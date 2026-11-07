import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { config } from '../config.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { userCanPost, applyDefaultNameColor } from '../utils.js';
import { imageUpload } from '../uploads.js';
import { captchaGuard, verifyCaptcha } from '../services/captcha.js';
import {
  getFlowConfig,
  submitForReview,
  cancelPendingByArticle,
  getBlockingReviewRecord,
  releaseFailedRecordByArticle,
  describeRecord,
  ReviewError,
} from '../services/review.js';

export const articlesRouter = Router();

const LIST_FIELDS = `
  a.id, a.title, a.summary, a.status, a.pinned, a.published_at, a.created_at, a.updated_at,
  u.id AS author_id, u.name AS author_name, u.name_color AS author_name_color, u.avatar_url AS author_avatar
`;

/** 我的文章：额外带出审核状态（作者端据此显示「审核中 / 未通过」标记） */
const MINE_FIELDS = `
  a.id, a.title, a.summary, a.status, a.review_state, a.pinned, a.published_at, a.created_at, a.updated_at,
  u.id AS author_id, u.name AS author_name, u.name_color AS author_name_color, u.avatar_url AS author_avatar
`;

const LIST_JOIN = 'FROM articles a JOIN users u ON a.author_id = u.id';

async function loadArticle(id) {
  const [rows] = await pool.query(
    `SELECT a.*, u.name AS author_name, u.name_color AS author_name_color, u.avatar_url AS author_avatar
     FROM articles a JOIN users u ON a.author_id = u.id WHERE a.id = ? LIMIT 1`,
    [id]
  );
  const article = rows[0];
  if (article) await applyDefaultNameColor([article]);
  return article;
}

function canEdit(user, article) {
  return !!user && user.id === article.author_id;
}

/** 审核总开关是否打开（流程配置里 enabled） */
async function reviewEnabled() {
  const flow = await getFlowConfig();
  return flow?.enabled === true;
}

/** 从 Authorization 头解析请求者：普通用户 uid / 后台管理员标记 */
function identifyRequester(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { uid: null, isAdmin: false };
  let uid = null;
  try {
    uid = jwt.verify(token, config.jwtSecret)?.uid ?? null;
  } catch {
    uid = null;
  }
  let isAdmin = false;
  try {
    isAdmin = !!jwt.verify(token, `${config.jwtSecret}:admin`)?.admin;
  } catch {
    isAdmin = false;
  }
  return { uid, isAdmin };
}

/**
 * 步骤 → 审核流水动作的归类表（作者详情的步骤时间/意见用）。
 * 数组顺序即优先级：同一阶段可能留有多条流水（例如 AI 先报错、随后又给出结论），
 * 取优先级最高的那条作为该步骤的意见。未知动作不参与归类，仍原样出现在 actions 里。
 */
const STEP_ACTION_MAP = {
  ai: ['ai_approve', 'ai_reject', 'ai_error', 'ai_retry'],
  human: ['approve', 'reject', 'force_approve', 'force_reject'],
};

/**
 * 作者可见的「AI 初审失败」文案：上游错误原文（可能含接口地址 / 响应体）只在
 * 管理员 / 审核员的记录详情里出现（routes/review.js），作者侧统一泛化。
 */
const AI_ERROR_AUTHOR_NOTE = 'AI 初审暂不可用，已转人工审核';
const AI_ERROR_STEP_LABEL = 'AI 初审失败';

/**
 * 给每个步骤补上 at（该步骤流水的原始时间戳）与 note（该步骤的意见），无流水时为 null。
 * opts.redactAiError=false 时保留 ai_error 的原文（管理员视角），默认泛化。
 * 匹配到 ai_error 的步骤额外带 error=true / error_label：describeStages 只看 status +
 * stage_index（AI 报错后可能已转人工，该步骤 state 仍是 done），展示层据此改文案。
 */
function attachStepFlow(steps, actions, opts = {}) {
  const redactAiError = opts.redactAiError !== false;
  return steps.map((step) => {
    const names = STEP_ACTION_MAP[step.key] || [];
    let hit = null;
    for (const name of names) {
      hit = actions.find((a) => a.action === name) || null;
      if (hit) break;
    }
    const isError = hit?.action === 'ai_error';
    const rawNote = hit && hit.note ? hit.note : null;
    return {
      ...step,
      at: hit ? hit.created_at : null,
      note: isError && redactAiError ? AI_ERROR_AUTHOR_NOTE : rawNote,
      ...(isError ? { error: true, error_label: AI_ERROR_STEP_LABEL } : {}),
    };
  });
}

/**
 * 取文章最新一条对应的审核记录，挂成 article.review。
 * - pending：最新一条待审记录
 * - rejected：最新一条被拒记录
 * 记录里的 title/summary/content 即提交时的快照。
 * 含 actions（该记录的审核流水）。本函数只被详情接口在「作者本人 / 管理员」视角调用，
 * 公开访问不会带出这些字段。
 */
