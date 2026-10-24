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
  about_html: '',
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
  web_origin: 'http://localhost:5180',
  register_open: '1',
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

export async function webOrigin() {
  return (await getSetting('web_origin')) || process.env.WEB_ORIGIN || 'http://localhost:5180';
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
  return {
    title: all.site_title,
    subtitle: all.site_subtitle,
    description: all.site_description,
    logoUrl: all.site_logo_url || '',
    defaultAvatarUrl: all.default_avatar_url || '',
    aboutHtml: all.about_html || '',
    registerOpen: all.register_open === '1',
    githubEnabled: gh.enabled,
  };
}
