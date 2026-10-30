import { pool } from '../db.js';
import { config } from '../config.js';

/**
 * 站点配置：存 settings 表（key/value），带内存缓存。
 * 后台修改后立即失效缓存 → 下一次读取生效，无需重启。
 */
const cache = new Map();
let loaded = false;

const DEFAULTS = {
  site_title: '微光博客',
  site_subtitle: '追光的人，终会光芒万丈',
  site_description: '微光博客 —— 一个会发光的个人博客角落。',
  site_logo_url: '',
  default_avatar_url: '',
  // 用户未自定义名称颜色时的默认色：取前端实际显示的强调色 --accent rgb(140 198 226)
  default_name_color: '#8cc6e2',
  about_html: '',
  about_subtitle: '一个会发光的角落',
  mail_code_subject: '',
  mail_code_body: '',
  mail_welcome_subject: '',
  mail_welcome_body: '',
  mail_test_subject: '',
  mail_test_body: '',
  smtp_host: '',
  smtp_port: '',
  smtp_secure: '',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  github_client_id: '',
  github_client_secret: '',
  google_client_id: '',
  google_client_secret: '',
  oauth_proxy_url: '',
  web_origin: 'http://localhost:5180',
  register_open: '1',
  // GoCaptcha 行为验证码：api 为前端取题用的服务公开地址；verify_api 可选（后端二次校验地址，
  // 同机部署时填内网地址可免依赖公网证书）；id 为取题实例（服务端 gocaptcha.json 里定义）
  captcha_enabled: '0',
  captcha_api: '',
  captcha_verify_api: '',
  captcha_id: 'click-default-ch',
};

export function invalidateSettings() {
  cache.clear();
  loaded = false;
}

async function ensureLoaded() {
  if (loaded) return;
  const [rows] = await pool.query('SELECT `key`, value FROM settings');
  for (const r of rows) cache.set(r.key, r.value);
  loaded = true;
}

export async function getAllSettings() {
  await ensureLoaded();
  const out = { ...DEFAULTS };
  for (const [k, v] of cache) out[k] = v;
  return out;
}

export async function getSetting(key) {
  await ensureLoaded();
  return cache.has(key) ? cache.get(key) : (DEFAULTS[key] ?? '');
}

export async function setSettings(patch) {
  const entries = Object.entries(patch).filter(([k]) => k in DEFAULTS);
  if (!entries.length) return { updated: 0 };
  for (const [k, v] of entries) {
    await pool.query(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [k, String(v ?? '')]
    );
  }
  invalidateSettings();
  return { updated: entries.length };
}

/** GitHub OAuth 生效配置：后台配置优先，其次环境变量 */
export async function githubConfig() {
  const id = (await getSetting('github_client_id')) || config.github.clientId;
  const secret = (await getSetting('github_client_secret')) || config.github.clientSecret;
  return { clientId: id, clientSecret: secret, enabled: !!(id && secret) };
}

/** Google OAuth 生效配置：后台配置优先，其次环境变量 */
export async function googleConfig() {
  const id = (await getSetting('google_client_id')) || config.google.clientId;
  const secret = (await getSetting('google_client_secret')) || config.google.clientSecret;
  return { clientId: id, clientSecret: secret, enabled: !!(id && secret) };
}

/** 默认用户名颜色：用户未自定义 name_color 时前端显示的颜色（后台「用户管理」可改；空值回退 #8cc6e2） */
export async function defaultNameColor() {
  return (await getSetting('default_name_color')) || '#8cc6e2';
}

export async function webOrigin() {
  return (await getSetting('web_origin')) || process.env.WEB_ORIGIN || 'http://localhost:5180';
}

/** GoCaptcha 服务公开地址：前端取题用（后台配置，如 https://go-captcha.example.com） */
export async function captchaApi() {
  return (await getSetting('captcha_api')) || '';
}

/** OAuth 出站代理：后台配置优先，其次环境变量；空 = 直连（国内服务器访问 GitHub/Google API 时填写） */
export async function oauthProxy() {
  return (await getSetting('oauth_proxy_url')) || process.env.OAUTH_PROXY_URL || '';
}

