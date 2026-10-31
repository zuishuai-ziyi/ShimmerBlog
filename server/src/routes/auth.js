import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { sendCodeEmail, sendWelcomeEmail } from '../services/mailer.js';
import {
  captchaGuard,
  captchaOptionalGuard,
  grantCaptchaCredit,
  verifyCaptcha,
  captchaConfig,
} from '../services/captcha.js';
import { githubConfig, googleConfig, webOrigin, getSetting } from '../services/settings.js';
import { oauthFetch } from '../services/oauth-fetch.js';
import { saveAvatarFromUrl, isAllowedAvatarHost } from '../services/avatar.js';
import { signToken, publicUser, randomCode, makeLimiter } from '../utils.js';
import { avatarUpload } from '../uploads.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** OAuth state（GitHub / Google 共用，10 分钟有效，单实例内存即可） */
const oauthStates = new Map(); // state -> { expires, mode: 'login' | 'bind', userId? }

async function oauthCallbackUri(provider) {
  // 以站点配置 web_origin 为准，不依赖请求头：线上走 nginx 反代时 req.protocol 拿到的是 http，
  // 会导致发向 GitHub/Google 的 redirect_uri 与控制台登记的 https 地址不一致而报错
  const base = await webOrigin();
  return `${base}/api/auth/${provider}/callback`;
}

// oauthFetch 已抽至 services/oauth-fetch.js（OAuth API 与头像下载共用，支持出站代理）

/**
 * OAuth 登录共用：按第三方 id 找老用户 → 按邮箱并档 → 都没有则新建（视为已验证邮箱）。
 * 头像：新建/并档后后台异步转存（不阻塞注册/登录主流程，失败仅日志不报错）；
 * 每次登录都会刷新 remote_avatar_url（第三方可能更新了头像地址，供之后手动同步用）。
 */
async function localizeAvatar(userId, remoteUrl) {
  const local = await saveAvatarFromUrl(remoteUrl);
  await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [local, userId]);
}

async function findOrCreateOAuthUser(providerCol, providerId, { email, name, avatar }) {
  const [byPid] = await pool.query(`SELECT * FROM users WHERE \`${providerCol}\` = ? LIMIT 1`, [providerId]);
  let user = byPid[0];
  let createdNew = false;
  if (!user && email) {
    const [byEmail] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    user = byEmail[0];
    if (user) {
      // 并档也记录第三方头像原始地址，便于之后手动「同步第三方头像」；
      // 若该用户还没有头像，后台异步转存第三方头像（已有自定义头像则不覆盖）
      await pool.query(`UPDATE users SET \`${providerCol}\` = ?, remote_avatar_url = ? WHERE id = ?`, [providerId, avatar || null, user.id]);
      if (avatar && !user.avatar_url) {
        localizeAvatar(user.id, avatar).catch((e) =>
          console.error('[oauth-avatar] 并档头像后台转存失败（保留默认头像）:', String(e?.message || e))
        );
      }
    }
  }
  if (!user) {
    const nick = String(name || '第三方用户').slice(0, 50);
    // 头像本地化不阻塞注册：先建号（暂用默认头像，记录原始地址），后台异步下载转存，成功后回填 avatar_url
    const [r] = await pool.query(
      `INSERT INTO users (email, name, avatar_url, remote_avatar_url, \`${providerCol}\`, email_verified) VALUES (?, ?, ?, ?, ?, 1)`,
      [email, nick, null, avatar || null, providerId]
    );
    const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
    user = created[0];
    createdNew = true;
    if (avatar) {
      localizeAvatar(user.id, avatar).catch((e) =>
        console.error('[oauth-avatar] 注册头像后台转存失败（保留默认头像）:', String(e?.message || e))
      );
    }
    return { user, createdNew };
  }
  // 老用户登录：来源地址有变化才写库（第三方换过头像地址后，重新登录一次即可继续手动同步）
  if (avatar && user.remote_avatar_url !== avatar) {
    await pool.query('UPDATE users SET remote_avatar_url = ? WHERE id = ?', [avatar, user.id]);
    user.remote_avatar_url = avatar;
  }
  return { user, createdNew };
}

