import { defineStore } from 'pinia';
import { computed, onMounted, onUnmounted, ref } from 'vue';

/**
 * 全局轮询状态：顶栏「加载中」指示器的数据源。
 * active 为正在进行的轮询请求数（>0 即显示指示器）。
 */
export const usePollingStore = defineStore('polling', () => {
  const active = ref(0);
  const busy = computed(() => active.value > 0);

  /** 包裹一次轮询请求：进入时计数 +1，结束（含异常）时 -1 */
  async function track<T>(fn: () => Promise<T>): Promise<T> {
    active.value += 1;
    try {
      return await fn();
    } finally {
      active.value = Math.max(0, active.value - 1);
    }
  }

  return { active, busy, track };
});

/**
 * 组合式轮询：组件挂载后按固定间隔静默执行 fn。
 * - 挂载时不立即执行（首屏数据由页面自己负责，不会让指示器闪一下）
 * - 页面不可见（document.hidden）时跳过本次
 * - 执行包在 store.track() 里，顶栏指示器随之亮起 / 熄灭
 * - 失败静默（不弹提示、不打断页面）
 * - 组件卸载时清除定时器
 *
 * @param fn        每次轮询要执行的异步任务（内部自行处理错误更稳妥）
 * @param intervalMs 轮询间隔（毫秒）
 * @param shouldRun 额外的跳过条件（如「当前不在目标 tab」）；返回 false 时本次不执行
 * @param enabled   整体开关（如「已登录」）；返回 false 时不创建定时器。
 *                  开关变化时由调用方调用返回的 start()/stop() 启停。
 */
export function useSilentPolling(
  fn: () => Promise<unknown>,
  intervalMs = 5000,
  shouldRun?: () => boolean,
  enabled?: () => boolean,
) {
  const polling = usePollingStore();
  let timer: ReturnType<typeof setInterval> | undefined;

  async function tick() {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (enabled && !enabled()) return;
    if (shouldRun && !shouldRun()) return;
    try {
      await polling.track(fn);
    } catch {
      /* 静默：轮询失败不打扰用户 */
    }
  }

  function start() {
    if (timer !== undefined) return;
    // 开关关闭时不创建定时器（如未登录时的登录门：轮询会打出 401）
    if (enabled && !enabled()) return;
    timer = setInterval(tick, intervalMs);
  }

  function stop() {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  onMounted(start);
  onUnmounted(stop);

  return { stop, start };
}
