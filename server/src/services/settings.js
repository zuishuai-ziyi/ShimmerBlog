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
  return {
    host,
    port: Number(all.smtp_port || config.smtp.port || 587),
    secure: all.smtp_secure === 'true' || all.smtp_secure === '1' || (all.smtp_secure === '' && config.smtp.secure),
    user: all.smtp_user || config.smtp.user,
    pass: all.smtp_pass || config.smtp.pass,
    from: all.smtp_from || config.smtp.from || all.smtp_user || config.smtp.user,
  };
}

/** 验证码邮件模板：后台可配置，{code} 占位符 */
export async function mailTemplate() {
  const all = await getAllSettings();
  return {
    subject: all.mail_code_subject || '验证码',
    body: all.mail_code_body || '你的验证码是 {code}，10 分钟内有效。',
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
