<template>
  <div class="admin">
    <!-- ======== 登录门 ======== -->
    <div v-if="!admin.authed" class="gate">
      <div class="gate-card">
        <h1>ShimmerBlog 管理后台</h1>
        <p class="gate-sub">请输入管理密码进入</p>
        <form @submit.prevent="doLogin">
          <input
            v-model="password"
            type="password"
            placeholder="管理密码"
            autocomplete="current-password"
          />
          <button type="submit" :disabled="busy">{{ busy ? '验证中…' : '进入后台' }}</button>
        </form>
        <p v-if="gateError" class="gate-err">{{ gateError }}</p>
        <p class="gate-hint">管理密码与用户账号无关，仅用于本后台。</p>
      </div>
    </div>

    <!-- ======== 后台主体 ======== -->
    <div v-else class="shell">
      <aside class="side">
        <div class="side-brand">ShimmerBlog<br /><span>管理后台</span></div>
        <nav>
          <button :class="{ on: tab === 'site' }" @click="tab = 'site'">站点</button>
          <button :class="{ on: tab === 'mail' }" @click="tab = 'mail'">邮件</button>
          <button :class="{ on: tab === 'users' }" @click="tab = 'users'">用户</button>
          <button :class="{ on: tab === 'articles' }" @click="tab = 'articles'">文章</button>
        </nav>
        <div class="side-foot">
          <button class="ghost" @click="changePwd">改管理密码</button>
          <button class="ghost danger" @click="logout">退出</button>
        </div>
      </aside>

      <main class="main">
        <!-- ============ 站点 ============ -->
        <section v-if="tab === 'site'" class="pane">
          <h2>站点信息</h2>
          <label class="row"><span>主标题</span><input v-model.trim="siteForm.site_title" /></label>
          <label class="row"><span>副标题</span><input v-model.trim="siteForm.site_subtitle" /></label>
          <label class="row"><span>站点描述</span><input v-model="siteForm.site_description" /></label>

          <h2>站点 Logo</h2>
          <div class="logo-box">
            <img v-if="logoUrl" :src="logoUrl" alt="logo" class="logo-preview" />
            <span v-else class="logo-empty">未设置（使用默认 logo.png）</span>
            <div class="logo-ops">
              <label class="file-btn">
                上传新 Logo
                <input type="file" accept="image/*" hidden @change="uploadLogo" />
              </label>
              <button v-if="logoUrl" class="ghost danger" @click="removeLogo">恢复默认</button>
            </div>
          </div>

          <h2>关于页面内容（HTML）</h2>
          <p class="hint">留空则显示内置介绍。仅允许文本、链接、图片、标题、列表等安全标签。</p>
          <textarea v-model="siteForm.about_html" class="ta mono" rows="10" spellcheck="false" />

          <div class="ops">
            <button class="primary" :disabled="saving" @click="saveSettings(['site_title', 'site_subtitle', 'site_description', 'about_html'])">
              {{ saving ? '保存中…' : '保存站点设置' }}
            </button>
            <span v-if="flash" class="flash">{{ flash }}</span>
          </div>
        </section>

        <!-- ============ 邮件 ============ -->
        <section v-if="tab === 'mail'" class="pane">
          <h2>验证码邮件模板</h2>
          <label class="row"><span>邮件主题</span><input v-model.trim="mailForm.mail_code_subject" /></label>
          <label class="body-row"><span>邮件正文</span>
            <textarea v-model="mailForm.mail_code_body" class="ta mono" rows="6" spellcheck="false" />
          </label>
          <p class="hint">正文中使用 <code>{code}</code> 占位符，发送时替换为 6 位验证码。</p>

          <h2>SMTP 发信配置</h2>
          <p class="hint" :class="{ ok: smtpEnabled }">{{ smtpEnabled ? '● 已配置' : '○ 未配置（将无法发送验证码邮件）' }}</p>
          <div class="grid">
            <label class="row"><span>SMTP 主机</span><input v-model.trim="mailForm.smtp_host" placeholder="smtp.example.com" /></label>
            <label class="row"><span>端口</span><input v-model.trim="mailForm.smtp_port" placeholder="465" /></label>
            <label class="row"><span>发件人</span><input v-model.trim="mailForm.smtp_from" placeholder="ShimmerBlog &lt;no-reply@example.com&gt;" /></label>
            <label class="row"><span>账号</span><input v-model.trim="mailForm.smtp_user" /></label>
            <label class="row"><span>密码/授权码</span><input v-model="mailForm.smtp_pass" type="password" :placeholder="smtpPassSet ? '已配置，留空保持不变' : '未配置'" /></label>
            <label class="row check"><input type="checkbox" v-model="smtpSecureBool" /><span>SSL/TLS（465 端口通常勾选）</span></label>
          </div>

          <h2>发送测试邮件</h2>
          <div class="row send-row">
            <input v-model.trim="testTo" placeholder="接收邮箱" />
            <button class="ghost" :disabled="testing" @click="sendTest">{{ testing ? '发送中…' : '发送' }}</button>
          </div>
          <p v-if="testResult" class="hint" :class="{ ok: testOk }">{{ testResult }}</p>

          <div class="ops">
            <button class="primary" :disabled="saving" @click="saveSettings(['mail_code_subject', 'mail_code_body', 'smtp_host', 'smtp_port', 'smtp_from', 'smtp_user', 'smtp_pass', 'smtp_secure'])">
              {{ saving ? '保存中…' : '保存邮件设置' }}
            </button>
            <span v-if="flash" class="flash">{{ flash }}</span>
          </div>
        </section>

        <!-- ============ 用户 ============ -->
        <section v-if="tab === 'users'" class="pane">
          <div class="list-head">
            <h2>用户管理 <small>{{ userTotal }} 人</small></h2>
            <input v-model.trim="userQuery" class="search" placeholder="搜索邮箱 / 昵称…" @input="searchUsers" />
          </div>
          <table class="tbl">
            <thead>
              <tr><th>ID</th><th>用户</th><th>名称颜色</th><th>权限</th><th>状态</th><th>注册时间</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td class="dim">{{ u.id }}</td>
                <td>
                  <div class="cell-user">
                    <img :src="u.avatar_url || defaultAvatar" class="mini-avatar" alt="" />
                    <div>
                      <div class="u-name" :style="u.name_color ? { color: u.name_color } : undefined">{{ u.name }}</div>
                      <div class="dim">{{ u.email }}<template v-if="u.github_id"> · GitHub</template></div>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="color-cell">
                    <input type="color" :value="toHex6(u.name_color)" @input="setColor(u, $event)" />
                    <code class="dim">{{ u.name_color || '默认' }}</code>
                  </div>
                </td>
                <td>
                  <label class="perm"><input type="checkbox" :checked="hasPerm(u, 'post')" @change="setPerm(u, 'post', $event)" />发布文章</label>
                </td>
                <td>
                  <button class="pill" :class="u.status" @click="toggleStatus(u)">
                    {{ u.status === 'active' ? '正常' : '已禁用' }}
                  </button>
                </td>
                <td class="dim">{{ fmtDate(u.created_at) }}</td>
                <td>
                  <a class="ghost sm" :href="`/space/${u.id}`" target="_blank">空间</a>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!users.length" class="hint">没有匹配的用户。</p>
        </section>

        <!-- ============ 文章 ============ -->
        <section v-if="tab === 'articles'" class="pane">
          <div class="list-head">
            <h2>文章管理 <small>{{ articleTotal }} 篇（含草稿）</small></h2>
            <input v-model.trim="articleQuery" class="search" placeholder="搜索标题…" @input="searchArticles" />
          </div>
          <table class="tbl">
            <thead>
              <tr><th>ID</th><th>标题</th><th>作者</th><th>状态</th><th>置顶</th><th>更新时间</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="a in articles" :key="a.id">
                <td class="dim">{{ a.id }}</td>
                <td class="title-cell"><a :href="`/article/${a.id}`" target="_blank">{{ a.title }}</a></td>
                <td>
                  <span :style="a.author_name_color ? { color: a.author_name_color } : undefined">{{ a.author_name }}</span>
                  <small v-if="a.status === 'draft'" class="dim"> · 草稿</small>
                </td>
                <td><span class="pill" :class="a.status">{{ a.status === 'published' ? '已发布' : '草稿' }}</span></td>
                <td>
                  <button class="pill" :class="{ pinned: !!a.pinned }" @click="togglePin(a)">
                    {{ a.pinned ? '已置顶' : '未置顶' }}
                  </button>
                </td>
                <td class="dim">{{ fmtDate(a.updated_at) }}</td>
                <td><button class="ghost sm danger" @click="deleteArticle(a)">删除</button></td>
              </tr>
            </tbody>
          </table>
          <p v-if="!articles.length" class="hint">没有匹配的文章。</p>
        </section>
      </main>
    </div>

    <!-- 改管理密码弹层 -->
    <div v-if="pwdOpen" class="modal-mask" @click.self="pwdOpen = false">
      <div class="modal">
        <h3>修改管理密码</h3>
        <input v-model="newPwd" type="password" placeholder="新密码（至少 6 位）" />
        <div class="modal-ops">
          <button class="ghost" @click="pwdOpen = false">取消</button>
          <button class="primary" :disabled="saving" @click="savePwd">保存</button>
        </div>
        <p v-if="pwdMsg" class="hint" :class="{ ok: pwdOk }">{{ pwdMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import adminHttp, { errMsg } from '../api/adminHttp';
import { useAdminStore } from '../stores/admin';
import defaultAvatar from '../assets/default-avatar.svg';

const admin = useAdminStore();

type Tab = 'site' | 'mail' | 'users' | 'articles';
const tab = ref<Tab>('site');

/* ---- 登录门 ---- */
const password = ref('');
const busy = ref(false);
const gateError = ref('');

async function doLogin() {
  if (!password.value) return;
  busy.value = true;
  gateError.value = '';
  try {
    await admin.login(password.value);
    password.value = '';
    await bootstrap();
    await Promise.all([loadUsers(), loadArticles()]);
  } catch (e) {
    gateError.value = errMsg(e);
  } finally {
    busy.value = false;
  }
}

function logout() {
  admin.logout();
}

/* ---- 管理密码 ---- */
const pwdOpen = ref(false);
const newPwd = ref('');
const pwdMsg = ref('');
const pwdOk = ref(false);

function changePwd() {
  newPwd.value = '';
  pwdMsg.value = '';
  pwdOpen.value = true;
}

async function savePwd() {
  pwdMsg.value = '';
  try {
    await adminHttp.put('/admin/password', { password: newPwd.value });
    pwdOk.value = true;
    pwdMsg.value = '已更新，下次登录使用新密码。';
  } catch (e) {
    pwdOk.value = false;
    pwdMsg.value = errMsg(e);
  }
}

/* ---- 通用保存 ---- */
const saving = ref(false);
const flash = ref('');
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function showFlash(msg: string) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ''), 2600);
}

