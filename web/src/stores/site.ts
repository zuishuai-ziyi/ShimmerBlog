import { defineStore } from 'pinia';
import http from '../api/http';

export interface SiteInfo {
  title: string;
  subtitle: string;
  description: string;
  registerOpen: boolean;
  githubEnabled: boolean;
}

export const useSiteStore = defineStore('site', {
  state: () => ({
    info: {
      title: '微光博客',
      subtitle: '在深空里写字，让每一篇都亮一点点。',
      description: '微光博客 —— 一个会发光的个人博客角落。',
      registerOpen: true,
      githubEnabled: false,
    } as SiteInfo,
    loaded: false,
  }),
  actions: {
    async fetch() {
      try {
        const { data } = await http.get<SiteInfo>('/site');
        this.info = data;
        document.title = data.title;
      } catch {
        /* 后端不可用时保留默认文案 */
      } finally {
        this.loaded = true;
      }
    },
  },
});
