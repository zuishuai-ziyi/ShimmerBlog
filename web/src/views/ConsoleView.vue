<template>
  <main class="console page">
    <header class="page-head">
      <h1>控制台</h1>
      <p class="muted">管理你的文章与个人资料</p>
    </header>

    <nav class="tabs glass">
      <button v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="tab = t.key">
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
              <button class="link-btn danger" @click="remove(a)">删除</button>
            </div>
          </li>
        </ul>
      </template>
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
          <router-link class="space-link" :to="`/space/${auth.user?.id}`">我的空间 →</router-link>
        </div>
        <div class="field">
          <label>昵称</label>
          <input v-model.trim="profileName" maxlength="50" />
        </div>
        <div class="field">
          <label>简介（展示在个人空间）</label>
          <textarea v-model="profileBio" rows="3" maxlength="500" placeholder="介绍一下自己（最多 500 字）" />
        </div>
        <div class="field">
          <label>邮箱</label>
          <input :value="auth.user?.email || '（未绑定）'" disabled />
        </div>
        <p v-if="profileError" class="error-tip">{{ profileError }}</p>
        <p v-if="profileNotice" class="notice">{{ profileNotice }}</p>
        <div class="form-actions">
          <button class="btn-ghost logout" type="button" @click="doLogout">退出登录</button>
          <button class="btn" type="submit" :disabled="savingProfile">{{ savingProfile ? '保存中…' : '保存资料' }}</button>
        </div>
      </form>
      <!-- 验证码弹窗必须放在本 section 内：资料页激活时才挂载，避免放在其它 tab 的分支里导致不渲染 -->
      <CaptchaDialog v-model:open="profileCaptchaOpen" :action="doSaveProfileWithCaptcha" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import http, { errMsg, isCaptchaRequired, isCaptchaFailure } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import CaptchaDialog from '../components/CaptchaDialog.vue';
import { formatDateTime } from '../utils/format';
import type { ArticleBrief } from '../types';
import bundledAvatar from '../assets/default-avatar.svg';
import ArticleEditor from '../components/ArticleEditor.vue';

// 用户默认头像：后台可设置，未设置时用内置图
const site = useSiteStore();
const defaultAvatar = computed(() => site.info.defaultAvatarUrl || bundledAvatar);

const tabs = [
  { key: 'articles', label: '我的文章' },
  { key: 'profile', label: '个人资料' },
] as const;
const tab = ref<'articles' | 'profile'>('articles');

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

/** 退出登录：清凭证回首页 */
function doLogout() {
  auth.logout();
  router.push('/');
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

async function remove(a: ArticleBrief) {
  if (!confirm(`确定删除《${a.title}》？此操作不可恢复。`)) return;
  try {
    await http.delete(`/articles/${a.id}`);
    mine.value = mine.value.filter((x) => x.id !== a.id);
  } catch (e) {
    alert(errMsg(e));
  }
}

/* ---------- 个人资料 ---------- */
const profileName = ref('');
const profileBio = ref('');
const savingProfile = ref(false);
const profileError = ref('');
const profileNotice = ref('');
const uploadingAvatar = ref(false);

watch(
  () => auth.user,
  (u) => {
    if (u) {
      profileName.value = u.name;
      profileBio.value = u.bio || '';
    }
  },
  { immediate: true }
);

async function saveProfile() {
  // 正常修改零打扰：直接保存；后端检测到频繁修改（10 分钟内第 3 次起）才回 CAPTCHA_REQUIRED，
  // 届时自动弹出验证窗，验证通过后自动重试
  await doSaveProfile();
}

const profileCaptchaOpen = ref(false);
const doSaveProfileWithCaptcha = async (c: { key: string; value: string }) => {
  await doSaveProfile(c);
};

async function doSaveProfile(captcha?: { key: string; value: string }) {
  savingProfile.value = true;
  profileError.value = '';
  profileNotice.value = '';
  try {
    const { data } = await http.put('/auth/profile', { name: profileName.value, bio: profileBio.value, captcha });
    if (data.user) auth.user = data.user;
    profileNotice.value = '已保存';
  } catch (e) {
    if (isCaptchaRequired(e)) {
      // 风控触发：不打扰文案，直接弹验证窗（验证通过后自动重试）
      profileError.value = '';
      profileNotice.value = '';
      profileCaptchaOpen.value = true;
      return;
    }
    if (isCaptchaFailure(e)) return; // 验证码未通过：弹窗内已提示并自动换题
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
}

/* 悬停态与顶栏「首页 / 关于」一致 */
.tabs button:hover:not(.on) {
  color: var(--text);
  background: rgba(140, 198, 226, 0.12);
}

.spacer {
  flex: 1;
}

/* 小字返回链接：只做文字色过渡，不加悬停底色 */
.back {
  font-size: 13px;
  color: var(--text-dim);
  text-decoration: none;
  padding-right: 6px;
  transition: color 0.25s ease;
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
  /* 给状态圆点左侧光晕留出裁剪余量（padding 反向 offset，内容位置不变） */
  padding-left: 10px;
  margin-left: -10px;
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
  transition: color 0.25s ease;
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

.link-btn {
  font-size: 13px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s, opacity 0.2s;
}

.link-btn:hover {
  color: var(--accent);
}

.link-btn.danger {
  color: #ff8a8a;
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

.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

/* 退出登录放在左侧，与右侧「保存资料」区分主次；悬停变红 */
.form-actions .logout {
  margin-right: auto;
  /* 全局 .btn-ghost 只过渡 background，这里补上文字色与边框色的过渡 */
  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

.form-actions .logout:hover {
  color: #ff8a8a;
  background: rgba(255, 138, 138, 0.14);
  border-color: rgba(255, 138, 138, 0.42);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.space-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  transition: color 0.25s ease;
}

.space-link:hover {
  color: #ffffff;
}

.upload-chip {
  font-size: 13px;
  color: var(--accent);
  background: transparent;
  border: 1px dashed var(--glass-border);
  border-radius: 999px;
  padding: 7px 16px;
  cursor: pointer;
  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

/* 与站内其他胶囊按钮一致的悬停反馈（无位移，只变色） */
.upload-chip:hover {
  color: var(--text);
  background: rgba(140, 198, 226, 0.14);
  border-color: rgba(140, 198, 226, 0.55);
}

.notice {
  font-size: 13px;
  color: var(--accent);
}
</style>
