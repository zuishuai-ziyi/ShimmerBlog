/**
 * 审核后台接口（挂载于 /api/review）。
 * 除 /login 外全部需要审核员令牌（reviewerRequired）。
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { reviewerRequired } from '../middleware/auth.js';
import { signReviewerToken, makeLimiter } from '../utils.js';
import { captchaGuard } from '../services/captcha.js';
import { applyHumanDecision, ReviewError, describeRecord } from '../services/review.js';
import { getReviewerNotifyPrefs, setReviewerNotifyPrefs, reviewerNotifyOf } from '../services/notify.js';

export const reviewRouter = Router();

/** 登录限流：同 IP 15 分钟内最多 10 次 */
const reviewerLoginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyOf: (req) => `review-login:${req.ip}`,
  message: '登录尝试过于频繁，请 15 分钟后再试',
});

/** 审核员对外信息（含通知开关） */
function publicReviewer(r) {
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name || '',
    email: r.email || '',
    notify: reviewerNotifyOf(r.notify_prefs),
  };
}

/** 记录里的 stages 是 JSON 数组字符串 → 解析成数组 */
function parseStages(value) {
  try {
    const arr = JSON.parse(String(value ?? ''));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** ReviewError 按自带状态码返回，其余交给全局错误处理 */
function fail(e, res, next) {
  if (e instanceof ReviewError) return res.status(e.status).json({ error: e.message });
  next(e);
}

/* ---------- 登录 ---------- */
reviewRouter.post('/login', reviewerLoginLimiter, captchaGuard, async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
    const [rows] = await pool.query('SELECT * FROM reviewers WHERE username = ? LIMIT 1', [username]);
    const r = rows[0];
    if (!r || !(await bcrypt.compare(password, r.password_hash))) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    if (r.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    await pool.query('UPDATE reviewers SET last_login_at = NOW() WHERE id = ?', [r.id]);
    res.json({ token: signReviewerToken(r), reviewer: publicReviewer(r) });
  } catch (e) {
    next(e);
  }
});

/* ---------- 当前审核员 ---------- */
reviewRouter.get('/me', reviewerRequired, async (req, res, next) => {
  try {
    const notify = await getReviewerNotifyPrefs(req.reviewer.id);
    res.json({ reviewer: { ...req.reviewer, notify } });
  } catch (e) {
    next(e);
  }
});

/* ---------- 通知设置（新任务提醒开关） ---------- */
reviewRouter.put('/notify-prefs', reviewerRequired, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const notify = await setReviewerNotifyPrefs(req.reviewer.id, body);
    res.json({ notify });
  } catch (e) {
    next(e);
  }
});

/* ---------- 待人工审核队列 ---------- */
reviewRouter.get('/queue', reviewerRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM review_records WHERE status = 'pending' AND stage = 'human'"
    );
    const [rows] = await pool.query(
      `SELECT rr.id, rr.article_id, a.status AS article_status,
              u.name AS author_name, u.avatar_url AS author_avatar,
              rr.title, rr.summary, rr.content, rr.stages, rr.stage, rr.stage_index, rr.status,
              rr.ai_verdict, rr.ai_reason, rr.ai_error, rr.created_at
       FROM review_records rr
       LEFT JOIN users u ON u.id = rr.author_id
       LEFT JOIN articles a ON a.id = rr.article_id
       WHERE rr.status = 'pending' AND rr.stage = 'human'
       ORDER BY rr.created_at ASC, rr.id ASC
       LIMIT ? OFFSET ?`,
      [pageSize, (page - 1) * pageSize]
    );
    // 步骤信息（进度条用）：与其它接口同一套 describeRecord
    const items = rows.map((r) => {
      const d = describeRecord(r);
      return {
        ...r,
        stages: d.stages,
        steps: d.steps,
        current_stage: d.current_stage,
        current_stage_label: d.current_stage_label,
      };
    });
    res.json({ items, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/* ---------- 单条记录详情（含操作流水） ---------- */
reviewRouter.get('/records/:id', reviewerRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '记录 ID 无效' });
    const [rows] = await pool.query(
      `SELECT rr.id, rr.article_id, a.status AS article_status,
              u.name AS author_name, u.avatar_url AS author_avatar,
              rr.title, rr.summary, rr.content, rr.stages, rr.stage, rr.stage_index,
              rr.status, rr.ai_verdict, rr.ai_reason, rr.ai_error,
              rr.reviewer_id, rr.reject_note, rr.created_at, rr.decided_at
       FROM review_records rr
       LEFT JOIN users u ON u.id = rr.author_id
       LEFT JOIN articles a ON a.id = rr.article_id
       WHERE rr.id = ? LIMIT 1`,
      [id]
    );
    const record = rows[0];
    if (!record) return res.status(404).json({ error: '审核记录不存在' });
    const [actions] = await pool.query(
      'SELECT * FROM review_actions WHERE record_id = ? ORDER BY created_at ASC, id ASC',
      [id]
    );
    // 步骤信息（进度条用）：与其它接口同一套 describeRecord
    const d = describeRecord(record);
    res.json({
      ...record,
      stages: d.stages,
      steps: d.steps,
      current_stage: d.current_stage,
      current_stage_label: d.current_stage_label,
      actions,
    });
  } catch (e) {
    next(e);
  }
});

/* ---------- 人工裁决 ---------- */
reviewRouter.post('/records/:id/decide', reviewerRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '记录 ID 无效' });
    const action = String(req.body?.action ?? '').trim().toLowerCase();
    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: '审核操作无效' });
    }
    const note = req.body?.note === undefined || req.body?.note === null ? '' : String(req.body.note);
    if (note.length > 500) return res.status(400).json({ error: '备注最长 500 字' });
    const record = await applyHumanDecision({ recordId: id, reviewer: req.reviewer, action, note });
    res.json({ record });
  } catch (e) {
    fail(e, res, next);
  }
});

/* ---------- 我的处理历史 ---------- */
reviewRouter.get('/history', reviewerRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM review_records WHERE status IN ('approved','rejected') AND reviewer_id = ?",
      [req.reviewer.id]
    );
    const [rows] = await pool.query(
      `SELECT rr.id, rr.article_id, rr.title, rr.status, rr.reject_note, rr.decided_at, rr.created_at,
              u.name AS author_name
       FROM review_records rr
       LEFT JOIN users u ON u.id = rr.author_id
       WHERE rr.status IN ('approved','rejected') AND rr.reviewer_id = ?
       ORDER BY rr.decided_at DESC, rr.id DESC
       LIMIT ? OFFSET ?`,
      [req.reviewer.id, pageSize, (page - 1) * pageSize]
    );
    res.json({ items: rows, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/* ---------- 修改自己的密码 ---------- */
reviewRouter.put('/password', reviewerRequired, async (req, res, next) => {
  try {
    const oldPassword = String(req.body?.oldPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (newPassword.length < 8) return res.status(400).json({ error: '新密码至少 8 位' });
    if (newPassword.length > 100) return res.status(400).json({ error: '新密码最长 100 位' });
    const [rows] = await pool.query('SELECT * FROM reviewers WHERE id = ? LIMIT 1', [req.reviewer.id]);
    const r = rows[0];
    if (!r) return res.status(403).json({ error: '账号不可用' });
    if (!(await bcrypt.compare(oldPassword, r.password_hash))) {
      return res.status(401).json({ error: '当前密码错误' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE reviewers SET password_hash = ? WHERE id = ?', [hash, r.id]);
    res.json({ ok: true, message: '密码已修改' });
  } catch (e) {
    next(e);
  }
});
