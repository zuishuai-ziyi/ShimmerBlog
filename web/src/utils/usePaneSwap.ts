import { ref } from 'vue';

/**
 * 页内切换（tab / 登录模式）共用的高度过渡。
 *
 * 只用 <Transition mode="out-in"> 的话，离场结束到进场开始之间新内容还没挂载，
 * 容器会瞬间塌成 0：外层面板高度跳一下、下面的内容被扯上来又弹回去。
 * 这里在离场前锁住当前高度，进场时用 220ms 补间到新内容的自然高度，
 * 进场结束后清掉内联高度，交还给内容自适应。
 *
 * 直接写 el.style 而不是绑 :style —— Vue 的样式更新是异步的，
 * 想靠「改对象 + el.offsetHeight」在中间强制回流拿不到新值，
 * 会退化成「同帧修改 transition 与 height」，浏览器不补间。
 *
 * 用法：
 *   const { swapHost, swapHandlers } = usePaneSwap();
 *   <div ref="swapHost">
 *     <Transition name="swap" mode="out-in" v-on="swapHandlers"> ... </Transition>
 *   </div>
 *
 * 注意 swapHandlers 的键必须是裸事件名（beforeLeave）：v-on="obj" 会经 toHandlerKey
 * 拼成 onBeforeLeave，写成 onBeforeLeave 就变成了 onOnBeforeLeave，钩子静默不触发。
 */
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const DURATION = 220;

export function usePaneSwap() {
  const swapHost = ref<HTMLElement | null>(null);
  let locked = 0;
  let gen = 0; // 每次开始进场/重置都递增，防止上一轮的 rAF 回调迟到后改错高度

  const reduced = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  function reset() {
    locked = 0;
    gen += 1;
    const el = swapHost.value;
    if (!el) return;
    el.style.transition = '';
    el.style.height = '';
    el.style.overflow = '';
  }

  function onBeforeLeave() {
    const el = swapHost.value;
    if (!el || reduced()) return;
    locked = Math.round(el.getBoundingClientRect().height);
    // overflow: hidden 是必要的：新内容可能比锁定的高度高，补间期间不能溢出到面板外面
    el.style.transition = 'none';
    el.style.overflow = 'hidden';
    el.style.height = `${locked}px`;
  }

  function onBeforeEnter() {
    const el = swapHost.value;
    if (!el || reduced() || !locked) return;
    gen += 1;
    const mine = gen;
    // 先把过渡声明好（此时高度仍是锁定值）并强制回流，之后改高度才会补间
    el.style.transition = `height ${DURATION}ms ${EASE}`;
    void el.offsetHeight;
    // 量高度要等到下一帧：beforeEnter 里新内容未必已经落进 DOM，量到旧元素就永远是 locked
    requestAnimationFrame(() => {
      if (mine !== gen) return;
      const child = el.firstElementChild as HTMLElement | null;
      const target = Math.round(child ? child.getBoundingClientRect().height : el.scrollHeight);
      if (target > 0) el.style.height = `${target}px`;
    });
  }

  return {
    swapHost,
    swapHandlers: { beforeLeave: onBeforeLeave, beforeEnter: onBeforeEnter, afterEnter: reset, leaveCancelled: reset },
  };
}
