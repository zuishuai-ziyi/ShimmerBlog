import { Router } from 'express';
import { pool } from '../db.js';

export const spaceRouter = Router();

/** 用户公开空间：资料 + 已发布文章（分页） */
spaceRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的用户 ID' });
    const [users] = await pool.query(
      'SELECT id, name, name_color, avatar_url, bio, status, created_at FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    const user = users[0];
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.status === 'disabled') return res.status(404).json({ error: '用户不存在' });

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 10) || 10));
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM articles WHERE author_id = ? AND status = 'published'",
      [id]
    );
    const [articles] = await pool.query(
      `SELECT id, title, summary, pinned, published_at, created_at
       FROM articles WHERE author_id = ? AND status = 'published'
       ORDER BY pinned DESC, published_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [id, pageSize, (page - 1) * pageSize]
    );
    res.json({
      user: {
        id: user.id,
        name: user.name,
        name_color: user.name_color || null,
        avatar_url: user.avatar_url,
        bio: user.bio || '',
        created_at: user.created_at,
      },
      articles,
      total,
      page,
      pageSize,
    });
  } catch (e) {
    next(e);
  }
});