async function attachReview(article, opts = {}) {
  const redactAiError = opts.redactAiError !== false;
  const state = article.review_state === 'pending' ? 'pending' : 'rejected';
  const [rows] = await pool.query(
    'SELECT * FROM review_records WHERE article_id = ? AND status = ? ORDER BY id DESC LIMIT 1',
    [article.id, state]
  );
  const rec = rows[0];
  if (!rec) return null;
  // 审核流水（谁在什么时候做了什么 / 意见）：按时间正序，保留原始时间戳
  const [rawActions] = await pool.query(
    `SELECT id, actor_type, actor_name, action, note, created_at
       FROM review_actions WHERE record_id = ? ORDER BY created_at ASC, id ASC`,
    [rec.id]
  );
  // 作者视角：AI 报错的原文（含上游响应）不外泄，只给泛化文案；管理员保留原文
  const actions = redactAiError
    ? rawActions.map((a) => (a.action === 'ai_error' ? { ...a, note: AI_ERROR_AUTHOR_NOTE } : a))
    : rawActions;
  // 步骤信息（前端进度条用）：与审核后台同一套 describeRecord
  const flow = describeRecord(rec);
  return {
    state,
    record: {
      id: rec.id,
      stage: rec.stage,
      ai_verdict: rec.ai_verdict ?? null,
      ai_reason: rec.ai_reason ?? null,
      reject_note: rec.reject_note ?? null,
      decided_at: rec.decided_at ?? null,
      created_at: rec.created_at,
    },
    snapshot: {
      title: rec.title,
      summary: rec.summary,
      content: rec.content,
    },
    steps: attachStepFlow(flow.steps, rawActions, { redactAiError }),
    current_stage: flow.current_stage,
    current_stage_label: flow.current_stage_label,
    stage_index: flow.stage_index,
    stages: flow.stages,
    actions,
  };
}

/**
 * 我的文章列表批量挂审核进度：一次查询取回这些文章「最新的未终结审核记录」，
 * 再展开成 steps / current_stage 等字段（与文章详情同一套 describeRecord）。
 * 没有未终结记录时 review 为 null。
 */
