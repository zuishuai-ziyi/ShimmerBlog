import { defineStore } from 'pinia';
import http from '../api/http';
import { setSiteName } from '../utils/title';
import { normalizeWhitelistEntries } from '../utils/externalLink';

/**
 * 天爱验证码类型白名单（与后端 server/src/services/settings.js 的 TIANAI_CAPTCHA_TYPES 保持一致；
 * 后端新增类型时需同步此处，否则前端会把新类型当作非法值过滤掉）
 */
export const TIANAI_TYPE_ALLOWLIST: string[] = ['SLIDER', 'ROTATE', 'CONCAT', 'WORD_IMAGE_CLICK'];
/** GoCaptcha 类型白名单（与后端 GOCAPTCHA_CAPTCHA_TYPES 保持一致） */
export const GOCAPTCHA_TYPE_ALLOWLIST: string[] = ['CLICK'];
/** 天爱验证码可用类型（后端白名单，至少 1 个） */
export const DEFAULT_TIANAI_TYPES: string[] = ['SLIDER'];
/** GoCaptcha 可用类型（后端白名单，至少 1 个） */
export const DEFAULT_GOCAPTCHA_TYPES: string[] = ['CLICK'];

/**
 * /api/site 返回的验证码类型缺失/非数组/空数组/含非法值时安全回落，避免运行时抛错：
 * - 非数组 → 直接回落 fallback；
 * - 数组 → 过滤白名单外的非法值与重复项（保留其余合法值）；
 * - 过滤后为空 → 回落 fallback（保证至少一个可用类型）。
 */
function pickTypes(value: unknown, fallback: string[], allowlist: string[]): string[] {
  if (!Array.isArray(value)) return fallback.slice();
  const picked: string[] = [];
  for (const v of value) {
    const t = String(v).trim().toUpperCase();
    if (!t || !allowlist.includes(t) || picked.includes(t)) continue; // 非法值/重复值直接丢弃
    picked.push(t);
  }
  return picked.length ? picked : fallback.slice();
}

export interface SiteInfo {
  title: string;
  subtitle: string;
  description: string;
  registerOpen: boolean;
  githubEnabled: boolean;
  googleEnabled: boolean;
  captchaEnabled: boolean;
  captchaProvider: 'gocaptcha' | 'recaptcha' | 'tianai';
  captchaApi: string;
  captchaId: string;
  recaptchaSiteKey: string;
  logoUrl: string;
  defaultAvatarUrl: string;
  aboutHtml: string;
  aboutSubtitle: string;
  /** 天爱验证码类型白名单（多选，前端随机取一种呈现） */
  captchaTianaiTypes: string[];
  /** GoCaptcha 类型白名单（多选，前端随机取一种呈现） */
  captchaGocaptchaTypes: string[];
  /** 外站跳转白名单（域名数组）：命中的域名点击跳转时不弹「是否前往外站」确认气泡 */
  externalLinkWhitelist: string[];
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
      captchaTianaiTypes: DEFAULT_TIANAI_TYPES.slice(),
      captchaGocaptchaTypes: DEFAULT_GOCAPTCHA_TYPES.slice(),
      externalLinkWhitelist: [] as string[],
    } as SiteInfo,
    loaded: false,
  }),
  actions: {
    async fetch() {
      try {
        const { data } = await http.get<SiteInfo>('/site');
        const info = (data ?? {}) as SiteInfo;
        this.info = {
          ...this.info,
          ...info,
          captchaTianaiTypes: pickTypes(info.captchaTianaiTypes, DEFAULT_TIANAI_TYPES, TIANAI_TYPE_ALLOWLIST),
          captchaGocaptchaTypes: pickTypes(info.captchaGocaptchaTypes, DEFAULT_GOCAPTCHA_TYPES, GOCAPTCHA_TYPE_ALLOWLIST),
          // 外站跳转白名单：归一化（去空/去非法/去重），非法条目丢弃 → 视为未命中 → 照常提示
          externalLinkWhitelist: normalizeWhitelistEntries(info.externalLinkWhitelist),
        };
        setSiteName(this.info.title);
      } catch {
        /* 后端不可用时保留默认文案 */
      } finally {
        this.loaded = true;
      }
    },
  },
});
