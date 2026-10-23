<template>
  <main class="console page">
    <header class="page-head">
      <h1>控制台</h1>
      <p class="muted">管理你的文章、站点与用户</p>
    </header>

    <nav class="tabs glass">
      <button v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="switchTab(t.key)">
        {{ t.label }}
      </button>
      <span class="spacer" />
      <router-link class="back" to="/">← 回到首页</router-link>
    </nav>

    <!-- ================= 我的文章 ================= -->
    <section v-if="tab === 'articles'">
      <ArticleEditor
        v-if="editing !== null"
        :key="editing"
        :article-id="editing > 0 ? editing : undefined"
        @saved="onSaved"
        @cancel="editing = null"
      />

      <template v-else>
        <div class="toolbar">
          <span class="muted">共 {{ mine.length }} 篇</span>
          <button class="btn" @click="startNew">＋ 新建文章</button>
        </div>

        <p v-if="loadingMine" class="muted">加载中…</p>
        <p v-else-if="!mine.length" class="muted empty">还没有文章，点右上角新建第一篇吧。</p>

        <ul v-else class="rows glass">
          <li v-for="a in mine" :key="a.id" class="row">
            <div class="row-main">
              <div class="row-title">
                <span class="dot" :class="a.status" />
                <router-link :to="`/article/${a.id}`">{{ a.title }}</router-link>
                <span v-if="a.status === 'draft'" class="chip draft">草稿</span>
                <span v-if="a.pinned" class="chip pin">置顶</span>
              </div>
              <div class="row-meta">
                <span>{{ formatDateTime(a.published_at || a.created_at) }}</span>
                <span v-if="a.summary">· {{ a.summary.slice(0, 60) }}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="link-btn" @click="startEdit(a.id)">编辑</button>
              <button v-if="auth.isAdmin" class="link-btn" @click="togglePin(a)">
                {{ a.pinned ? '取消置顶' : '置顶' }}
              </button>
              <button class="link-btn danger" @click="remove(a)">删除</button>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <!-- ================= 用户管理 ================= -->
    <section v-else-if="tab === 'users'" class="stack">
      <div class="stats">
        <div class="stat glass"><b>{{ stats.users }}</b><span>用户</span></div>
        <div class="stat glass"><b>{{ stats.articles }}</b><span>文章总数</span></div>
        <div class="stat glass"><b>{{ stats.published }}</b><span>已发布</span></div>
        <div class="stat glass"><b>{{ stats.drafts }}</b><span>草稿</span></div>
      </div>

      <div class="toolbar">
        <input v-model.trim="userQuery" class="search" placeholder="搜索邮箱或昵称" @keyup.enter="loadUsers(1)" />
        <button class="btn-ghost" @click="loadUsers(1)">搜索</button>
      </div>

      <p v-if="userError" class="error-tip">{{ userError }}</p>
      <p v-if="loadingUsers" class="muted">加载中…</p>

      <ul v-else class="rows glass">
        <li v-for="u in users" :key="u.id" class="row">
          <div class="row-main user-main">
            <img class="avatar" :src="u.avatar_url || defaultAvatar" :alt="u.name" />
            <div>
              <div class="row-title">
                {{ u.name }}
                <span v-if="u.role === 'admin'" class="chip admin">管理员</span>
                <span v-if="u.status === 'disabled'" class="chip off">已禁用</span>
              </div>
              <div class="row-meta">
                <span>{{ u.email || '（无邮箱）' }}</span>
                <span>· 注册于 {{ formatDate(u.created_at) }}</span>
              </div>
            </div>
          </div>
          <div class="row-actions">
            <button class="link-btn" :disabled="u.id === auth.user?.id" @click="patchUser(u, { status: u.status === 'active' ? 'disabled' : 'active' })">
              {{ u.status === 'active' ? '禁用' : '启用' }}
            </button>
            <button
              class="link-btn"
              :disabled="u.id === auth.user?.id"
              @click="patchUser(u, { role: u.role === 'admin' ? 'user' : 'admin' })"
            >
              {{ u.role === 'admin' ? '取消管理员' : '设为管理员' }}
            </button>
          </div>
        </li>
      </ul>

      <div v-if="userTotal > userPageSize" class="pager">
        <button class="btn-ghost" :disabled="userPage <= 1" @click="loadUsers(userPage - 1)">上一页</button>
        <span class="muted">{{ userPage }} / {{ Math.ceil(userTotal / userPageSize) }}</span>
        <button class="btn-ghost" :disabled="userPage >= Math.ceil(userTotal / userPageSize)" @click="loadUsers(userPage + 1)">
          下一页
        </button>
      </div>
    </section>

    <!-- ================= 站点配置 ================= -->
    <section v-else-if="tab === 'settings'" class="stack">
      <form class="glass form-card" @submit.prevent="saveSettings">
        <h2>站点信息</h2>
        <div class="field">
          <label>站点标题</label>
          <input v-model.trim="set.site_title" maxlength="60" />
        </div>
        <div class="field">
          <label>副标题（首页 hero 下方文案）</label>
          <input v-model.trim="set.site_subtitle" maxlength="120" />
        </div>
        <div class="field">
          <label>站点描述（用于页面 meta）</label>
          <textarea v-model.trim="set.site_description" rows="2" maxlength="300" />
        </div>

        <h2>注册与登录</h2>
        <label class="switch">
          <input v-model="registerOpen" type="checkbox" />
          <span>开放邮箱注册</span>
        </label>

        <div class="field">
          <label>GitHub OAuth Client ID</label>
          <input v-model.trim="set.github_client_id" placeholder="留空则隐藏 GitHub 登录按钮" />
        </div>
        <div class="field">
          <label class="secret-label">
            GitHub OAuth Client Secret
            <button v-if="hasSecret" type="button" class="link-btn" @click="clearSecret = !clearSecret">
              {{ clearSecret ? '取消清除' : '清除已保存的密钥' }}
            </button>
          </label>
          <input
            v-model.trim="set.github_client_secret"
            type="password"
            :placeholder="clearSecret ? '保存后将清空密钥' : hasSecret ? '已配置，留空则不修改' : '留空则隐藏 GitHub 登录按钮'"
            :disabled="clearSecret"
          />
        </div>
        <div class="field">
          <label>站点前端地址（OAuth 回调后跳回这里）</label>
          <input v-model.trim="set.web_origin" placeholder="http://localhost:5180" />
        </div>

        <p v-if="setError" class="error-tip">{{ setError }}</p>
        <p v-if="setNotice" class="notice">{{ setNotice }}</p>
        <div class="form-actions">
          <button class="btn" type="submit" :disabled="savingSet">{{ savingSet ? '保存中…' : '保存配置' }}</button>
        </div>
      </form>
    </section>

    <!-- ================= 个人资料 ================= -->
    <section v-else class="stack">
      <form class="glass form-card" @submit.prevent="saveProfile">
        <h2>个人资料</h2>
        <div class="profile-row">
          <img class="avatar big" :src="auth.user?.avatar_url || defaultAvatar" :alt="auth.user?.name" />
          <label class="upload-chip">
            <input type="file" accept="image/*" hidden @change="uploadAvatar" />
            {{ uploadingAvatar ? '上传中…' : '更换头像' }}
          </label>
        </div>
        <div class="field">
          <label>昵称</label>
          <input v-model.trim="profileName" maxlength="50" />
        </div>
        <div class="field">
          <label>邮箱</label>
          <input :value="auth.user?.email || '（未绑定）'" disabled />
        </div>
        <p v-if="profileError" class="error-tip">{{ profileError }}</p>
        <p v-if="profileNotice" class="notice">{{ profileNotice }}</p>
        <div class="form-actions">
          <button class="btn" type="submit" :disabled="savingProfile">{{ savingProfile ? '保存中…' : '保存资料' }}</button>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import http, { errMsg } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import { formatDate, formatDateTime } from '../utils/format';
