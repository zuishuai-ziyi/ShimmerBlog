<template>
  <div class="space">
    <!-- ======== 资料卡 ======== -->
    <section class="profile">
      <img class="big-avatar" :src="user?.avatar_url || defaultAvatar" alt="" />
      <div class="profile-main">
        <h1 class="u-name" :style="user?.name_color ? { color: user.name_color } : undefined">
          {{ user?.name || '…' }}
        </h1>
        <p class="u-bio">{{ user?.bio || '这个人还没有写简介。' }}</p>
        <p class="u-meta">加入于 {{ fmtDate(user?.created_at) }} · {{ total }} 篇文章</p>
      </div>
      <button v-if="isSelf" class="edit-btn" @click="openEdit">编辑资料</button>
    </section>

    <!-- ======== 本人编辑（昵称 + 简介） ======== -->
    <section v-if="isSelf && editing" class="editor">
      <label class="f">
        <span>昵称</span>
        <input v-model.trim="draft.name" maxlength="50" />
      </label>
      <label class="f">
        <span>简介</span>
        <textarea v-model="draft.bio" rows="3" maxlength="500" placeholder="介绍一下自己（最多 500 字）" />
      </label>
      <div class="f-ops">
        <button class="btn-save" :disabled="saving" @click="saveProfile">{{ saving ? '保存中…' : '保存' }}</button>
        <button class="btn-cancel" @click="editing = false">取消</button>
        <span v-if="editMsg" class="edit-msg" :class="{ err: !editOk }">{{ editMsg }}</span>
      </div>
    </section>

    <!-- ======== 活动文章 ======== -->
    <h2 class="sec-title">Ta 的文章</h2>
    <div v-if="articles.length" class="list">
      <router-link v-for="a in articles" :key="a.id" :to="`/article/${a.id}`" class="item">
        <div class="item-head">
          <span v-if="a.pinned" class="pin">置顶</span>
          <h3>{{ a.title }}</h3>
        </div>
        <p class="item-summary">{{ a.summary || '（暂无摘要）' }}</p>
        <p class="item-date">{{ fmtDate(a.published_at || a.created_at) }}</p>
      </router-link>
    </div>
    <p v-else class="empty">还没有公开的文章。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import http, { errMsg } from '../api/http';
import { useAuthStore } from '../stores/auth';
import defaultAvatar from '../assets/default-avatar.svg';

interface SpaceUser {
  id: number;
  name: string;
  name_color: string | null;
  avatar_url: string | null;
  bio: string;
  created_at: string;
}
interface SpaceArticle {
  id: number;
  title: string;
  summary: string | null;
  pinned: number;
  published_at: string | null;
  created_at: string;
}

const route = useRoute();
const auth = useAuthStore();

const user = ref<SpaceUser | null>(null);
const articles = ref<SpaceArticle[]>([]);
const total = ref(0);
const missing = ref(false);

const editing = ref(false);
const saving = ref(false);
const editMsg = ref('');
const editOk = ref(false);
const draft = reactive({ name: '', bio: '' });

const isSelf = computed(() => !!auth.user && auth.user.id === Number(route.params.id));

async function load() {
  missing.value = false;
  user.value = null;
  articles.value = [];
  try {
    const { data } = await http.get(`/space/${route.params.id}`);
    user.value = data.user;
    articles.value = data.articles;
    total.value = data.total;
  } catch {
    missing.value = true;
  }
}

function openEdit() {
  draft.name = user.value?.name ?? '';
  draft.bio = user.value?.bio ?? '';
  editMsg.value = '';
  editing.value = true;
}

async function saveProfile() {
  saving.value = true;
  editMsg.value = '';
  try {
    const { data } = await http.put<{ user: { name: string; name_color: string | null; bio: string | null } }>(
      '/auth/profile',
      { name: draft.name, bio: draft.bio }
    );
    if (user.value) {
      user.value.name = data.user.name;
      user.value.name_color = data.user.name_color;
      user.value.bio = data.user.bio || '';
    }
    await auth.fetchMe(); // 顶栏同步
    editOk.value = true;
    editMsg.value = '✓ 已保存';
    setTimeout(() => (editing.value = false), 800);
  } catch (e) {
    editOk.value = false;
    editMsg.value = errMsg(e);
  } finally {
    saving.value = false;
  }
}

function fmtDate(s?: string | null): string {
  return s ? new Date(s).toLocaleDateString('zh-CN') : '—';
}

onMounted(load);
watch(() => route.params.id, load);
</script>

<style scoped>
.space {
  max-width: 720px;
  margin: 0 auto;
  padding: 130px 22px 90px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 资料卡：与文章卡片同族的透明蓝 + 细描边 */
.profile {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 28px 30px;
  background: rgb(52 128 191 / 28%);
  border: 1px solid rgb(140 198 226 / 22%);
  border-radius: var(--radius-lg);
}

.big-avatar {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
  box-shadow: 0 0 0 3px rgb(140 198 226 / 25%);
}

.profile-main {
  flex: 1;
  min-width: 0;
}

.u-name {
  margin: 0 0 6px;
  font-size: 24px;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.u-bio {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.78);
}

.u-meta {
  margin: 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.5);
}

.edit-btn {
  flex: none;
  padding: 8px 18px;
  border-radius: 999px;
  border: 1px solid rgb(140 198 226 / 35%);
  background: rgb(52 128 191 / 18%);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.edit-btn:hover {
  background: rgb(61 140 205 / 34%);
}

/* 编辑区 */
.editor {
  padding: 20px 24px;
  background: rgb(52 128 191 / 14%);
  border: 1px solid rgb(140 198 226 / 18%);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.f {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.f span {
  width: 52px;
  flex: none;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  padding-top: 9px;
}

.f input,
.f textarea {
  flex: 1;
  padding: 9px 12px;
  background: rgb(10 20 30 / 45%);
  border: 1px solid rgb(140 198 226 / 22%);
  border-radius: 9px;
  color: var(--text);
  font-size: 13.5px;
  font-family: inherit;
  outline: none;
  resize: vertical;
}

.f input:focus,
.f textarea:focus {
  border-color: rgb(140 198 226 / 55%);
}

.f-ops {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 64px;
}

.btn-save {
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #06202c;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}

.btn-cancel {
  padding: 8px 16px;
  border: 1px solid rgb(140 198 226 / 25%);
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.65);
  font-size: 13px;
  cursor: pointer;
}

.edit-msg {
  font-size: 12.5px;
  color: #7ec699;
}

.edit-msg.err {
  color: #ff9b93;
}

/* 文章列表 */
.sec-title {
  margin: 14px 0 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.5px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.item {
  display: block;
  padding: 20px 24px;
  background: rgb(52 128 191 / 28%);
  border: 1px solid rgb(140 198 226 / 22%);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: background 0.2s, border-color 0.2s;
}

.item:hover {
  background: rgb(61 140 205 / 42%);
  border-color: rgb(140 198 226 / 45%);
}

.item-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pin {
  flex: none;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--accent);
  border: 1px solid rgb(140 198 226 / 40%);
}

.item h3 {
  margin: 0;
  font-size: 16.5px;
  color: #ffffff;
}

.item-summary {
  margin: 8px 0 10px;
  font-size: 13.5px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.72);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-date {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13.5px;
  padding: 30px 0;
}
</style>
