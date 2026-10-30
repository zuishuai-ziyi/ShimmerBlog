/**
 * GoCaptcha 行为验证码冒烟测试：node scripts/smoke-captcha.mjs
 * 本地起一个 mock go-captcha-service（127.0.0.1:9797，只实现 check-data），
 * 开启 captcha_enabled 后验证：/site 公开字段、各保护端点缺参 400 / 校验失败 400 /
 * 校验通过放行、一 key 一用（防重放）、验证码服务不可用 502（fail-closed），最后还原配置。
 */
import http from 'node:http';
import { latestCode } from './_test-lib.mjs';

const BASE = process.env.SB_BASE || 'http://127.0.0.1:3010/api';
const MOCK_PORT = Number(process.env.SB_CAPTCHA_MOCK_PORT || 9797);

/* ---------- mock go-captcha-service + reCAPTCHA siteverify ---------- */
// mode: 'ok'（校验通过）| 'failure'（校验不通过）| 'down'（连接直接断开，模拟服务不可用）
let mode = 'ok';
let rcSecret = ''; // reCAPTCHA 段设置；mock 侧校验后端送达的 secret 是否正确
const mock = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/api/v1/public/check-data')) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (mode === 'down') {
        req.destroy();
        return;
      }
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {}
      const passed = mode === 'ok' && !!body.captchaKey && !!body.value && !!body.id;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200, message: '', data: passed ? 'ok' : 'failure' }));
    });
    return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/recaptcha/siteverify')) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (mode === 'down') {
        req.destroy();
        return;
      }
      const p = new URLSearchParams(raw);
      const passed = mode === 'ok' && p.get('secret') === rcSecret && !!p.get('response');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: passed, challenge_ts: new Date().toISOString(), hostname: '127.0.0.1' }));
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 404, message: 'not found' }));
});
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

/* ---------- 工具 ---------- */
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// 每次「取题」都会得到新 key（真实流程 get-data 每次返回新的 captcha_key），这里用自增 key 模拟
let keySeq = 0;
const good = () => ({ key: `k-${Date.now()}-${++keySeq}`, value: '10,20,30,40' }); // 带时间戳：服务端 consumed Map（31min TTL）跨轮不碰撞

/* ---------- 前置：管理员登录 + 备份并开启验证码配置 ---------- */
const adminLogin = await req('POST', '/admin/login', { body: { password: process.env.SB_ADMIN_PASSWORD || '123456' } });
if (adminLogin.status !== 200) {
  console.error('管理员登录失败，无法继续', adminLogin.status);
  mock.close();
  process.exit(1);
}
const adminToken = adminLogin.data.token;

const cur = await req('GET', '/admin/settings', { token: adminToken });
const oldCfg = {
  captcha_enabled: cur.data.settings.captcha_enabled ?? '0',
  captcha_provider: cur.data.settings.captcha_provider ?? 'gocaptcha',
  captcha_api: cur.data.settings.captcha_api ?? '',
  captcha_verify_api: cur.data.settings.captcha_verify_api ?? '',
  captcha_id: cur.data.settings.captcha_id ?? 'click-default-ch',
  recaptcha_site_key: cur.data.settings.recaptcha_site_key ?? '',
  recaptcha_verify_api: cur.data.settings.recaptcha_verify_api ?? '',
};
// recaptcha_secret_key 掩码回传（有配置 → __KEEP__）：原本未配置时还原需显式 __CLEAR__ 清掉测试值
const oldRcSecretSet = cur.data.settings.recaptcha_secret_key === '__KEEP__';
let r = await req('PUT', '/admin/settings', {
  token: adminToken,
  body: { captcha_enabled: '1', captcha_api: `http://127.0.0.1:${MOCK_PORT}`, captcha_id: 'click-default-ch' },
});
ok('开启验证码 200', r.status === 200 && r.data.captchaEnabled === true);

r = await req('GET', '/site');
ok('/site 暴露 captchaEnabled/captchaApi/captchaId', r.data.captchaEnabled === true && r.data.captchaApi === `http://127.0.0.1:${MOCK_PORT}` && r.data.captchaId === 'click-default-ch');