import type { ArticleBrief } from '../types';
import defaultAvatar from '../assets/default-avatar.svg';
import ArticleEditor from '../components/ArticleEditor.vue';

type TabKey = 'articles' | 'users' | 'settings' | 'profile';

interface AdminUser {
  id: number;
  email: string | null;
  name: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  created_at: string;
}

const auth = useAuthStore();
const site = useSiteStore();
const route = useRoute();

const tabs = computed<{ key: TabKey; label: string }[]>(() => {
  const list: { key: TabKey; label: string }[] = [{ key: 'articles', label: '我的文章' }];
  if (auth.isAdmin) {
    list.push({ key: 'users', label: '用户管理' }, { key: 'settings', label: '站点配置' });
  }
  list.push({ key: 'profile', label: '个人资料' });
  return list;
});

const tab = ref<TabKey>('articles');

function switchTab(k: TabKey) {
  tab.value = k;
  if (k === 'users' && auth.isAdmin) loadUsers(1);
  if (k === 'settings' && auth.isAdmin) loadSettings();
}

/* ---------- 我的文章 ---------- */
const mine = ref<ArticleBrief[]>([]);
const loadingMine = ref(false);
const editing = ref<number | null>(null);

async function loadMine() {
  loadingMine.value = true;
  try {
    const { data } = await http.get<{ items: ArticleBrief[] }>('/articles/mine');
    mine.value = data.items ?? [];
  } catch (e) {
    console.warn(errMsg(e));
  } finally {
    loadingMine.value = false;
  }
}

