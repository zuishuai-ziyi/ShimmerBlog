import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { articlesRouter } from './routes/articles.js';
import { adminRouter } from './routes/admin.js';
import { spaceRouter } from './routes/space.js';
import { siteRouter } from './routes/site.js';
import { uploadsDir } from './uploads.js';

// 生产环境由后端直接托管前端构建产物（宝塔「Node 项目」整站反代到本服务即可，
// 不需要 Nginx 做 /api、/uploads 的部分路径反代）；开发时不构建也不影响。
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.resolve(here, '../../web/dist');
const indexHtml = path.join(distDir, 'index.html');
const hasDist = fs.existsSync(indexHtml);

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

  // 前端静态资源 + SPA history 回退（仅当存在构建产物时）
  if (hasDist) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
          // /assets 下是带 hash 的文件，可长期缓存；入口 HTML 永不缓存
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
            return;
          }
          res.setHeader(
            'Cache-Control',
            filePath.includes(`${path.sep}assets${path.sep}`)
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=3600'
          );
        },
      })
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
    console.log(`[server] 前端静态托管已开启: ${distDir}`);
  } else {
    console.log(`[server] 未找到前端构建产物（${distDir}），仅提供 API`);
  }

  // 统一错误处理（multer 限流等 → 400 JSON）
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[server] error:', err.message);
    res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
  });

  return app;
}
