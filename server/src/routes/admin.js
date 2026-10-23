import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { getAllSettings, setSettings, githubConfig } from '../services/settings.js';

export const adminRouter = Router();

/* ---------- 用户管理 ---------- */
adminRouter.get('/users', authRequired, adminRequired, async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const where = q ? 'WHERE email LIKE ? OR name LIKE ?' : '';
    const args = q ? [`%${q}%`, `%${q}%`] : [];
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, args);
    const [rows] = await pool.query(
      `SELECT id, email, name, avatar_url, role, status, github_id, email_verified, created_at
       FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
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

adminRouter.patch('/users/:id', authRequired, adminRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (target.id === req.user.id) return res.status(400).json({ error: '不能修改自己的账号状态或角色' });

    const sets = [];
    const args = [];
    if (req.body?.status === 'active' || req.body?.status === 'disabled') {
      sets.push('status = ?');
      args.push(req.body.status);
    }
    if (req.body?.role === 'admin' || req.body?.role === 'user') {
      sets.push('role = ?');
      args.push(req.body.role);
    }
    if (!sets.length) return res.status(400).json({ error: '没有可修改的字段' });
    args.push(id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, args);
    const [after] = await pool.query(
      'SELECT id, email, name, avatar_url, role, status, github_id, email_verified, created_at FROM users WHERE id = ?',
      [id]
    );
    res.json({ user: after[0] });
  } catch (e) {
    next(e);
  }
});

/* ---------- 站点配置 ---------- */
adminRouter.get('/settings', authRequired, adminRequired, async (_req, res, next) => {
  try {
    const all = await getAllSettings();
    const gh = await githubConfig();
    res.json({
      settings: {
        ...all,
        // 密钥不回传明文，只回传是否已配置
        github_client_secret: all.github_client_secret ? '__KEEP__' : '',
      },
      githubEnabled: gh.enabled,
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.put('/settings', authRequired, adminRequired, async (req, res, next) => {
  try {
    const body = { ...(req.body ?? {}) };
    // 密钥：'__KEEP__' 与空串都表示「不修改」，'__CLEAR__' 才是清空
    if (body.github_client_secret === '__KEEP__' || body.github_client_secret === '') delete body.github_client_secret;
    else if (body.github_client_secret === '__CLEAR__') body.github_client_secret = '';
    // 布尔开关统一存 '1' / '0'
    if (typeof body.register_open === 'boolean') body.register_open = body.register_open ? '1' : '0';
    const r = await setSettings(body);
    const gh = await githubConfig();
    res.json({ ok: true, updated: r.updated, githubEnabled: gh.enabled });
  } catch (e) {
    next(e);
  }
});
