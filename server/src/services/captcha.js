import { getSetting, tianaiCaptchaTypes } from './settings.js';

/**
 * 行为验证码（provider 可切换，后台「行为验证码」页配置）：
 * - gocaptcha（GoCaptcha 点选）：前端向 captcha_api 发 GET /api/v1/public/get-data?id=<captcha_id> 取题，
 *   前端随业务请求带上 captcha = { key, value }（value 为点选坐标串 "x1,y1,x2,y2,..."），
 *   后端向 verify 接口 POST /api/v1/public/check-data { id, captchaKey, value } 二次校验；
 * - tianai（天爱滑块，自托管 tianai-captcha-demo 服务）：前端 tac SDK 弹滑块，
 *   SDK 自己向服务发 GET /gen 取题、POST /check 校验滑动轨迹，通过后拿到 captcha id，
 *   业务请求带上 captcha = { key: <id> }，后端向服务发 GET /check2?id= 二次验证
 *   （服务端需 captcha.secondary.enabled=true，check2 一次一用，验证通过后 id 有效期 2 分钟）；
 * - recaptcha（Google reCAPTCHA v2 勾选框）：前端用 recaptcha.net 镜像加载官方组件（大陆可达），
 *   勾选后拿到 token 随业务请求带上 captcha = { value: <g-recaptcha-response> }，
 *   后端向 siteverify 接口（默认 https://recaptcha.net/recaptcha/api/siteverify）POST
 *   secret + response 校验，token 一次一用由 Google 保证，这里额外用进程内已消费集合防重放。
 * 服务端校验成功后并不立刻作废 key/token（保留至缓存 TTL），
 * 因此这里用已消费集合保证「一次一用」。
 */

const CAPTCHA_ID_DEFAULT = 'click-default-ch';
const RECAPTCHA_VERIFY_DEFAULT = 'https://recaptcha.net/recaptcha/api/siteverify';

/** 生效配置：enabled 需开关打开且当前 provider 所需配置齐全 */
export async function captchaConfig() {
  const enabled = (await getSetting('captcha_enabled')) === '1';
  const provider =
    (await getSetting('captcha_provider')) === 'recaptcha'
      ? 'recaptcha'
      : (await getSetting('captcha_provider')) === 'tianai'
        ? 'tianai'
        : 'gocaptcha';
  const api = (await getSetting('captcha_api')) || '';
  const id = (await getSetting('captcha_id')) || CAPTCHA_ID_DEFAULT;
  const recaptchaSiteKey = (await getSetting('recaptcha_site_key')) || '';
  const recaptchaSecret = (await getSetting('recaptcha_secret_key')) || '';
  const recaptchaVerifyBase =
    (await getSetting('recaptcha_verify_api')) || RECAPTCHA_VERIFY_DEFAULT;
  const ok = provider === 'recaptcha' ? !!(recaptchaSiteKey && recaptchaSecret) : !!api;
  // tianai 与 gocaptcha 都复用 captcha_api 作为服务基址（前端取题/后端校验同源）
  return {
    enabled: enabled && ok,
    provider,
    api,
    id,
    recaptchaSiteKey,
    recaptchaSecret,
    recaptchaVerifyBase,
  };
}

/* ---------- tianai 出题签发登记表 ----------
 * 为什么需要：tianai /check2 只能证明「这个 id 真实存在且已通过轨迹校验」，无法证明
 * 「出题时用的题型在后台白名单内」——客户端过去可直接 GET {base}/gen?type=任意模式 取题。
 * 现在出题只能经本服务代理（/api/captcha/tianai/gen），服务端从 whitelist 选模式并向 tianai
 * 取题，把返回的 id 登记到这里；业务校验时只有登记表中存在（且未过期）的 id 才放行。
 * 服务重启丢登记属预期（fail-closed）：用户重新弹一次验证码即可。
 */
const TIANAI_ISSUE_TTL = 10 * 60 * 1000; // 10 分钟
const TIANAI_ISSUE_MAX = 20000; // 容量上限
const tianaiIssued = new Map(); // id -> { type, expiresAt }
// ① 白名单收紧后，已签发的 id 在 TTL（10 分钟）内仍然有效——收敛窗口，用户无需重新弹验证码；
//    ② 该表为单进程内存，多实例/集群部署时需换成共享存储（如 Redis），否则签发与校验可能落到不同实例。

/**
 * 惰性清理：每次出题前顺带扫描，避免常驻 setInterval。
 * 取舍：不额外占用进程定时器，清理成本摊到出题请求；TTL 相同 → Map 插入序即过期序。
 */
function tianaiIssueSweep(now) {
  for (const [id, rec] of tianaiIssued) {
    if (rec.expiresAt <= now) tianaiIssued.delete(id);
  }
  // 超容量时逐出最早过期项（插入序最早）
  while (tianaiIssued.size >= TIANAI_ISSUE_MAX) {
    const oldest = tianaiIssued.keys().next().value;
    if (oldest === undefined) break;
    tianaiIssued.delete(oldest);
  }
}