/* ---------- 注册（邮箱 + 密码） ----------
 * 验证码：send-code 时已验过一次（签发信用），此处优先吃信用；
 * 信用缺失（过期/跨机器）且未携带验证码 → 400 CAPTCHA_REQUIRED 由前端按需弹窗。 */
authRouter.post('/register', captchaOptionalGuard('register', (req) => req.body?.email), async (req, res, next) => {
  try {
    const { email, password, name, code } = req.body ?? {};
    if ((await getSetting('register_open')) !== '1') {
      return res.status(403).json({ error: '站点已关闭注册，请联系管理员' });
    }
    if (!EMAIL_RE.test(String(email ?? ''))) return res.status(400).json({ error: '邮箱格式不正确' });
    if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    const mail = String(email).toLowerCase();
    const nick = String(name ?? '').trim() || mail.split('@')[0].slice(0, 50);
    const [exists] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [mail]);
    if (exists.length > 0) return res.status(409).json({ error: '该邮箱已注册' });
    // 注册必须验证邮箱：先 POST /auth/send-code {purpose:'register'} 取码，再带 code 提交
    if (!/^\d{6}$/.test(String(code ?? ''))) {
      return res.status(400).json({ error: '请先获取并填写邮箱验证码' });
    }
    const [codes] = await pool.query(
      `SELECT id FROM email_codes
       WHERE email = ? AND code = ? AND purpose = 'register' AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [mail, code]
    );
    if (codes.length === 0) return res.status(401).json({ error: '验证码错误或已过期' });
    await pool.query('UPDATE email_codes SET used = 1 WHERE id = ?', [codes[0].id]);
    const hash = await bcrypt.hash(password, 10);
    // 验证码已校验通过，账号即为已验证状态
    const [r] = await pool.query(
      'INSERT INTO users (email, password_hash, name, email_verified) VALUES (?, ?, ?, 1)',
      [mail, hash, nick]
    );
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
    sendWelcomeEmail(rows[0]).catch(() => {}); // 欢迎邮件：异步发送，不阻塞注册
    res.status(201).json({ token: signToken(rows[0]), user: await publicUser(rows[0]) });
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

authRouter.post('/login', loginLimiter, captchaGuard, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: '邮箱或密码错误' });
    const ok = await bcrypt.compare(String(password ?? ''), user.password_hash);
    if (!ok) return res.status(401).json({ error: '邮箱或密码错误' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    res.json({ token: signToken(user), user: await publicUser(user) });
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

authRouter.post('/send-code', codeLimiter, captchaGuard, async (req, res, next) => {
  try {
    const { email } = req.body ?? {};
    const rawPurpose = req.body?.purpose;
    const purpose = rawPurpose === 'reset' ? 'reset' : rawPurpose === 'register' ? 'register' : 'login';
    if (!EMAIL_RE.test(String(email ?? ''))) return res.status(400).json({ error: '邮箱格式不正确' });
    const mail = String(email).toLowerCase();
    if (purpose === 'register') {
      // 注册验证码：邮箱已被占用时直接拒绝，避免白发一封邮件
      const [u] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [mail]);
      if (u.length > 0) return res.status(409).json({ error: '该邮箱已注册' });
    }
    if (purpose === 'reset') {
      // 找回密码：仅向已注册且未被禁用的邮箱发码，同时不暴露邮箱是否存在以外的信息
      const [u] = await pool.query('SELECT status FROM users WHERE email = ? LIMIT 1', [mail]);
      if (u.length === 0) return res.status(404).json({ error: '该邮箱尚未注册' });
      if (u[0].status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    }
    const code = randomCode();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query('INSERT INTO email_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)', [
      mail,
      code,
      purpose,
      expires,
    ]);
    const viaSmtp = await sendCodeEmail(email, code);
    // 发码且通过了行为验证 → 签发一次性信用，后续 register/login/code 免二次验证
    if (purpose === 'register' || purpose === 'login') {
      grantCaptchaCredit(req.ip, mail, purpose);
    }
    // 开发模式（SMTP 未配置）时把验证码带回去，方便本地联调；SMTP 配好后自动消失
    res.json({ sent: true, via: viaSmtp ? 'smtp' : 'console', devCode: viaSmtp ? undefined : code });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login/code', captchaOptionalGuard('login', (req) => req.body?.email), async (req, res, next) => {
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
        'INSERT INTO users (email, name, email_verified) VALUES (?, ?, 1)',
        [mail, nick]
      );
      const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [r.insertId]);
      user = created[0];
      sendWelcomeEmail(user).catch(() => {}); // 验证码首次登录 = 自动注册，同样发欢迎邮件
    } else if (user.status !== 'active') {
      return res.status(403).json({ error: '账号已被禁用' });
    }
    if (!user.email_verified) await pool.query('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
    res.json({ token: signToken(user), user: await publicUser(user) });
  } catch (e) {
    next(e);
  }
});

/* ---------- 忘记密码：验证邮箱后重置 ---------- */
const resetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyOf: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
  message: '重置密码尝试过于频繁，请稍后再试',
});

authRouter.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const { email, code, password } = req.body ?? {};
    const mail = String(email ?? '').toLowerCase();
    if (!EMAIL_RE.test(mail) || !/^\d{6}$/.test(String(code ?? ''))) {
      return res.status(400).json({ error: '邮箱或验证码格式不正确' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    const [rows] = await pool.query(
      `SELECT id FROM email_codes
       WHERE email = ? AND code = ? AND purpose = 'reset' AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [mail, code]
    );
    if (rows.length === 0) return res.status(401).json({ error: '验证码错误或已过期' });
    await pool.query('UPDATE email_codes SET used = 1 WHERE id = ?', [rows[0].id]);
    const [users] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [mail]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: '该邮箱尚未注册' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    const hash = await bcrypt.hash(String(password), 10);
    await pool.query('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?', [hash, user.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- GitHub OAuth ---------- */
/* ---------- 第三方账号绑定（已登录用户主动绑定 GitHub/Google） ----------
 * 入口 /auth/bind/:provider（authRequired）：签发 bind 模式 state → 302 授权页；
 * 回调复用 /auth/:provider/callback，state.mode==='bind' 时只做绑定，不登录/并档/建号。 */
function bindRedirect(res, origin, ok, reason) {
  const q = new URLSearchParams({ bind: ok ? 'ok' : 'fail' });
  if (reason) q.set('reason', reason);
  res.redirect(`${origin}/auth/callback?${q.toString()}`);
}

async function startBind(provider, req, res) {
  const cfg = provider === 'github' ? await githubConfig() : await googleConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    return res.status(501).json({ error: `${provider === 'github' ? 'GitHub' : 'Google'} OAuth 未配置，无法绑定` });
  }
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { expires: Date.now() + 10 * 60 * 1000, mode: 'bind', userId: req.user.id });
  const url = new URL(
    provider === 'github'
      ? 'https://github.com/login/oauth/authorize'
      : 'https://accounts.google.com/o/oauth2/v2/auth'
  );
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', await oauthCallbackUri(provider));
  if (provider === 'github') {
    url.searchParams.set('scope', 'read:user user:email');
  } else {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
  }
  url.searchParams.set('state', state);
  res.redirect(url.toString());
}

authRouter.get('/bind/github', authRequired, (req, res, next) => {
  startBind('github', req, res).catch(next);
});
authRouter.get('/bind/google', authRequired, (req, res, next) => {
  startBind('google', req, res).catch(next);
});

/* 绑定模式回调共用：把第三方 id 写到发起用户上（校验未被其他账号占用），不登录不建号 */
async function finishBind(rec, providerCol, providerId, avatar, res) {
  const origin = await webOrigin();
  try {
    const [cur] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [rec.userId]);
    const u = cur[0];
    if (!u) return bindRedirect(res, origin, false, '账号不存在或已注销');
    const [dup] = await pool.query(
      `SELECT id FROM users WHERE \`${providerCol}\` = ? AND id <> ? LIMIT 1`,
      [providerId, rec.userId]
    );
    if (dup.length > 0) return bindRedirect(res, origin, false, '该第三方账号已绑定其他本站账号');
    await pool.query(`UPDATE users SET \`${providerCol}\` = ?, remote_avatar_url = ? WHERE id = ?`, [
      providerId,
      avatar || u.remote_avatar_url || null,
      u.id,
    ]);
    // 当前没有头像时后台异步转存第三方头像（已有头像不覆盖）
    if (avatar && !u.avatar_url) {
      localizeAvatar(u.id, avatar).catch((e) =>
        console.error('[oauth-avatar] 绑定头像后台转存失败（保留默认头像）:', String(e?.message || e))
      );
    }
    bindRedirect(res, origin, true);
  } catch (e) {
    bindRedirect(res, origin, false, String(e?.message || e));
  }
}

authRouter.get('/github', async (req, res) => {
  const gh = await githubConfig();
  const { clientId, clientSecret } = gh;
  if (!clientId || !clientSecret) {
    return res.status(501).json({
      error: 'GitHub OAuth 未配置：请在后台「站点配置」填写，或设置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET',
    });
  }
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { expires: Date.now() + 10 * 60 * 1000, mode: 'login' });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', await oauthCallbackUri('github'));
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

authRouter.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const rec = typeof state === 'string' ? oauthStates.get(state) : undefined;
  const expires = rec?.expires;
  oauthStates.delete(String(state ?? ''));
  if (typeof code !== 'string' || !expires || Date.now() > expires) {
    return res.status(400).json({ error: 'GitHub 回调参数无效或 state 已过期' });
  }
  const gh = await githubConfig();
  const { clientId, clientSecret } = gh;
  if (!clientId || !clientSecret) return res.status(501).json({ error: 'GitHub OAuth 未配置' });
  try {
    const tokenRes = await oauthFetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: await oauthCallbackUri('github') }),
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
    const ghUser = await (await oauthFetch('https://api.github.com/user', { headers })).json();
    // 绑定模式：只把第三方 id 写到发起用户上，不登录/并档/建号（也省去拉邮箱）
    if (rec?.mode === 'bind') {
      return finishBind(rec, 'github_id', ghUser.id, ghUser.avatar_url || null, res);
    }
    const ghEmailsRes = await oauthFetch('https://api.github.com/user/emails', { headers });
    const ghEmails = ghEmailsRes.ok ? await ghEmailsRes.json() : [];
    const email = ghEmails.find((e) => e.primary && e.verified)?.email || ghUser.email || null;

    const { user, createdNew } = await findOrCreateOAuthUser('github_id', ghUser.id, {
      email: email ? String(email).toLowerCase() : null,
      name: String(ghUser.name || ghUser.login || 'github 用户'),
      avatar: ghUser.avatar_url,
    });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    if (createdNew && user.email) sendWelcomeEmail(user).catch(() => {});
    const origin = await webOrigin();
    res.redirect(`${origin}/auth/callback?token=${signToken(user)}`);
  } catch (e) {
    res.status(502).json({ error: 'GitHub OAuth 处理失败', detail: String(e) });
  }
});

