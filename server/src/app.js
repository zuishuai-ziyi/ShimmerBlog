import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { articlesRouter } from './routes/articles.js';
import { adminRouter } from './routes/admin.js';
import { spaceRouter } from './routes/space.js';
import { siteRouter } from './routes/site.js';
import { uploadsDir } from './uploads.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: ['http://localhost:5180', 'http://127.0.0.1:5180', 'http://localhost:5173'], credentials: true }));
  app.use(express.json({ limit: '5mb' }));

  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

  app.use('/api', healthRouter);
  app.use('/api', siteRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/articles', articlesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/space', spaceRouter);

  // /api 未知路径 → JSON 404
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

  // 统一错误处理（multer 限流等 → 400 JSON）
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[server] error:', err.message);
    res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
  });

  return app;
}
