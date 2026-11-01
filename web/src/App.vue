<template>
  <StarField v-if="route.name !== 'admin'" />
  <TopBar v-if="route.name !== 'admin'" />
  <StarTransitionCanvas v-if="route.name !== 'admin'" />
  <div class="app-root">
    <div class="app-shell">
      <router-view v-slot="{ Component, route: viewRoute }">
        <Transition
          :name="starMode ? 'star' : 'fade'"
          mode="out-in"
          :duration="{ enter: 2800, leave: 700 }"
          @before-leave="onBeforeLeave"
          @enter="onEnter"
        >
          <component :is="Component" :key="viewRoute.path" />
        </Transition>
      </router-view>
    </div>
    <SiteFooter v-if="route.name !== 'admin'" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StarField from './components/StarField.vue';
import StarTransitionCanvas from './components/StarTransitionCanvas.vue';
import TopBar from './components/TopBar.vue';
import SiteFooter from './components/SiteFooter.vue';
import {
  createStarMask,
  ENTER_GROW_MS,
  ENTER_STAGGER_MS,
  ENTER_TAIL_MS,
  LEAVE_MS,
  planViewportWindows,
  planWindows,
  sampleContent,
  starTransition,
  type DissolveWindow,
  type StarMaskHandle,
} from './utils/starTransition';
import { scrollGate } from './utils/scrollGate';

// 管理后台使用独立界面，不叠加前台顶栏与星空
const route = useRoute();
const router = useRouter();

/**
 * 页面切换星光过渡：
 * - 离场：内容元素化作蓝色星光光点消散（before-leave 采样 DOM，同时 CSS 模糊淡出）
 * - 入场：星光全部锚定内容区域，等新页布局真正落定（MutationObserver 静默判定，
 *   采样到的是最终位置而非加载占位盒）后，从上一页内容所在区域起飞聚合，内容随后凝结浮现
 * - 后台（admin）进出、首次加载、系统「减少动态效果」时降级为普通淡入淡出
 */
const reducedMotion =
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const starMode = ref(false);

router.beforeEach((to, from) => {
  starMode.value = !reducedMotion && from.matched.length > 0 && to.name !== 'admin' && from.name !== 'admin';
  // 星光过渡期间挂起滚动复位（见 utils/scrollGate.ts）：
  // 否则离场一开始视口就被弹回顶部，按旧滚动位置规划的消散小窗全部落到画面外。
  // 位置改由 onEnter 在「旧页已卸载、新页仍被蒙版遮住」时应用，视觉无位移跳变。
  if (starMode.value) scrollGate.hold();
  else scrollGate.take(); // 降级模式：清掉可能残留的挂起（导航被中途改道时）
});

function onBeforeLeave(el: Element) {
  if (!starMode.value) return;
  const target = el as HTMLElement;
  // 关键：结束上次入场用 WAAPI 打的「凝结」动画 —— fill:'both' 的 forwards 填充
  // 会一直占住 opacity/filter，且动画级联优先级高于类样式，会把离场的
  // 模糊淡出（.star-leave-to）整个压死（卡片全程清晰然后被直接卸载）
  target.getAnimations().forEach((a) => a.cancel());
  // 同理：清掉入场反向蒙版注入的内联 animation / mask（内联样式优先级高于类，
  // 不清会压死 .star-leave-active 里的 star-dissolve-svg，第二次导航起消失动画失效）。
  // 清完随即重注入离场蒙版，同帧同步无闪黑
  target.style.animation = '';
  ['mask-image', '-webkit-mask-image', 'mask-repeat', '-webkit-mask-repeat'].forEach((p) =>
    target.style.removeProperty(p)
  );
  // 逐星小蒙版消散：按内容密度规划一批小收缩窗（每个窗中心对应一颗星），
  // 内联 SVG mask（黑底 + 每窗一个白软边圆，CSS r transition 驱动收缩）——
  // 窗内正常显示、窗外隐藏，各窗坍缩时窗心那颗星亮起（每颗星对应一个蒙版）
  const rects = sampleContent(target);
  const wins = planWindows(rects);
  const er = target.getBoundingClientRect();
  // 视口坐标 → 元素坐标（mask userSpaceOnUse 以元素左上角为原点）
  const mask = createStarMask(
    target,
    wins.map((w) => ({ cx: w.cx - er.left, cy: w.cy - er.top, r0: w.r0 })),
    er.width,
    er.height,
    'shrink',
    LEAVE_MS,
    60,
  );
  target.style.setProperty('mask-image', `url(#${mask.id})`);
  target.style.setProperty('-webkit-mask-image', `url(#${mask.id})`);
  mask.fire();
  starTransition.dissolve(rects, wins);
}