/* ---------- 注册：发码（带验证码）→ 注册免二次验证（验证码信用） ---------- */
mode = 'ok';
const MAIL = `cap-${Date.now()}@shimmer.dev`;
r = await req('POST', '/auth/send-code', { body: { email: MAIL, purpose: 'register', captcha: good() } });
ok('send-code 带正确验证码 200', r.status === 200 && r.data.sent === true);

// 发码已验证 → 注册不再要求验证码（信用一次一用）
const regCode = r.data.devCode || (await latestCode(MAIL, 'register'));
r = await req('POST', '/auth/register', { body: { email: MAIL, password: 'pass123456', name: '验证码测试', code: regCode } });
ok('注册免二次验证（信用）201', r.status === 201, JSON.stringify(r.data));
let token = r.data.token || '';

// 无信用且未携带验证码 → 400 CAPTCHA_REQUIRED
const MAIL2 = `cap2-${Date.now()}@shimmer.dev`;
r = await req('POST', '/auth/register', { body: { email: MAIL2, password: 'pass123456', name: 'x', code: '123456' } });
ok('注册无信用无验证码 400 CAPTCHA_REQUIRED', r.status === 400 && r.data.code === 'CAPTCHA_REQUIRED', JSON.stringify(r.data));

// 带验证码可直接注册（无信用兑底路径）
r = await req('POST', '/auth/send-code', { body: { email: MAIL2, purpose: 'register', captcha: good() } });
const code2 = r.data.devCode || (await latestCode(MAIL2, 'register'));
r = await req('POST', '/auth/register', { body: { email: MAIL2, password: 'pass123456', name: 'x2', code: code2, captcha: good() } });
ok('注册带验证码（兑底）201', r.status === 201, JSON.stringify(r.data));
ok('测试用户 token 就绪', !!token);

// 携带错误验证码且无信用 → 直接回验证错误（不吃信用）
mode = 'failure';
const MAIL3 = `cap3-${Date.now()}@shimmer.dev`;
r = await req('POST', '/auth/register', { body: { email: MAIL3, password: 'pass123456', name: 'x3', code: '123456', captcha: good() } });
ok('注册错验证码 400', r.status === 400 && r.data.code === 'CAPTCHA_FAILED' && /验证未通过/.test(r.data.error || ''), JSON.stringify(r.data));
mode = 'ok';

/* ---------- 各保护端点 ---------- */
// 1. 登录：缺 captcha → 400
r = await req('POST', '/auth/login', { body: { email: MAIL, password: 'pass123456' } });
ok('login 缺验证码 400', r.status === 400 && /行为验证/.test(r.data.error || ''), JSON.stringify(r.data));

// 2. 登录：验证码校验失败 → 400
mode = 'failure';
r = await req('POST', '/auth/login', { body: { email: MAIL, password: 'pass123456', captcha: good() } });
ok('login 校验失败 400', r.status === 400 && /验证未通过/.test(r.data.error || ''));

// 3. 登录：验证码通过（错误密码 → 401 说明已穿过验证码层）
mode = 'ok';
r = await req('POST', '/auth/login', { body: { email: MAIL, password: 'wrong-pass', captcha: good() } });
ok('login 验证码通过后到密码校验 401', r.status === 401);

// 4. 一 key 一用：同一个 key 第二次使用 → 400（防重放）
const kk = good();
r = await req('POST', '/auth/login', { body: { email: MAIL, password: 'pass123456', captcha: kk } });
ok('login 正确验证码+正确密码 200', r.status === 200);
r = await req('POST', '/auth/login', { body: { email: MAIL, password: 'pass123456', captcha: kk } });
ok('同一 key 重放 400', r.status === 400 && /已失效/.test(r.data.error || ''), JSON.stringify(r.data));

// 4b. 魔法登录：发码（带验证码）→ login/code 免二次验证（信用）
r = await req('POST', '/auth/send-code', { body: { email: MAIL, purpose: 'login', captcha: good() } });
ok('send-code(login) 带验证码 200', r.status === 200 && r.data.sent === true);
const lc = r.data.devCode || (await latestCode(MAIL, 'login'));
r = await req('POST', '/auth/login/code', { body: { email: MAIL, code: lc } });
ok('login/code 免二次验证（信用）200', r.status === 200 && !!r.data.token, JSON.stringify(r.data));