const siteForm = reactive({ site_title: '', site_subtitle: '', site_description: '', about_html: '' });
const mailForm = reactive({
  mail_code_subject: '',
  mail_code_body: '',
  smtp_host: '',
  smtp_port: '',
  smtp_from: '',
  smtp_user: '',
  smtp_pass: '',
  smtp_secure: '',
});
const smtpSecureBool = ref(false);
const smtpEnabled = ref(false);
const smtpPassSet = ref(false);
const logoUrl = ref('');

async function bootstrap() {
  const { data } = await adminHttp.get('/admin/settings');
  Object.assign(siteForm, {
    site_title: data.settings.site_title ?? '',
    site_subtitle: data.settings.site_subtitle ?? '',
    site_description: data.settings.site_description ?? '',
    about_html: data.settings.about_html ?? '',
  });
  Object.assign(mailForm, {
    mail_code_subject: data.settings.mail_code_subject ?? '',
    mail_code_body: data.settings.mail_code_body ?? '',
    smtp_host: data.settings.smtp_host ?? '',
    smtp_port: data.settings.smtp_port ?? '',
    smtp_from: data.settings.smtp_from ?? '',
    smtp_user: data.settings.smtp_user ?? '',
    smtp_pass: data.settings.smtp_pass ?? '',
    smtp_secure: data.settings.smtp_secure ?? '',
  });
  smtpSecureBool.value = mailForm.smtp_secure === '1';
  smtpEnabled.value = !!data.smtpEnabled;
  smtpPassSet.value = data.settings.smtp_pass === '__KEEP__';
  logoUrl.value = data.settings.site_logo_url ?? '';
}