/**
 * 注入入场反向蒙版：初始全 0 尺寸（内容全隐藏），star-reveal 动画从窗心长大。
 * 每窗终点尺寸至少要能从窗心长满整个元素（取到元素最远角），
 * 否则页尾会永远藏在蒙版外。
 */
function revealEnterMask(el: HTMLElement, wins: DissolveWindow[]): StarMaskHandle {
  const rect = el.getBoundingClientRect();
  // 蒙版坐标系原点 = 元素 border box 左上角（userSpaceOnUse），
  // 所以窗心只需「视口坐标 − 元素视口左上角」，不能带滚动量。
  // 蒙版尺寸取元素与视口的较大者：入场窗是视口格网，元素比视口矮时
  // （加载占位、短文页面）也要盖满整个视口。
  const handle = createStarMask(
    el,
    wins.map((w) => ({ cx: w.cx - rect.left, cy: w.cy - rect.top, r0: w.r0 })),
    Math.max(rect.width, window.innerWidth),
    Math.max(rect.height, window.innerHeight),
    'grow',
    ENTER_GROW_MS,
    0,
  );
  el.style.setProperty('mask-image', `url(#${handle.id})`);
  el.style.setProperty('-webkit-mask-image', `url(#${handle.id})`);
  return handle;
}

function onEnter(el: Element) {
  if (!starMode.value) return;
  const target = el as HTMLElement;
  // 滚动复位：星光过渡期间被 scrollGate 挂起的目的位置（router 的 scrollBehavior
  // 已挂起）。不能在这里立刻滚：新页此刻往往只有加载占位盒（实测挂载瞬间 docH=900，
  // 落定后 3071），scrollTo(1100) 会被浏览器钳到 0，而 vue-router 的位置恢复只发生
  // 这一次 —— 后退回来的滚动位置就永久丢了（实测：后退始终回到顶部）。
  // 改为在布局落定（settle）时、建蒙版之前应用：此时高度已是最终值，且整页仍全透明，
  // 位移不可见；蒙版窗也是按滚动后的坐标系规划的。
  const pendingScroll = scrollGate.take();
  // 挂起到落位之间用户可能自己滚了一下（滚轮/触摸/方向键）—— 那就不要再用程序化位置把人拽走。
  // 入场期间元素 pointer-events: none，但滚轮作用在文档上仍然生效，必须显式把关。
  let userScrolled = false;
  const markUserScroll = () => {
    userScrolled = true;
  };
  const passiveOnce = { passive: true, once: true } as AddEventListenerOptions;
  window.addEventListener('wheel', markUserScroll, passiveOnce);
  window.addEventListener('touchmove', markUserScroll, passiveOnce);
  window.addEventListener('keydown', markUserScroll, passiveOnce);
  const applyPendingScroll = () => {
    window.removeEventListener('wheel', markUserScroll);
    window.removeEventListener('touchmove', markUserScroll);
    window.removeEventListener('keydown', markUserScroll);
    if (!pendingScroll || userScrolled) return;
    window.scrollTo({
      left: pendingScroll.left ?? 0,
      top: pendingScroll.top ?? 0,
      behavior: 'instant' as ScrollBehavior,
    });
    // 已经在飞的星光不跟着滚动平移走（旧页已卸载，它们属于屏幕坐标）
    starTransition.resetScrollBaseline();
  };
  // 先整页透明隐藏。不能一上来就建 r=0 生长蒙版：蒙版尺寸/窗口在创建那一刻就固化，
  // 而文章页这类异步页面挂载时只有「正在加载…」占位盒（矮掉一半），
  // 数据到达后元素变高，蒙版只盖住旧高度 —— 下半截要等蒙版移除才「啪」地出现
  // （用户反馈的「内容闪一下后直接加载出来」根因）。改为落定后按真实内容建蒙版。
  target.style.opacity = '0';
  let enterMask: StarMaskHandle | null = null;
  let maskH = 0;
  // 等新页布局真正落定再一次性布目标 —— 之前 enter+16ms 就采样，
  // 采到的是异步数据加载前的占位盒，光点目标 ≠ 内容实际显示位置。
  // 起飞起点锚定上一页内容区域（引擎内记录），全程不出现无关空白区。
  requestAnimationFrame(() => {
    let hold = 0;
    let fired = false;
    // 按当前真实布局规划窗口并建生长蒙版（r=0 全隐）
    // 入场窗铺在视口格网上（planViewportWindows，与内容无关）：异步内容晚到时
    // 也必定落在正在生长的蒙版前沿内，不会出现「一片内容同步跳出」
    const buildMask = () => {
      const rects = sampleContent(target);
      const wins = planViewportWindows(window.innerWidth, window.innerHeight);
      enterMask = revealEnterMask(target, wins);
      maskH = Math.max(target.offsetHeight, window.innerHeight);
      return rects;
    };
    // 布局落定判定：监听子树变化，连续 60ms 无任何 DOM 变化即视为落定；
    // 650ms 硬上限兜底持续变化的页面（加载指示器、无限滚动等）
    const settle = () => {
      if (fired) return;
      fired = true;
      obs.disconnect();
      clearTimeout(hold);
      clearTimeout(cap);
      // 先落位再规划蒙版：此时内容高度已到最终值，scrollTo 不会被钳住；
      // 蒙版窗/光点目标都要按落位后的视口坐标算。
      applyPendingScroll();
      const rects = buildMask();
      // 同一帧内：蒙版(r=0)先接管隐藏，再撤掉透明 —— 视觉连续不闪
      if (enterMask) target.style.removeProperty('opacity');
      const flyMs = starTransition.gather(rects ?? sampleContent(target));
      // 先「光点消失」、再「新元素展开」：反向蒙版一直停在 r=0（内容全隐），
      // 等最后一颗星光落定熄灭（gather 返回的毫秒数）之后才开始从窗心长出。
      // 于是整段过渡是严格的三段式：旧页蚀空 → 光点出现/飞走 → 新页展开。
      setTimeout(() => {
        if (enterMask) {
          // 落定后元素还可能再长高（图片/字体/异步摘要）：超出蒙版就重建，
          // 同时把之前可能被钳住的滚动位置补一次（滞后数据的长页面）
          if (target.offsetHeight > maskH + 8) {
            enterMask.dispose();
            applyPendingScroll();
            buildMask();
          }
          enterMask.fire();
          // 蒙版长满（阶段1 渐显 + 阶段2 补边距 + 错峰）后移除内联 SVG 与引用
          const m = enterMask;
          setTimeout(() => {
            ['mask-image', '-webkit-mask-image'].forEach((p) => target.style.removeProperty(p));
            m.dispose();
          }, ENTER_GROW_MS + ENTER_TAIL_MS + ENTER_STAGGER_MS + 60);
          // 指针事件在蒙版基本长满（内容全露出）后恢复；mask 不影响命中测试，必须手动把关
          setTimeout(() => {
            target.style.pointerEvents = 'auto';
          }, ENTER_GROW_MS);
        } else {
          target.style.removeProperty('opacity');
          target.animate(
            [
              { opacity: 0, filter: 'blur(7px) brightness(1.25)' },
              { opacity: 1, filter: 'blur(0px) brightness(1)' },
            ],
            { duration: 260, easing: 'ease', fill: 'both' }
          );
          setTimeout(() => {
            target.style.pointerEvents = 'auto';
          }, 280);
        }
      }, flyMs);
    };
    const obs = new MutationObserver(() => {
      clearTimeout(hold);
      hold = window.setTimeout(settle, 60);
    });
    obs.observe(target, { childList: true, subtree: true, attributes: true, characterData: true });
    const cap = setTimeout(() => {
      obs.disconnect();
      settle(); // 硬上限：650ms 后无论如何都开始聚合
    }, 650);
    hold = window.setTimeout(settle, 60);
  });
}
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

