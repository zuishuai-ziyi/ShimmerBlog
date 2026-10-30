import { getSetting } from './settings.js';

/**
 * GoCaptcha 行为验证码（独立 go-captcha-service，HTTP API）：
 * - 前端向 captcha_api 发 GET /api/v1/public/get-data?id=<captcha_id> 取题
 * - 前端随业务请求带上 captcha = { key, value }（value 为点选坐标串 "x1,y1,x2,y2,..."）
 * - 后端向 verify 接口 POST /api/v1/public/check-data { id, captchaKey, value } 二次校验
 * 服务端 check-data 成功后并不立刻作废 key（保留至缓存 TTL），
 * 因此这里额外用进程内已消费集合保证「一 key 一用」，防止重放。
 */

const CAPTCHA_ID_DEFAULT = 'click-default-ch';

/** 生效配置：enabled 需开关打开且配了服务地址 */
export async function captchaConfig() {
  const enabled = (await getSetting('captcha_enabled')) === '1';
  const api = (await getSetting('captcha_api')) || '';
  const id = (await getSetting('captcha_id')) || CAPTCHA_ID_DEFAULT;
  return { enabled: enabled && !!api, api, id };
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

  const key = String(payload?.key ?? '');
  const value = String(payload?.value ?? '');
  if (!key || !value) return { ok: false, status: 400, error: '请完成行为验证' };
  if (consumed.has(key)) return { ok: false, status: 400, error: '验证已失效，请重新验证' };

  const base = (await getSetting('captcha_verify_api')) || cfg.api;
  try {
    const r = await fetch(`${base.replace(/\/+$/, '')}/api/v1/public/check-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cfg.id, captchaKey: key, value }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.code === 200 && j?.data === 'ok') {
      consumeSweep();
      consumed.set(key, Date.now());
      return { ok: true };
    }
    return { ok: false, status: 400, error: '验证未通过，请重新验证' };
  } catch {
    return { ok: false, status: 502, error: '验证码服务暂不可用，请稍后再试' };
  }
}

/** Express 中间件：校验 req.body.captcha，失败直接 4xx/5xx */
export function captchaGuard(req, res, next) {
  verifyCaptcha(req.body?.captcha)
    .then((r) => (r.ok ? next() : res.status(r.status).json({ error: r.error })))
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
  return !!(p && p.key && p.value);
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
          return res.status(r.status).json({ error: r.error });
        }
        const email = String(getEmail?.(req) ?? '').trim();
        if (email && consumeCaptchaCredit(req.ip, email, purpose)) return next();
        return res.status(400).json({ error: '请完成行为验证', code: 'CAPTCHA_REQUIRED' });
      })
      .catch(next);
  };
}
