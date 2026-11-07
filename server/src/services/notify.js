/**
 * 邮件通知服务：作者侧（登录提醒 / 审核状态）与审核员侧（新任务提醒）。
 *
 * 设计要点：
 * - 订阅开关存在 users.notify_prefs / reviewers.notify_prefs（JSON 字符串；NULL = 用默认值）
 * - 发信一律「尽力而为」：任何异常都吞掉并记一行日志，绝不影响登录 / 审核等主流程
 * - 模板正文是纯文本，变量只做单行化 + 长度截断，避免污染邮件头或撑爆正文
 */
import { pool } from '../db.js';
import { smtpConfig, webOrigin } from './settings.js';
import { sendNotifyEmail } from './mailer.js';

/** 用户可订阅的通知事件 */
export const USER_NOTIFY_EVENTS = ['login', 'review_pending', 'review_approved', 'review_rejected'];

/** 用户默认订阅：登录提醒默认关闭（噪音大），审核结果默认开启 */
export const DEFAULT_USER_PREFS = {
  login: false,
  review_pending: true,
  review_approved: true,
  review_rejected: true,
};

/** 审核员默认订阅：新任务提醒默认开启 */
export const DEFAULT_REVIEWER_PREFS = { new_task: true };

/** 事件 → 模板 kind */
const EVENT_TEMPLATES = {
  login: 'notify_login',
  review_pending: 'notify_review_pending',
  review_approved: 'notify_review_approved',
  review_rejected: 'notify_review_rejected',
};

/** 变量长度上限（防爆；标题上限与 articles.title 一致：200） */
const VAR_LIMITS = {
  name: 50,
  title: 200,
  author: 50,
  note: 500,
  url: 500,
  time: 64,
  ip: 64,
  count: 20,
};

/** 审核未通过时审核意见的兜底文案 */
const EMPTY_REJECT_NOTE = '未填写原因';

/** 变量清洗：压成单行（去掉换行/控制字符，防邮件头注入）并按字段截断 */
function cleanVar(key, value) {
  let s = value === undefined || value === null ? '' : String(value);
  s = s.replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const max = VAR_LIMITS[key] ?? 200;
  return s.length > max ? s.slice(0, max) : s;
}

/** 批量清洗变量；site 由模板自身填充，不允许外部覆盖 */
function cleanVars(vars) {
  const out = {};
  if (!vars || typeof vars !== 'object') return out;
  for (const [k, v] of Object.entries(vars)) {
    if (k === 'site') continue;
    out[k] = cleanVar(k, v);
  }
  return out;
}

/** 解析 notify_prefs：非法 JSON / 非对象 → 静默回退默认；只认布尔值 */
function parsePrefs(raw, defaults) {
  let obj = null;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) obj = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  const out = { ...defaults };
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(defaults)) {
      if (typeof obj[k] === 'boolean') out[k] = obj[k];
    }
  }
  return out;
}

/* ---------- 用户侧订阅 ---------- */

