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

adminHttp.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      const url = String(err.config?.url ?? '');
      if (!UNAUTHORIZED_PASSTHROUGH.some((p) => url.includes(p))) {
        // 令牌失效：清除管理令牌并刷新回登录门
        localStorage.removeItem('sb_admin_token');
        window.location.reload();
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
