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

      <!-- 滚动哨兵：进入视口（提前 400px）即自动加载下一页 -->
      <div v-if="articles.length" ref="sentinel" class="sentinel">
        <span v-if="loading" class="sentinel-text loading"><i class="spinner" />正在加载…</span>
        <span v-else-if="moreError" class="sentinel-text failed">加载失败，点击<button type="button" class="inline-link" @click="loadMore">此处</button>重试</span>
        <span v-else-if="hasMore" class="sentinel-text idle">继续上滑加载更多</span>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
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
const page = ref(0); // 已成功加载的页码
const pageSize = 8;
const loading = ref(false);
const error = ref(''); // 首屏错误（整页占位）
const moreError = ref(''); // 加载后续页失败（列表保留，可重试）
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const hasMore = computed(() => articles.value.length < total.value);

async function fetchPage(p: number) {
  if (loading.value) return;
  loading.value = true;
  try {
    const { data } = await http.get<{ items: ArticleBrief[]; total: number }>('/articles', {
      params: { page: p, pageSize },
    });
    articles.value = p === 1 ? data.items : [...articles.value, ...data.items];
    total.value = data.total;
    page.value = p;
    error.value = '';
    moreError.value = '';
  } catch (e) {
    // 首屏失败显示整页占位；后续页失败只提示、不清空已有列表（且不推进页码）
    if (p === 1) error.value = errMsg(e);
    else moreError.value = errMsg(e);
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return;
  fetchPage(page.value + 1);
}

onMounted(async () => {
  await fetchPage(1);
  // 等首屏列表渲染完，哨兵元素已存在后再挂观察器
  await nextTick();
  // 滚动到底部附近自动续页；rootMargin 提前 400px 预加载，滚动不等待
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((en) => en.isIntersecting)) loadMore();
    },
    { rootMargin: '400px 0px' },
  );
  if (sentinel.value) observer.observe(sentinel.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
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

.sentinel {
  display: flex;
  justify-content: center;
  padding: 40px 0 10px;
  min-height: 1px;
}

.sentinel-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--text-dim);
}

.sentinel-text.loading {
  color: var(--accent);
}

.sentinel-text.idle {
  color: rgba(205, 226, 238, 0.32);
}

.spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(140, 198, 226, 0.25);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sentinel-text.failed {
  /* 不要 Inline-Flex 的 gap：否则「加载失败，点击」「此处」「重试」之间被拉开 8px */
  display: inline-block;
  color: rgba(255, 155, 155, 0.7);
}

/* 仅「此处」可点击，文字样式与整句一致 */
.inline-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: #ff9b9b;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 0.2s;
}

.inline-link:hover {
  color: #ffd0d0;
}

</style>
