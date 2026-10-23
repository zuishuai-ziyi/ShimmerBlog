import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { sendCodeEmail } from '../services/mailer.js';
import { githubConfig, webOrigin, getSetting } from '../services/settings.js';
import { signToken, publicUser, randomCode, makeLimiter } from '../utils.js';
import { avatarUpload } from '../uploads.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GitHub OAuth state（10 分钟有效，单实例内存即可） */
const githubStates = new Map();

function githubRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/auth/github/callback`;
}

/* ---------- 注册（邮箱 + 密码） ---------- */
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body ?? {};
    if ((await getSetting('register_open')) !== '1') {
      return res.status(403).json({ error: '站点已关闭注册，请联系管理员' });
    }
    if (!EMAIL_RE.test(String(email ?? ''))) return res.status(400).json({ error: '邮箱格式不正确' });
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    const nick = String(name ?? '').trim() || String(email).split('@')[0].slice(0, 50);
    const [exists] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (exists.length > 0) return res.status(409).json({ error: '该邮箱已注册' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO users (email, password_hash, name, role, email_verified) VALUES (?, ?, ?, ?, 0)',
      [email, hash, nick, 'user']
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
    res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
  } catch (e) {
    next(e);
  }
});

/* ---------- 登录（邮箱 + 密码） ---------- */
const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOf: (req) => `${req.ip}:${String(req.body?.email ?? '')}`,
  message: '登录尝试过于频繁，请 15 分钟后再试',
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: '邮箱或密码错误' });
    const ok = await bcrypt.compare(String(password ?? ''), user.password_hash);
    if (!ok) return res.status(401).json({ error: '邮箱或密码错误' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

/* ---------- 验证码：发送 + 魔法登录 ---------- */
const codeLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyOf: (req) => String(req.body?.email ?? '').toLowerCase(),
  message: '验证码发送过于频繁，每小时最多 5 次',
});

authRouter.post('/send-code', codeLimiter, async (req, res, next) => {
  try {
    const { email } = req.body ?? {};
    if (!EMAIL_RE.test(String(email ?? ''))) return res.status(400).json({ error: '邮箱格式不正确' });
    const code = randomCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query('INSERT INTO email_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)', [
      String(email).toLowerCase(),
      code,
      'login',
      expires,
    ]);
    const viaSmtp = await sendCodeEmail(email, code);
    // 开发模式（SMTP 未配置）时把验证码带回去，方便本地联调；SMTP 配好后自动消失
    res.json({ sent: true, via: viaSmtp ? 'smtp' : 'console', devCode: viaSmtp ? undefined : code });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login/code', async (req, res, next) => {
  try {
    const { email, code } = req.body ?? {};
    const mail = String(email ?? '').toLowerCase();
    if (!EMAIL_RE.test(mail) || !/^\d{6}$/.test(String(code ?? ''))) {
      return res.status(400).json({ error: '邮箱或验证码格式不正确' });
    }
    const [rows] = await pool.query(
      `SELECT id FROM email_codes
       WHERE email = ? AND code = ? AND purpose = 'login' AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [mail, code]
    );
    if (rows.length === 0) return res.status(401).json({ error: '验证码错误或已过期' });
    await pool.query('UPDATE email_codes SET used = 1 WHERE id = ?', [rows[0].id]);

    const [users] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [mail]);
    let user = users[0];
    if (!user) {
      // 验证码首次登录 = 自动注册（免密账号）
      const nick = mail.split('@')[0].slice(0, 50);
      const [r] = await pool.query(
        'INSERT INTO users (email, name, role, email_verified) VALUES (?, ?, ?, 1)',
        [mail, nick, 'user']
      );
      const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
      user = created[0];
    } else if (user.status !== 'active') {
      return res.status(403).json({ error: '账号已被禁用' });
    }
    if (!user.email_verified) await pool.query('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

/* ---------- GitHub OAuth ---------- */
authRouter.get('/github', async (req, res) => {
  const gh = await githubConfig();
  const { clientId, clientSecret } = gh;
  if (!clientId || !clientSecret) {
    return res.status(501).json({
      error: 'GitHub OAuth 未配置：请在后台「站点配置」填写，或设置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET',
    });
  }
  const state = crypto.randomBytes(16).toString('hex');
  githubStates.set(state, Date.now() + 10 * 60 * 1000);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', githubRedirectUri(req));
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

authRouter.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const expires = typeof state === 'string' ? githubStates.get(state) : undefined;
  githubStates.delete(String(state ?? ''));
  if (typeof code !== 'string' || !expires || Date.now() > expires) {
    return res.status(400).json({ error: 'GitHub 回调参数无效或 state 已过期' });
  }
  const gh = await githubConfig();
  const { clientId, clientSecret } = gh;
  if (!clientId || !clientSecret) return res.status(501).json({ error: 'GitHub OAuth 未配置' });
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: githubRedirectUri(req) }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'GitHub 授权失败', detail: tokenData });
    }
    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'shimmerblog',
    };
    const ghUser = await (await fetch('https://api.github.com/user', { headers })).json();
    const ghEmailsRes = await fetch('https://api.github.com/user/emails', { headers });
    const ghEmails = ghEmailsRes.ok ? await ghEmailsRes.json() : [];
    const email = ghEmails.find((e) => e.primary && e.verified)?.email || ghUser.email || null;

    // 按 github_id 找老用户；否则按邮箱并档；否则新建
    const [byGh] = await pool.query('SELECT * FROM users WHERE github_id = ? LIMIT 1', [ghUser.id]);
    let user = byGh[0];
    if (!user && email) {
      const [byEmail] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
      user = byEmail[0];
      if (user) {
        await pool.query('UPDATE users SET github_id = ? WHERE id = ?', [ghUser.id, user.id]);
      }
    }
    if (!user) {
      const nick = String(ghUser.name || ghUser.login || 'github 用户').slice(0, 50);
      const [r] = await pool.query(
        'INSERT INTO users (email, name, avatar_url, role, github_id, email_verified) VALUES (?, ?, ?, ?, ?, 1)',
        [email, nick, ghUser.avatar_url || null, 'user', ghUser.id]
      );
      const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
      user = created[0];
    }
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    const origin = await webOrigin();
    res.redirect(`${origin}/auth/callback?token=${signToken(user)}`);
  } catch (e) {
    res.status(502).json({ error: 'GitHub OAuth 处理失败', detail: String(e) });
  }
});

/* ---------- 当前用户 / 资料 / 头像 ---------- */
authRouter.get('/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.put('/profile', authRequired, async (req, res, next) => {
  try {
    const { name, avatar_url } = req.body ?? {};
    const patch = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: '昵称不能为空' });
      }
      patch.name = name.trim().slice(0, 50);
    }
    if (typeof avatar_url === 'string') patch.avatar_url = avatar_url.slice(0, 500) || null;
    if (Object.keys(patch).length > 0) {
      await pool.query('UPDATE users SET ? WHERE id = ?', [patch, req.user.id]);
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: publicUser(rows[0]) });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/avatar', authRequired, (req, res) => {
  avatarUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || '头像上传失败' });
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    const url = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.user.id]);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: publicUser(rows[0]), url });
  });
});