/* ---------- Google OAuth（OIDC） ---------- */
authRouter.get('/google', async (req, res) => {
  const g = await googleConfig();
  if (!g.clientId || !g.clientSecret) {
    return res.status(501).json({
      error: 'Google 登录未配置：请在后台「第三方登录」填写 Client ID / Client Secret',
    });
  }
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { expires: Date.now() + 10 * 60 * 1000, mode: 'login' });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', g.clientId);
  url.searchParams.set('redirect_uri', await oauthCallbackUri('google'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

authRouter.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const rec = typeof state === 'string' ? oauthStates.get(state) : undefined;
  const expires = rec?.expires;
  oauthStates.delete(String(state ?? ''));
  if (typeof code !== 'string' || !expires || Date.now() > expires) {
    return res.status(400).json({ error: 'Google 回调参数无效或 state 已过期' });
  }
  const g = await googleConfig();
  if (!g.clientId || !g.clientSecret) return res.status(501).json({ error: 'Google 登录未配置' });
  try {
    const tokenRes = await oauthFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: g.clientId,
        client_secret: g.clientSecret,
        redirect_uri: await oauthCallbackUri('google'),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Google 授权失败', detail: tokenData });
    }
    const uiRes = await oauthFetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!uiRes.ok) {
      return res.status(502).json({ error: '获取 Google 用户信息失败', detail: uiRes.status });
    }
    const ui = await uiRes.json();
    // 只信任 Google 明确标注已验证的邮箱
    const email = ui.email && ui.email_verified ? String(ui.email).toLowerCase() : null;
    // 绑定模式：只把第三方 id 写到发起用户上，不登录/并档/建号
    if (rec?.mode === 'bind') {
      return finishBind(rec, 'google_id', String(ui.sub), ui.picture || null, res);
    }

    const { user, createdNew } = await findOrCreateOAuthUser('google_id', String(ui.sub), {
      email,
      name: String(ui.name || 'google 用户'),
      avatar: ui.picture,
    });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    if (createdNew && user.email) sendWelcomeEmail(user).catch(() => {});
    const origin = await webOrigin();
    res.redirect(`${origin}/auth/callback?token=${signToken(user)}`);
  } catch (e) {
    res.status(502).json({ error: 'Google OAuth 处理失败', detail: String(e) });
  }
});

