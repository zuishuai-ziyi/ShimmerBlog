import { Router } from 'express';
import { issueTianaiCaptcha } from '../services/captcha.js';
import { makeLimiter } from '../utils.js';

export const captchaRouter = Router();

/**
 * tianai 出题代理限流：每 IP 60 次/分钟（单实例内存限流，正常用户每次弹窗只取一次题）。
 * 出题走本服务而非让前端直连 tianai：模式（题型）必须由服务端从后台白名单选出并登记，
 * /check2 只验证 id 真实性、拿不回题型，因此不在出题链路强制白名单就等于没限制。
 */
const tianaiGenLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyOf: (req) => String(req.ip || ''),
});

async function tianaiGen(req, res, next) {
  try {
    // 客户端 URL 上的 ?type= 一律忽略：模式只由服务端从白名单选择
    const r = await issueTianaiCaptcha();
    if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.code });
    // 原样透传 tianai /gen 的 JSON（tac SDK 依赖 code / data.id / data.type 等字段）
    res.json(r.body);
  } catch (e) {
    next(e);
  }
}

// 同时挂 GET 与 POST：tac SDK 的 requestCaptchaData() 固定用 POST
// （Content-Type: application/json，body 为 {}），二者行为完全一致。
captchaRouter.get('/tianai/gen', tianaiGenLimiter, tianaiGen);
captchaRouter.post('/tianai/gen', tianaiGenLimiter, tianaiGen);
