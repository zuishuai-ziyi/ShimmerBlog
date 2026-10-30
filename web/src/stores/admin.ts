import { defineStore } from 'pinia';
import adminHttp, { errMsg } from '../api/adminHttp';

/** 独立管理后台会话（/admin 鉴权后直接进入） */
export const useAdminStore = defineStore('admin', {
  state: () => ({
    token: localStorage.getItem('sb_admin_token') || '',
    checked: false,
  }),
  getters: {
    authed: (s) => !!s.token,
  },
  actions: {
    async login(password: string, captcha?: { key: string; value: string }) {
      const { data } = await adminHttp.post<{ token: string }>('/admin/login', { password, captcha });
      this.token = data.token;
      localStorage.setItem('sb_admin_token', data.token);
      this.checked = true;
    },
    /** 启动时校验令牌是否仍有效，失效则清除 */
    async check() {
      if (!this.token) {
        this.checked = true;
        return;
      }
      try {
        await adminHttp.get('/admin/session');
      } catch (e) {
        if (String(errMsg(e)).includes('过期') || String(errMsg(e)).includes('未登录')) this.logout();
      } finally {
        this.checked = true;
      }
    },
    logout() {
      this.token = '';
      localStorage.removeItem('sb_admin_token');
    },
  },
});
