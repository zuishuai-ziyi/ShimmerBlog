import { defineStore } from 'pinia';
import { apiLogin, apiMe, isUnauthorized, type Captcha, type Reviewer } from '../api/review';

/** 独立审核后台会话（/review 鉴权后直接进入工作台） */
export const useReviewerStore = defineStore('reviewer', {
  state: () => ({
    token: localStorage.getItem('sb_reviewer_token') || '',
    reviewer: null as Reviewer | null,
    checked: false,
  }),
  getters: {
    authed: (s) => !!s.token,
  },
  actions: {
    async login(username: string, password: string, captcha?: Captcha) {
      const data = await apiLogin({ username, password, captcha });
      this.token = data.token;
      this.reviewer = data.reviewer;
      localStorage.setItem('sb_reviewer_token', data.token);
      this.checked = true;
    },
    /** 启动时校验令牌是否仍有效，失效则清除 */
    async check() {
      if (!this.token) {
        this.checked = true;
        return;
      }
      try {
        this.reviewer = await apiMe();
      } catch (e) {
        // 仅 401（未登录/过期）才清令牌；后端异常时保留，避免网络抖动误登出
        if (isUnauthorized(e)) this.logout();
      } finally {
        this.checked = true;
      }
    },
    logout() {
      this.token = '';
      this.reviewer = null;
      localStorage.removeItem('sb_reviewer_token');
    },
  },
});