// 5. 后台登录：缺验证码 → 400；通过 → 错误密码 401
r = await req('POST', '/admin/login', { body: { password: process.env.SB_ADMIN_PASSWORD || '123456' } });
ok('admin login 缺验证码 400', r.status === 400);
r = await req('POST', '/admin/login', { body: { password: 'definitely-wrong', captcha: good() } });
ok('admin login 验证码通过后到密码校验 401', r.status === 401);

// 6. 修改资料：正常修改免验证；10 分钟内第 3 次起要求验证码（风控）
r = await req('PUT', '/auth/profile', { token, body: { name: '改名测试1' } });
ok('profile 第 1 次免验证 200', r.status === 200, JSON.stringify(r.data));
r = await req('PUT', '/auth/profile', { token, body: { name: '改名测试2' } });
ok('profile 第 2 次免验证 200', r.status === 200, JSON.stringify(r.data));
r = await req('PUT', '/auth/profile', { token, body: { name: '改名测试3' } });
ok('profile 第 3 次要求验证 400 CAPTCHA_REQUIRED', r.status === 400 && r.data.code === 'CAPTCHA_REQUIRED', JSON.stringify(r.data));
r = await req('PUT', '/auth/profile', { token, body: { name: '改名测试4', captcha: good() } });
ok('profile 带验证码 200', r.status === 200, JSON.stringify(r.data));
// 窗口内计数含带码那次（t1,t2,t4）→ 第 5 次仍被风控拦
r = await req('PUT', '/auth/profile', { token, body: { name: '改名测试5' } });
ok('profile 风控窗口内再次要求验证 400', r.status === 400 && r.data.code === 'CAPTCHA_REQUIRED', JSON.stringify(r.data));

// 7. 发布文章：缺验证码 → 400；带验证码（空标题穿过后被业务校验拦下）
r = await req('POST', '/articles', { token, body: { title: 't', content: 'c', status: 'draft' } });
ok('文章缺验证码 400', r.status === 400);
r = await req('POST', '/articles', { token, body: { title: '', content: '', status: 'draft', captcha: good() } });
ok('文章验证码穿过后被业务校验拦 400', r.status === 400 && !/行为验证|验证未通过/.test(r.data.error || ''), JSON.stringify(r.data));
// 测试用户可能无发文权限，若 403 也说明穿过了验证码层
r = await req('POST', '/articles', { token, body: { title: '标题', content: '正文', status: 'draft', captcha: good() } });
ok('文章带验证码到达权限/创建层', r.status === 201 || r.status === 403, `status=${r.status}`);

// 8. 上传图片：multipart 里 captcha 校验失败 → 400（不落文件）
{
  mode = 'failure';
  const fd = new FormData();
  fd.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');
  fd.append('captcha', JSON.stringify(good()));
  const res = await fetch(`${BASE}/articles/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const j = await res.json().catch(() => ({}));
  ok('上传图片验证码失败 400', res.status === 400 && /验证未通过/.test(j.error || ''), JSON.stringify(j));

  mode = 'ok';
  const fd2 = new FormData();
  fd2.append('captcha', JSON.stringify(good()));
  const res2 = await fetch(`${BASE}/articles/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd2 });
  const j2 = await res2.json().catch(() => ({}));
  ok('上传图片验证码通过后缺文件 400', res2.status === 400 && /未收到图片文件/.test(j2.error || ''), JSON.stringify(j2));
}

// 9. 验证码服务不可用 → 502 fail-closed
mode = 'down';
r = await req('POST', '/auth/send-code', { body: { email: MAIL, purpose: 'reset', captcha: good() } });
ok('验证码服务不可用 502', r.status === 502 && /暂不可用/.test(r.data.error || ''), JSON.stringify(r.data));
mode = 'ok';

