/**
 * 用户系统冒烟测试：node scripts/smoke-auth.mjs
 * 覆盖：注册→登录→/api/me→验证码登录→GitHub 占位→头像上传→资料修改→第三方头像同步
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

// 注册需邮箱验证（第 45 轮）：先发注册验证码，再带码注册
let r = await post('/send-code', { email: MAIL, purpose: 'register' });
let body = await r.json().catch(() => ({}));
ok('send-code purpose=register 200', r.status === 200 && body.sent === true, `via=${body.via}`);
const regCode = body.devCode ?? (await latestCode(MAIL));

r = await post('/register', { email: MAIL, password: 'pass123456' });
ok('register 无验证码 400', r.status === 400);

r = await post('/register', { email: MAIL, password: 'pass123456', code: String((Number(regCode) + 1) % 1000000).padStart(6, '0') });
ok('register 错误验证码 401', r.status === 401);

r = await post('/register', { email: MAIL, password: 'pass123456', name: '测试用户', code: regCode });
body = await r.json().catch(() => ({}));
ok('register 201', r.status === 201 && body.token && body.user?.email === MAIL, body.user?.name ?? '');
ok('register 后邮箱已验证', body.user?.email_verified === true);
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

r = await fetch(`${B}/google`, { redirect: 'manual' });
const ggText = await r.text();
ok('google 501 placeholder', r.status === 501 && ggText.includes('未配置'), ggText.slice(0, 40));

r = await fetch(`${B}/google/callback?code=abc&state=badstate456`);
ok('google callback bad state 400', r.status === 400);

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

// ---------- 第三方头像同步（POST /auth/avatar/refresh-oauth） ----------
r = await post('/avatar/refresh-oauth', {});
ok('avatar refresh 未登录 401', r.status === 401);

r = await post('/avatar/refresh-oauth', {}, t1);
body = await r.json().catch(() => ({}));
ok('avatar refresh 未绑定第三方 400', r.status === 400 && String(body.error || '').includes('未绑定'), `${r.status} ${body.error ?? ''}`);

// 绑定 GitHub（octocat 公开头像）后手动同步：服务端下载→同规格校验→转存为本站文件
await pool.query('UPDATE users SET github_id = 583231, remote_avatar_url = NULL WHERE email = ?', [MAIL]);
r = await post('/avatar/refresh-oauth', {}, t1);
body = await r.json().catch(() => ({}));
ok('avatar refresh GitHub 200', r.status === 200 && body.url?.startsWith('/uploads/avatars/'), `${r.status} ${body.error ?? body.url ?? ''}`);
ok('avatar refresh 后 user.avatar_url 为本站链接', r.status === 200 && body.user?.avatar_url === body.url);
if (r.status === 200) {
  const [urows] = await pool.query('SELECT avatar_url, remote_avatar_url FROM users WHERE email = ?', [MAIL]);
  ok('avatar refresh 后 remote_avatar_url 已记录', urows[0]?.avatar_url === body.url && String(urows[0]?.remote_avatar_url || '').includes('avatars.githubusercontent.com'));
  const img = await fetch(`http://localhost:3010${body.url}`);
  ok('avatar refresh 文件可访问', img.status === 200 && (img.headers.get('content-type') ?? '').startsWith('image/'));
}

r = await post('/avatar/refresh-oauth', {}, t1);
ok('avatar refresh 限频 429', r.status === 429);

// 仅绑 Google：无 remote_avatar_url → 400；域名不在白名单 → 502（拒绝落盘）
const syncMail = `avsync-${Date.now()}@shimmer.dev`;
r = await post('/send-code', { email: syncMail });
const syncCode = (await r.json().catch(() => ({}))).devCode ?? (await latestCode(syncMail));
r = await post('/login/code', { email: syncMail, code: syncCode });
const t3 = (await r.json().catch(() => ({}))).token;
await pool.query('UPDATE users SET github_id = NULL, google_id = ?, remote_avatar_url = NULL WHERE email = ?', ['mock-google-sub', syncMail]);
r = await post('/avatar/refresh-oauth', {}, t3);
body = await r.json().catch(() => ({}));
ok('avatar refresh Google 无来源 400', r.status === 400 && String(body.error || '').includes('缺少'), `${r.status} ${body.error ?? ''}`);

await pool.query("UPDATE users SET remote_avatar_url = 'https://evil.example/a.png' WHERE email = ?", [syncMail]);
r = await post('/avatar/refresh-oauth', {}, t3);
body = await r.json().catch(() => ({}));
ok('avatar refresh 白名单外域名 502', r.status === 502, `${r.status} ${body.error ?? ''}`);

// provider 参数：显式指定来源；绑定多个第三方时前端让用户选择
r = await post('/avatar/refresh-oauth', { provider: 'bogus' }, t3);
body = await r.json().catch(() => ({}));
ok('avatar refresh provider 非法 400', r.status === 400 && String(body.error || '').includes('provider'), `${r.status} ${body.error ?? ''}`);

r = await post('/avatar/refresh-oauth', { provider: 'github' }, t3);
body = await r.json().catch(() => ({}));
ok('avatar refresh 未绑定指定来源 400', r.status === 400 && String(body.error || '').includes('未绑定 GitHub'), `${r.status} ${body.error ?? ''}`);

// 双绑定用户：provider=google 强制走 Google 分支（remote_avatar_url 邪恶域名 → 502，证明 provider 生效）；
// 不指定 provider 默认走 GitHub（可由 id 构造地址）
const bothMail = `avboth-${Date.now()}@shimmer.dev`;
r = await post('/send-code', { email: bothMail });
const bothCode = (await r.json().catch(() => ({}))).devCode ?? (await latestCode(bothMail));
r = await post('/login/code', { email: bothMail, code: bothCode });
const t4 = (await r.json().catch(() => ({}))).token;
// github_id 唯一：先把 583231 从前面的测试用户释放，再绑给双绑定用户
await pool.query('UPDATE users SET github_id = NULL WHERE email = ?', [MAIL]);
await pool.query("UPDATE users SET github_id = 583231, google_id = 'mock-google-sub-b', remote_avatar_url = 'https://evil.example/a.png', avatar_url = NULL WHERE email = ?", [bothMail]);
r = await post('/avatar/refresh-oauth', { provider: 'google' }, t4);
ok('双绑定 provider=google 强制走 Google 分支 502', r.status === 502, String(r.status));
r = await post('/avatar/refresh-oauth', {}, t4);
body = await r.json().catch(() => ({}));
ok('双绑定不指定 provider 默认 GitHub 200', r.status === 200 && body.provider === 'github' && body.url?.startsWith('/uploads/avatars/'), `${r.status} ${body.error ?? body.url ?? ''}`);

// 来源回填：老用户 remote_avatar_url 为空但现有头像仍是白名单域名外链 → 直接拿来当来源（Google 分支）
await pool.query("UPDATE users SET remote_avatar_url = NULL, avatar_url = 'https://avatars.githubusercontent.com/u/583231?size=460' WHERE email = ?", [syncMail]);
r = await post('/avatar/refresh-oauth', { provider: 'google' }, t3);
body = await r.json().catch(() => ({}));
ok('avatar refresh 来源回填（旧外链 avatar_url）200', r.status === 200 && body.provider === 'google' && body.url?.startsWith('/uploads/avatars/'), `${r.status} ${body.error ?? body.url ?? ''}`);
if (r.status === 200) {
  const [brows] = await pool.query('SELECT remote_avatar_url FROM users WHERE email = ?', [syncMail]);
  ok('回填后 remote_avatar_url 已记录', String(brows[0]?.remote_avatar_url || '').includes('avatars.githubusercontent.com'), String(brows[0]?.remote_avatar_url));
}

// ===== 第 63 轮：修改密码 + 第三方绑定/解绑 =====
const pwMail = `pw-${Date.now()}@shimmer.dev`;
r = await post('/send-code', { email: pwMail, purpose: 'register' });
const pwCode = (await r.json().catch(() => ({}))).devCode ?? (await latestCode(pwMail));
r = await post('/register', { email: pwMail, password: 'pw-old-123', name: '改密用户', code: pwCode });
const pwT = (await r.json().catch(() => ({}))).token;
ok('pw register 201', r.status === 201 && !!pwT);

r = await fetch(`${B}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: 'pw-new-456' }) });
ok('password 未登录 401', r.status === 401);
r = await fetch(`${B}/bind/github`, { headers: { Authorization: `Bearer ${pwT}` } });
ok('bind/github 未配置 501', r.status === 501, String(r.status));
r = await fetch(`${B}/bind/github`);
ok('bind/github 未登录 401', r.status === 401);

// 有密码时：必须验当前密码
r = await fetch(`${B}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pwT}` }, body: JSON.stringify({ newPassword: 'pw-new-456' }) });
body = await r.json().catch(() => ({}));
ok('password 缺当前密码 400', r.status === 400 && body.error === '请输入当前密码', `${r.status} ${body.error ?? ''}`);
r = await fetch(`${B}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pwT}` }, body: JSON.stringify({ currentPassword: 'wrong-cur', newPassword: 'pw-new-456' }) });
body = await r.json().catch(() => ({}));
ok('password 错当前密码 401', r.status === 401 && body.error === '当前密码错误', `${r.status} ${body.error ?? ''}`);
r = await fetch(`${B}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pwT}` }, body: JSON.stringify({ currentPassword: 'pw-old-123', newPassword: 'pw-new-456' }) });
body = await r.json().catch(() => ({}));
ok('password 改密 200', r.status === 200 && body.message === '密码已修改' && body.user?.has_password === true, `${r.status} ${body.error ?? body.message ?? ''}`);
r = await post('/login', { email: pwMail, password: 'pw-new-456' });
ok('新密码登录 200', r.status === 200);

// 无密码用户（OAuth-only）：首设密码免验当前密码
await pool.query('UPDATE users SET password_hash = NULL WHERE email = ?', [pwMail]);
r = await fetch(`${B}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pwT}` }, body: JSON.stringify({ newPassword: 'pw-new-789' }) });
body = await r.json().catch(() => ({}));
ok('password 首设免验当前密码 200', r.status === 200 && body.message === '密码已设置', `${r.status} ${body.error ?? body.message ?? ''}`);

// 解绑：保护规则 + 成功解绑
r = await fetch(`${B}/oauth/github`, { method: 'DELETE', headers: { Authorization: `Bearer ${pwT}` } });
body = await r.json().catch(() => ({}));
ok('oauth 解绑未绑定 400', r.status === 400 && body.error === '尚未绑定该第三方账号', `${r.status} ${body.error ?? ''}`);
r = await fetch(`${B}/oauth/foo`, { method: 'DELETE', headers: { Authorization: `Bearer ${pwT}` } });
ok('oauth 解绑非法 provider 400', r.status === 400);
await pool.query("UPDATE users SET google_id = 'pw-mock-sub', password_hash = NULL WHERE email = ?", [pwMail]);
r = await fetch(`${B}/oauth/google`, { method: 'DELETE', headers: { Authorization: `Bearer ${pwT}` } });
body = await r.json().catch(() => ({}));
ok('oauth 解绑后无登录方式 400', r.status === 400 && String(body.error || '').includes('无法登录'), `${r.status} ${body.error ?? ''}`);
await pool.query("UPDATE users SET password_hash = 'x' WHERE email = ?", [pwMail]);
r = await fetch(`${B}/oauth/google`, { method: 'DELETE', headers: { Authorization: `Bearer ${pwT}` } });
body = await r.json().catch(() => ({}));
ok('oauth 解绑成功 200', r.status === 200 && body.message === '已解绑' && body.user?.google_id === null, `${r.status} ${body.error ?? body.message ?? ''}`);

// 清理本脚本创建的测试用户（不留终态数据；否则每次回归都会新建同名用户，用户会看到「已删用户又出现」）
await pool.query('DELETE FROM users WHERE email IN (?)', [[MAIL, magicMail, syncMail, bothMail, pwMail]]);

console.log(`\n== ${pass} pass, ${fail} fail ==`);
process.exit(fail ? 1 : 0);
