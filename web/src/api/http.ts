import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 15000 });

http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('sb_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// 统一取出后端 { error } 文本，方便组件直接展示
export function errMsg(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    return data?.error || e.message || '请求失败';
  }
  return String(e);
}

// 后端要求行为验证（验证码信用缺失/风控触发）→ 视图据此按需弹出验证码窗
export function isCaptchaRequired(e: unknown): boolean {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { code?: string } | undefined;
    return data?.code === 'CAPTCHA_REQUIRED';
  }
  return false;
}

export default http;