async function saveSettings(keys: string[]) {
  saving.value = true;
  try {
    const body: Record<string, unknown> = {};
    for (const k of keys) body[k] = (siteForm as Record<string, unknown>)[k] ?? (mailForm as Record<string, unknown>)[k];
    body.smtp_secure = smtpSecureBool.value;
    const { data } = await adminHttp.put('/admin/settings', body);
    smtpEnabled.value = !!data.smtpEnabled;
    if (logoUrl.value && keys.includes('site_title')) await refreshSite();
    showFlash('✓ 已保存');
  } catch (e) {
    showFlash('保存失败：' + errMsg(e));
  } finally {
    saving.value = false;
  }
}

async function refreshSite() {
  await fetch('/api/site', { cache: 'no-store' }).catch(() => undefined);
}

async function uploadLogo(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await adminHttp.post('/admin/logo', fd);
    logoUrl.value = data.url;
    await refreshSite();
    showFlash('✓ Logo 已更新');
  } catch (err) {
    showFlash('上传失败：' + errMsg(err));
  }
  input.value = '';
}

async function removeLogo() {
  try {
    await adminHttp.delete('/admin/logo');
    logoUrl.value = '';
    await refreshSite();
    showFlash('✓ 已恢复默认 Logo');
  } catch (err) {
    showFlash('操作失败：' + errMsg(err));
  }
}

