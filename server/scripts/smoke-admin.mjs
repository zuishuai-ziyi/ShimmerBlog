/**
 * task-6 冒烟：站点公开配置 / 后台用户管理 / 后台站点配置 / 个人资料
 * 用法：node scripts/smoke-admin.mjs
 */
const BASE = process.env.SB_BASE || 'http://127.0.0.1:3010/api';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

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

const rnd = () => Math.random().toString(36).slice(2, 8);

async function main() {
  console.log('\n== 站点公开配置 ==');
  const site = await req('GET', '/site');
  check('GET /site 200', site.status === 200, JSON.stringify(site.data));
  check('/site 含 title/subtitle/registerOpen/githubEnabled', ['title', 'subtitle', 'registerOpen', 'githubEnabled'].every((k) => k in site.data));

  console.log('\n== 后台鉴权 ==');
  const adminLogin = await req('POST', '/auth/login', { body: { email: 'admin@shimmerblog.local', password: 'shimmer-admin' } });
  check('管理员登录 200', adminLogin.status === 200, JSON.stringify(adminLogin.data));
  const adminToken = adminLogin.data?.token;

  // 普通用户
  const email = `smoke${rnd()}@test.local`;
  const reg = await req('POST', '/auth/register', { body: { email, password: 'secret123', name: '冒烟用户' } });
  check('新建普通用户 201', reg.status === 201, JSON.stringify(reg.data));
  const userToken = reg.data?.token;
  const userId = reg.data?.user?.id;

  const denied = await req('GET', '/admin/users', { token: userToken });
  check('普通用户访问 /admin/users 403', denied.status === 403, String(denied.status));

  const anon = await req('GET', '/admin/settings');
  check('匿名访问 /admin/settings 401', anon.status === 401, String(anon.status));

  console.log('\n== 用户管理 ==');
  const list = await req('GET', '/admin/users?page=1&pageSize=5', { token: adminToken });
  check('用户列表 200', list.status === 200);
  check('用户列表含 total/stats', typeof list.data?.total === 'number' && !!list.data?.stats, JSON.stringify(list.data?.stats));
  check('用户列表每页 5 条', (list.data?.users?.length ?? 0) <= 5);
  check('列表不含 password_hash', !JSON.stringify(list.data?.users || []).includes('password_hash'));

  const search = await req('GET', `/admin/users?q=smoke${rnd().slice(0, 0)}`, { token: adminToken });
  check('用户搜索接口可用', search.status === 200);

  const selfPatch = await req('PATCH', `/admin/users/${adminLogin.data.user.id}`, { token: adminToken, body: { role: 'user' } });
  check('禁止修改自己 400', selfPatch.status === 400, String(selfPatch.status));

  const disable = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { status: 'disabled' } });
  check('禁用用户 200 且 status=disabled', disable.status === 200 && disable.data?.user?.status === 'disabled', JSON.stringify(disable.data));

  const disabledLogin = await req('POST', '/auth/login', { body: { email, password: 'secret123' } });
  check('被禁用用户登录 403', disabledLogin.status === 403, String(disabledLogin.status));

  const enable = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { status: 'active' } });
  check('启用用户 200', enable.status === 200 && enable.data?.user?.status === 'active');

  const promote = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { role: 'admin' } });
  check('设为管理员 200', promote.status === 200 && promote.data?.user?.role === 'admin');
  const demote = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { role: 'user' } });
  check('取消管理员 200', demote.status === 200 && demote.data?.user?.role === 'user');

  const badField = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { status: 'hacked' } });
  check('非法 status 400', badField.status === 400, String(badField.status));

  console.log('\n== 站点配置 ==');
  const getSet = await req('GET', '/admin/settings', { token: adminToken });
  check('读取配置 200', getSet.status === 200);
  const setObj = getSet.data?.settings || {};
  const before = setObj.site_title;

  // 密钥掩码：写入后只回 __KEEP__，空串不覆盖，__CLEAR__ 才清空
  await req('PUT', '/admin/settings', { token: adminToken, body: { github_client_secret: 'test-secret-abc' } });
  const masked = await req('GET', '/admin/settings', { token: adminToken });
  check('secret 写入后掩码为 __KEEP__', masked.data?.settings?.github_client_secret === '__KEEP__', String(masked.data?.settings?.github_client_secret));
  await req('PUT', '/admin/settings', { token: adminToken, body: { github_client_secret: '' } });
  const keptAfterEmpty = await req('GET', '/admin/settings', { token: adminToken });
  check('空串不覆盖已有 secret', keptAfterEmpty.data?.settings?.github_client_secret === '__KEEP__');
  await req('PUT', '/admin/settings', { token: adminToken, body: { github_client_secret: '__CLEAR__' } });
  const cleared = await req('GET', '/admin/settings', { token: adminToken });
  check('__CLEAR__ 清空 secret', cleared.data?.settings?.github_client_secret === '', String(cleared.data?.settings?.github_client_secret));

  const newTitle = `微光博客·${rnd()}`;
  const put = await req('PUT', '/admin/settings', { token: adminToken, body: { site_title: newTitle, github_client_secret: '__KEEP__' } });
  check('保存配置 200', put.status === 200, JSON.stringify(put.data));

  const site2 = await req('GET', '/site');
  check('公开 /site 立即反映新标题', site2.data?.title === newTitle, String(site2.data?.title));

  console.log('\n== 注册开关 ==');
  const closeReg = await req('PUT', '/admin/settings', { token: adminToken, body: { register_open: false } });
  check('关闭注册 200', closeReg.status === 200);
  const blocked = await req('POST', '/auth/register', { body: { email: `x${rnd()}@test.local`, password: 'secret123' } });
  check('关闭注册后注册 403', blocked.status === 403, String(blocked.status));
  const site3 = await req('GET', '/site');
  check('/site registerOpen=false', site3.data?.registerOpen === false);
  await req('PUT', '/admin/settings', { token: adminToken, body: { register_open: true } });
  const reopened = await req('POST', '/auth/register', { body: { email: `y${rnd()}@test.local`, password: 'secret123' } });
  check('重新开放注册后注册 201', reopened.status === 201, String(reopened.status));

  // 还原标题
  await req('PUT', '/admin/settings', { token: adminToken, body: { site_title: before } });
  const restored = await req('GET', '/site');
  check('标题已还原', restored.data?.title === before, String(restored.data?.title));

  console.log('\n== 个人资料 ==');
  const newName = `改名${rnd()}`;
  const prof = await req('PUT', '/auth/profile', { token: reopened.data.token, body: { name: newName } });
  check('修改昵称 200', prof.status === 200 && prof.data?.user?.name === newName, JSON.stringify(prof.data));

  const emptyName = await req('PUT', '/auth/profile', { token: reopened.data.token, body: { name: '' } });
  check('空昵称 400', emptyName.status === 400, String(emptyName.status));

  // 清理冒烟用户
  const cleanupIds = [userId, reopened.data.user.id];
  for (const id of cleanupIds) {
    await req('PATCH', `/admin/users/${id}`, { token: adminToken, body: { status: 'disabled' } });
  }

  console.log(`\n结果：${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error('冒烟脚本异常:', e);
  process.exitCode = 1;
});