function startNew() {
  editing.value = 0;
}

function startEdit(id: number) {
  editing.value = id;
}

async function onSaved() {
  await loadMine();
  editing.value = null;
}

async function togglePin(a: ArticleBrief) {
  try {
    await http.post(`/articles/${a.id}/pin`, { pinned: a.pinned ? 0 : 1 });
    await loadMine();
  } catch (e) {
    alert(errMsg(e));
  }
}

async function remove(a: ArticleBrief) {
  if (!confirm(`确定删除《${a.title}》？此操作不可恢复。`)) return;
  try {
    await http.delete(`/articles/${a.id}`);
    mine.value = mine.value.filter((x) => x.id !== a.id);
  } catch (e) {
    alert(errMsg(e));
  }
}

/* ---------- 用户管理 ---------- */
const users = ref<AdminUser[]>([]);
const userQuery = ref('');
const loadingUsers = ref(false);
const userError = ref('');
const userPage = ref(1);
const userTotal = ref(0);
const userPageSize = 20;
const stats = reactive({ users: 0, articles: 0, published: 0, drafts: 0 });

async function loadUsers(page = userPage.value) {
  loadingUsers.value = true;
  userError.value = '';
  try {
    const { data } = await http.get<{
      items: AdminUser[];
      total: number;
      stats: { users: number; articles: number; published: number; drafts: number };
    }>('/admin/users', { params: { q: userQuery.value || undefined, page, pageSize: userPageSize } });
    users.value = data.items ?? [];
    userTotal.value = data.total;
    userPage.value = page;
    Object.assign(stats, data.stats);
  } catch (e) {
    userError.value = errMsg(e);
  } finally {
    loadingUsers.value = false;
  }
}

async function patchUser(u: AdminUser, patch: { status?: string; role?: string }) {
  userError.value = '';
  try {
    const { data } = await http.patch(`/admin/users/${u.id}`, patch);
    Object.assign(u, data.user);
    if (u.id === auth.user?.id) await auth.fetchMe();
  } catch (e) {
    userError.value = errMsg(e);
  }
}

/* ---------- 站点配置 ---------- */
const set = reactive<Record<string, string>>({
  site_title: '',
  site_subtitle: '',
  site_description: '',
  github_client_id: '',
  github_client_secret: '',
  web_origin: '',
});
const registerOpen = ref(true);
const hasSecret = ref(false);
const clearSecret = ref(false);
const savingSet = ref(false);
const setError = ref('');
const setNotice = ref('');
let settingsLoaded = false;

async function loadSettings() {
  if (settingsLoaded) return;
  setError.value = '';
  try {
    const { data } = await http.get<{ settings: Record<string, string> | any[] }>('/admin/settings');
    const s = data.settings;
    const obj: Record<string, string> = Array.isArray(s)
      ? Object.fromEntries(s.map((it: any) => [it.key, it.value]))
      : (s as Record<string, string>);
    for (const k of Object.keys(set)) if (k in obj) set[k] = obj[k];
    hasSecret.value = obj.github_client_secret === '__KEEP__';
    set.github_client_secret = '';
    clearSecret.value = false;
    registerOpen.value = obj.register_open !== '0';
    settingsLoaded = true;
  } catch (e) {
    setError.value = errMsg(e);
  }
}

async function saveSettings() {
  savingSet.value = true;
  setError.value = '';
  setNotice.value = '';
  try {
    const payload: Record<string, unknown> = { ...set, register_open: registerOpen.value };
    if (hasSecret.value && !set.github_client_secret) {
      payload.github_client_secret = clearSecret.value ? '__CLEAR__' : '__KEEP__';
    }
    await http.put('/admin/settings', payload);
    setNotice.value = '已保存，站点配置即时生效';
    settingsLoaded = false;
    await loadSettings();
    await site.fetch();
  } catch (e) {
    setError.value = errMsg(e);
  } finally {
    savingSet.value = false;
  }
}

/* ---------- 个人资料 ---------- */
const profileName = ref('');
const savingProfile = ref(false);
const profileError = ref('');
const profileNotice = ref('');
const uploadingAvatar = ref(false);