/** SMTP 生效配置：后台设置优先，其次环境变量；均未配置返回 null */
export async function smtpConfig() {
  const all = await getAllSettings();
  const host = all.smtp_host || config.smtp.host;
  if (!host) return null;
  const user = all.smtp_user || config.smtp.user;
  // from 必须含邮箱地址；只填了名称时把它当显示名、用认证账号当地址
  // （否则 nodemailer 拿不到地址 → 空信封 Return-Path + 无 From 头，外域必拒收）
  let from = all.smtp_from || config.smtp.from || user;
  if (from && !/@/.test(from) && user) from = `${JSON.stringify(from).replace(/[^ -~]/g, '')} <${user}>`;
  return {
    host,
    port: Number(all.smtp_port || config.smtp.port || 587),
    secure: all.smtp_secure === 'true' || all.smtp_secure === '1' || (all.smtp_secure === '' && config.smtp.secure),
    user,
    pass: all.smtp_pass || config.smtp.pass,
    from,
  };
}

/**
 * 邮件模板注册表：每种邮件（验证码 / 欢迎 / 测试）都有独立的主题与正文，
 * 后台可自定义；存值为空时回退到这里的内置默认。
 * placeholders 中的 {site} 自动替换为站点标题，其余由发送方传入。
 */
export const MAIL_TEMPLATES = {
  code: {
    kind: 'code',
    label: '验证码邮件',
    desc: '登录 / 注册 / 找回密码时发送的 6 位验证码',
    subjectKey: 'mail_code_subject',
    bodyKey: 'mail_code_body',
    placeholders: ['{code}', '{site}'],
    defaults: { subject: '验证码', body: '你的验证码是 {code}，10 分钟内有效。' },
  },
  welcome: {
    kind: 'welcome',
    label: '欢迎邮件',
    desc: '新用户注册成功后自动发送',
    subjectKey: 'mail_welcome_subject',
    bodyKey: 'mail_welcome_body',
    placeholders: ['{name}', '{site}'],
    defaults: {
      subject: '欢迎来到 {site}',
      body: '你好，{name}！\n\n欢迎加入 {site}，期待你的第一篇文章。',
    },
  },
  test: {
    kind: 'test',
    label: '测试邮件',
    desc: '后台「发送测试邮件」按钮使用此模板',
    subjectKey: 'mail_test_subject',
    bodyKey: 'mail_test_body',
    placeholders: ['{site}'],
    defaults: {
      subject: '【{site}】邮件发送测试',
      body: '这是一封来自 {site} 的测试邮件。\n\n如果你收到了它，说明当前 SMTP 配置可以正常发信。',
    },
  },
};

/**
 * 读取并渲染某类邮件模板：后台配置优先，空值回退内置默认。
 * 渲染时替换模板 placeholders 里出现的 {xxx}（{site} 由站点标题自动填充）。
 */
export async function mailTemplate(kind, vars = {}) {
  const meta = MAIL_TEMPLATES[kind];
  if (!meta) throw new Error(`未知邮件模板类型: ${kind}`);
  const all = await getAllSettings();
  const merged = { site: all.site_title || '微光博客', ...vars };
  const render = (text) => {
    let out = String(text ?? '');
    for (const [k, v] of Object.entries(merged)) out = out.replaceAll(`{${k}}`, String(v ?? ''));
    return out;
  };
  return {
    subject: render(all[meta.subjectKey] || meta.defaults.subject),
    body: render(all[meta.bodyKey] || meta.defaults.body),
  };
}

/** 对外公开的站点信息（不含密钥） */
export async function publicSiteInfo() {
  const all = await getAllSettings();
  const gh = await githubConfig();
  const gg = await googleConfig();
  const title = all.site_title;
  return {
    title,
    subtitle: all.site_subtitle,
    description: all.site_description,
    logoUrl: all.site_logo_url || '',
    defaultAvatarUrl: all.default_avatar_url || '',
    aboutHtml: all.about_html || '',
    aboutSubtitle: all.about_subtitle || '一个会发光的角落',
    registerOpen: all.register_open === '1',
    githubEnabled: gh.enabled,
    googleEnabled: gg.enabled,
    captchaEnabled: all.captcha_enabled === '1' && !!all.captcha_api,
    captchaApi: all.captcha_api || '',
    captchaId: all.captcha_id || 'click-default-ch',
  };
}
