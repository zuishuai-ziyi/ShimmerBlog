import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { userCanPost } from '../utils.js';
import { imageUpload } from '../uploads.js';

export const articlesRouter = Router();

const LIST_FIELDS = `
  a.id, a.title, a.summary, a.status, a.pinned, a.published_at, a.created_at, a.updated_at,
  u.id AS author_id, u.name AS author_name, u.name_color AS author_name_color, u.avatar_url AS author_avatar
`;

const LIST_JOIN = 'FROM articles a JOIN users u ON a.author_id = u.id';

async function loadArticle(id) {
  const [rows] = await pool.query(
    `SELECT a.*, u.name AS author_name, u.name_color AS author_name_color, u.avatar_url AS author_avatar
     FROM articles a JOIN users u ON a.author_id = u.id WHERE a.id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
}

function canEdit(user, article) {
  return !!user && user.id === article.author_id;
}

function validateArticlePayload(body) {
  const title = String(body?.title ?? '').trim();
  const summary = String(body?.summary ?? '').trim();
  const content = String(body?.content ?? '');
  if (title.length < 1 || title.length > 200) return { error: '标题长度需在 1-200 字之间' };
  if (summary.length > 500) return { error: '简介最多 500 字' };
  if (content.length < 1 || content.length > 50000) return { error: '正文长度需在 1-50000 字之间' };
  const status = body?.status === 'published' ? 'published' : 'draft';
  return { title, summary, content, status };
}

/* ---------- 创建 ---------- */
articlesRouter.post('/', authRequired, async (req, res, next) => {
  try {
    if (!userCanPost(req.user)) return res.status(403).json({ error: '没有写作权限（可在后台申请开通）' });
    const v = validateArticlePayload(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const publishedAt = v.status === 'published' ? new Date() : null;
    const [r] = await pool.query(
      'INSERT INTO articles (author_id, title, summary, content, status, published_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, v.title, v.summary, v.content, v.status, publishedAt]
    );
    const article = await loadArticle(r.insertId);
    res.status(201).json({ article });
  } catch (e) {
    next(e);
  }
});

/* ---------- 修改（作者或管理员） ---------- */
articlesRouter.put('/:id', authRequired, async (req, res, next) => {
  try {
    const article = await loadArticle(req.params.id);
    if (!article) return res.status(404).json({ error: '文章不存在' });
    if (!canEdit(req.user, article)) return res.status(403).json({ error: '无权修改他人文章' });
    const v = validateArticlePayload(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    let publishedAt = article.published_at;
    if (v.status === 'published' && !publishedAt) publishedAt = new Date();
    await pool.query('UPDATE articles SET title = ?, summary = ?, content = ?, status = ?, published_at = ? WHERE id = ?', [
      v.title,
      v.summary,
      v.content,
      v.status,
      publishedAt,
      article.id,
    ]);
    res.json({ article: await loadArticle(article.id) });
  } catch (e) {
    next(e);
  }
});

/* ---------- 删除（作者或管理员） ---------- */
articlesRouter.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const article = await loadArticle(req.params.id);
    if (!article) return res.status(404).json({ error: '文章不存在' });
    if (!canEdit(req.user, article)) return res.status(403).json({ error: '无权删除他人文章' });
    await pool.query('DELETE FROM articles WHERE id = ?', [article.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- 置顶/取消置顶（管理员） ---------- */
articlesRouter.post('/:id/pin', authRequired, adminRequired, async (req, res, next) => {
  try {
    const article = await loadArticle(req.params.id);
    if (!article) return res.status(404).json({ error: '文章不存在' });
    // 前端可能传 0/1、false/true 或 '0'/'1'，统一归一化
    const raw = req.body?.pinned;
    const pinned = raw === 0 || raw === false || raw === '0' || raw === 'false' ? 0 : 1;
    await pool.query('UPDATE articles SET pinned = ? WHERE id = ?', [pinned, article.id]);
    res.json({ article: await loadArticle(article.id) });
  } catch (e) {
    next(e);
  }
});

/* ---------- 公开列表（已发布，置顶优先 + 时间倒序，分页） ---------- */
articlesRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 10) || 10));
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM articles WHERE status = 'published'");
    const [rows] = await pool.query(
      `SELECT ${LIST_FIELDS} ${LIST_JOIN}
       WHERE a.status = 'published'
       ORDER BY a.pinned DESC, a.published_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [pageSize, (page - 1) * pageSize]
    );
    res.json({ items: rows, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/* ---------- 我的文章（含草稿，时间倒序） ---------- */
articlesRouter.get('/mine', authRequired, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${LIST_FIELDS} ${LIST_JOIN} WHERE a.author_id = ? ORDER BY a.updated_at DESC, a.id DESC`,
      [req.user.id]
    );
    res.json({ items: rows, total: rows.length });
  } catch (e) {
    next(e);
  }
});

/* ---------- 详情（已发布公开；草稿仅作者/管理员可见） ---------- */
articlesRouter.get('/:id', async (req, res, next) => {
  try {
    const article = await loadArticle(req.params.id);
    if (!article) return res.status(404).json({ error: '文章不存在' });
    if (article.status !== 'published') {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      let uid = null;
      if (token) {
        try {
          uid = jwt.verify(token, config.jwtSecret)?.uid ?? null;
        } catch {
          uid = null;
        }
      }
      if (uid == null || uid !== article.author_id) return res.status(403).json({ error: '文章未发布' });
    }
    res.json({ article });
  } catch (e) {
    next(e);
  }
});

/* ---------- 正文配图上传（登录用户） ---------- */
articlesRouter.post('/upload-image', authRequired, (req, res) => {
  imageUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || '图片上传失败' });
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    res.json({ url: `/uploads/images/${req.file.filename}` });
  });
});