/** 已消费验证码 key：key -> 消费时间（TTL 略大于服务端缓存 TTL 30 分钟，定期清理） */
const consumed = new Map();
const CONSUMED_TTL = 31 * 60 * 1000;

function consumeSweep() {
  const now = Date.now();
  for (const [k, t] of consumed) {
    if (now - t > CONSUMED_TTL) consumed.delete(k);
  }
}

async function verifyGocaptcha(payload, cfg) {
  const key = String(payload?.key ?? '');
  const value = String(payload?.value ?? '');
  if (!key || !value) return { ok: false, status: 400, error: '请完成行为验证', code: 'CAPTCHA_REQUIRED' };
  if (consumed.has(key)) return { ok: false, status: 400, error: '验证已失效，请重新验证', code: 'CAPTCHA_FAILED' };

  const base = (await getSetting('captcha_verify_api')) || cfg.api;
  try {
    const r = await fetch(`${base.replace(/\/+$/, '')}/api/v1/public/check-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cfg.id, captchaKey: key, value }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && Number(j?.code) === 200 && j?.data === 'ok') {
      consumeSweep();
      consumed.set(key, Date.now());
      return { ok: true };
    }
    return { ok: false, status: 400, error: '验证未通过，请重新验证', code: 'CAPTCHA_FAILED' };
  } catch {
    return { ok: false, status: 502, error: '验证码服务暂不可用，请稍后再试', code: 'CAPTCHA_UNAVAILABLE' };
  }
}

async function verifyRecaptcha(payload, cfg) {
  // 前端统一放 value（也兼容 token 字段）；token 一次一用由 Google 保证
  const token = String(payload?.value ?? payload?.token ?? '');
  if (!token) return { ok: false, status: 400, error: '请完成行为验证', code: 'CAPTCHA_REQUIRED' };
  if (consumed.has(token)) return { ok: false, status: 400, error: '验证已失效，请重新验证', code: 'CAPTCHA_FAILED' };

  try {
    const body = new URLSearchParams({ secret: cfg.recaptchaSecret, response: token });
    const r = await fetch(cfg.recaptchaVerifyBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.success === true) {
      consumeSweep();
      consumed.set(token, Date.now());
      return { ok: true };
    }
    return { ok: false, status: 400, error: '验证未通过，请重新验证', code: 'CAPTCHA_FAILED' };
  } catch {
    return { ok: false, status: 502, error: '验证码服务暂不可用，请稍后再试', code: 'CAPTCHA_UNAVAILABLE' };
  }
}

/**
 * tianai（天爱滑块）二次验证：业务请求只带 key = captcha id，
 * 后端先核对「签发登记表」（只有经本服务白名单模式出题的 id 才在表中），
 * 再向服务 GET /check2?id= 确认「已通过轨迹校验且未被消费」。
 * 服务端返回纯文本 true/false（Spring @ResponseBody boolean）。
 */
async function verifyTianai(payload, cfg) {
  const key = String(payload?.key ?? '');
  if (!key) return { ok: false, status: 400, error: '请完成行为验证', code: 'CAPTCHA_REQUIRED' };
  if (consumed.has(key)) return { ok: false, status: 400, error: '验证已失效，请重新验证', code: 'CAPTCHA_FAILED' };

  // 服务端强制：id 必须由本服务用后台白名单内的模式签发（未登记/已过期一律失败）。
  const rec = tianaiIssued.get(key);
  if (!rec || rec.expiresAt <= Date.now()) {
    if (rec) tianaiIssued.delete(key);
    return { ok: false, status: 400, error: '验证已失效，请重新验证', code: 'CAPTCHA_FAILED' };
  }
  // 先原子认领（删除）再向上游确认：并发同 id 只允许一个请求继续；
  // check2 未通过/服务不可用即作废（前端会重新取题），保持 fail-closed 与一次性消费。
  tianaiIssued.delete(key);

  const base = (await getSetting('captcha_verify_api')) || cfg.api;
  try {
    const r = await fetch(`${base.replace(/\/+$/, '')}/check2?id=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const txt = await r.text();
    if (r.ok && /"?true"?/i.test(txt.trim())) {
      consumeSweep();
      consumed.set(key, Date.now()); // 二次防重放（登记表已消费，这里保留旧集合语义）
      return { ok: true };
    }
    return { ok: false, status: 400, error: '验证未通过，请重新验证', code: 'CAPTCHA_FAILED' };
  } catch {
    return { ok: false, status: 502, error: '验证码服务暂不可用，请稍后再试', code: 'CAPTCHA_UNAVAILABLE' };
  }
}

/**
 * tianai 出题代理：服务端从后台白名单随机选模式 → 向 tianai /gen 取题 →
 * 把 id 登记进签发表 → 原始响应 JSON 原样透传（同构 passthrough，不增删字段，
 * tac SDK 依赖 code/data.id/data.type 等）。
 * 客户端 URL 上的 ?type= 一律忽略（SDK 可能拼参），模式只由服务端决定。
 */
export async function issueTianaiCaptcha() {
  const cfg = await captchaConfig();
  if (!cfg.enabled || cfg.provider !== 'tianai') {
    return { ok: false, status: 400, error: '当前未启用天爱验证码', code: 'CAPTCHA_UNAVAILABLE' };
  }

  // 与后台保存共用 settings.tianaiCaptchaTypes()（同一份归一化逻辑，避免双份实现漂移）
  const types = tianaiCaptchaTypes(await getSetting('captcha_tianai_types'));
  const type = types[Math.floor(Math.random() * types.length)] || types[0];

  let body;
  try {
    const r = await fetch(`${cfg.api.replace(/\/+$/, '')}/gen?type=${encodeURIComponent(type)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    body = await r.json().catch(() => null);
    if (!r.ok || Number(body?.code) !== 200 || body?.data?.id === undefined || body?.data?.id === null) {
      throw new Error('bad gen response');
    }
  } catch {
    return { ok: false, status: 502, error: '验证码服务暂不可用，请稍后再试', code: 'CAPTCHA_UNAVAILABLE' };
  }

  const id = String(body.data.id);
  tianaiIssueSweep(Date.now());
  tianaiIssued.set(id, { type, expiresAt: Date.now() + TIANAI_ISSUE_TTL });
  return { ok: true, body };
}

/**
 * 校验验证码。返回 { ok: true } 或 { ok: false, status, error }。
 * - 未启用 → 直接放行（skipped: true）
 * - 服务不可达 → 502（fail-closed：启用状态下必须验证通过才放行）
 */
export async function verifyCaptcha(payload) {
  const cfg = await captchaConfig();
  if (!cfg.enabled) return { ok: true, skipped: true };

  // JSON 请求体里是对象；multipart 表单里是 JSON 字符串（前端 fd.append('captcha', JSON.stringify(...))）
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }

  if (cfg.provider === 'recaptcha') return verifyRecaptcha(payload, cfg);
  if (cfg.provider === 'tianai') return verifyTianai(payload, cfg);
  return verifyGocaptcha(payload, cfg);
}

/** Express 中间件：校验 req.body.captcha，失败直接 4xx/5xx */
export function captchaGuard(req, res, next) {
  verifyCaptcha(req.body?.captcha)
    .then((r) => (r.ok ? next() : res.status(r.status).json({ error: r.error, code: r.code })))
    .catch(next);
}

/* ---------- 验证码信用：一次验证覆盖同一用户的后续一步 ----------
 * 场景：注册/魔法登录需要先发邮箱码，若发码与提交各验一次则用户要过两关。
 * send-code 通过行为验证后签发信用（IP+邮箱+用途，10 分钟内一次一用），
 * 后续 register / login/code 无需再验——仍需邮箱码，安全性不降。
 */
const credits = new Map(); // `${ip}|${email}|${purpose}` -> 签发时间
const CREDIT_TTL = 10 * 60 * 1000;

function creditSweep() {
  const now = Date.now();
  for (const [k, t] of credits) {
    if (now - t > CREDIT_TTL) credits.delete(k);
  }
}

/** send-code 成功后调用：给该 IP+邮箱+用途签发一次性信用 */
export function grantCaptchaCredit(ip, email, purpose) {
  creditSweep();
  credits.set(`${String(ip)}|${String(email).toLowerCase()}|${purpose}`, Date.now());
}

function consumeCaptchaCredit(ip, email, purpose) {
  const k = `${String(ip)}|${String(email).toLowerCase()}|${purpose}`;
  const t = credits.get(k);
  if (t === undefined) return false;
  credits.delete(k); // 一次一用
  return Date.now() - t <= CREDIT_TTL;
}

function captchaPayloadPresent(raw) {
  let p = raw;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = null;
    }
  }
  // gocaptcha: { key, value }；recaptcha: { value: token }（或 { token }）
  return !!(p && (p.key || p.value || p.token));
}

/**
 * Express 中间件：验证码可选——
 * - 未启用 → 放行；
 * - 携带了验证码 → 必须校验通过（错码/失效/服务不可用直接回错误）；
 * - 未携带 → 消费一次验证码信用，无信用则 400 { code: 'CAPTCHA_REQUIRED' }
 *   （前端据此按需弹窗，正常用户零打扰）。
 */
export function captchaOptionalGuard(purpose, getEmail) {
  return function (req, res, next) {
    verifyCaptcha(req.body?.captcha)
      .then((r) => {
        if (r.ok) return next();
        if (captchaPayloadPresent(req.body?.captcha)) {
          return res.status(r.status).json({ error: r.error, code: r.code });
        }
        const email = String(getEmail?.(req) ?? '').trim();
        if (email && consumeCaptchaCredit(req.ip, email, purpose)) return next();
        return res.status(400).json({ error: '请完成行为验证', code: 'CAPTCHA_REQUIRED' });
      })
      .catch(next);
  };
}