/* ---------- 当前用户 / 资料 / 头像 ---------- */
authRouter.get('/me', authRequired, async (req, res) => {
  res.json({ user: await publicUser(req.user) });
});

// 资料修改风控：正常修改零打扰，10 分钟内第 3 次起要求行为验证（防滥用刷屏）
const profileEdits = new Map(); // userId -> 最近成功修改时间戳数组
const PROFILE_EDIT_WINDOW = 10 * 60 * 1000;
const PROFILE_EDIT_FREE = 2;
function profileEditRisk(userId) {
  const now = Date.now();
  const arr = (profileEdits.get(userId) || []).filter((t) => now - t < PROFILE_EDIT_WINDOW);
  profileEdits.set(userId, arr);
  return arr.length >= PROFILE_EDIT_FREE;
}

authRouter.put('/profile', authRequired, async (req, res, next) => {
  try {
    const { name, bio, avatar_url } = req.body ?? {};
    const patch = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: '昵称不能为空' });
      }
      patch.name = name.trim().slice(0, 50);
    }
    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 500) {
        return res.status(400).json({ error: '简介最长 500 字' });
      }
      patch.bio = bio.trim() || null;
    }
    if (typeof avatar_url === 'string') patch.avatar_url = avatar_url.slice(0, 500) || null;
    if (Object.keys(patch).length > 0) {
      const cfg = await captchaConfig();
      if (cfg.enabled) {
        if (req.body?.captcha) {
          // 携带了验证码则必须有效（错码/失效/服务不可用都拦下）
          const r = await verifyCaptcha(req.body.captcha);
          if (!r.ok) return res.status(r.status).json({ error: r.error });
        } else if (profileEditRisk(req.user.id)) {
          // 未带码且命中风控 → 要求验证，前端按 CAPTCHA_REQUIRED 按需弹窗
          return res.status(400).json({ error: '操作过于频繁，请完成安全验证后再保存', code: 'CAPTCHA_REQUIRED' });
        }
      }
      await pool.query('UPDATE users SET ? WHERE id = ?', [patch, req.user.id]);
      const nowTs = Date.now();
      profileEdits.set(req.user.id, [
        ...(profileEdits.get(req.user.id) || []).filter((t) => nowTs - t < PROFILE_EDIT_WINDOW),
        nowTs,
      ]);
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: await publicUser(rows[0]) });
  } catch (e) {
    next(e);
  }
});