/** 读取用户通知偏好；用户不存在 / 列不存在 / 数据非法 → 返回默认值 */
export async function getUserNotifyPrefs(userId) {
  try {
    const [rows] = await pool.query('SELECT notify_prefs FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!rows.length) return { ...DEFAULT_USER_PREFS };
    return parsePrefs(rows[0].notify_prefs, DEFAULT_USER_PREFS);
  } catch (e) {
    console.warn('[notify] 读取用户通知偏好失败，回退默认:', String(e?.message || e));
    return { ...DEFAULT_USER_PREFS };
  }
}

/**
 * 写入用户通知偏好：只接受四个已知 key 的布尔值，其余忽略；
 * 与现有偏好合并后整体写回，返回合并后的对象。
 */
export async function setUserNotifyPrefs(userId, patch) {
  const cur = await getUserNotifyPrefs(userId);
  const next = { ...cur };
  if (patch && typeof patch === 'object') {
    for (const k of USER_NOTIFY_EVENTS) {
      if (typeof patch[k] === 'boolean') next[k] = patch[k];
    }
  }
  try {
    await pool.query('UPDATE users SET notify_prefs = ? WHERE id = ?', [JSON.stringify(next), userId]);
  } catch (e) {
    console.warn('[notify] 写入用户通知偏好失败:', String(e?.message || e));
  }
  return next;
}

/* ---------- 审核员侧订阅 ---------- */

/** 读取审核员通知偏好；异常 → 默认值 */
export async function getReviewerNotifyPrefs(reviewerId) {
  try {
    const [rows] = await pool.query('SELECT notify_prefs FROM reviewers WHERE id = ? LIMIT 1', [reviewerId]);
    if (!rows.length) return { ...DEFAULT_REVIEWER_PREFS };
    return parsePrefs(rows[0].notify_prefs, DEFAULT_REVIEWER_PREFS);
  } catch (e) {
    console.warn('[notify] 读取审核员通知偏好失败，回退默认:', String(e?.message || e));
    return { ...DEFAULT_REVIEWER_PREFS };
  }
}

/** 写入审核员通知偏好（仅 new_task，值为布尔） */
export async function setReviewerNotifyPrefs(reviewerId, patch) {
  const cur = await getReviewerNotifyPrefs(reviewerId);
  const next = { ...cur };
  if (patch && typeof patch === 'object' && typeof patch.new_task === 'boolean') {
    next.new_task = patch.new_task;
  }
  try {
    await pool.query('UPDATE reviewers SET notify_prefs = ? WHERE id = ?', [JSON.stringify(next), reviewerId]);
  } catch (e) {
    console.warn('[notify] 写入审核员通知偏好失败:', String(e?.message || e));
  }
  return next;
}

/** 由原始 notify_prefs 字符串直接得到 { new_task }（后台列表用，避免再查库） */
export function reviewerNotifyOf(raw) {
  return parsePrefs(raw, DEFAULT_REVIEWER_PREFS);
}

/* ---------- 发信 ---------- */

/**
 * 给用户发通知邮件。
 * 事件未订阅 / 用户不存在 / 没有邮箱 / SMTP 未配置 → 静默返回 false；
 * 其他异常一律吞掉（记一行日志）后返回 false —— 永不抛错。
 */
export async function notifyUser(userId, event, vars = {}) {
  try {
    if (!USER_NOTIFY_EVENTS.includes(event)) return false;
    const id = Number(userId);
    if (!Number.isFinite(id)) return false;

    const prefs = await getUserNotifyPrefs(id);
    if (!prefs[event]) return false;

    const [rows] = await pool.query('SELECT id, email, name FROM users WHERE id = ? LIMIT 1', [id]);
    const user = rows[0];
    if (!user || !user.email) return false;

    const smtp = await smtpConfig();
    if (!smtp?.host) return false;

    const mailVars = cleanVars({ ...vars, name: user.name || vars?.name || '' });
    if (event === 'review_rejected' && !mailVars.note) mailVars.note = EMPTY_REJECT_NOTE;

    return await sendNotifyEmail(user.email, EVENT_TEMPLATES[event], mailVars);
  } catch (e) {
    console.warn(`[notify] 通知邮件发送失败（已忽略）: ${event} -> ${String(e?.message || e)}`);
    return false;
  }
}

/**
 * 通知所有活跃审核员：队列里出现新的人工审核任务时调用。
 * 逐个审核员判断 new_task 开关后发信；返回成功发送数。任何异常都被吞掉。
 */
export async function notifyReviewersNewTask(vars = {}) {
  try {
    const smtp = await smtpConfig();
    if (!smtp?.host) return 0;

    const [rows] = await pool.query(
      "SELECT id, username, display_name, email, notify_prefs FROM reviewers WHERE status = 'active'"
    );
    let sent = 0;
    for (const r of rows) {
      const prefs = parsePrefs(r.notify_prefs, DEFAULT_REVIEWER_PREFS);
      if (!prefs.new_task) continue;
      if (!r.email) continue; // 审核员未填邮箱 → 跳过（不影响其他人）
      const mailVars = cleanVars({ ...vars, name: r.display_name || r.username || '' });
      try {
        const ok = await sendNotifyEmail(r.email, 'notify_reviewer_new_task', mailVars);
        if (ok) sent += 1;
      } catch (e) {
        console.warn(`[notify] 审核员通知发送失败（已忽略）: ${r.id} -> ${String(e?.message || e)}`);
      }
    }
    return sent;
  } catch (e) {
    console.warn('[notify] 审核员新任务通知失败（已忽略）:', String(e?.message || e));
    return 0;
  }
}

/** 文章前台链接（站点地址取后台配置 web_origin） */
export async function articleUrl(articleId) {
  try {
    const base = String((await webOrigin()) || '').replace(/\/+$/, '');
    const id = Number(articleId);
    if (!Number.isFinite(id)) return base;
    return `${base}/article/${id}`;
  } catch {
    return '';
  }
}