/* ---------- reCAPTCHA v2 勾选框（provider 切换 + siteverify mock） ---------- */
rcSecret = `rc-secret-${Date.now()}`;
r = await req('PUT', '/admin/settings', {
  token: adminToken,
  body: {
    captcha_provider: 'recaptcha',
    recaptcha_site_key: 'rc-site-key-test',
    recaptcha_secret_key: rcSecret,
    recaptcha_verify_api: `http://127.0.0.1:${MOCK_PORT}/recaptcha/siteverify`,
  },
});
ok('切到 reCAPTCHA 200 且生效', r.status === 200 && r.data.captchaEnabled === true, JSON.stringify(r.data));
r = await req('GET', '/site');
ok('/site 暴露 captchaProvider/recaptchaSiteKey', r.data.captchaEnabled === true && r.data.captchaProvider === 'recaptcha' && r.data.recaptchaSiteKey === 'rc-site-key-test', JSON.stringify(r.data));

// provider 校验：非法值 400
r = await req('PUT', '/admin/settings', { token: adminToken, body: { captcha_provider: 'bogus' } });
ok('非法 provider 400', r.status === 400, JSON.stringify(r.data));

mode = 'ok';
// 未携带 token → 400 CAPTCHA_REQUIRED（换 MAIL2 账号：loginLimiter 按 ip:email 计数，避免耗尽 MAIL 桶）
r = await req('POST', '/auth/login', { body: { email: MAIL2, password: 'pass123456' } });
ok('recaptcha login 缺 token 400', r.status === 400 && r.data.code === 'CAPTCHA_REQUIRED', JSON.stringify(r.data));

// 空 token → 400 CAPTCHA_REQUIRED
r = await req('POST', '/auth/login', { body: { email: MAIL2, password: 'pass123456', captcha: { key: '', value: '' } } });
ok('recaptcha 空 token 400', r.status === 400 && r.data.code === 'CAPTCHA_REQUIRED', JSON.stringify(r.data));

// siteverify 拒绝 → 400 CAPTCHA_FAILED
mode = 'failure';
r = await req('POST', '/auth/login', { body: { email: MAIL2, password: 'pass123456', captcha: { key: '', value: 'tok-wrong' } } });
ok('recaptcha 校验失败 400', r.status === 400 && r.data.code === 'CAPTCHA_FAILED', JSON.stringify(r.data));

// 通过 → 穿过验证码层（错误密码 401；mock 已校验 secret 送达正确）
mode = 'ok';
const rcTok = `tok-${Date.now()}`;
r = await req('POST', '/auth/login', { body: { email: MAIL2, password: 'wrong-pass', captcha: { value: rcTok } } });
ok('recaptcha 通过后到密码校验 401', r.status === 401, JSON.stringify(r.data));

// token 一次一用（防重放，mock success 但服务端已消费）
r = await req('POST', '/auth/login', { body: { email: MAIL2, password: 'pass123456', captcha: { value: rcTok } } });
ok('recaptcha 同 token 重放 400', r.status === 400 && /已失效/.test(r.data.error || ''), JSON.stringify(r.data));

// 服务不可用 → 502 fail-closed
mode = 'down';
r = await req('POST', '/auth/login', { body: { email: MAIL2, password: 'pass123456', captcha: { value: `tok-down-${Date.now()}` } } });
ok('recaptcha 服务不可用 502', r.status === 502 && /暂不可用/.test(r.data.error || ''), JSON.stringify(r.data));
mode = 'ok';

/* ---------- 还原 ---------- */
r = await req('PUT', '/admin/settings', {
  token: adminToken,
  body: { ...oldCfg, recaptcha_secret_key: oldRcSecretSet ? '__KEEP__' : '__CLEAR__' },
});
const expectedOn = oldCfg.captcha_enabled === '1' && (oldCfg.captcha_provider === 'recaptcha' ? true : !!oldCfg.captcha_api);
ok('还原配置 200', r.status === 200 && r.data.captchaEnabled === expectedOn);
r = await req('GET', '/site');
ok('还原后 /site 回到原 provider', r.data.captchaProvider === (oldCfg.captcha_provider === 'recaptcha' ? 'recaptcha' : 'gocaptcha') && r.data.captchaEnabled === expectedOn);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
mock.close();
process.exit(fail ? 1 : 0);
