import axios from 'axios';

/* ------------------------------------------------------------------ *
 * 审核后台专用 API（独立于用户端与后台管理端）
 *  - 审核员令牌存 localStorage['sb_reviewer_token']，与用户 / 管理员互不干扰
 *  - 后端契约见任务说明：/api/review/*
 * ------------------------------------------------------------------ */

const reviewHttp = axios.create({ baseURL: '/api', timeout: 20000 });

reviewHttp.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('sb_reviewer_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

/** 401 时放行的接口：登录（密码错误）与 /me（store.check 已自行登出） */
const UNAUTHORIZED_PASSTHROUGH = ['/review/login', '/review/me'];

reviewHttp.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      const url = String(err.config?.url ?? '');
      if (!UNAUTHORIZED_PASSTHROUGH.some((p) => url.includes(p))) {
        // 令牌失效：清除审核员令牌并刷新回登录门
        localStorage.removeItem('sb_reviewer_token');
        window.location.reload();
      }
    }
    return Promise.reject(err);
  }
);

/** 统一取出后端 { error } 文本，方便组件直接展示 */
export function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || e.message || '请求失败';
  }
  return String(e);
}

/** 登录需要行为验证码：后端返回 400 + code=CAPTCHA_REQUIRED */
export function isCaptchaRequired(e: unknown): boolean {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { code?: string } | undefined;
    return data?.code === 'CAPTCHA_REQUIRED';
  }
  return false;
}

/** 验证码本身未通过/失效/服务不可用（由验证码弹窗自行提示） */
export function isCaptchaFailure(e: unknown): boolean {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { code?: string } | undefined;
    return data?.code === 'CAPTCHA_FAILED' || data?.code === 'CAPTCHA_UNAVAILABLE';
  }
  return false;
}

/** 409：记录已被处理或不在人工阶段 */
export function isConflict(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 409;
}

/** 401：未登录 / 令牌过期 */
export function isUnauthorized(e: unknown): boolean {
  return axios.isAxiosError(e) && e.response?.status === 401;
}

/* ----------------------------- 类型 ----------------------------- */

export interface Reviewer {
  id: number;
  username: string;
  display_name: string;
  /** 本人收件邮箱（通知邮件发到这里），未设置时为空 */
  email?: string;
  /** 通知订阅（新审核任务邮件开关），后端未返回时缺省 */
  notify?: { new_task?: boolean };
}

/** 文章状态：draft=新稿待审，published=已发布文章的修改待审 */
export type ArticleStatus = 'draft' | 'published';

/** AI 初审结论：approve=建议通过，reject=建议拒绝，null=无结论 */
export type AiVerdict = 'approve' | 'reject' | null;

export interface QueueItem {
  id: number;
  article_id: number;
  article_status: ArticleStatus;
  author_name: string;
  author_avatar: string | null;
  title: string;
  summary: string | null;
  content: string;
  stages: string[];
  stage: string;
  ai_verdict: AiVerdict;
  ai_reason: string | null;
  ai_error: string | null;
  created_at: string;
}

/** 审核流转动作 */
export interface ReviewAction {
  actor_type: string;
  actor_name: string;
  action: string;
  note: string | null;
  created_at: string;
}

/** 队列项 + 流转记录 */
export interface ReviewRecord extends QueueItem {
  /** 记录状态：pending=待审，approved=已通过，rejected=已拒绝，cancelled=已取消 */
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  actions: ReviewAction[];
}

export interface HistoryItem {
  id: number;
  article_id: number;
  title: string;
  status: 'approved' | 'rejected';
  reject_note: string | null;
  decided_at: string | null;
  created_at: string;
  author_name: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Captcha {
  key: string;
  value: string;
}

export interface LoginPayload {
  username: string;
  password: string;
  captcha?: Captcha;
}

export interface LoginResponse {
  token: string;
  reviewer: Reviewer;
}

/* ----------------------------- 接口 ----------------------------- */

/** 审核员登录 */
export async function apiLogin(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await reviewHttp.post<LoginResponse>('/review/login', payload);
  return data;
}

/** 当前登录审核员（401=未登录） */
export async function apiMe(): Promise<Reviewer> {
  const { data } = await reviewHttp.get<{ reviewer: Reviewer }>('/review/me');
  return data.reviewer;
}

/** 待审队列 */
export async function apiQueue(page = 1, pageSize = 20): Promise<Paged<QueueItem>> {
  const { data } = await reviewHttp.get<Paged<QueueItem>>('/review/queue', { params: { page, pageSize } });
  return data;
}

/** 单条审核记录详情（含流转记录） */
export async function apiRecord(id: number): Promise<ReviewRecord> {
  const { data } = await reviewHttp.get<ReviewRecord>(`/review/records/${id}`);
  return data;
}

/** 人工裁决：approve=通过，reject=拒绝（note 可留空） */
export async function apiDecide(
  id: number,
  action: 'approve' | 'reject',
  note?: string
): Promise<ReviewRecord> {
  const { data } = await reviewHttp.post<{ record: ReviewRecord }>(`/review/records/${id}/decide`, {
    action,
    note: note && note.trim() ? note.trim() : undefined,
  });
  return data.record;
}

/** 我的审核记录 */
export async function apiHistory(page = 1, pageSize = 20): Promise<Paged<HistoryItem>> {
  const { data } = await reviewHttp.get<Paged<HistoryItem>>('/review/history', { params: { page, pageSize } });
  return data;
}

/** 修改审核员密码 */
export async function apiChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  await reviewHttp.put('/review/password', { oldPassword, newPassword });
}

/* ---------------- 通知订阅（新增导出，不改动以上已有函数） ---------------- */

/** 审核员通知订阅 */
export interface ReviewerNotify {
  /** 有新审核任务时发邮件 */
  new_task: boolean;
}

/** 读取审核员通知订阅（GET /review/notify-prefs） */
export async function apiNotifyPrefs(): Promise<ReviewerNotify> {
  const { data } = await reviewHttp.get<{
    notify?: Partial<ReviewerNotify>;
    new_task?: boolean;
  }>('/review/notify-prefs');
  return { new_task: !!(data?.notify?.new_task ?? data?.new_task) };
}

/** 保存审核员通知订阅（PUT /review/notify-prefs） */
export async function apiUpdateNotifyPrefs(prefs: Partial<ReviewerNotify>): Promise<void> {
  await reviewHttp.put('/review/notify-prefs', { ...prefs });
}

export default reviewHttp;
