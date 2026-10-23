<template>
  <article class="card" @click="go">
    <div v-if="article.pinned" class="pin" title="置顶">置顶</div>
    <h2 class="title">{{ article.title }}</h2>
    <p v-if="article.summary" class="summary">{{ article.summary }}</p>
    <p v-else class="summary placeholder">（暂无简介）</p>
    <footer class="meta">
      <img class="avatar" :src="article.author_avatar || fallbackAvatar" alt="" />
      <span class="author">{{ article.author_name }}</span>
      <span class="dot">·</span>
      <time>{{ formatDate(article.published_at || article.created_at) }}</time>
      <span class="read">阅读 →</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { ArticleBrief } from '../types';
import { formatDate } from '../utils/format';
import fallbackAvatar from '../assets/default-avatar.svg';

const props = defineProps<{ article: ArticleBrief }>();
const router = useRouter();

function go() {
  router.push(`/article/${props.article.id}`);
}
</script>

<style scoped>
.card {
  position: relative;
  padding: 22px 26px;
  cursor: pointer;
  background: rgb(52 128 191 / 28%);
  border: 1px solid rgb(140 198 226 / 22%);
  border-radius: var(--radius-lg);
  transition:
    background-color 0.45s ease,
    border-color 0.45s ease,
    box-shadow 0.45s ease;
}

/* 悬浮：底色提亮一档（同色相、不位移） */
.card:hover {
  background-color: rgb(61 140 205 / 42%);
  border-color: rgb(140 198 226 / 45%);
  box-shadow: 0 8px 28px rgba(2, 62, 138, 0.25);
}

.pin {
  position: absolute;
  top: -10px;
  right: 18px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #ffffff;
  background: var(--fill);
  border-radius: 999px;
  box-shadow: 0 2px 12px rgba(28, 128, 180, 0.5);
}

.title {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.45;
  color: #ffffff;
  margin-bottom: 8px;
}

.summary {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-dim);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.summary.placeholder {
  opacity: 0.5;
  font-style: italic;
}

.meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 14px;
  font-size: 12.5px;
  color: rgba(205, 226, 238, 0.5);
}

.avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

.author {
  color: var(--accent);
}

.dot {
  opacity: 0.6;
}

.read {
  margin-left: auto;
  color: var(--accent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.card:hover .read {
  opacity: 1;
}
</style>
