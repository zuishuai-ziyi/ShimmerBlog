import { pool } from '../db.js';
import { config } from '../config.js';

/* ---------- 行为验证码类型白名单与默认值（集中定义，供设置读写与下发共用） ---------- */
/** tianai（天爱 captcha）：/gen?type=XXX 支持的类型集合 */
export const TIANAI_CAPTCHA_TYPES = ['SLIDER', 'ROTATE', 'CONCAT', 'WORD_IMAGE_CLICK'];
/** tianai 默认类型：配置为空/全非法时回落 */
export const TIANAI_CAPTCHA_TYPES_DEFAULT = 'SLIDER';
/** GoCaptcha：前端库 go-captcha-vue 目前只对接点选（Click），故白名单仅 CLICK */
export const GOCAPTCHA_CAPTCHA_TYPES = ['CLICK'];
/** GoCaptcha 默认类型：配置为空/全非法时回落 */
export const GOCAPTCHA_CAPTCHA_TYPES_DEFAULT = 'CLICK';

/**
 * 规范化行为验证码类型列表（纯函数，不碰数据库，便于复用与测试）：
 * 入参可为 CSV 字符串或字符串数组 → 大写、trim、去重、按白名单过滤；
 * 结果为空（空串/全非法）时回落到 fallback（fallback 必须是白名单内的一个合法值）。
 */
export function normalizeCaptchaTypes(value, allowed, fallback) {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  const seen = new Set();
  const out = [];
  for (const part of raw.split(',')) {
    const t = part.trim().toUpperCase();
    if (!t || seen.has(t)) continue;
    if (!allowed.includes(t)) continue; // 白名单外的类型直接丢弃（不报错）
    seen.add(t);
    out.push(t);
  }
  return out.length ? out : [fallback];
}

/** tianai 可用类型（数组）：入参 CSV/数组 → 规范化后的合法类型列表 */
export function tianaiCaptchaTypes(value) {
  return normalizeCaptchaTypes(value, TIANAI_CAPTCHA_TYPES, TIANAI_CAPTCHA_TYPES_DEFAULT);
}

/** GoCaptcha 可用类型（数组）：入参 CSV/数组 → 规范化后的合法类型列表 */
export function gocaptchaCaptchaTypes(value) {
  return normalizeCaptchaTypes(value, GOCAPTCHA_CAPTCHA_TYPES, GOCAPTCHA_CAPTCHA_TYPES_DEFAULT);
}

/* ---------- 外站跳转白名单（域名） ---------- */
/**
 * 规范化单个白名单条目（纯函数，不碰数据库）：
 * - 支持直接粘贴完整 URL：剥掉 scheme / userinfo / 路径 / 查询串 / 锚点 / 端口，只取 hostname；
 * - 支持 `.example.com` 与 `*.example.com` 两种「仅子域」写法，统一归一为 `.example.com`；
 * - 大小写统一转小写；空行与非法条目丢弃（不报错）。
 * 返回：普通条目 `example.com`；仅子域条目 `.example.com`；非法/空 → 空串。
 */
function normalizeExternalLinkEntry(input) {
  let s = String(input ?? '').trim();
  if (!s) return '';
  // 「仅子域」标记：*.example.com / .example.com → 统一为 .example.com
  let subOnly = false;
  if (s.startsWith('*.')) {
    subOnly = true;
    s = s.slice(2);
  } else if (s.startsWith('.')) {
    subOnly = true;
    s = s.slice(1);
  }
  // 剥掉 scheme（http://、https://）与协议相对前缀（//）
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '');
  // 剥掉 userinfo（user:pass@host）
  const at = s.lastIndexOf('@');
  if (at >= 0) s = s.slice(at + 1);
  // 剥掉路径 / 查询串 / 锚点
  s = s.split(/[/?#]/)[0];
  // 剥掉端口
  s = s.replace(/:\d+$/, '');
  s = s.trim().toLowerCase();
  // 去掉结尾的点（FQDN 写法 example.com.）
  s = s.replace(/\.+$/, '');
  if (!s) return '';
  // 只接受合法域名（label = 字母数字/连字符，且不能以连字符开头或结尾）
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(s)) return '';
  return subOnly ? `.${s}` : s;
}

