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

/** 独立管理员鉴权：/admin 用的 JWT（与用户体系分离，不再使用管理员用户账号） */
export function adminRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录管理后台' });
  try {
    const payload = jwt.verify(token, config.jwtSecret + ':admin');
    if (!payload.admin) throw new Error('not admin token');
  } catch {
    return res.status(401).json({ error: '后台登录已过期，请重新登录' });
  }
  next();
}

/**
 * 审核员鉴权：/api/review 用的独立 JWT（与用户 / 管理员体系分离）。
 * 令牌签名用 jwtSecret + ':reviewer'，且每次请求都回查 reviewers 表：
 * 账号被禁用后旧令牌立即失效。
 */
export async function reviewerRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录审核后台' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret + ':reviewer');
    if (!payload.reviewer) throw new Error('not reviewer token');
  } catch {
    return res.status(401).json({ error: '审核后台登录已过期，请重新登录' });
  }
  const [rows] = await pool.query(
    "SELECT id, username, display_name, email FROM reviewers WHERE id = ? AND status = 'active' LIMIT 1",
    [payload.reviewer]
  );
  const reviewer = rows[0];
  if (!reviewer) return res.status(401).json({ error: '审核后台登录已过期，请重新登录' });
  req.reviewer = reviewer;
  next();
}
