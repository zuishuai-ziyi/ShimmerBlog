import { defineStore } from 'pinia';
import http from '../api/http';
import { setSiteName } from '../utils/title';

export interface SiteInfo {
  title: string;
  subtitle: string;
  description: string;
  registerOpen: boolean;
  githubEnabled: boolean;
  googleEnabled: boolean;
  captchaEnabled: boolean;
  captchaProvider: 'gocaptcha' | 'recaptcha';
  captchaApi: string;
  captchaId: string;
  recaptchaSiteKey: string;
  logoUrl: string;
  defaultAvatarUrl: string;
  aboutHtml: string;
  aboutSubtitle: string;
}

export const useSiteStore = defineStore('site', {
  state: () => ({
    info: {
      title: '微光博客',
      subtitle: '追光的人，终会光芒万丈',
      description: '微光博客 —— 一个会发光的个人博客角落。',
      registerOpen: true,
      githubEnabled: false,
      googleEnabled: false,
      captchaEnabled: false,
      captchaProvider: 'gocaptcha',
      captchaApi: '',
      captchaId: 'click-default-ch',
      recaptchaSiteKey: '',
      logoUrl: '',
      defaultAvatarUrl: '',
      aboutHtml: '',
      aboutSubtitle: '一个会发光的角落',
    } as SiteInfo,
    loaded: false,
  }),
  actions: {
    async fetch() {
      try {
        const { data } = await http.get<SiteInfo>('/site');
        this.info = data;
        setSiteName(data.title);
      } catch {
        /* 后端不可用时保留默认文案 */
      } finally {
        this.loaded = true;
      }
    },
  },
});
