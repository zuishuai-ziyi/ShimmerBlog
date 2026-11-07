/**
 * 文章审核流程引擎。
 *
 * 流程：作者提交 → （可选）AI 初审 → （可选）人工审核 → 终审通过则把快照写回 articles 并发布。
 * 阶段与去向由 settings 里的 review_flow 决定：
 *   stages：['ai','human'] 的子集（去重、非空）
 *   ai / human 段的 on_approve / on_reject：'next' 进下一阶段，'final_approve' / 'final_reject' 直接终审
 *
 * 记录表 review_records 保存提交时的文章快照（标题/摘要/正文），
 * 终审通过才用快照覆盖 articles —— 作者在审核期间改稿不会影响本次审核结果。
 */

import { pool } from '../db.js';
import { getSetting, DEFAULTS } from './settings.js';
import { runAIReview } from './ai-review.js';
import { notifyUser, notifyReviewersNewTask, articleUrl } from './notify.js';

/** 业务错误：带 HTTP 状态码，路由层直接回给前端 */
export class ReviewError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReviewError';
    this.status = status;
  }
}

/** 阶段枚举 */
const STAGE_AI = 'ai';
const STAGE_HUMAN = 'human';

/** 阶段标签表（对外展示用；未知 key 的标签回退为 key 本身） */
const STAGE_LABELS = {
  [STAGE_AI]: 'AI 审核',
  [STAGE_HUMAN]: '人工审核',
};

/* ---------- 配置读取与归一化 ---------- */

/** 解析 JSON 对象；失败返回 null */
function parseJsonObject(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    const obj = JSON.parse(String(raw ?? ''));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** 解析 stages 字段（记录里存的是 JSON 数组字符串） */
function parseStages(value) {
  let arr = value;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((s) => s === STAGE_AI || s === STAGE_HUMAN);
}

/**
 * enabled 归一化：只有明确关闭的值才算关闭。
 * 历史脏数据里 enabled 可能是字符串 "false" / "0"，用 `!== false` 判断会被当成「开启」，
 * 这里按字符串归一化，避免把显式关闭的配置误判为开启。
 */
function parseEnabled(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(v)) return false;
  return true;
}

/** 读取动作枚举，非法抛错 */
function pickAction(value, allowed, label) {
  if (value === undefined || value === null || value === '') return allowed[allowed.length - 1];
  const v = String(value);
  if (!allowed.includes(v)) throw new ReviewError(`审核流程配置无效：${label}`, 400);
  return v;
}

/**
 * 归一化审核流程配置。
 * - stages：只允许 'ai' / 'human'，去重且非空
 * - ai / human 的 on_approve ∈ ['final_approve','next']，on_reject ∈ ['final_reject','next']
 * - 最后一个阶段（含单一阶段）的 'next' 归一化为对应的 final
 * 非法配置抛 ReviewError。
 */
export function normalizeFlow(obj) {
  const raw = parseJsonObject(obj) || {};
  const stageList = Array.isArray(raw.stages) ? raw.stages : [];
  const stages = [];
  for (const s of stageList) {
    if (s !== STAGE_AI && s !== STAGE_HUMAN) throw new ReviewError('审核流程配置无效：stages 只能包含 ai / human', 400);
    if (!stages.includes(s)) stages.push(s);
  }
  if (!stages.length) throw new ReviewError('审核流程配置无效：stages 不能为空', 400);

  const aiRaw = parseJsonObject(raw.ai) || {};
  const humanRaw = parseJsonObject(raw.human) || {};
  const flow = {
    enabled: parseEnabled(raw.enabled),
    stages,
    ai: {
      on_approve: pickAction(aiRaw.on_approve, ['final_approve', 'next'], 'ai.on_approve'),
      on_reject: pickAction(aiRaw.on_reject, ['final_reject', 'next'], 'ai.on_reject'),
    },
    human: {
      on_approve: pickAction(humanRaw.on_approve, ['final_approve', 'next'], 'human.on_approve'),
      on_reject: pickAction(humanRaw.on_reject, ['final_reject', 'next'], 'human.on_reject'),
    },
  };
  return applyFinalRule(flow, stages);
}

