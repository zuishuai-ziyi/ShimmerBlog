<template>
  <div class="article-page">
    <div v-if="loading" class="hint">正在加载…</div>
    <div v-else-if="error" class="hint err">{{ error }}</div>

    <template v-else-if="article">
      <article class="sheet glass">
        <router-link to="/" class="back">← 返回时间轴</router-link>

        <h1 class="title">{{ article.title }}</h1>

        <div class="meta">
          <img class="avatar" :src="article.author_avatar || fallbackAvatar" alt="" />
          <router-link :to="`/space/${article.author_id}`" class="author"
            :style="article.author_name_color ? { color: article.author_name_color } : undefined">{{ article.author_name }}</router-link>
          <span class="sep">·</span>
          <time>{{ formatDate(article.published_at || article.created_at) }}</time>
          <span v-if="article.pinned" class="tag">置顶</span>
          <span v-if="article.status === 'draft'" class="tag draft">草稿</span>
          <router-link v-if="canEdit" :to="`/console?edit=${article.id}`" class="edit">编辑</router-link>
        </div>

        <p v-if="article.summary" class="lead">{{ article.summary }}</p>

        <hr class="rule" />

        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="prose" v-html="html"></div>
      </article>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import http, { errMsg } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { formatDate } from '../utils/format';
import type { Article } from '../types';
import fallbackAvatar from '../assets/default-avatar.svg';

const route = useRoute();
const auth = useAuthStore();
const article = ref<Article | null>(null);
const loading = ref(true);
const error = ref('');

const html = computed(() => {
  if (!article.value) return '';
  const raw = marked.parse(article.value.content ?? '', { breaks: true, async: false }) as string;
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
});

const canEdit = computed(
  () => !!auth.user && !!article.value && auth.user.id === article.value.author_id
);

async function load(id: string) {
  loading.value = true;
  error.value = '';
  article.value = null;
  try {
    const { data } = await http.get<{ article: Article }>(`/articles/${id}`);
    article.value = data.article;
    document.title = `${data.article.title} · 微光博客`;
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.params.id,
  (id) => {
    if (id) load(String(id));
  },
  { immediate: true }
);
</script>

<style scoped>
.article-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 130px 22px 100px;
}

.hint {
  padding: 60px 0;
  text-align: center;
  color: var(--text-dim);
}

.hint.err {
  color: #ff9b9b;
}

.sheet {
  padding: 34px 40px 48px;
}

.back {
  display: inline-block;
  font-size: 13px;
  color: var(--text-dim);
  text-decoration: none;
  margin-bottom: 18px;
  transition: color 0.2s;
}

.back:hover {
  color: var(--accent);
}

.title {
  font-size: clamp(26px, 4vw, 36px);
  line-height: 1.35;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.5px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  font-size: 13px;
  color: rgba(205, 226, 238, 0.55);
}

.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.author {
  color: var(--accent);
}

a.author {
  text-decoration: none;
}

a.author:hover {
  text-decoration: underline;
}

.tag {
  padding: 1px 9px;
  font-size: 11px;
  border-radius: 999px;
  color: #ffffff;
  background: var(--fill);
}

.tag.draft {
  color: var(--accent);
  background: rgba(140, 198, 226, 0.16);
  border: 1px solid var(--glass-border);
}

.edit {
  margin-left: auto;
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
}

.lead {
  margin-top: 22px;
  padding-left: 14px;
  border-left: 2px solid rgba(140, 198, 226, 0.5);
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--text-dim);
}

.rule {
  margin: 26px 0;
  border: none;
  height: 1px;
  background: rgba(140, 198, 226, 0.3);
}

/* Markdown 正文 */
.prose {
  font-size: 15.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.92);
  word-break: break-word;
}

.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3),
.prose :deep(h4) {
  margin: 1.6em 0 0.7em;
  color: #ffffff;
  font-weight: 700;
  line-height: 1.4;
}

.prose :deep(h1) {
  font-size: 1.5em;
}
.prose :deep(h2) {
  font-size: 1.3em;
}
.prose :deep(h3) {
  font-size: 1.12em;
}

.prose :deep(p) {
  margin: 0.9em 0;
}

.prose :deep(a) {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid rgba(140, 198, 226, 0.4);
}

.prose :deep(a:hover) {
  color: var(--accent);
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0.9em 0;
  padding-left: 1.5em;
}

.prose :deep(li) {
  margin: 0.35em 0;
}

.prose :deep(blockquote) {
  margin: 1.1em 0;
  padding: 8px 16px;
  border-left: 3px solid rgba(140, 198, 226, 0.45);
  background: rgba(140, 198, 226, 0.07);
  border-radius: 0 10px 10px 0;
  color: var(--text-dim);
}

.prose :deep(code) {
  padding: 2px 6px;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--accent);
  background: rgb(9 34 46 / 60%);
  border-radius: 6px;
}

.prose :deep(pre) {
  margin: 1.1em 0;
  padding: 16px 18px;
  overflow-x: auto;
  background: rgb(9 34 46 / 60%);
  border: 1px solid rgba(150, 205, 232, 0.18);
  border-radius: 14px;
}

.prose :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 13.5px;
  line-height: 1.7;
}

.prose :deep(img) {
  max-width: 100%;
  border-radius: 12px;
  margin: 1em 0;
}

.prose :deep(table) {
  width: 100%;
  margin: 1.1em 0;
  border-collapse: collapse;
  font-size: 14px;
}

.prose :deep(th),
.prose :deep(td) {
  padding: 8px 12px;
  border: 1px solid rgba(150, 205, 232, 0.22);
  text-align: left;
}

.prose :deep(th) {
  background: rgba(140, 198, 226, 0.12);
  color: var(--accent);
}

.prose :deep(hr) {
  margin: 1.8em 0;
  border: none;
  height: 1px;
  background: rgba(150, 205, 232, 0.25);
}

@media (max-width: 640px) {
  .sheet {
    padding: 26px 20px 36px;
  }
}
</style>
