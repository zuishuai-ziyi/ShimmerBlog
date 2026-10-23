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
  site_subtitle: '在深空里写字，让每一篇都亮一点点。',
  site_description: '微光博客 —— 一个会发光的个人博客角落。',
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

/** 对外公开的站点信息（不含密钥） */
export async function publicSiteInfo() {
  const all = await getAllSettings();
  const gh = await githubConfig();
  return {
    title: all.site_title,
    subtitle: all.site_subtitle,
    description: all.site_description,
    registerOpen: all.register_open === '1',
    githubEnabled: gh.enabled,
  };
}