/* ---------- 修改密码（OAuth-only 用户首次设置密码免验当前密码） ---------- */
const passwordChangeLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyOf: (req) => `pw:${req.user?.id ?? req.ip}`,
  message: '修改密码过于频繁，请稍后再试',
});

authRouter.put('/password', authRequired, passwordChangeLimiter, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少 6 位' });
    }
    if (newPassword.length > 100) return res.status(400).json({ error: '密码最长 100 位' });
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const u = rows[0];
    if (!u) return res.status(403).json({ error: '账号不可用' });
    if (u.password_hash) {
      if (!currentPassword) return res.status(400).json({ error: '请输入当前密码' });
      const ok = await bcrypt.compare(String(currentPassword ?? ''), u.password_hash);
      if (!ok) return res.status(401).json({ error: '当前密码错误' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, u.id]);
    const [fresh] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [u.id]);
    res.json({ user: await publicUser(fresh[0]), message: u.password_hash ? '密码已修改' : '密码已设置' });
  } catch (e) {
    next(e);
  }
});

/* ---------- 解绑第三方账号 ----------
 * 解绑后必须仍保留至少一种登录方式（密码或另一第三方），避免把自己锁死。 */
authRouter.delete('/oauth/:provider', authRequired, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const col = provider === 'github' ? 'github_id' : provider === 'google' ? 'google_id' : null;
    if (!col) return res.status(400).json({ error: '不支持的第三方类型' });
    const u = req.user;
    if (!u[col]) return res.status(400).json({ error: '尚未绑定该第三方账号' });
    const hasOther = u.password_hash || (provider === 'github' ? u.google_id : u.github_id);
    if (!hasOther) {
      return res.status(400).json({ error: '解绑后将无法登录：请先设置密码，或保留至少一种第三方登录' });
    }
    await pool.query(`UPDATE users SET \`${col}\` = NULL WHERE id = ?`, [u.id]);
    const [fresh] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [u.id]);
    res.json({ user: await publicUser(fresh[0]), message: '已解绑' });
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
    res.json({ user: await publicUser(rows[0]), url });
  });
});

