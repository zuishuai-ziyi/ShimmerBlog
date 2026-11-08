<template>
  <StarField v-if="!bareLayout" />
  <TopBar v-if="!bareLayout" />
  <div class="app-root">
    <div class="app-shell">
      <router-view />
    </div>
    <SiteFooter v-if="!bareLayout" />
  </div>

  <!-- 站外链接二次确认气泡：确认后才新标签页打开 -->
  <ExternalLinkConfirm
    :open="extOpen"
    :href="extHref"
    :anchor="extAnchor"
    :return-focus-el="extReturnFocusEl"
    @confirm="onConfirmExternal"
    @cancel="onCancelExternal"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import StarField from './components/StarField.vue';
import TopBar from './components/TopBar.vue';
import SiteFooter from './components/SiteFooter.vue';
import ExternalLinkConfirm, { type ExternalLinkAnchor } from './components/ExternalLinkConfirm.vue';

// 管理后台使用独立界面，不叠加前台顶栏与星空
const route = useRoute();
// 审核后台同样是独立界面（与 /admin 一致）：不显示前台顶栏、星空与页脚
const bareLayout = computed(() => route.name === 'admin' || route.name === 'review');

/* ---------------- 站外链接确认气泡 ---------------- */
/* 气泡状态：链接地址、锚点位置、关闭后归还焦点的元素 */
const extOpen = ref(false);
const extHref = ref('');
const extAnchor = shallowRef<ExternalLinkAnchor | null>(null);
const extReturnFocusEl = shallowRef<HTMLElement | null>(null);

/**
 * 全局拦截站外链接点击（捕获阶段）：
 * 站内链接、下载链接、mailto/tel 等一律放过，只把站外 http(s) 链接交给气泡确认。
 */
function handleClick(e: MouseEvent) {
  // 已有组件处理过这次点击
  if (e.defaultPrevented) return;
  // 只拦左键
  if (e.button !== 0) return;
  // 按住 Ctrl/Cmd/Shift/Alt 时保持浏览器原生行为（新标签页/新窗口）
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const el = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!el) return;

  // 逃生口：下载链接、显式标记不需要确认的链接
  if (el.hasAttribute('download')) return;
  if (el.dataset.noExternalConfirm !== undefined) return;
  if (el.dataset.externalConfirm === 'off') return;

  const raw = el.getAttribute('href') || '';
  if (/^(mailto:|tel:|javascript:)/i.test(raw.trim())) return;

  let url: URL;
  try {
    url = new URL(raw, location.href);
  } catch {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // 站内链接一律放过（含 /api/auth/* 的 OAuth 跳转、/uploads/* 静态资源）
  if (url.origin === location.origin) return;

  // 只拦默认跳转，不 stopPropagation，避免影响组件内其它点击逻辑
  e.preventDefault();

  const r = el.getBoundingClientRect();
  extHref.value = url.href;
  extAnchor.value = {
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
  extReturnFocusEl.value = el;
  extOpen.value = true;
}

/** 确认前往：新标签页打开外链（被弹窗拦截时不跳转兜底，仅关闭气泡） */
function onConfirmExternal() {
  const href = extHref.value;
  extOpen.value = false;
  if (href) window.open(href, '_blank', 'noopener,noreferrer');
}

/** 取消：不跳转，关闭气泡 */
function onCancelExternal() {
  extOpen.value = false;
}

/** 路由变化时关闭气泡：
 *  键盘 Tab+Enter 激活链接导航不会产生 pointerdown，拦截不到，气泡会残留在新页面上 */
watch(
  () => route.fullPath,
  () => {
    extOpen.value = false;
  }
);

onMounted(() => {
  document.addEventListener('click', handleClick, true);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClick, true);
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #000;
  color: var(--text);
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

.app-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-shell {
  position: relative;
  z-index: 1;
  flex: 1 0 auto;
}

/* 页面通用容器 */
.page {
  max-width: var(--content-w);
  margin: 0 auto;
  padding: 120px 22px 80px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  background: none;
  color: #ffffff;
}

.muted {
  color: var(--text-dim);
  font-size: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.field > label {
  font-size: 13px;
  color: var(--text-dim);
}

input,
textarea,
select {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  /* 输入框：比所在毛玻璃面板更亮一档（淡蓝），避免叠加纯黑后发黑 */
  background: var(--field-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus,
textarea:focus,
select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(140, 198, 226, 0.16);
}

textarea {
  resize: vertical;
  line-height: 1.7;
}

button {
  font-family: inherit;
  cursor: pointer;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  background: var(--fill);
  border: none;
  border-radius: 999px;
  transition: background 0.2s, filter 0.2s;
}

/* 悬停只变底色，不做上浮位移 */
.btn:hover:not(:disabled) {
  background: var(--fill-hover);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-ghost {
  padding: 9px 18px;
  font-size: 14px;
  color: var(--text);
  background: rgba(140, 198, 226, 0.1);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s;
}

.btn-ghost:hover {
  background: rgba(140, 198, 226, 0.2);
}

.btn-danger {
  padding: 9px 18px;
  font-size: 14px;
  color: #ffd9d9;
  background: rgba(220, 60, 60, 0.18);
  border: 1px solid rgba(255, 120, 120, 0.4);
  border-radius: 999px;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.btn-danger:hover {
  background: rgba(220, 60, 60, 0.3);
}

.error-tip {
  color: #ff9b9b;
  font-size: 13px;
  margin-top: 6px;
}
</style>