async function attachReviewList(rows) {
  if (!rows.length) return rows;
  // 只有 review_state 为 pending / rejected 的行才可能有「未终结审核记录」；
  // 与 GET /:id 的守卫（review_state 为 none 时不带 review）保持一致，
  // 否则已发布 / 已通过的文章会把历史记录当成当前进度展示。
  const ids = rows.filter((r) => r.review_state === 'pending' || r.review_state === 'rejected').map((r) => r.id);
  if (!ids.length) {
    for (const row of rows) row.review = null;
    return rows;
  }
  const [records] = await pool.query(
    `SELECT id, article_id, title, status, stages, stage_index, stage, ai_verdict, ai_error, reject_note, created_at
       FROM review_records
      WHERE article_id IN (?) AND status IN ('pending', 'rejected')
      ORDER BY id DESC`,
    [ids]
  );
  // 同一篇文章可能留有多条历史记录：只取 id 最大的一条（查询已按 id DESC 排序）
  const latest = new Map();
  for (const rec of records) {
    if (!latest.has(rec.article_id)) latest.set(rec.article_id, rec);
  }
  for (const row of rows) {
    const rec = ids.includes(row.id) ? latest.get(row.id) : null;
    if (!rec) {
      row.review = null;
      continue;
    }
    const flow = describeRecord(rec);
    row.review = {
      state: rec.status,
      steps: flow.steps,
      current_stage: flow.current_stage,
      current_stage_label: flow.current_stage_label,
      stage_index: flow.stage_index,
      stages: flow.stages,
    };
  }
  return rows;
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
articlesRouter.post('/', authRequired, captchaGuard, async (req, res, next) => {
  try {
    if (!userCanPost(req.user)) return res.status(403).json({ error: '没有写作权限（可在后台申请开通）' });
    const v = validateArticlePayload(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    // 审核开启：发布走审核流程 —— 先落草稿并送审，终审通过才真正发布
    if (v.status === 'published' && (await reviewEnabled())) {
      // 先落草稿（review_state 保持 none），送审成功后由 submitForReview 置为 pending；
      // 送审失败时文章不会卡在「审核中」
      const [r] = await pool.query(
        "INSERT INTO articles (author_id, title, summary, content, status, published_at) VALUES (?, ?, ?, ?, 'draft', NULL)",
        [req.user.id, v.title, v.summary, v.content]
      );
      try {
        await submitForReview({
          articleId: r.insertId,
          authorId: req.user.id,
          title: v.title,
          summary: v.summary,
          content: v.content,
          actorName: req.user.name || String(req.user.id),
        });
      } catch (e) {
        await pool.query("UPDATE articles SET review_state = 'none' WHERE id = ?", [r.insertId]).catch(() => {});
        if (e instanceof ReviewError) {
          return res.status(e.status).json({ code: 'REVIEW_PENDING', message: e.message, error: e.message });
        }
        throw e;
      }
      const article = await loadArticle(r.insertId);
      return res.status(201).json({ article, message: '已提交审核，通过后自动发布' });
    }
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
    if (await reviewEnabled()) {
      // 审核中：任何修改都不允许
      // 以「真正占用作者的记录」为准：AI 初审失败已放开的记录不算（作者可改稿重提）
      const blocking = await getBlockingReviewRecord(article.id);
      if (blocking) {
        return res.status(409).json({
          code: 'REVIEW_PENDING',
          message: '文章正在审核中',
          error: '文章正在审核中',
        });
      }
      // 没有占用中的记录，但状态还挂着 pending → 残留状态，归位
      if (article.review_state === 'pending') {
        await pool.query("UPDATE articles SET review_state = 'none' WHERE id = ? AND review_state = 'pending'", [article.id]);
      }
      if (v.status === 'published') {
        // 先建审核记录（快照新版本），再改文章内容：
        // 避免送审被拒（已有待审记录）时文章内容已被改写
        try {
          await submitForReview({
            articleId: article.id,
            authorId: article.author_id,
            title: v.title,
            summary: v.summary,
            content: v.content,
            actorName: req.user.name || String(req.user.id),
          });
        } catch (e) {
          if (e instanceof ReviewError) {
            return res.status(e.status).json({ code: 'REVIEW_PENDING', message: e.message, error: e.message });
          }
          throw e;
        }
        if (article.status === 'draft') {
          // 草稿 → 送审：写入新版本内容，状态保持草稿，published_at 不动
          await pool.query(
            "UPDATE articles SET title = ?, summary = ?, content = ?, review_state = 'pending' WHERE id = ?",
            [v.title, v.summary, v.content, article.id]
          );
        } else {
          // 已发布 → 送审：线上内容保持旧版不动，只标记待审
          await pool.query("UPDATE articles SET review_state = 'pending' WHERE id = ?", [article.id]);
        }
        return res.json({ article: await loadArticle(article.id), message: '已提交审核，通过后自动发布' });
      }
      // 存草稿：按原逻辑更新，并把审核状态归位（被拒稿重新存草稿后回到未审核）
      // 若还有「AI 初审失败」的待审记录，一并作废：它的快照已经过时
      await releaseFailedRecordByArticle(article.id, req.user.name || String(req.user.id)).catch((e) => {
        console.error('[review] 释放失败记录失败:', String(e?.message || e));
      });
      await pool.query(
        "UPDATE articles SET title = ?, summary = ?, content = ?, status = 'draft', published_at = ?, review_state = 'none' WHERE id = ?",
        [v.title, v.summary, v.content, article.published_at, article.id]
      );
      return res.json({ article: await loadArticle(article.id) });
    }
    // 审核未启用：走原逻辑；若之前遗留「审核中」状态则一并归位，
    // 否则作者会被永久 409 卡住（审核开关关掉后没人再处理队列）
    if (article.review_state && article.review_state !== 'none') {
      await cancelPendingByArticle(article.id, req.user.name || String(req.user.id)).catch((e) => {
        console.error('[review] 取消待审记录失败:', String(e?.message || e));
      });
      await pool.query("UPDATE articles SET review_state = 'none' WHERE id = ?", [article.id]).catch(() => {});
    }
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
    // 删除前取消该文章下所有待审记录（避免留下永远pending的记录）
    await cancelPendingByArticle(article.id, req.user.name || String(req.user.id)).catch((e) => {
      console.error('[review] 取消待审记录失败:', String(e?.message || e));
    });
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
    await applyDefaultNameColor(rows);
    res.json({ items: rows, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/* ---------- 我的文章（含草稿，时间倒序） ---------- */
articlesRouter.get('/mine', authRequired, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${MINE_FIELDS} ${LIST_JOIN} WHERE a.author_id = ? ORDER BY a.updated_at DESC, a.id DESC`,
      [req.user.id]
    );
    // 每项追加 review：审核步骤 / 当前阶段（无未终结记录时为 null）
    await attachReviewList(rows);
    await applyDefaultNameColor(rows);
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
    const { uid, isAdmin } = identifyRequester(req);
    const isOwner = uid != null && Number(uid) === Number(article.author_id);
    if (article.status !== 'published') {
      // 草稿仅作者与管理员可见
      if (!isOwner && !isAdmin) return res.status(403).json({ error: '文章未发布' });
    }
    // 待审 / 被拒时，作者与管理员可看到审核进度与提交快照
    if ((isOwner || isAdmin) && article.review_state && article.review_state !== 'none') {
      // 管理员看原文，作者只看泛化后的 AI 报错文案
      const review = await attachReview(article, { redactAiError: !isAdmin });
      if (review) article.review = review;
    }
    res.json({ article });
  } catch (e) {
    next(e);
  }
});

/* ---------- 正文配图上传（登录用户） ---------- */
articlesRouter.post('/upload-image', authRequired, (req, res) => {
  imageUpload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || '图片上传失败' });
    // multipart 表单：captcha 字段为 JSON 字符串，需在 multer 解析后校验（先验证码后文件处理）
    const v = await verifyCaptcha(req.body?.captcha);
    if (!v.ok) return res.status(v.status).json({ error: v.error });
    if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
    res.json({ url: `/uploads/images/${req.file.filename}` });
  });
});