/**
 * 规范化外站跳转白名单（纯函数，不碰数据库，便于复用与测试）：
 * 入参可为多行字符串或字符串数组 → 逐条归一化、去空、去重（保留首次出现顺序）；
 * 条目之间可用换行或逗号分隔。返回规范化后的条目数组。
 */
export function normalizeExternalLinkWhitelist(value) {
  const raw = Array.isArray(value) ? value.join('\n') : String(value ?? '');
  const seen = new Set();
  const out = [];
  for (const line of raw.split(/[\r\n]+/)) {
    for (const part of line.split(',')) {
      const entry = normalizeExternalLinkEntry(part);
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
    }
  }
  return out;
}

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
  // 通知类邮件模板（作者侧：登录提醒 / 审核状态；审核员侧：新任务提醒）
  mail_notify_login_subject: '',
  mail_notify_login_body: '',
  mail_notify_review_pending_subject: '',
  mail_notify_review_pending_body: '',
  mail_notify_review_approved_subject: '',
  mail_notify_review_approved_body: '',
  mail_notify_review_rejected_subject: '',
  mail_notify_review_rejected_body: '',
  mail_notify_reviewer_new_task_subject: '',
  mail_notify_reviewer_new_task_body: '',
  smtp_host: '',
  smtp_port: '',
  smtp_secure: '',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  // 注：旧的 github_client_id / github_client_secret / google_client_id / google_client_secret
  // 已迁移到 oauth_providers 表（见 db.js 的 migrateOAuthProviders），不再作为站点设置读写。
  oauth_proxy_url: '',
  web_origin: 'http://localhost:5180',
  register_open: '1',
  // 行为验证码：provider 选验证服务（gocaptcha 点选 / recaptcha v2 勾选框）；
  // gocaptcha：api 为前端取题用的服务公开地址，verify_api 可选（后端二次校验地址，同机部署时填内网地址
  // 可免依赖公网证书），id 为取题实例（服务端 gocaptcha.json 里定义）；
  // recaptcha：site_key 前端渲染勾选框用，secret_key 后端 siteverify 用，verify_api 可选（默认官方国内镜像 recaptcha.net）
  captcha_enabled: '0',
  captcha_provider: 'gocaptcha',
  captcha_api: '',
  captcha_verify_api: '',
  captcha_id: 'click-default-ch',
  // 行为验证码可选类型（CSV，逗号分隔，可多选）：
  // tianai 支持 SLIDER/ROTATE/CONCAT/WORD_IMAGE_CLICK，gocaptcha 支持 CLICK；
  // 保存时按白名单规范化（非法值过滤掉，空值回落到默认类型），下发时转成数组。
  captcha_tianai_types: 'SLIDER',
  captcha_gocaptcha_types: 'CLICK',
  recaptcha_site_key: '',
  recaptcha_secret_key: '',
  recaptcha_verify_api: '',
  // 外站跳转白名单（每行一个域名）：命中的域名点击跳转时不弹「是否前往外站」确认气泡。
  // 支持 example.com（含任意子域）、.example.com / *.example.com（仅子域），
  // 也可直接粘贴完整 URL（保存时归一化，只取主机名）。
  external_link_whitelist: '',
  // 第三方头像转存：重定向跟随上限（0–12 跳）与总超时（1–300 秒），后台可改
  avatar_redirect_hops: '12',
  avatar_timeout_seconds: '60',
  // 文章审核流程：enabled 总开关；stages 为阶段序列（'ai' / 'human' 的子集、去重、非空）；
  // ai / human 段的 on_approve / on_reject 决定该阶段通过或拒绝后的去向：
  // 'next' 进入下一阶段，'final_approve' / 'final_reject' 直接终审。
  review_flow: '{"enabled":false,"stages":["ai","human"],"ai":{"on_approve":"next","on_reject":"next"},"human":{"on_approve":"final_approve","on_reject":"final_reject"}}',
  // AI 初审接口配置（OpenAI 兼容）：base_url 到 /v1 为止；thinking 非 'off' 时按 reasoning_effort 下发
  review_ai: '{"base_url":"https://api.openai.com/v1","api_key":"","model":"gpt-4o-mini","thinking":"off","temperature":0.2,"timeout_seconds":60,"strictness":"standard","custom_prompt":""}',
};

/** 内置默认配置（供其他模块做回退参考） */
export { DEFAULTS };

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