/* ---------- 路由切换过渡：星光模式 / 降级淡入淡出 ---------- */

/* 离场：逐星小蒙版（SVG mask 由 onBeforeLeave 注入：每窗一个径向渐变圆挂
   metaball 液态滤镮，相邻圆边缘融合成液体状；圆半径用 CSS r transition 收缩，
   每个窗中心对应一颗星光）；这里只做元素级的提亮/模糊/淡出，与圆收缩同一节奏 */
.star-leave-active {
  animation: star-dissolve-svg 0.56s cubic-bezier(0.4, 0, 0.7, 0.4) forwards;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}
.star-leave-to {
  opacity: 0;
}
@keyframes star-dissolve-svg {
  0% {
    opacity: 1;
    filter: brightness(1);
  }
  30% {
    opacity: 1;
    filter: brightness(1.3);
  }
  75% {
    opacity: 1;
    filter: brightness(1.35) blur(0.5px);
  }
  100% {
    opacity: 0;
    filter: brightness(1.45) blur(1px);
  }
}

/* 星光过渡期间（引擎加 html.st-active）压暗背景星空：过渡光点从背景里跳出来 */
.starfield {
  transition: opacity 0.35s ease;
}
html.st-active .starfield {
  opacity: 0.4;
}

/* 进入：内容先用 SVG 生长蒙版隐藏（onEnter，各窗 r=0 即全隐藏），
   布局落定后圆长大 = 消散收缩的时间镜像（同样带 metaball 液态融合，
   半径长满全元素）；这里只负责过渡期的指针拦截 */
.star-enter-active {
  pointer-events: none;
}

/* 降级模式（后台 / 减少动态效果）：快速淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
