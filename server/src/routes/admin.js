import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { adminRequired } from '../middleware/auth.js';
import { signAdminToken } from '../utils.js';
import { getAllSettings, setSettings, githubConfig, smtpConfig } from '../services/settings.js';
import { sendTestEmail } from '../services/mailer.js';
import { makeLimiter } from '../utils.js';
import { imageUpload } from '../uploads.js';

export const adminRouter = Router();

const ADMIN_SELECT = 'id, email, name, name_color, bio, avatar_url, permissions, status, github_id, email_verified, created_at';
const PERMISSION_KEYS = ['post'];
const NAME_COLOR_RE = /^#?[0-9a-fA-F]{3,8}$/;

/* ---------- 后台登录（独立密码，与用户体系分离） ---------- */
const adminLoginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOf: (req) => `admin-login:${req.ip}`,
  message: '尝试过于频繁，请 15 分钟后再试',
});

async function adminPasswordHash() {
  const [rows] = await pool.query("SELECT value FROM settings WHERE `key` = 'admin_password_hash' LIMIT 1");
  return rows[0]?.value ?? '';
}

adminRouter.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '');
    const hash = await adminPasswordHash();
    if (!hash || !(await bcrypt.compare(password, hash))) {
      return res.status(401).json({ error: '管理密码错误' });
    }
    res.json({ token: signAdminToken(), expiresInHours: 12 });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/session', adminRequired, (_req, res) => {
  res.json({ ok: true });
});

