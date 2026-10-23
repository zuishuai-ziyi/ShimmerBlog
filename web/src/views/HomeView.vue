<template>
  <div class="home">
    <header class="hero">
      <h1 class="hero-title">
        <template v-if="heroParts"><span class="shimmer">{{ heroParts[0] }}</span>{{ heroParts[1] }}</template>
        <template v-else>{{ heroTitle }}</template>
      </h1>
      <p class="hero-sub">{{ site.info.subtitle }}</p>
    </header>

    <main class="timeline-zone">
      <div v-if="loading && !articles.length" class="placeholder">正在加载微光…</div>
      <div v-else-if="error" class="placeholder err">{{ error }}</div>
      <div v-else-if="!articles.length" class="placeholder">
        还没有文章。{{ auth.isLoggedIn ? '去控制台写下第一篇吧。' : '登录后即可发布内容。' }}
      </div>
      <TimelineList v-else :articles="articles" />

      <div v-if="articles.length < total" class="more">
        <button class="btn" :disabled="loading" @click="loadMore">
          {{ loading ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import http, { errMsg } from '../api/http';
import TimelineList from '../components/TimelineList.vue';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import type { ArticleBrief } from '../types';

const auth = useAuthStore();
const site = useSiteStore();
// 标题取自站点配置；默认「微光博客」保留「微光」渐变高亮
const heroTitle = computed(() => site.info.title?.trim() || '微光博客');
const heroParts = computed<[string, string] | null>(() =>
  heroTitle.value.length > 2 && heroTitle.value.endsWith('博客')
    ? [heroTitle.value.slice(0, -2), '博客']
    : null,
);
const articles = ref<ArticleBrief[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 8;
const loading = ref(false);
const error = ref('');

async function fetchPage(p: number) {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await http.get<{ items: ArticleBrief[]; total: number }>('/articles', {
      params: { page: p, pageSize },
    });
    articles.value = p === 1 ? data.items : [...articles.value, ...data.items];
    total.value = data.total;
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  page.value += 1;
  fetchPage(page.value);
}

onMounted(() => fetchPage(1));
</script>

<style scoped>
.home {
  padding: 0 22px 100px;
}

.hero {
  max-width: var(--content-w);
  margin: 0 auto;
  padding: 150px 0 54px;
  text-align: center;
}

.hero-title {
  font-size: clamp(34px, 6vw, 56px);
  font-weight: 800;
  letter-spacing: 3px;
  line-height: 1.2;
  color: #ffffff;
}

.shimmer {
  color: #ffffff;
}

.hero-sub {
  margin-top: 16px;
  font-size: 15px;
  letter-spacing: 1px;
  color: var(--text-dim);
}

.timeline-zone {
  /* 比正文区更宽，卡片才有横向错落与弯曲连线的空间 */
  max-width: var(--timeline-w, 1280px);
  margin: 0 auto;
}

.placeholder {
  padding: 60px 0;
  text-align: center;
  color: var(--text-dim);
  font-size: 15px;
}

.placeholder.err {
  color: #ff9b9b;
}

.more {
  display: flex;
  justify-content: center;
  margin-top: 54px;
}
</style>