/* ---------- SSO provider（oauth_providers 表） ---------- */

/** 内置 OAuth 端点预设：按 type 取默认授权 / 令牌 / 用户信息地址与 scope（行内 URL、scope 为空时回落） */
export const OAUTH_PRESETS = {
  github: {
    authorize_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    userinfo_url: 'https://api.github.com/user',
    scope: 'read:user user:email',
  },
  google: {
    authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  generic: {
    authorize_url: '',
    token_url: '',
    userinfo_url: '',
    scope: '',
  },
};

/** oauth_providers 的 type 枚举（与建表 ENUM 一致） */
const PROVIDER_TYPES = ['github', 'google', 'generic'];

/** oauth_providers 可写字段白名单（防注入未知列） */
const PROVIDER_FIELDS = [
  'slug',
  'name',
  'type',
  'client_id',
  'client_secret',
  'authorize_url',
  'token_url',
  'userinfo_url',
  'scope',
  'enabled',
  'sort_order',
];

/**
 * 解析 provider 生效的端点：行内自定义值为空时回落到 type 对应预设，否则用自定义值。
 * 入参可以是数据库行或普通对象；返回 { authorize_url, token_url, userinfo_url, scope }。
 */
export function resolveProviderEndpoints(row) {
  const preset = OAUTH_PRESETS[row?.type] || OAUTH_PRESETS.generic;
  const pick = (value, key) => {
    const v = String(value ?? '').trim();
    return v || (preset[key] || '');
  };
  return {
    authorize_url: pick(row?.authorize_url, 'authorize_url'),
    token_url: pick(row?.token_url, 'token_url'),
    userinfo_url: pick(row?.userinfo_url, 'userinfo_url'),
    scope: pick(row?.scope, 'scope'),
  };
}

/** enabled 字段归一化：true / 1 / '1' / 'true' → 1，其余 → 0 */
function toEnabledFlag(value) {
  if (value === true || value === 1) return 1;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()) ? 1 : 0;
  }
  return value ? 1 : 0;
}

/** 只保留白名单字段并做基本类型归一（字符串 / enabled 0-1 / sort_order 整数 / type 枚举） */
function pickProviderFields(data = {}) {
  const out = {};
  for (const f of PROVIDER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, f)) continue;
    const v = data[f];
    if (v === undefined) continue;
    if (f === 'enabled') {
      out[f] = toEnabledFlag(v);
      continue;
    }
    if (f === 'sort_order') {
      const n = Number.parseInt(v, 10);
      out[f] = Number.isFinite(n) ? n : 0;
      continue;
    }
    if (f === 'type') {
      const t = String(v ?? '').trim().toLowerCase();
      out[f] = PROVIDER_TYPES.includes(t) ? t : 'generic';
      continue;
    }
    out[f] = String(v ?? '');
  }
  return out;
}

/** provider 列表：默认只返回 enabled=1 的，按 sort_order、id 排序 */
export async function listOAuthProviders(includeDisabled = false) {
  const sql = includeDisabled
    ? 'SELECT * FROM oauth_providers ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM oauth_providers WHERE enabled = 1 ORDER BY sort_order ASC, id ASC';
  const [rows] = await pool.query(sql);
  return rows;
}

/** 按 slug 取 provider（含 disabled 的行）；没有则返回 null */
export async function getOAuthProviderBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM oauth_providers WHERE slug = ? LIMIT 1', [slug]);
  return rows[0] ?? null;
}

/** 按 id 取 provider（含 disabled 的行）；没有则返回 null */
export async function getOAuthProviderById(id) {
  const [rows] = await pool.query('SELECT * FROM oauth_providers WHERE id = ? LIMIT 1', [id]);
  return rows[0] ?? null;
}

