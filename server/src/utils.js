import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function signToken(user) {
  return jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: '7d' });
}

/** 后台独立令牌（12 小时），与用户 token 分离 */
export function signAdminToken() {
  return jwt.sign({ admin: true }, config.jwtSecret + ':admin', { expiresIn: '12h' });
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    name_color: u.name_color || null,
    avatar_url: u.avatar_url,
    bio: u.bio || '',
    status: u.status,
    github_id: u.github_id,
    email_verified: !!u.email_verified,
    created_at: u.created_at,
  };
}

/** 权限：permissions 为 NULL 时默认拥有全部基础权限（['post']），否则按配置数组 */
export function userPermissions(u) {
  if (!u?.permissions) return ['post'];
  try {
    const arr = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
    return Array.isArray(arr) ? arr : ['post'];
  } catch {
    return ['post'];
  }
}

export function userCanPost(u) {
  return userPermissions(u).includes('post');
}

export function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 简单内存限流器（单实例够用） */
export function makeLimiter({ windowMs, max, keyOf, message = '请求过于频繁，请稍后再试' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }, windowMs);
  timer.unref?.();
  return (req, res, next) => {
    const key = keyOf(req);
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || now - rec.start > windowMs) {
      rec = { start: now, count: 0 };
      hits.set(key, rec);
    }
    rec.count += 1;
    if (rec.count > max) return res.status(429).json({ error: message });
    next();
  };
}