/**
 * 最后一个阶段（含单一阶段）的 'next' 归一化为对应的 final：
 * 该阶段走到最后没有下一阶段了，直接出终审结果。
 */
function applyFinalRule(flow, stages) {
  const list = Array.isArray(stages) && stages.length ? stages : flow.stages;
  const last = list[list.length - 1];
  const out = {
    ...flow,
    stages: list,
    ai: { ...flow.ai },
    human: { ...flow.human },
  };
  if (last === STAGE_AI) {
    if (out.ai.on_approve === 'next') out.ai.on_approve = 'final_approve';
    if (out.ai.on_reject === 'next') out.ai.on_reject = 'final_reject';
  } else if (last === STAGE_HUMAN) {
    if (out.human.on_approve === 'next') out.human.on_approve = 'final_approve';
    if (out.human.on_reject === 'next') out.human.on_reject = 'final_reject';
  }
  return out;
}

/**
 * 读取审核流程配置。
 * - 未配置（空值）→ 用内置默认（默认关闭审核）
 * - 已配置但非法 → 保守回退：保留「审核开启」，避免审核被静默关掉导致文章直接发布
 */
export async function getFlowConfig() {
  const raw = await getSetting('review_flow');
  const stored = parseJsonObject(raw);
  if (stored) {
    try {
      return normalizeFlow(stored);
    } catch (e) {
      console.error('[review] 审核流程配置无效，回退保守默认（保留审核开启）:', String(e?.message || e));
    }
  } else if (String(raw ?? '').trim()) {
    console.error('[review] 审核流程配置无法解析，回退保守默认（保留审核开启）');
  } else {
    return normalizeFlow(parseJsonObject(DEFAULTS.review_flow));
  }
  const fallback = normalizeFlow(parseJsonObject(DEFAULTS.review_flow));
  fallback.enabled = true;
  return fallback;
}

/** 读取 AI 审核配置；缺项回退内置默认 */
export async function getAIConfig() {
  const d = parseJsonObject(DEFAULTS.review_ai) || {};
  const stored = parseJsonObject(await getSetting('review_ai')) || {};
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    base_url: String(stored.base_url ?? d.base_url ?? ''),
    api_key: String(stored.api_key ?? d.api_key ?? ''),
    model: String(stored.model ?? d.model ?? ''),
    thinking: String(stored.thinking ?? d.thinking ?? 'off'),
    temperature: num(stored.temperature, num(d.temperature, 0.2)),
    timeout_seconds: num(stored.timeout_seconds, num(d.timeout_seconds, 60)),
    strictness: String(stored.strictness ?? d.strictness ?? 'standard'),
    custom_prompt: String(stored.custom_prompt ?? d.custom_prompt ?? ''),
  };
}

/* ---------- 步骤描述（接口输出与邮件文案共用） ---------- */

/** 阶段标签；未知 key 回退为 key 本身 */
export function stageLabel(stage) {
  const key = String(stage ?? '');
  return STAGE_LABELS[key] || key;
}

/**
 * 解析 stages（展示用）：接受 JSON 数组字符串或数组，保留未知 key。
 * 与 parseStages 的区别：parseStages 只保留 ai/human（流程配置校验用），
 * 这里不做白名单过滤，未知 key 由 stageLabel 回退成 key 本身。
 */
function parseStageList(value) {
  let arr = value;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s ?? '').trim()).filter((s) => s !== '');
}

/**
 * 把审核阶段序列翻译成「步骤 + 当前步骤」结构（前端进度条 / 邮件文案共用）。
 * opts: { stageIndex = 0, status = 'pending' }
 * - pending：阶段之前的 done、当前阶段 current、之后 pending
 * - approved：全部 done；rejected：当前（或越界时的最后一步）rejected；cancelled：已完成的部分 done，其余 pending
 * 返回 { steps, current_stage, current_stage_label, stage_index, stages }
 */