watch(
  () => auth.user,
  (u) => {
    if (u) profileName.value = u.name;
  },
  { immediate: true }
);

async function saveProfile() {
  savingProfile.value = true;
  profileError.value = '';
  profileNotice.value = '';
  try {
    const { data } = await http.put('/auth/profile', { name: profileName.value });
    if (data.user) auth.user = data.user;
    profileNotice.value = '已保存';
  } catch (e) {
    profileError.value = errMsg(e);
  } finally {
    savingProfile.value = false;
  }
}

async function uploadAvatar(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  uploadingAvatar.value = true;
  profileError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await http.post<{ user: any }>('/auth/avatar', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (data.user) auth.user = data.user;
    profileNotice.value = '头像已更新';
  } catch (e) {
    profileError.value = errMsg(e);
  } finally {
    uploadingAvatar.value = false;
  }
}

onMounted(async () => {
  if (!auth.ready) await auth.fetchMe();
  await loadMine();
  // 从文章页点「编辑」进来时，直接打开对应文章的编辑器
  const editId = Number(route.query.edit);
  if (Number.isInteger(editId) && editId > 0) {
    tab.value = 'articles';
    editing.value = editId;
  }
});
</script>

<style scoped>
.console {
  padding: 120px 22px 80px;
  max-width: 1020px;
}

.page-head {
  margin-bottom: 18px;
}

.page-head h1 {
  font-size: 26px;
  color: #ffffff;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.tabs button {
  padding: 8px 16px;
  font-size: 14px;
  color: var(--text-dim);
  background: transparent;
  border: none;
  border-radius: 999px;
  transition: color 0.2s, background 0.2s;
}

.tabs button.on {
  color: #ffffff;
  background: var(--fill);
  font-weight: 700;
}

.spacer {
  flex: 1;
}

.back {
  font-size: 13px;
  color: var(--text-dim);
  text-decoration: none;
  padding-right: 6px;
}

.back:hover {
  color: var(--accent);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.toolbar .muted {
  margin-right: auto;
}

.rows {
  list-style: none;
  padding: 6px;
  display: grid;
  gap: 2px;
  min-width: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  min-width: 0;
  flex-wrap: wrap;
  transition: background 0.2s;
}

.row:hover {
  background: rgba(150, 205, 232, 0.07);
}

.row-main {
  min-width: 0;
  flex: 1 1 200px;
  overflow: hidden;
}

.user-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #ffffff;
  flex-wrap: wrap;
}

.row-title a {
  color: inherit;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.row-title a:hover {
  color: var(--accent);
}

.row-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-dim);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-meta span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-actions {
  display: flex;
  gap: 12px;
  flex: none;
  margin-left: auto;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.dot.published {
  background: #63e6be;
  box-shadow: 0 0 8px #63e6be;
}

.dot.draft {
  background: #f0b429;
}

.chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1.6;
  font-weight: 600;
}

.chip.draft {
  color: #f0b429;
  background: rgba(240, 180, 41, 0.14);
}

.chip.pin {
  color: var(--accent);
  background: rgba(140, 198, 226, 0.16);
}

.chip.admin {
  color: #ffffff;
  background: var(--fill);
}

.chip.off {
  color: #ff8a8a;
  background: rgba(255, 138, 138, 0.14);
}

.link-btn {
  font-size: 13px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  color: var(--accent);
}

.link-btn.danger {
  color: #ff8a8a;
}

.link-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--glass-border);
}

.avatar.big {
  width: 64px;
  height: 64px;
}

.empty {
  padding: 40px 0;
  text-align: center;
}

.stack {
  display: grid;
  gap: 16px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}

.stat {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat b {
  font-size: 24px;
  color: var(--accent);
}

.stat span {
  font-size: 12.5px;
  color: var(--text-dim);
}

.search {
  flex: 1;
  max-width: 320px;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.form-card {
  padding: 24px 26px 28px;
  display: grid;
  gap: 14px;
}

.form-card h2 {
  font-size: 15px;
  color: var(--accent);
  margin-top: 6px;
}

.form-card h2:first-child {
  margin-top: 0;
}

.secret-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.switch {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #ffffff;
  cursor: pointer;
}

.switch input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.upload-chip {
  font-size: 13px;
  color: var(--accent);
  border: 1px dashed var(--glass-border);
  border-radius: 999px;
  padding: 7px 16px;
  cursor: pointer;
}

.notice {
  font-size: 13px;
  color: var(--accent);
}
</style>
