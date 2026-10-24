import { defineStore } from 'pinia';
import http, { errMsg } from '../api/http';

export interface User {
  id: number;
  email: string | null;
  name: string;
  name_color: string | null;
  bio: string | null;
  avatar_url: string | null;
  email_verified: number;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    token: localStorage.getItem('sb_token') || '',
    ready: false,
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
  },
  actions: {
    setToken(t: string) {
      this.token = t;
      localStorage.setItem('sb_token', t);
      return this.fetchMe();
    },
    async fetchMe() {
      if (!this.token) {
        this.ready = true;
        return;
      }
      try {
        const { data } = await http.get<{ user: User }>('/auth/me');
        this.user = data.user;
      } catch (e) {
        if (String(errMsg(e)).includes('登录')) {
          this.clear();
        }
      } finally {
        this.ready = true;
      }
    },
    clear() {
      this.token = '';
      this.user = null;
      localStorage.removeItem('sb_token');
    },
    /** 退出登录：JWT 无服务端会话，清掉本地凭证即可；跳转由调用方决定 */
    logout() {
      this.clear();
    },
  },
});