export function describeStages(stagesInput, opts = {}) {
  const stages = parseStageList(stagesInput);
  const rawIndex = Number(opts?.stageIndex ?? 0);
  const stageIndex = Number.isFinite(rawIndex) ? Math.max(0, Math.trunc(rawIndex)) : 0;
  const status = String(opts?.status ?? 'pending');
  if (!stages.length) {
    return { steps: [], current_stage: null, current_stage_label: null, stage_index: 0, stages: [] };
  }
  const steps = stages.map((key) => ({ key, label: stageLabel(key), state: 'pending' }));
  let current_stage = null;
  let current_stage_label = null;
  if (status === 'approved') {
    for (const s of steps) s.state = 'done';
  } else if (status === 'rejected') {
    steps.forEach((s, i) => {
      s.state = i < stageIndex ? 'done' : 'pending';
    });
    // 拒绝发生在当前阶段；stage_index 越界时落在最后一步
    const rejectIndex = stageIndex < steps.length ? stageIndex : steps.length - 1;
    if (rejectIndex >= 0) steps[rejectIndex].state = 'rejected';
  } else if (status === 'cancelled') {
    steps.forEach((s, i) => {
      s.state = i < stageIndex ? 'done' : 'pending';
    });
  } else {
    // pending 及其它未知状态：按 pending 处理
    steps.forEach((s, i) => {
      s.state = i < stageIndex ? 'done' : i > stageIndex ? 'pending' : 'current';
    });
    const cur = stages[stageIndex];
    if (cur) {
      current_stage = cur;
      current_stage_label = stageLabel(cur);
    }
  }
  return { steps, current_stage, current_stage_label, stage_index: stageIndex, stages };
}

/** 从一条审核记录（review_records 行）取步骤信息 */
export function describeRecord(record) {
  if (!record) return describeStages([], { stageIndex: 0, status: 'pending' });
  return describeStages(record.stages, {
    stageIndex: Number(record.stage_index ?? 0),
    status: record.status ?? 'pending',
  });
}

/** 流程文案：'1. AI 审核 → 2. 人工审核'（无阶段时返回空串） */
export function formatFlowText(stagesInput, opts = {}) {
  const d = describeStages(stagesInput, opts);
  if (!d.steps.length) return '';
  return d.steps.map((s, i) => `${i + 1}. ${s.label}`).join(' → ');
}

/** 当前步骤文案：'AI 审核' / '人工审核' / '已完成' / '已拒绝' / '已取消' */
export function formatCurrentStageText(stagesInput, opts = {}) {
  const status = String(opts?.status ?? 'pending');
  if (status === 'approved') return '已完成';
  if (status === 'rejected') return '已拒绝';
  if (status === 'cancelled') return '已取消';
  const d = describeStages(stagesInput, opts);
  return d.current_stage_label || '';
}

/* ---------- 数据访问 ---------- */

