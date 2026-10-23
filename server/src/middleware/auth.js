import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';

/** 解析 Bearer JWT 并加载用户；失败返回 401/403 */
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [payload.uid]);
  const user = rows[0];
  if (!user || user.status !== 'active') return res.status(403).json({ error: '账号不可用' });
  req.user = user;
  next();
}

export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}
