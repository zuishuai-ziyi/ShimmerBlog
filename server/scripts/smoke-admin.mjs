/**
 * task-6 冒烟：站点公开配置 / 后台用户管理 / 后台站点配置 / 个人资料
 * 用法：node scripts/smoke-admin.mjs
 */
import { registerUser } from './_test-lib.mjs';

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
  check('/site 含 title/subtitle/registerOpen/githubEnabled/aboutSubtitle', ['title', 'subtitle', 'registerOpen', 'githubEnabled', 'aboutSubtitle'].every((k) => k in site.data));

  console.log('\n== 后台鉴权 ==');
  const adminLogin = await req('POST', '/admin/login', { body: { password: process.env.SB_ADMIN_PASSWORD || '123456' } });
  check('管理员登录 200', adminLogin.status === 200 && !!adminLogin.data?.token, JSON.stringify(adminLogin.data));
  const adminToken = adminLogin.data?.token;

  // 普通用户
  const email = `smoke${rnd()}@test.local`;
  const reg = await registerUser(BASE, { email, password: 'secret123', name: '冒烟用户' });
  check('新建普通用户 201', reg.status === 201, JSON.stringify(reg.data));
  const userToken = reg.data?.token;
  const userId = reg.data?.user?.id;

  const denied = await req('GET', '/admin/users', { token: userToken });
  check('普通用户访问 /admin/users 401', denied.status === 401, String(denied.status));

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

  const rolePatch = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { role: 'user' } });
  check('已废弃 role 字段 400', rolePatch.status === 400, String(rolePatch.status));

  const disable = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { status: 'disabled' } });
  check('禁用用户 200 且 status=disabled', disable.status === 200 && disable.data?.user?.status === 'disabled', JSON.stringify(disable.data));

  const disabledLogin = await req('POST', '/auth/login', { body: { email, password: 'secret123' } });
  check('被禁用用户登录 403', disabledLogin.status === 403, String(disabledLogin.status));

  const enable = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { status: 'active' } });
  check('启用用户 200', enable.status === 200 && enable.data?.user?.status === 'active');

  const perms = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { permissions: ['post'] } });
  const permArr = typeof perms.data?.user?.permissions === 'string' ? JSON.parse(perms.data.user.permissions) : perms.data?.user?.permissions;
  check('设置用户权限 200', perms.status === 200 && Array.isArray(permArr) && permArr.includes('post'), JSON.stringify(perms.data?.user?.permissions));
  const color = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { name_color: '#2563eb' } });
  check('设置名字颜色 200', color.status === 200 && color.data?.user?.name_color === '#2563eb');

  console.log('\n== 用户扩展操作（第 38 轮） ==');
  const uEmptyName = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { name: '   ' } });
  check('空昵称 400', uEmptyName.status === 400, String(uEmptyName.status));
  const badMail = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { email: 'not-an-email' } });
  check('非法邮箱 400', badMail.status === 400, String(badMail.status));
  const shortPwd = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { password: '123' } });
  check('短密码 400', shortPwd.status === 400, String(shortPwd.status));
  const rename = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { name: '改名' + rnd() } });
  check('改名 200', rename.status === 200 && !!rename.data?.user?.name, JSON.stringify(rename.data));
  const newMail = `moved${rnd()}@test.local`;
  const chMail = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { email: newMail } });
  check('改邮箱 200 且重置验证态', chMail.status === 200 && chMail.data?.user?.email === newMail && chMail.data?.user?.email_verified === 0, JSON.stringify(chMail.data));
  const dupMail = await registerUser(BASE, { email: `other${rnd()}@test.local`, password: 'secret123', name: '占用邮箱' });
  const dupId = dupMail.data?.user?.id;
  const dupRes = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { email: dupMail.data?.user?.email } });
  check('改到已占用邮箱 409', dupRes.status === 409, String(dupRes.status));
  const oldLogin = await req('POST', '/auth/login', { body: { email: email, password: 'secret123' } });
  check('旧邮箱登录 401', oldLogin.status === 401, String(oldLogin.status));
  const newLogin = await req('POST', '/auth/login', { body: { email: newMail, password: 'secret123' } });
  check('新邮箱旧密码登录 200', newLogin.status === 200);
  const rp = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { password: 'newpass456' } });
  check('重置密码 200', rp.status === 200);
  const rpLogin = await req('POST', '/auth/login', { body: { email: newMail, password: 'newpass456' } });
  check('新密码登录 200', rpLogin.status === 200);
  const ghost = await req('DELETE', `/admin/users/99999999`, { token: adminToken });
  check('删除不存在用户 404', ghost.status === 404, String(ghost.status));
  // 删除用户（硬删除：文章级联删除）
  const del = await req('DELETE', `/admin/users/${dupId}`, { token: adminToken });
  check('删除用户 200', del.status === 200 && del.data?.ok === true, JSON.stringify(del.data));
  const delAgain = await req('DELETE', `/admin/users/${dupId}`, { token: adminToken });
  check('删除不存在用户 404', delAgain.status === 404, String(delAgain.status));
  const tSpace = await req('GET', `/space/${dupId}`);
  check('删除后空间 404', tSpace.status === 404, String(tSpace.status));
  const gone = await req('POST', '/auth/login', { body: { email: dupMail.data?.user?.email, password: 'secret123' } });
  check('已删用户登录 401', gone.status === 401, String(gone.status));
  const reReg = await registerUser(BASE, { email: dupMail.data?.user?.email, password: 'secret123', name: '邮箱释放回归' });
  check('释放后的邮箱可重新注册 201', reReg.status === 201, String(reReg.status));
  const freedId = reReg.data?.user?.id;

  const badField = await req('PATCH', `/admin/users/${userId}`, { token: adminToken, body: { status: 'hacked' } });
  check('非法 status 400', badField.status === 400, String(badField.status));

  console.log('\n== 邮件模板（第 36 轮新增） ==');
  const tplSet = await req('GET', '/admin/settings', { token: adminToken });
  const tpls = tplSet.data?.mailTemplates ?? [];
  check('mailTemplates 三类', tpls.length === 3 && ['code', 'welcome', 'test'].every((k) => tpls.some((t) => t.kind === k)), JSON.stringify(tpls.map((t) => t.kind)));

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

  // 关于页副标题（第 43 轮，替代原页脚小字）：自定义；置空回退默认；测后还原原值
  const beforeSub = setObj.about_subtitle ?? '';
  const customSub = `光 · ${rnd()}`;
  await req('PUT', '/admin/settings', { token: adminToken, body: { about_subtitle: customSub } });
  const siteF = await req('GET', '/site');
  check('关于页副标题自定义生效', siteF.data?.aboutSubtitle === customSub, String(siteF.data?.aboutSubtitle));
  await req('PUT', '/admin/settings', { token: adminToken, body: { about_subtitle: '' } });
  const siteFd = await req('GET', '/site');
  check('关于页副标题置空回退默认', siteFd.data?.aboutSubtitle === '一个会发光的角落', String(siteFd.data?.aboutSubtitle));
  await req('PUT', '/admin/settings', { token: adminToken, body: { about_subtitle: beforeSub } });
  check('关于页副标题已还原测试前原值', (await req('GET', '/admin/settings', { token: adminToken })).data?.settings?.about_subtitle === beforeSub);

  console.log('\n== 注册开关 ==');
  const closeReg = await req('PUT', '/admin/settings', { token: adminToken, body: { register_open: false } });
  check('关闭注册 200', closeReg.status === 200);
  const blocked = await req('POST', '/auth/register', { body: { email: `x${rnd()}@test.local`, password: 'secret123' } });
  check('关闭注册后注册 403', blocked.status === 403, String(blocked.status));
  const site3 = await req('GET', '/site');
  check('/site registerOpen=false', site3.data?.registerOpen === false);
  await req('PUT', '/admin/settings', { token: adminToken, body: { register_open: true } });
  const reopened = await registerUser(BASE, { email: `y${rnd()}@test.local`, password: 'secret123' });
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

  // 清理冒烟用户（硬删除）
  for (const id of [userId, dupId, freedId, reopened.data.user.id].filter(Boolean)) {
    await req('DELETE', `/admin/users/${id}`, { token: adminToken });
  }

  console.log(`\n结果：${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error('冒烟脚本异常:', e);
  process.exitCode = 1;
});
