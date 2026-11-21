import { defineStore } from 'pinia';
import http, { errMsg } from '../api/http';

/** 第三方账号绑定记录（后端 user_oauth_accounts 表的公开子集） */
export interface OAuthAccount {
  /** provider 的 slug（与站点配置里的 oauthProviders[].slug 对应） */
  provider: string;
  provider_user_id: string;
  created_at?: string;
}

export interface User {
  id: number;
  email: string | null;
  name: string;
  name_color: string | null;
  bio: string | null;
  avatar_url: string | null;
  email_verified: number;
  /** 已绑定的第三方账号（未绑定时后端返回空数组，缺省时按 [] 处理） */
  oauth_accounts?: OAuthAccount[];
  has_password: boolean;
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
