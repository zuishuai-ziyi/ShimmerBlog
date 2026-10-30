/**
 * GoCaptcha 行为验证码冒烟测试：node scripts/smoke-captcha.mjs
 * 本地起一个 mock go-captcha-service（127.0.0.1:9797，只实现 check-data），
 * 开启 captcha_enabled 后验证：/site 公开字段、各保护端点缺参 400 / 校验失败 400 /
 * 校验通过放行、一 key 一用（防重放）、验证码服务不可用 502（fail-closed），最后还原配置。
 */
import http from 'node:http';
import { registerUser, latestCode } from './_test-lib.mjs';

const BASE = process.env.SB_BASE || 'http://127.0.0.1:3010/api';
const MOCK_PORT = Number(process.env.SB_CAPTCHA_MOCK_PORT || 9797);

/* ---------- mock go-captcha-service ---------- */
// mode: 'ok'（校验通过）| 'failure'（校验不通过）| 'down'（连接直接断开，模拟服务不可用）
let mode = 'ok';
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
const good = () => ({ key: `k-${++keySeq}`, value: '10,20,30,40' });

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
  captcha_api: cur.data.settings.captcha_api ?? '',
  captcha_verify_api: cur.data.settings.captcha_verify_api ?? '',
  captcha_id: cur.data.settings.captcha_id ?? 'click-default-ch',
};
let r = await req('PUT', '/admin/settings', {
  token: adminToken,
  body: { captcha_enabled: '1', captcha_api: `http://127.0.0.1:${MOCK_PORT}`, captcha_id: 'click-default-ch' },
});
ok('开启验证码 200', r.status === 200 && r.data.captchaEnabled === true);

r = await req('GET', '/site');
ok('/site 暴露 captchaEnabled/captchaApi/captchaId', r.data.captchaEnabled === true && r.data.captchaApi === `http://127.0.0.1:${MOCK_PORT}` && r.data.captchaId === 'click-default-ch');

/* ---------- 注册一个测试用户（发码/注册本身也要过验证码） ---------- */
mode = 'ok';
const MAIL = `cap-${Date.now()}@shimmer.dev`;
r = await req('POST', '/auth/send-code', { body: { email: MAIL, purpose: 'register', captcha: good() } });
ok('send-code 带正确验证码 200', r.status === 200 && r.data.sent === true);

const reg = await registerUser(BASE, { email: MAIL, password: 'pass123456', name: '验证码测试' });
// registerUser 内部不带 captcha —— 会 400；改为手动带码注册
let token = '';
if (reg.status === 201) token = reg.data.token;
else {
  // 预期路径：registerUser 已把验证码发了但注册被 captcha 拦下，这里补发码+带 captcha 注册
  const send = await req('POST', '/auth/send-code', { body: { email: MAIL, purpose: 'register', captcha: good() } });
  const code = send.data.devCode || (await latestCode(MAIL, 'register'));
  const rr = await req('POST', '/auth/register', { body: { email: MAIL, password: 'pass123456', name: '验证码测试', code, captcha: good() } });
  ok('register 带验证码 201', rr.status === 201, JSON.stringify(rr.data));
  token = rr.data.token || '';
}
ok('测试用户 token 就绪', !!token);

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

// 5. 后台登录：缺验证码 → 400；通过 → 错误密码 401
r = await req('POST', '/admin/login', { body: { password: process.env.SB_ADMIN_PASSWORD || '123456' } });
ok('admin login 缺验证码 400', r.status === 400);
r = await req('POST', '/admin/login', { body: { password: 'definitely-wrong', captcha: good() } });
ok('admin login 验证码通过后到密码校验 401', r.status === 401);

// 6. 修改资料：缺验证码 → 400；带正确验证码 → 200
r = await req('PUT', '/auth/profile', { token, body: { name: '改名测试' } });
ok('profile 缺验证码 400', r.status === 400);
r = await req('PUT', '/auth/profile', { token, body: { name: '改名测试', bio: 'bio', captcha: good() } });
ok('profile 带验证码 200', r.status === 200, JSON.stringify(r.data));

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

/* ---------- 还原 ---------- */
r = await req('PUT', '/admin/settings', { token: adminToken, body: oldCfg });
ok('还原配置 200', r.status === 200 && r.data.captchaEnabled === (oldCfg.captcha_enabled === '1' && !!oldCfg.captcha_api));
r = await req('GET', '/site');
ok('还原后 /site captchaEnabled=false', r.data.captchaEnabled === false);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
mock.close();
process.exit(fail ? 1 : 0);