/** 取一条审核记录 */
export async function getRecord(id) {
  const [rows] = await pool.query('SELECT * FROM review_records WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/** 记一条审核流水（传入 conn 时并入调用方事务，保证审计与状态一致） */
export async function addAction(recordId, actorType, actorName, action, note, conn = pool) {
  await conn.query(
    'INSERT INTO review_actions (record_id, actor_type, actor_name, action, note) VALUES (?, ?, ?, ?, ?)',
    [
      recordId,
      actorType,
      String(actorName ?? '').slice(0, 100),
      String(action ?? '').slice(0, 30),
      note === undefined || note === null || note === '' ? null : String(note).slice(0, 500),
    ]
  );
}

/* ---------- 通知（异步、不阻塞主流程） ---------- */

/** 触发一个通知任务：不等结果、失败只记日志 */
function fire(promise) {
  Promise.resolve(promise).catch((e) =>
    console.warn('[review] 通知发送失败（已忽略）:', String(e?.message || e))
  );
}

/**
 * 通知审核员：队列里出现了新的人工审核任务（记录已进入 human 阶段）。
 * 只能在对应事务提交之后调用；函数内部吞掉所有异常，不影响审核流程。
 */
async function notifyHumanQueue(record) {
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS n FROM review_records WHERE status = 'pending' AND stage = 'human'"
  );
  const count = Number(row?.n ?? 0);
  const [rows] = await pool.query('SELECT name FROM users WHERE id = ? LIMIT 1', [record?.author_id]);
  const author = rows[0]?.name || '作者';
  // 邮件里带上当前流程与所处步骤（变量名与模板占位符一致）
  const stageIndex = Number(record?.stage_index ?? 0);
  const status = record?.status ?? 'pending';
  const flowText = formatFlowText(record?.stages, { stageIndex, status });
  const currentStageText = formatCurrentStageText(record?.stages, { stageIndex, status });
  return await notifyReviewersNewTask({
    title: record?.title || '',
    author,
    count,
    flow: flowText,
    current_stage: currentStageText,
  });
}

/* ---------- 阶段推进 ---------- */

/**
 * 进入下一阶段：stage_index + 1，stage 取 stages 的下一项。
 * 没有下一阶段时返回 null（调用方据此直接终审）。
 */
export async function advance(record) {
  const stages = parseStages(record?.stages);
  const nextIndex = Number(record?.stage_index ?? 0) + 1;
  if (!stages.length || nextIndex >= stages.length) return null;
  const nextStage = stages[nextIndex];
  // 进入下一阶段时释放当前审核员占用（reviewer_id 置空），
  // 否则上一阶段的审核员会一直占着记录，下一阶段没人能认领
  await pool.query(
    "UPDATE review_records SET stage = ?, stage_index = ?, reviewer_id = NULL WHERE id = ? AND status = 'pending'",
    [nextStage, nextIndex, record.id]
  );
  const next = await getRecord(record.id);
  // 进入人工阶段 = 新建一条人工审核任务：通知审核员
  //（上面的 UPDATE 是自动提交的单条语句，不在事务内；通知同样在事务外）
  if (next?.stage === STAGE_HUMAN) fire(notifyHumanQueue(next));
  return next;
}

/* ---------- 终审 ---------- */

/**
 * 终审通过：把快照写回文章并发布，标记文章无待审状态。
 * 并发保护：先抢文章行锁再抢记录（UPDATE ... AND status='pending'），
 * affectedRows=0 说明记录已被别人裁决过 → 409；文章已删除 → 409（不静默「通过」）。
 */
export async function finalizeApprove(record) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 锁文章行（与 submitForReview 的加锁顺序一致，避免死锁）；文章被删则无法通过
    const [arts] = await conn.query('SELECT id FROM articles WHERE id = ? FOR UPDATE', [record.article_id]);
    if (!arts.length) throw new ReviewError('文章不存在或已被删除，无法通过审核', 409);
    // 抢占记录：只有仍是 pending 的记录能被终审
    const [recRes] = await conn.query(
      "UPDATE review_records SET status = 'approved', stage = 'done', decided_at = NOW() WHERE id = ? AND status = 'pending'",
      [record.id]
    );
    if (!recRes.affectedRows) throw new ReviewError('该记录已被处理', 409);
    await conn.query(
      "UPDATE articles SET title = ?, summary = ?, content = ?, status = 'published', published_at = COALESCE(published_at, NOW()), review_state = 'none' WHERE id = ?",
      [record.title, record.summary, record.content, record.article_id]
    );
    // 流水与状态同事务：避免事务成功但流水丢失
    await addAction(record.id, 'system', 'system', 'final_approve', '', conn);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  // 事务已提交：审核通过通知放在事务外（异步发出，不拖长事务）
  const fresh = await getRecord(record.id);
  // 终审通过 → 流程文案 + 当前步骤（已完成）
  const freshIndex = Number(fresh?.stage_index ?? 0);
  const flowText = formatFlowText(fresh?.stages, { stageIndex: freshIndex, status: 'approved' });
  const currentStageText = formatCurrentStageText(fresh?.stages, { stageIndex: freshIndex, status: 'approved' });
  fire(
    notifyUser(fresh.author_id, 'review_approved', {
      title: fresh.title,
      url: await articleUrl(fresh.article_id),
      flow: flowText,
      current_stage: currentStageText,
    })
  );
  return fresh;
}