const testTo = ref('');
const testing = ref(false);
const testResult = ref('');
const testOk = ref(false);

async function sendTest() {
  testing.value = true;
  testResult.value = '';
  try {
    await adminHttp.post('/admin/mail/test', { to: testTo.value });
    testOk.value = true;
    testResult.value = '✓ 测试邮件已发送，请查收';
  } catch (e) {
    testOk.value = false;
    testResult.value = errMsg(e);
  } finally {
    testing.value = false;
  }
}

/* ---- 用户管理 ---- */
interface AdminUser {
  id: number;
  email: string | null;
  name: string;
  name_color: string | null;
  avatar_url: string | null;
  permissions: string[] | null;
  status: 'active' | 'disabled';
  github_id: number | null;
  created_at: string;
}

const users = ref<AdminUser[]>([]);
const userTotal = ref(0);
const userQuery = ref('');
let userSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadUsers() {
  try {
    const { data } = await adminHttp.get('/admin/users', { params: { q: userQuery.value || undefined } });
    users.value = data.items;
    userTotal.value = data.total;
  } catch (e) {
    showFlash(errMsg(e));
  }
}

function searchUsers() {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(loadUsers, 300);
}

function toHex6(c: string | null): string {
  if (!c) return '#ffffff';
  const v = c.startsWith('#') ? c.slice(1) : c;
  if (v.length === 3) return '#' + v.split('').map((ch) => ch + ch).join('');
  if (v.length === 6) return '#' + v;
  if (v.length === 8) return '#' + v.slice(0, 6);
  return '#ffffff';
}

async function patchUser(u: AdminUser, body: Record<string, unknown>) {
  try {
    const { data } = await adminHttp.patch(`/admin/users/${u.id}`, body);
    Object.assign(u, data.user);
    showFlash(`✓ 已更新「${u.name}」`);
  } catch (e) {
    showFlash('更新失败：' + errMsg(e));
  }
}

function setColor(u: AdminUser, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  patchUser(u, { name_color: v === '#ffffff' ? null : v });
}

function hasPerm(u: AdminUser, key: string): boolean {
  return u.permissions ? u.permissions.includes(key) : true; // null = 默认全开
}

function setPerm(u: AdminUser, key: string, e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  const current = u.permissions ? [...u.permissions] : ['post'];
  const next = on ? Array.from(new Set([...current, key])) : current.filter((p) => p !== key);
  patchUser(u, { permissions: next });
}

function toggleStatus(u: AdminUser) {
  patchUser(u, { status: u.status === 'active' ? 'disabled' : 'active' });
}

/* ---- 文章管理 ---- */
interface AdminArticle {
  id: number;
  title: string;
  status: 'draft' | 'published';
  pinned: number;
  author_name: string;
  author_name_color: string | null;
  updated_at: string;
}

const articles = ref<AdminArticle[]>([]);
const articleTotal = ref(0);
const articleQuery = ref('');
let articleSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadArticles() {
  try {
    const { data } = await adminHttp.get('/admin/articles', { params: { q: articleQuery.value || undefined } });
    articles.value = data.items;
    articleTotal.value = data.total;
  } catch (e) {
    showFlash(errMsg(e));
  }
}

function searchArticles() {
  clearTimeout(articleSearchTimer);
  articleSearchTimer = setTimeout(loadArticles, 300);
}

async function togglePin(a: AdminArticle) {
  try {
    const { data } = await adminHttp.patch(`/admin/articles/${a.id}`, { pinned: a.pinned ? 0 : 1 });
    a.pinned = data.pinned;
  } catch (e) {
    showFlash(errMsg(e));
  }
}

