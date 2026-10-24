import axios from 'axios';

/** 后台专用 axios：独立管理令牌，与用户 token 互不干扰 */
const adminHttp = axios.create({ baseURL: '/api', timeout: 20000 });

adminHttp.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('sb_admin_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    return data?.error || e.message || '请求失败';
  }
  return String(e);
}

export default adminHttp;