/** 终审拒绝：文章标记为已驳回（不改动发布状态），记录写驳回理由 */
export async function finalizeReject(record, note) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 锁文章行（与 submitForReview 的加锁顺序一致）
    await conn.query('SELECT id FROM articles WHERE id = ? FOR UPDATE', [record.article_id]);
    // 抢占记录：只有仍是 pending 的记录能被终审
    const [recRes] = await conn.query(
      "UPDATE review_records SET status = 'rejected', stage = 'done', reject_note = ?, decided_at = NOW() WHERE id = ? AND status = 'pending'",
      [note ? String(note).slice(0, 500) : null, record.id]
    );
    if (!recRes.affectedRows) throw new ReviewError('该记录已被处理', 409);
    await conn.query("UPDATE articles SET review_state = 'rejected' WHERE id = ?", [record.article_id]);
    await addAction(record.id, 'system', 'system', 'final_reject', note || '', conn);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  // 事务已提交：审核未通过通知放在事务外（异步发出，不拖长事务）
  const fresh = await getRecord(record.id);
  // 终审拒绝 → 流程文案 + 当前步骤（已拒绝）
  const freshIndex = Number(fresh?.stage_index ?? 0);
  const flowText = formatFlowText(fresh?.stages, { stageIndex: freshIndex, status: 'rejected' });
  const currentStageText = formatCurrentStageText(fresh?.stages, { stageIndex: freshIndex, status: 'rejected' });
  fire(
    notifyUser(fresh.author_id, 'review_rejected', {
      title: fresh.title,
      note: note || fresh.reject_note || '',
      flow: flowText,
      current_stage: currentStageText,
    })
  );
  return fresh;
}

/* ---------- 主流程 ---------- */

/**
 * 提交文章送审：建记录 + 记流水，然后异步推进流程（AI 阶段会立即跑 AI 初审）。
 * 同一篇文章已有待审记录时直接 409（避免旧快照在稍后被批准时覆盖线上内容）。
 * 返回新建的记录行。
 */