/** 新建 provider：data 字段即表字段，只写入白名单列；返回新建后的行 */
export async function createOAuthProvider(data = {}) {
  const clean = pickProviderFields(data);
  const slug = String(clean.slug ?? '').trim();
  const name = String(clean.name ?? '').trim();
  if (!slug) throw new Error('provider slug 不能为空');
  if (!name) throw new Error('provider name 不能为空');
  const cols = ['slug', 'name', 'type'];
  const vals = [slug, name, clean.type || 'generic'];
  for (const f of PROVIDER_FIELDS) {
    if (f === 'slug' || f === 'name' || f === 'type') continue;
    if (!(f in clean)) continue;
    cols.push(f);
    vals.push(clean[f]);
  }
  const [res] = await pool.query(
    `INSERT INTO oauth_providers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    vals
  );
  return getOAuthProviderById(res.insertId);
}

/**
 * 更新 provider（按 id）：patch 只取白名单列；改 slug 时同步改绑定表里的 provider_slug。
 * 返回更新后的行；id 不存在时返回 null。
 */
export async function updateOAuthProvider(id, patch = {}) {
  const clean = pickProviderFields(patch);
  const cols = Object.keys(clean);
  if (cols.length === 0) return getOAuthProviderById(id);
  const before = clean.slug ? await getOAuthProviderById(id) : null;
  const sets = cols.map((c) => `${c} = ?`).join(', ');
  const vals = cols.map((c) => clean[c]);
  vals.push(id);
  await pool.query(`UPDATE oauth_providers SET ${sets} WHERE id = ?`, vals);
  if (before && before.slug && before.slug !== clean.slug) {
    // slug 是绑定表的关联键，改名时同步，避免绑定落到不存在的 provider 上
    await pool.query('UPDATE user_oauth_accounts SET provider_slug = ? WHERE provider_slug = ?', [
      clean.slug,
      before.slug,
    ]);
  }
  return getOAuthProviderById(id);
}

/** 删除 provider：同时清掉该 provider 名下的用户绑定；返回是否删到了行 */
export async function deleteOAuthProvider(id) {
  const row = await getOAuthProviderById(id);
  if (!row) return false;
  await pool.query('DELETE FROM user_oauth_accounts WHERE provider_slug = ?', [row.slug]);
  await pool.query('DELETE FROM oauth_providers WHERE id = ?', [id]);
  return true;
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

/** 验证码 provider：tianai（天爱滑块）| recaptcha（Google 勾选）| gocaptcha（点选），未知值回退 gocaptcha */
function captchaProviderOf(all) {
  if (all.captcha_provider === 'recaptcha') return 'recaptcha';
  if (all.captcha_provider === 'tianai') return 'tianai';
  return 'gocaptcha';
}

/** 验证码是否生效：开关打开 + 当前 provider 所需配置齐全（tianai/gocaptcha 都复用 captcha_api 作为服务基址） */
function captchaEnabledOf(all) {
  if (all.captcha_enabled !== '1') return false;
  return captchaProviderOf(all) === 'recaptcha'
    ? !!(all.recaptcha_site_key && all.recaptcha_secret_key)
    : !!all.captcha_api;
}

/** OAuth 出站代理：后台配置优先，其次环境变量；空 = 直连（国内服务器访问 GitHub/Google API 时填写） */
export async function oauthProxy() {
  return (await getSetting('oauth_proxy_url')) || process.env.OAUTH_PROXY_URL || '';
}

/** 第三方头像下载：重定向跟随上限（钳制 0–12，默认 12） */
export async function avatarRedirectHops() {
  const n = parseInt(await getSetting('avatar_redirect_hops'), 10);
  return Number.isFinite(n) ? Math.min(12, Math.max(0, n)) : 12;
}

/** 第三方头像下载：总超时秒数（钳制 1–300，默认 60） */
export async function avatarTimeoutSeconds() {
  const n = parseInt(await getSetting('avatar_timeout_seconds'), 10);
  return Number.isFinite(n) ? Math.min(300, Math.max(1, n)) : 60;
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
  notify_login: {
    kind: 'notify_login',
    label: '登录提醒',
    desc: '用户登录时发送（需用户在「通知设置」里开启）',
    subjectKey: 'mail_notify_login_subject',
    bodyKey: 'mail_notify_login_body',
    placeholders: ['{name}', '{time}', '{ip}', '{site}'],
    defaults: {
      subject: '【{site}】新登录提醒',
      body: '你好，{name}：\n\n你的账号刚刚在 {time} 从 IP {ip} 登录 {site}。\n\n如非本人操作，请立即修改密码并检查账号安全。',
    },
  },
  notify_review_pending: {
    kind: 'notify_review_pending',
    label: '文章待审核通知',
    desc: '作者提交文章送审后发送',
    subjectKey: 'mail_notify_review_pending_subject',
    bodyKey: 'mail_notify_review_pending_body',
    placeholders: ['{name}', '{title}', '{flow}', '{current_stage}', '{site}'],
    defaults: {
      subject: '【{site}】文章已进入审核',
      body: '你好，{name}：\n\n你的文章《{title}》已提交到 {site}，当前正在审核队列中。\n\n审核结果会另行通知你，请耐心等待。\n\n审核流程：{flow}\n当前步骤：{current_stage}',
    },
  },
  notify_review_approved: {
    kind: 'notify_review_approved',
    label: '审核通过通知',
    desc: '文章终审通过后发送给作者',
    subjectKey: 'mail_notify_review_approved_subject',
    bodyKey: 'mail_notify_review_approved_body',
    placeholders: ['{name}', '{title}', '{url}', '{flow}', '{current_stage}', '{site}'],
    defaults: {
      subject: '【{site}】文章审核通过',
      body: '你好，{name}：\n\n你的文章《{title}》已通过审核并正式发布。\n\n文章链接：{url}\n\n审核流程：{flow}\n当前步骤：{current_stage}',
    },
  },
  notify_review_rejected: {
    kind: 'notify_review_rejected',
    label: '审核未通过通知',
    desc: '文章终审未通过后发送给作者',
    subjectKey: 'mail_notify_review_rejected_subject',
    bodyKey: 'mail_notify_review_rejected_body',
    placeholders: ['{name}', '{title}', '{note}', '{flow}', '{current_stage}', '{site}'],
    defaults: {
      subject: '【{site}】文章未通过审核',
      body: '你好，{name}：\n\n你的文章《{title}》未通过审核。\n\n审核意见：{note}\n\n你可以修改文章后重新提交审核。\n\n审核流程：{flow}\n当前步骤：{current_stage}',
    },
  },
  notify_reviewer_new_task: {
    kind: 'notify_reviewer_new_task',
    label: '审核员新任务提醒',
    desc: '有新的文章进入人工审核阶段时发送给审核员',
    subjectKey: 'mail_notify_reviewer_new_task_subject',
    bodyKey: 'mail_notify_reviewer_new_task_body',
    placeholders: ['{name}', '{title}', '{author}', '{count}', '{flow}', '{current_stage}', '{site}'],
    defaults: {
      subject: '【{site}】新的审核任务',
      body: '你好，{name}：\n\n{author} 的文章《{title}》已进入人工审核阶段。\n\n当前待审核任务共 {count} 条，请尽快处理。\n\n审核流程：{flow}\n当前步骤：{current_stage}',
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
  // 已启用的 provider（按 sort_order、id 排序）：只下发 slug / name / type，不含任何密钥
  const providers = await listOAuthProviders(false);
  // 真正可用的（enabled + client_id + client_secret 齐全）才对外暴露入口，避免按钮点了报 501
  const usable = providers.filter(
    (p) => p.enabled && String(p.client_id ?? '').trim() && String(p.client_secret ?? '').trim()
  );
  const enabledSlugs = new Set(usable.map((p) => p.slug));
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
    // github / google 是否可用：从 oauth_providers 表推导（该 slug 存在、enabled=1 且密钥齐全）
    githubEnabled: enabledSlugs.has('github'),
    googleEnabled: enabledSlugs.has('google'),
    // 可用的第三方登录入口（前端按此渲染登录按钮）
    oauthProviders: usable.map((p) => ({ slug: p.slug, name: p.name, type: p.type })),
    captchaEnabled: captchaEnabledOf(all),
    captchaProvider: captchaProviderOf(all),
    captchaApi: all.captcha_api || '',
    captchaId: all.captcha_id || 'click-default-ch',
    // 可选验证码类型（数组）：前端按 provider 挑一个用，保证至少有一个合法值
    captchaTianaiTypes: tianaiCaptchaTypes(all.captcha_tianai_types),
    captchaGocaptchaTypes: gocaptchaCaptchaTypes(all.captcha_gocaptcha_types),
    recaptchaSiteKey: captchaProviderOf(all) === 'recaptcha' ? all.recaptcha_site_key || '' : '',
    // 外站跳转白名单（数组）：解析后的域名条目；前端命中则直接放行跳转，不弹确认气泡
    externalLinkWhitelist: normalizeExternalLinkWhitelist(all.external_link_whitelist),
  };
}
