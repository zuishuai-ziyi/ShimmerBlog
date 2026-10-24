/* task-3 冒烟：文章 CRUD / 权限 / 分页 / 置顶 / 图片上传 */
const BASE = 'http://localhost:3010/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
import { registerUser } from './_test-lib.mjs';

const j = (r) => r.json();

async function register(name) {
  const email = `${name}_${Date.now()}@test.local`;
  // 注册需邮箱验证（第 45 轮）：registerUser 内部先发码再带码注册
  const r = await registerUser(BASE, { email, password: 'password123', name });
  return r.data?.token;
}
const auth = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

// 1. 注册两个用户 + 管理员登录
const tA = await register('writerA');
const tB = await register('writerB');
ok('register A+B', !!tA && !!tB);
const rAdmin = await fetch(`${BASE}/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: process.env.SB_ADMIN_PASSWORD || '123456' }),
});
const tAdmin = (await j(rAdmin)).token;
ok('admin login', !!tAdmin);

// 2. A 建草稿 → 不在公开列表、无凭证取详情 403
let r = await fetch(`${BASE}/articles`, { method: 'POST', headers: auth(tA), body: JSON.stringify({ title: 'A 的草稿', content: '# 草稿\n正文', summary: 'draft' }) });
const draft = (await j(r)).article;
ok('create draft 201', r.status === 201 && draft.status === 'draft' && !draft.published_at);
r = await fetch(`${BASE}/articles?page=1&pageSize=50`);
let list = (await j(r)).items;
ok('draft not in public list', !list.some((a) => a.id === draft.id));
r = await fetch(`${BASE}/articles/${draft.id}`);
ok('draft detail anon 403', r.status === 403);

// 3. A 发布 → 列表可见、详情可得
r = await fetch(`${BASE}/articles/${draft.id}`, { method: 'PUT', headers: auth(tA), body: JSON.stringify({ title: 'A 的第一篇', content: '# 正文', summary: 'pub', status: 'published' }) });
const pub = (await j(r)).article;
ok('publish via PUT', r.status === 200 && pub.status === 'published' && !!pub.published_at);
r = await fetch(`${BASE}/articles?page=1&pageSize=50`);
list = (await j(r)).items;
ok('published in list w/ author', list.some((a) => a.id === pub.id && a.author_name === 'writerA'));
r = await fetch(`${BASE}/articles/${pub.id}`);
ok('published detail anon 200', r.status === 200 && (await j(r)).article.content.includes('正文'));

// 4. B 再发一篇 → 分页与新上旧下
r = await fetch(`${BASE}/articles`, { method: 'POST', headers: auth(tB), body: JSON.stringify({ title: 'B 的文章', content: 'B', status: 'published' }) });
const pubB = (await j(r)).article;
await new Promise((s) => setTimeout(s, 1100)); // 保证 published_at 有先后
r = await fetch(`${BASE}/articles`, { method: 'POST', headers: auth(tA), body: JSON.stringify({ title: 'A 的第二篇', content: 'A2', status: 'published' }) });
const pubA2 = (await j(r)).article;
r = await fetch(`${BASE}/articles?page=1&pageSize=2`);
const pg = await j(r);
ok('pagination total>=3 page=2items', pg.total >= 3 && pg.items.length === 2, `total=${pg.total}`);
ok('newest first', pg.items[0].id === pubA2.id, `first=${pg.items[0].id} expect=${pubA2.id}`);

// 5. 越权：B 改/删 A 的文章 → 403
r = await fetch(`${BASE}/articles/${pub.id}`, { method: 'PUT', headers: auth(tB), body: JSON.stringify({ title: 'hack', content: 'x' }) });
ok('B edit A 403', r.status === 403);
r = await fetch(`${BASE}/articles/${pub.id}`, { method: 'DELETE', headers: auth(tB) });
ok('B delete A 403', r.status === 403);

// 6. 管理后台：管理员 token 不能走用户文章接口；置顶走 /admin/articles
r = await fetch(`${BASE}/articles/${pub.id}`, { method: 'PUT', headers: auth(tAdmin), body: JSON.stringify({ title: 'x', content: 'x' }) });
ok('admin token 在用户文章接口 401', r.status === 401);
r = await fetch(`${BASE}/admin/articles/${pub.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tAdmin}` }, body: JSON.stringify({ pinned: true }) });
ok('admin pin 200', r.status === 200 && (await j(r)).pinned === 1, JSON.stringify(r.status));
r = await fetch(`${BASE}/articles?page=1&pageSize=2`);
list = (await j(r)).items;
ok('pinned first in list', list[0].id === pub.id, `first=${list[0].id}`);

// 7. 图片上传（multipart）→ 静态可访问
const fd = new FormData();
fd.append('file', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 't.png');
r = await fetch(`${BASE}/articles/upload-image`, { method: 'POST', headers: { Authorization: `Bearer ${tA}` }, body: fd });
const up = await j(r);
ok('upload image 200 w/ url', r.status === 200 && /^\/uploads\/images\/.+\.png$/.test(up.url ?? ''), JSON.stringify(up));
if (up.url) {
  const img = await fetch(`http://localhost:3010${up.url}`);
  ok('image served', img.status === 200 && (await img.arrayBuffer()).byteLength === 8);
}

// 8. 作者删除自己的文章 → 列表减少
r = await fetch(`${BASE}/articles/${pubA2.id}`, { method: 'DELETE', headers: auth(tA) });
ok('author delete own 200', r.status === 200);
r = await fetch(`${BASE}/articles/${pubA2.id}`);
ok('deleted detail 404', r.status === 404);

// 9. 管理员置顶后取消（走 /admin/articles）
r = await fetch(`${BASE}/admin/articles/${pub.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tAdmin}` }, body: JSON.stringify({ pinned: false }) });
ok('admin unpin', r.status === 200 && (await j(r)).pinned === 0);

// 前端控制台传的是数字 0/1，必须同样生效（曾因只认 boolean false 导致取消置顶无效）
r = await fetch(`${BASE}/admin/articles/${pub.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tAdmin}` }, body: JSON.stringify({ pinned: 1 }) });
ok('admin pin numeric 1', r.status === 200 && (await j(r)).pinned === 1);
r = await fetch(`${BASE}/admin/articles/${pub.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tAdmin}` }, body: JSON.stringify({ pinned: 0 }) });
ok('admin unpin numeric 0', r.status === 200 && (await j(r)).pinned === 0);

// 清理测试用户（文章随外键级联删除；不留终态数据，否则每次回归都新建同名用户）
for (const t of [tA, tB]) {
  const me = await fetch(`${BASE}/auth/me`, { headers: auth(t) }).then(j);
  if (me?.user?.id) {
    const del = await fetch(`${BASE}/admin/users/${me.user.id}`, { method: 'DELETE', headers: auth(tAdmin) });
    ok(del.status === 200, `cleanup ${me.user.name}`);
  }
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