async function deleteArticle(a: AdminArticle) {
  if (!confirm(`确定删除「${a.title}」？此操作不可恢复。`)) return;
  try {
    await adminHttp.delete(`/admin/articles/${a.id}`);
    await loadArticles();
    showFlash('✓ 已删除');
  } catch (e) {
    showFlash('删除失败：' + errMsg(e));
  }
}

function fmtDate(s: string): string {
  return s ? new Date(s).toLocaleDateString('zh-CN') : '—';
}

onMounted(async () => {
  if (!admin.authed) {
    await admin.check();
    if (admin.authed) await bootstrap();
  } else {
    await bootstrap();
  }
  if (admin.authed) {
    await loadUsers();
    await loadArticles();
  }
});
</script>

<style scoped>
/* 独立后台风格：冷石墨深色面板 + 琥珀强调，刻意区别于前台星空蓝 */
.admin {
  min-height: 100vh;
  background: #12151a;
  color: #e7e9ee;
  font-size: 14px;
}

/* 登录门 */
.gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(1200px 600px at 50% -10%, #1b2027 0%, #12151a 60%);
}

.gate-card {
  width: min(380px, calc(100vw - 40px));
  padding: 34px 32px;
  background: #191d24;
  border: 1px solid #262c36;
  border-radius: 14px;
}

.gate-card h1 {
  font-size: 19px;
  margin: 0 0 6px;
  color: #f2b34c;
}

.gate-sub {
  margin: 0 0 20px;
  color: #8a93a3;
}

.gate-card input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 13px;
  background: #12151a;
  border: 1px solid #2c333f;
  border-radius: 9px;
  color: #e7e9ee;
  font-size: 14px;
  outline: none;
}

.gate-card input:focus {
  border-color: #f2b34c;
}

.gate-card form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gate-card button {
  padding: 11px 0;
  border: 0;
  border-radius: 9px;
  background: #f2b34c;
  color: #1a1508;
  font-weight: 700;
  font-size: 14px;
}

.gate-err {
  color: #ff7b72;
  font-size: 13px;
  margin: 12px 0 0;
}

.gate-hint {
  color: #66707f;
  font-size: 12.5px;
  margin: 14px 0 0;
}

/* 主体布局 */
.shell {
  display: flex;
  min-height: 100vh;
}

.side {
  width: 200px;
  flex: none;
  padding: 26px 16px;
  background: #171b21;
  border-right: 1px solid #232935;
  display: flex;
  flex-direction: column;
  gap: 22px;
  position: sticky;
  top: 0;
  height: 100vh;
  box-sizing: border-box;
}

.side-brand {
  font-size: 16px;
  font-weight: 700;
  color: #f2b34c;
  line-height: 1.5;
}

.side-brand span {
  font-size: 12px;
  font-weight: 400;
  color: #8a93a3;
}

.side nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side nav button {
  text-align: left;
  padding: 10px 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #aab3c2;
  font-size: 14px;
  cursor: pointer;
}

.side nav button.on {
  background: #232a35;
  color: #f2b34c;
}

.side nav button:hover {
  color: #e7e9ee;
}

.side-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.main {
  flex: 1;
  padding: 34px 42px 60px;
  max-width: 980px;
}

.pane h2 {
  font-size: 15px;
  color: #f2b34c;
  margin: 28px 0 12px;
}

.pane h2:first-child {
  margin-top: 0;
}