export async function submitForReview({ articleId, authorId, title, summary, content, actorName }) {
  const flow = await getFlowConfig();
  const stages = flow.stages;
  const conn = await pool.getConnection();
  let id = null;
  try {
    await conn.beginTransaction();
    // 锁文章行：同一篇文章的并发提交被串行化
    await conn.query('SELECT id FROM articles WHERE id = ? FOR UPDATE', [articleId]);
    // 已有待审记录 → 拒绝（不新建，旧快照不得覆盖线上内容）
    const [pend] = await conn.query(
      "SELECT id, stage, ai_error, reviewer_id FROM review_records WHERE article_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [articleId]
    );
    if (pend.length) {
      const p = pend[0];
      // AI 初审失败且无人认领的记录可复用（作者改稿后重提，沿用同一条记录）；
      // 其余情况（等人工裁决 / AI 在跑）一律拒绝，避免旧快照覆盖线上内容
      const reusable = p.stage === STAGE_AI && !!p.ai_error && !p.reviewer_id;
      if (!reusable) throw new ReviewError('该文章已有待审核记录，请等待审核完成', 409);
      await conn.query(
        `UPDATE review_records
         SET title = ?, summary = ?, content = ?, stages = ?, stage_index = 0, stage = ?,
             ai_verdict = NULL, ai_reason = NULL, ai_raw = NULL, ai_error = NULL,
             decided_at = NULL, created_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [
          String(title ?? '').slice(0, 200),
          String(summary ?? '').slice(0, 500),
          String(content ?? ''),
          JSON.stringify(stages),
          stages[0],
          p.id,
        ]
      );
      await addAction(p.id, 'author', actorName ?? '', 'submit', '复用上次未完成的审核记录', conn);
      id = p.id;
    } else {
      const [r] = await conn.query(
        `INSERT INTO review_records (article_id, author_id, title, summary, content, status, stages, stage_index, stage)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, ?)`,
        [
          articleId,
          authorId,
          String(title ?? '').slice(0, 200),
          String(summary ?? '').slice(0, 500),
          String(content ?? ''),
          JSON.stringify(stages),
          stages[0],
        ]
      );
      id = r.insertId;
      await addAction(id, 'author', actorName ?? '', 'submit', '', conn);
    }
    await conn.query("UPDATE articles SET review_state = 'pending' WHERE id = ?", [articleId]);
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  // 事务已提交：作者「已进入审核」通知 + 人工队列通知都在事务外
  const record = await getRecord(id);
  // 提交阶段：stages 与 stage_index=0 已知，用本地变量算流程文案即可
  const flowText = formatFlowText(stages, { stageIndex: 0, status: 'pending' });
  const currentStageText = formatCurrentStageText(stages, { stageIndex: 0, status: 'pending' });
  fire(notifyUser(authorId, 'review_pending', { title: record.title, flow: flowText, current_stage: currentStageText }));
  if (record?.stage === STAGE_HUMAN) fire(notifyHumanQueue(record));
  // 异步推进（不阻塞提交接口）
  processRecord(id).catch((e) => console.error('[review] 流程处理异常:', String(e?.message || e)));
  return record;
}

/**
 * 推进一条待审记录（按当前阶段处理）。
 * - ai 阶段：跑 AI 初审；成功按配置进下一阶段或终审，失败记 ai_error
 *   （流程含人工阶段则直接转人工，否则留在 ai 阶段等重试）
 * - human 阶段：等待人工处理，这里不做任何事
 */
export async function processRecord(recordId) {
  const record = await getRecord(recordId);
  if (!record) return null;
  if (record.status !== 'pending') return record;
  if (record.stage !== STAGE_AI) return record;

  const flow = await getFlowConfig();
  const stages = parseStages(record.stages);
  const acts = applyFinalRule(flow, stages.length ? stages : flow.stages);
  const cfg = await getAIConfig();

  let result;
  try {
    result = await runAIReview(cfg, {
      title: record.title,
      summary: record.summary,
      content: record.content,
    });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    await pool.query('UPDATE review_records SET ai_error = ? WHERE id = ?', [msg, recordId]);
    await addAction(recordId, 'ai', 'AI', 'ai_error', msg);
    // 流程里有人工阶段 → 直接转人工审核；否则留在 ai 阶段，等 retryAI 重试
    const humanIndex = acts.stages.indexOf(STAGE_HUMAN);
    if (humanIndex >= 0) {
      await pool.query(
        "UPDATE review_records SET stage = ?, stage_index = ? WHERE id = ? AND status = 'pending'",
        [STAGE_HUMAN, humanIndex, recordId]
      );
      // 直接转人工审核 = 新建一条人工审核任务：通知审核员（单条 UPDATE 自动提交，不在事务内）
      const fresh = await getRecord(recordId);
      if (fresh?.stage === STAGE_HUMAN) fire(notifyHumanQueue(fresh));
    } else {
      // 没有人工阶段：文章不能一直卡在 pending（作者将永远无法再改稿）
      // 记录仍保持 pending + ai_error，管理员可 retry-ai / force-final 处理
      await pool.query(
        "UPDATE articles SET review_state = 'none' WHERE id = ? AND review_state = 'pending'",
        [record.article_id]
      ).catch(() => {});
    }
    return await getRecord(recordId);
  }

  try {
    await pool.query(
      'UPDATE review_records SET ai_verdict = ?, ai_reason = ?, ai_model = ?, ai_raw = ?, ai_error = NULL WHERE id = ?',
      [
        result.verdict,
        result.reason,
        result.model,
        JSON.stringify(result.raw ?? null),
        recordId,
      ]
    );
  } catch (e) {
    // ai_raw 写库失败（JSON 非法 / 列约束）：丢掉原始响应但保留结论与错误，
    // 否则记录会停在 stage='ai' 且 ai_error 为空，retryAI 直接 409
    const msg = String(e?.message || e).slice(0, 500);
    await pool.query(
      'UPDATE review_records SET ai_verdict = ?, ai_reason = ?, ai_model = ?, ai_raw = NULL, ai_error = ? WHERE id = ?',
      [result.verdict, result.reason, result.model, msg, recordId]
    ).catch(() => {});
    await addAction(recordId, 'ai', 'AI', 'ai_error', msg).catch(() => {});
  }
  await addAction(
    recordId,
    'ai',
    'AI',
    result.verdict === 'approve' ? 'ai_approve' : 'ai_reject',
    result.reason
  );

  const mapped = result.verdict === 'approve' ? acts.ai.on_approve : acts.ai.on_reject;
  if (mapped === 'next') {
    const next = await advance(record);
    if (next) {
      if (next.stage === STAGE_AI) {
        processRecord(recordId).catch((e) => console.error('[review] 流程处理异常:', String(e?.message || e)));
      }
      return next;
    }
    // 没有下一阶段 → 走终审
  }
  if (result.verdict === 'approve') return await finalizeApprove(await getRecord(recordId));
  return await finalizeReject(await getRecord(recordId), result.reason);
}

/**
 * 人工审核裁决。
 * action ∈ 'approve' | 'reject'；当前必须处于人工审核阶段。
 */
export async function applyHumanDecision({ recordId, reviewer, action, note }) {
  const act = String(action ?? '').trim().toLowerCase();
  if (act !== 'approve' && act !== 'reject') throw new ReviewError('审核操作无效', 400);
  const record = await getRecord(recordId);
  if (!record) throw new ReviewError('审核记录不存在', 404);
  if (record.status !== 'pending') {
    // 幂等：同一审核员对同一记录重复提交相同裁决 → 直接返回既有结果（不报错）
    const want = act === 'approve' ? 'approved' : 'rejected';
    if (record.reviewer_id && Number(record.reviewer_id) === Number(reviewer?.id) && record.status === want) {
      return record;
    }
    throw new ReviewError('该记录已被处理', 409);
  }
  if (record.stage !== STAGE_HUMAN) throw new ReviewError('该记录当前不在人工审核阶段', 409);

  // 原子占用：只有还没被人认领的 pending 记录才能被裁决。
  // 两个不同审核员并发时只有一方 affectedRows=1，另一方 → 409。
  const [res] = await pool.query(
    "UPDATE review_records SET reviewer_id = ? WHERE id = ? AND status = 'pending' AND reviewer_id IS NULL",
    [reviewer?.id, recordId]
  );
  if (!res.affectedRows) {
    // 已被自己认领但尚未终结（并发重试）：幂等返回当前记录
    const cur = await getRecord(recordId);
    if (cur && cur.reviewer_id && Number(cur.reviewer_id) === Number(reviewer?.id)) return cur;
    throw new ReviewError('该记录已被处理', 409);
  }

  await addAction(recordId, 'reviewer', reviewer?.username ?? '', act, note);

  const flow = await getFlowConfig();
  const stages = parseStages(record.stages);
  const acts = applyFinalRule(flow, stages.length ? stages : flow.stages);
  const mapped = act === 'approve' ? acts.human.on_approve : acts.human.on_reject;
  if (mapped === 'next') {
    const next = await advance(record);
    if (next) {
      if (next.stage === STAGE_AI) {
        processRecord(recordId).catch((e) => console.error('[review] 流程处理异常:', String(e?.message || e)));
      }
      return next;
    }
  }
  if (act === 'approve') return await finalizeApprove(await getRecord(recordId));
  return await finalizeReject(await getRecord(recordId), note || '');
}

/** 管理员强制终审：不校验阶段，只要求记录仍是待审状态 */
export async function forceFinal({ recordId, action, note, actorName }) {
  const act = String(action ?? '').trim().toLowerCase();
  if (act !== 'approve' && act !== 'reject') throw new ReviewError('审核操作无效', 400);
  const record = await getRecord(recordId);
  if (!record) throw new ReviewError('审核记录不存在', 404);
  if (record.status !== 'pending') throw new ReviewError('该记录已被处理', 409);
  await addAction(recordId, 'admin', actorName ?? 'admin', act === 'approve' ? 'force_approve' : 'force_reject', note);
  if (act === 'approve') return await finalizeApprove(record);
  return await finalizeReject(record, note || '');
}

/** 重试失败的 AI 初审：需仍处于 ai 阶段且存在 ai_error */
export async function retryAI(recordId, actorName) {
  const record = await getRecord(recordId);
  if (!record) throw new ReviewError('审核记录不存在', 404);
  if (record.status !== 'pending') throw new ReviewError('该记录已被处理', 409);
  if (record.stage !== STAGE_AI) throw new ReviewError('该记录当前不在 AI 审核阶段', 409);
  if (!record.ai_error) throw new ReviewError('该记录没有需要重试的 AI 错误', 409);
  await pool.query('UPDATE review_records SET ai_error = NULL WHERE id = ?', [recordId]);
  await addAction(recordId, 'system', actorName ?? 'system', 'ai_retry', '');
  return await processRecord(recordId);
}

/** 取某篇文章当前待审的记录（没有则返回 null） */
export async function getPendingRecordByArticle(articleId) {
  const [rows] = await pool.query(
    "SELECT id FROM review_records WHERE article_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [articleId]
  );
  return rows[0] || null;
}

/**
 * 取某篇文章下「真正占用作者编辑」的待审记录。
 * - stage='human'：等人工裁决 → 占用
 * - stage='ai' 且无 ai_error：AI 初审进行中 → 占用
 * - stage='ai' 且有 ai_error：AI 初审失败 → 不占用（作者可改稿重提）
 * 返回 null 表示作者可以自由修改。
 */
export async function getBlockingReviewRecord(articleId) {
  const [rows] = await pool.query(
    "SELECT id, stage, ai_error FROM review_records WHERE article_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    [articleId]
  );
  const r = rows[0];
  if (!r) return null;
  if (r.stage === STAGE_HUMAN) return r;
  if (r.stage === STAGE_AI && !r.ai_error) return r;
  return null;
}

/**
 * 放弃某篇文章下「AI 初审失败」的待审记录。
 * 该记录里的快照已经过时（作者改过稿），留着可能被批准后覆盖线上内容。
 */
export async function releaseFailedRecordByArticle(articleId, actorName) {
  const [rows] = await pool.query(
    "SELECT id FROM review_records WHERE article_id = ? AND status = 'pending' AND stage = 'ai' AND ai_error IS NOT NULL",
    [articleId]
  );
  for (const r of rows) {
    await pool.query(
      "UPDATE review_records SET status = 'cancelled', decided_at = NOW() WHERE id = ? AND status = 'pending'",
      [r.id]
    );
    await addAction(r.id, 'system', actorName ?? 'system', 'release', 'AI 初审失败，作者改稿重提');
  }
  return rows.length;
}

/** 取消某篇文章下所有待审记录（作者撤回 / 管理员终止） */
export async function cancelPendingByArticle(articleId, actorName) {
  const [rows] = await pool.query(
    "SELECT id FROM review_records WHERE article_id = ? AND status = 'pending'",
    [articleId]
  );
  for (const r of rows) {
    await pool.query(
      "UPDATE review_records SET status = 'cancelled', decided_at = NOW() WHERE id = ? AND status = 'pending'",
      [r.id]
    );
    await addAction(r.id, 'system', actorName ?? 'system', 'cancel', '');
  }
  // 记录作废后文章的待审标记也要归位，否则文章会一直卡在 pending（作者改不动）
  if (rows.length) {
    await pool.query("UPDATE articles SET review_state = 'none' WHERE id = ? AND review_state = 'pending'", [articleId]).catch(
      () => {}
    );
  }
  return rows.length;
}
