import axios from 'axios';

/** 后台专用 axios：独立管理令牌，与用户 token 互不干扰 */
const adminHttp = axios.create({ baseURL: '/api', timeout: 20000 });

adminHttp.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('sb_admin_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

/** 401 时放行的接口：登录（密码错误）与 /session（store.check 已自行登出） */
const UNAUTHORIZED_PASSTHROUGH = ['/admin/login', '/admin/session'];

/**
 * 会话失效（401）广播事件：store 收到后把管理员置为未登录，页面自然回到登录门。
 *
 * 401 一律不再整页刷新：整页刷新会清空登录门表单，并可能与轮询叠加成刷新循环。
 */
export const ADMIN_UNAUTHORIZED_EVENT = 'sb:admin-unauthorized';

/** 广播 401：hadToken=true 表示「原本有令牌但已失效」，false 表示「本来就没登录」 */
function notifyUnauthorized(hadToken: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT, { detail: { hadToken } }));
}

adminHttp.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      const url = String(err.config?.url ?? '');
      if (!UNAUTHORIZED_PASSTHROUGH.some((p) => url.includes(p))) {
        // 先判断是否存在令牌：
        // - 无令牌：本来就在登录门，只需清令牌 + 复位未登录态，绝不 reload
        // - 有令牌：会话过期，同样只复位状态回到登录门，绝不 reload（否则会形成刷新循环）
        const hadToken = !!localStorage.getItem('sb_admin_token');
        localStorage.removeItem('sb_admin_token');
        notifyUnauthorized(hadToken);
      }
    }
    return Promise.reject(err);
  }
);

export function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    return data?.error || e.message || '请求失败';
  }
  return String(e);
}

export default adminHttp;