.pane h2 small {
  color: #8a93a3;
  font-weight: 400;
  font-size: 12.5px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.row > span {
  width: 110px;
  flex: none;
  color: #8a93a3;
  font-size: 13px;
}

.row input[type='text'],
.row input:not([type]),
.row input[type='password'],
.row input[type='email'] {
  flex: 1;
  padding: 9px 12px;
  background: #12151a;
  border: 1px solid #2c333f;
  border-radius: 8px;
  color: #e7e9ee;
  font-size: 13.5px;
  outline: none;
}

.row input:focus {
  border-color: #f2b34c;
}

.row.check {
  gap: 8px;
}

.row.check span {
  width: auto;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 26px;
}

.body-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.body-row > span {
  width: 110px;
  flex: none;
  color: #8a93a3;
  font-size: 13px;
  padding-top: 9px;
}

.ta {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: #12151a;
  border: 1px solid #2c333f;
  border-radius: 8px;
  color: #e7e9ee;
  font-size: 13px;
  line-height: 1.7;
  outline: none;
  resize: vertical;
}

.ta:focus {
  border-color: #f2b34c;
}

.mono {
  font-family: ui-monospace, Consolas, monospace;
}

.hint {
  color: #66707f;
  font-size: 12.5px;
  margin: 6px 0 12px;
}

.hint.ok {
  color: #7ec699;
}

.hint code {
  color: #f2b34c;
}

.ops {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 26px;
}

.primary {
  padding: 10px 22px;
  border: 0;
  border-radius: 8px;
  background: #f2b34c;
  color: #1a1508;
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.6;
}

.ghost {
  padding: 8px 14px;
  border: 1px solid #2c333f;
  border-radius: 8px;
  background: transparent;
  color: #aab3c2;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
}

.ghost:hover {
  color: #e7e9ee;
  border-color: #3a4351;
}

.ghost.sm {
  padding: 4px 10px;
  font-size: 12.5px;
}

.ghost.danger {
  color: #ff7b72;
  border-color: rgba(255, 123, 114, 0.35);
}

.ghost.danger:hover {
  border-color: #ff7b72;
}

.flash {
  color: #7ec699;
  font-size: 13px;
}

/* Logo */
.logo-box {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 14px 16px;
  background: #171b21;
  border: 1px solid #232935;
  border-radius: 10px;
}

.logo-preview {
  width: 46px;
  height: 46px;
  object-fit: contain;
  border-radius: 8px;
  background: #12151a;
}

.logo-empty {
  color: #66707f;
  font-size: 13px;
}

.logo-ops {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.file-btn {
  padding: 8px 14px;
  border: 1px dashed #3a4351;
  border-radius: 8px;
  color: #aab3c2;
  font-size: 13px;
  cursor: pointer;
}

.file-btn:hover {
  color: #e7e9ee;
}

.send-row {
  max-width: 420px;
}

/* 列表 */
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.search {
  width: 240px;
  padding: 8px 12px;
  background: #12151a;
  border: 1px solid #2c333f;
  border-radius: 8px;
  color: #e7e9ee;
  font-size: 13px;
  outline: none;
}

.search:focus {
  border-color: #f2b34c;
}

.tbl {
  width: 100%;
  border-collapse: collapse;
}

.tbl th {
  text-align: left;
  font-size: 12px;
  color: #66707f;
  font-weight: 500;
  padding: 8px 10px;
  border-bottom: 1px solid #232935;
}

.tbl td {
  padding: 10px;
  border-bottom: 1px solid #1d222b;
  vertical-align: middle;
}

.tbl a {
  color: #d7dce4;
  text-decoration: none;
}

.tbl a:hover {
  color: #f2b34c;
}

.title-cell {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mini-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}

.u-name {
  font-weight: 600;
  font-size: 13.5px;
}

.dim {
  color: #66707f;
  font-size: 12.5px;
}

.color-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-cell input[type='color'] {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid #2c333f;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.perm {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #aab3c2;
  cursor: pointer;
}

.pill {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid #2c333f;
  background: transparent;
  color: #8a93a3;
  font-size: 12.5px;
  cursor: pointer;
}

.pill.pinned {
  color: #f2b34c;
  border-color: rgba(242, 179, 76, 0.5);
}

.pill.published {
  color: #7ec699;
  border-color: rgba(126, 198, 153, 0.4);
  cursor: default;
}

.pill.draft {
  color: #8a93a3;
  cursor: default;
}

.pill.active {
  color: #7ec699;
  border-color: rgba(126, 198, 153, 0.4);
}

.pill.disabled {
  color: #ff7b72;
  border-color: rgba(255, 123, 114, 0.4);
}

/* 弹层 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(6, 8, 11, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: min(360px, calc(100vw - 40px));
  background: #191d24;
  border: 1px solid #262c36;
  border-radius: 12px;
  padding: 24px;
}

.modal h3 {
  margin: 0 0 16px;
  font-size: 15px;
  color: #f2b34c;
}

.modal input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: #12151a;
  border: 1px solid #2c333f;
  border-radius: 8px;
  color: #e7e9ee;
  font-size: 13.5px;
  outline: none;
}

.modal-ops {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 720px) {
  .side {
    width: 64px;
    padding: 18px 8px;
  }
  .side-brand {
    display: none;
  }
  .side nav button {
    padding: 10px 0;
    text-align: center;
    font-size: 12px;
  }
  .main {
    padding: 24px 18px 60px;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