adminRouter.put('/password', adminRequired, async (req, res, next) => {
  try {
    const password = String(req.body?.password ?? '');
    if (password.length < 6) return res.status(400).json({ error: '管理密码至少 6 位' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO settings (`key`, value) VALUES ('admin_password_hash', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [hash]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 用户管理 ---------- */
adminRouter.get('/users', adminRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const where = q ? 'WHERE email LIKE ? OR name LIKE ?' : '';
    const args = q ? [`%${q}%`, `%${q}%`] : [];
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, args);
    const [rows] = await pool.query(
      `SELECT ${ADMIN_SELECT} FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    );
    const [stat] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM articles) AS articles,
         (SELECT COUNT(*) FROM articles WHERE status = 'published') AS published,
         (SELECT COUNT(*) FROM articles WHERE status = 'draft') AS drafts`
    );
    res.json({ items: rows, total, page, pageSize, stats: stat[0] });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/users/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    if (!rows[0]) return res.status(404).json({ error: '用户不存在' });

    const sets = [];
    const args = [];
    if (req.body?.status === 'active' || req.body?.status === 'disabled') {
      sets.push('status = ?');
      args.push(req.body.status);
    }
    if (req.body?.name_color !== undefined) {
      const c = String(req.body.name_color ?? '').trim();
      if (c && !NAME_COLOR_RE.test(c)) return res.status(400).json({ error: '颜色格式不正确' });
      sets.push('name_color = ?');
      args.push(c ? (c.startsWith('#') ? c : `#${c}`) : null);
    }
    if (req.body?.bio !== undefined) {
      sets.push('bio = ?');
      args.push(String(req.body.bio ?? '').slice(0, 500) || null);
    }
    if (req.body?.permissions !== undefined) {
      if (req.body.permissions === null) {
        sets.push('permissions = NULL'); // 恢复默认权限
      } else if (Array.isArray(req.body.permissions)) {
        const perms = req.body.permissions.filter((p) => PERMISSION_KEYS.includes(p));
        sets.push('permissions = ?');
        args.push(JSON.stringify(perms));
      } else {
        return res.status(400).json({ error: 'permissions 需为数组或 null' });
      }
    }
    if (!sets.length) return res.status(400).json({ error: '没有可修改的字段' });
    args.push(id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args);
    const [after] = await pool.query(`SELECT ${ADMIN_SELECT} FROM users WHERE id = ?`, [id]);
    res.json({ user: after[0] });
  } catch (e) {
    next(e);
  }
});

/* ---------- 站点配置（站点信息 / 关于页 / 邮件模板 / SMTP） ---------- */
adminRouter.get('/settings', adminRequired, async (_req, res, next) => {
  try {
    const all = await getAllSettings();
    const gh = await githubConfig();
    const smtp = await smtpConfig();
    res.json({
      settings: {
        ...all,
        // 密钥不回传明文，只回传是否已配置
        github_client_secret: all.github_client_secret ? '__KEEP__' : '',
        smtp_pass: all.smtp_pass ? '__KEEP__' : '',
      },
      githubEnabled: gh.enabled,
      smtpEnabled: !!smtp,
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/settings', adminRequired, async (req, res, next) => {
  try {
    const body = { ...(req.body ?? {}) };
    // 密钥：'__KEEP__' 与空串都表示「不修改」，'__CLEAR__' 才是清空
    for (const key of ['github_client_secret', 'smtp_pass']) {
      if (body[key] === '__KEEP__' || body[key] === '') delete body[key];
      else if (body[key] === '__CLEAR__') body[key] = '';
    }
    // 布尔开关统一存 '1' / '0'
    if (typeof body.register_open === 'boolean') body.register_open = body.register_open ? '1' : '0';
    if (typeof body.smtp_secure === 'boolean') body.smtp_secure = body.smtp_secure ? '1' : '0';
    const r = await setSettings(body);
    const gh = await githubConfig();
    const smtp = await smtpConfig();
    res.json({ ok: true, updated: r.updated, githubEnabled: gh.enabled, smtpEnabled: !!smtp });
  } catch (e) {
    next(e);
  }
});

/* ---------- 站点 Logo 上传 ---------- */
adminRouter.post('/logo', adminRequired, (req, res) => {
  imageUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Logo 上传失败' });
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    const url = `/uploads/images/${req.file.filename}`;
    await setSettings({ site_logo_url: url });
    res.json({ url });
  });
});

adminRouter.delete('/logo', adminRequired, async (_req, res, next) => {
  try {
    await setSettings({ site_logo_url: '' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 用户默认头像上传 ---------- */
adminRouter.post('/default-avatar', adminRequired, (req, res) => {
  imageUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || '默认头像上传失败' });
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    const url = `/uploads/images/${req.file.filename}`;
    await setSettings({ default_avatar_url: url });
    res.json({ url });
  });
});

adminRouter.delete('/default-avatar', adminRequired, async (_req, res, next) => {
  try {
    await setSettings({ default_avatar_url: '' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 发送测试邮件 ---------- */
adminRouter.post('/mail/test', adminRequired, async (req, res, next) => {
  try {
    const to = String(req.body?.to ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: '邮箱格式不正确' });
    await sendTestEmail(to);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || '发送失败' });
  }
});

/* ---------- 文章管理（全量，含草稿） ---------- */
adminRouter.get('/articles', adminRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const where = q ? 'WHERE a.title LIKE ?' : '';
    const args = q ? [`%${q}%`] : [];
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM articles a ${where}`, args);
    const [rows] = await pool.query(
      `SELECT a.id, a.title, a.summary, a.status, a.pinned, a.published_at, a.created_at, a.updated_at,
              a.author_id, u.name AS author_name, u.name_color AS author_name_color
       FROM articles a JOIN users u ON a.author_id = u.id ${where}
       ORDER BY a.updated_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    );
    res.json({ items: rows, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/* ---------- 文章管理：删除 / 置顶（后台令牌即可，不经用户鉴权） ---------- */
adminRouter.patch('/articles/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pinned = req.body?.pinned === true || req.body?.pinned === 1 ? 1 : 0;
    const [r] = await pool.query('UPDATE articles SET pinned = ? WHERE id = ?', [pinned, id]);
    if (!r.affectedRows) return res.status(404).json({ error: '文章不存在' });
    res.json({ ok: true, pinned });
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/articles/:id', adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query('DELETE FROM articles WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: '文章不存在' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
