/**
 * 用户系统冒烟测试：node scripts/smoke-auth.mjs
 * 覆盖：注册→登录→/api/me→验证码登录→GitHub 占位→头像上传→资料修改
 */
import { pool } from '../src/db.js';

const B = 'http://localhost:3010/api/auth';
/** 直查 DB 取最新验证码（SMTP 已配置时不返回 devCode，这是唯一稳定取码途径） */
async function latestCode(email) {
  const [rows] = await pool.query('SELECT code FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1', [email]);
  return rows[0]?.code;
}
const MAIL = `tester-${Date.now()}@shimmer.dev`;
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`PASS ${name} ${extra}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name} ${extra}`);
  }
};
const post = (path, payload, token) =>
  fetch(B + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });

let r = await post('/register', { email: MAIL, password: 'pass123456', name: '测试用户' });
let body = await r.json().catch(() => ({}));
ok('register 201', r.status === 201 && body.token && body.user?.email === MAIL, body.user?.name ?? '');
const t1 = body.token;

r = await post('/register', { email: MAIL, password: 'pass123456' });
ok('dup register 409', r.status === 409);

r = await post('/login', { email: MAIL, password: 'pass123456' });
body = await r.json().catch(() => ({}));
ok('login 200', r.status === 200 && !!body.token);

r = await post('/login', { email: MAIL, password: 'wrong-pass' });
ok('wrong password 401', r.status === 401);

r = await fetch(`${B}/me`, { headers: { Authorization: `Bearer ${t1}` } });
body = await r.json().catch(() => ({}));
ok('/api/me', r.status === 200 && body.user?.id > 0, `name=${body.user?.name}`);

r = await post('/send-code', { email: `magic-${Date.now()}@shimmer.dev` });
body = await r.json().catch(() => ({}));
ok('send-code 200', r.status === 200 && (body.via === 'console' || body.via === 'smtp'), `via=${body.via}`);
const magicMail = `magic-${Date.now()}@shimmer.dev`;
r = await post('/send-code', { email: magicMail });
const code = (await r.json().catch(() => ({}))).devCode ?? (await latestCode(magicMail));

r = await post('/login/code', { email: magicMail, code });
body = await r.json().catch(() => ({}));
ok('code login + auto register', r.status === 200 && body.user?.email === magicMail && body.user?.email_verified === true);

r = await post('/login/code', { email: magicMail, code });
ok('code reuse 401', r.status === 401);

r = await fetch(`${B}/github`, { redirect: 'manual' });
const ghText = await r.text();
ok('github 501 placeholder', r.status === 501 && ghText.includes('未配置'), ghText.slice(0, 40));

r = await fetch(`${B}/github/callback?code=abc&state=badstate123`);
ok('github callback bad state 400', r.status === 400);

// 头像上传（1x1 png）
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const fd = new FormData();
fd.append('file', new Blob([png], { type: 'image/png' }), 'a.png');
r = await fetch(`${B}/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${t1}` }, body: fd });
body = await r.json().catch(() => ({}));
ok('avatar upload', r.status === 200 && body.url?.startsWith('/uploads/avatars/'), `${r.status} ${body.error ?? body.url ?? ''}`);
if (body.url) {
  const img = await fetch(`http://localhost:3010${body.url}`);
  ok('avatar served', img.status === 200 && (img.headers.get('content-type') ?? '').includes('image/png'));
}

r = await fetch(`${B}/profile`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t1}` },
  body: JSON.stringify({ name: '改名后的用户' }),
});
body = await r.json().catch(() => ({}));
ok('profile update', r.status === 200 && body.user?.name === '改名后的用户');

// 清理本脚本创建的测试用户（不留终态数据；否则每次回归都会新建同名用户，用户会看到「已删用户又出现」）
await pool.query('DELETE FROM users WHERE email IN (?)', [[MAIL, magicMail]]);

console.log(`\n== ${pass} pass, ${fail} fail ==`);
process.exit(fail ? 1 : 0);