// 手动从第三方同步头像：仅绑定过 GitHub/Google 的用户可用；下载与校验流程与注册时完全一致。
// 简单限频：每用户 60 秒一次，防刷出站请求。
const avatarRefreshAt = new Map(); // userId -> 上次成功同步时间戳
const AVATAR_REFRESH_COOLDOWN = 60 * 1000;

/** 现有头像是否仍是受支持的第三方外链（用于老用户 Google 头像来源回填） */
function isAllowedAvatarUrl(s) {
  if (!s || typeof s !== 'string' || !s.startsWith('https://')) return false;
  try {
    return isAllowedAvatarHost(new URL(s).hostname);
  } catch {
    return false;
  }
}

authRouter.post('/avatar/refresh-oauth', authRequired, async (req, res, next) => {
  try {
    const last = avatarRefreshAt.get(req.user.id) || 0;
    if (Date.now() - last < AVATAR_REFRESH_COOLDOWN) {
      return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const u = rows[0];
    if (!u || (!u.github_id && !u.google_id)) {
      return res.status(400).json({ error: '当前账号未绑定第三方登录，无法同步头像' });
    }
    // 可选 body.provider：绑定了多个第三方时由前端让用户选择来源
    const provider = String(req.body?.provider || '').toLowerCase();
    if (provider && provider !== 'github' && provider !== 'google') {
      return res.status(400).json({ error: 'provider 仅支持 github 或 google' });
    }
    const useGithub = provider ? provider === 'github' : !!u.github_id;
    if (useGithub && !u.github_id) {
      return res.status(400).json({ error: '该账号未绑定 GitHub，无法从 GitHub 同步头像' });
    }
    if (!useGithub && !u.google_id) {
      return res.status(400).json({ error: '该账号未绑定 Google，无法从 Google 同步头像' });
    }
    let url;
    if (useGithub) {
      // GitHub 头像可由用户 id 直接构造公开地址（公开可访问，无需重新授权）
      url = `https://avatars.githubusercontent.com/u/${u.github_id}?size=460`;
    } else {
      // Google 头像地址不可从 id 推导：优先取登录时记录的原始地址；
      // 老用户（记录功能上线前注册）若现有头像仍是第三方外链（白名单域名），直接回填当来源
      url = u.remote_avatar_url;
      if (!url && isAllowedAvatarUrl(u.avatar_url)) url = u.avatar_url;
      if (!url) {
        return res.status(400).json({ error: '缺少第三方头像来源，请重新登录该第三方账号后再试' });
      }
    }
    let local;
    try {
      local = await saveAvatarFromUrl(url);
    } catch (e) {
      console.error('[oauth-avatar] 手动同步头像失败:', String(e?.message || e));
      return res.status(502).json({ error: '获取第三方头像失败，请稍后再试' });
    }
    await pool.query('UPDATE users SET avatar_url = ?, remote_avatar_url = ? WHERE id = ?', [local, url, u.id]);
    avatarRefreshAt.set(u.id, Date.now());
    const [fresh] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [u.id]);
    res.json({ user: await publicUser(fresh[0]), url: local, provider: useGithub ? 'github' : 'google' });
  } catch (e) {
    next(e);
  }
});
