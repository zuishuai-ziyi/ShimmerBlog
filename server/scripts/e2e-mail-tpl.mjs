/* E2E：邮件模板全量自定义（第 36 轮） */
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
const login = await j('POST', '/api/admin/login', { password: 'shimmer-admin' });
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
const reg = await j('POST', '/api/auth/register', { email, password: 'test123456', name: '欢迎邮件测试' });
ok(reg.status === 201 && reg.data.user?.name === '欢迎邮件测试', 'register 201', `status=${reg.status}`);

console.log('== 8) 恢复默认（置空） ==');
const put2 = await j('PUT', '/api/admin/settings', {
  mail_welcome_subject: '', mail_welcome_body: '', mail_test_subject: '', mail_test_body: '',
}, tk);
ok(put2.status === 200, '恢复默认 200');
const s3 = await j('GET', '/api/admin/settings', undefined, tk);
ok(s3.data.settings.mail_welcome_subject === '' && s3.data.settings.mail_test_body === '', '已回空值（回退内置默认）');

console.log(`\n结果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
