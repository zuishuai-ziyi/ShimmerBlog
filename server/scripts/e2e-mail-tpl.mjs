/* E2E：邮件模板全量自定义（第 36 轮） */
import { registerUser } from './_test-lib.mjs';

const BASE = 'http://127.0.0.1:3010';
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const j = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
};

console.log('== 1) 后台登录 ==');
const login = await j('POST', '/api/admin/login', { password: process.env.SB_ADMIN_PASSWORD || '123456' });
ok(login.status === 200 && login.data.token, 'admin login', `status=${login.status}`);
const tk = login.data.token;

console.log('== 2) GET /admin/settings 返回 3 类模板元数据 ==');
const s1 = await j('GET', '/api/admin/settings', undefined, tk);
const tpls = s1.data?.mailTemplates ?? [];
ok(s1.status === 200, 'GET settings 200');
ok(tpls.length === 3, 'mailTemplates=3', JSON.stringify(tpls.map(t => t.kind)));
const kinds = Object.fromEntries(tpls.map(t => [t.kind, t]));
ok(kinds.code?.placeholders?.join(',') === '{code},{site}', 'code placeholders', JSON.stringify(kinds.code?.placeholders));
ok(kinds.welcome?.placeholders?.join(',') === '{name},{site}', 'welcome placeholders', JSON.stringify(kinds.welcome?.placeholders));
ok(kinds.test?.subjectKey === 'mail_test_subject' && kinds.welcome?.bodyKey === 'mail_welcome_body', 'keys 映射正确');
ok(!!kinds.welcome?.defaultSubject && !!kinds.test?.defaultBody, '内置默认值已下发');

console.log('== 3) PUT 自定义 欢迎邮件 + 测试邮件 模板 ==');
// 备份测试前模板原值（含验证码模板），测完还原——此前每跑一次本脚本都会把用户自定义模板置空（丢失事故根因）。
const TPL_KEYS = ['mail_code_subject', 'mail_code_body', 'mail_welcome_subject', 'mail_welcome_body', 'mail_test_subject', 'mail_test_body'];
const tplBackup = Object.fromEntries(TPL_KEYS.map((k) => [k, s1.data.settings[k] ?? '']));
const put1 = await j('PUT', '/api/admin/settings', {
  mail_welcome_subject: '欢迎加入 {site}！',
  mail_welcome_body: '嗨 {name}，这是自定义欢迎语。',
  mail_test_subject: '自定义测试：{site}',
  mail_test_body: '自定义正文 {site}',
}, tk);
ok(put1.status === 200 && put1.data.ok, 'PUT 模板 200', `updated=${put1.data?.updated}`);

console.log('== 4) GET 回读持久化 ==');
const s2 = await j('GET', '/api/admin/settings', undefined, tk);
ok(s2.data.settings.mail_welcome_subject === '欢迎加入 {site}！', 'welcome subject 持久化', JSON.stringify(s2.data.settings.mail_welcome_subject));
ok(s2.data.settings.mail_welcome_body === '嗨 {name}，这是自定义欢迎语。', 'welcome body 持久化');
ok(s2.data.settings.mail_test_subject === '自定义测试：{site}', 'test subject 持久化');

console.log('== 5) 渲染检查（经 mailTemplate 读库） ==');
const { execSync } = await import('node:child_process');
const out = execSync('node scripts/tpl-check.mjs', { encoding: 'utf8' });
ok(out.includes('欢迎加入 微光博客！') && out.includes('嗨 小光，这是自定义欢迎语。'), 'welcome 渲染含自定义+变量');
ok(out.includes('自定义测试：微光博客'), 'test 渲染含自定义');

console.log('== 6) SMTP 未配置时 测试邮件 友好报错 ==');
// 环境自适应：若库里已配置 SMTP，先暂存并「只清非密字段」再测，测完还原。
// 注意绝不动 smtp_pass（密钥空串=__KEEP__ 语义；此前误清过一次，靠 binlog 才找回）。
{
  const cur = await j('GET', '/api/admin/settings', undefined, tk);
  const saved = cur.data?.settings ?? {};
  const plainKeys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_from'];
  const backup = Object.fromEntries(plainKeys.map((k) => [k, saved[k] ?? '']).filter(([, v]) => v !== ''));
  if (backup.smtp_host) {
    await j('PUT', '/api/admin/settings', Object.fromEntries(plainKeys.map((k) => [k, ''])), tk);
  }
  const mt = await j('POST', '/api/admin/mail/test', { to: 't@test.local' }, tk);
  ok(mt.status === 400 && /SMTP 未配置/.test(mt.data.error), 'mail/test 400 友好提示', JSON.stringify(mt.data));
  if (Object.keys(backup).length) await j('PUT', '/api/admin/settings', backup, tk);
}

console.log('== 7) 新用户注册（触发欢迎邮件路径，不阻塞注册） ==');
const email = `e2e-welcome-${Date.now()}@test.local`;
// 注册需邮箱验证（第 45 轮）：先取注册验证码再带码注册
const regRes = await registerUser(`${BASE}/api`, { email, password: 'test123456', name: '欢迎邮件测试' });
const reg = { status: regRes.status, data: regRes.data };
ok(reg.status === 201 && reg.data.user?.name === '欢迎邮件测试', 'register 201', `status=${reg.status}`);

console.log('== 8) 置空回退默认，再还原运行前原值 ==');
const put2 = await j('PUT', '/api/admin/settings', {
  mail_welcome_subject: '', mail_welcome_body: '', mail_test_subject: '', mail_test_body: '',
}, tk);
ok(put2.status === 200, '置空 200');
const s3 = await j('GET', '/api/admin/settings', undefined, tk);
ok(s3.data.settings.mail_welcome_subject === '' && s3.data.settings.mail_test_body === '', '已回空值（回退内置默认）');

// 还原为测试前的原值：不再把用户自定义模板留在空态。
const put3 = await j('PUT', '/api/admin/settings', tplBackup, tk);
ok(put3.status === 200, '还原原值 200');
const s4 = await j('GET', '/api/admin/settings', undefined, tk);
ok(TPL_KEYS.every((k) => (s4.data.settings[k] ?? '') === tplBackup[k]), '模板键已还原为测试前原值',
  JSON.stringify(Object.fromEntries(TPL_KEYS.map((k) => [k, s4.data.settings[k] ?? '']))));

// 清理本脚本注册的测试用户（不留终态数据；否则每次回归都会新建同名用户，用户会看到「已删用户又出现」）
if (reg.data?.user?.id) {
  const del = await j('DELETE', `/api/admin/users/${reg.data.user.id}`, undefined, tk);
  ok(del.status === 200, '清理 e2e 测试用户', `status=${del.status}`);
}

console.log(`\n结果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
