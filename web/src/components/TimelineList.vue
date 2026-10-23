<template>
  <div ref="wrapEl" class="timeline" :class="{ ready, animate }">
    <svg class="links" :viewBox="`0 0 ${size.w} ${size.h}`" preserveAspectRatio="none" aria-hidden="true">
      <path
        v-for="(p, i) in paths"
        :key="`l${i}`"
        :d="p.d"
        :style="{
          '--ca': p.ca,
          '--cb': p.cb,
          animationDuration: p.dur + 's',
          animationDelay: p.delay + 's',
        }"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
        class="curve"
      />
      <circle
        v-for="(p, i) in paths"
        :key="`p${i}`"
        :cx="p.x1"
        :cy="p.y1"
        r="3.5"
        class="node"
      />
    </svg>

    <div
      v-for="(a, i) in articles"
      :key="a.id"
      class="row"
      :data-article-id="a.id"
      :style="{ '--shift': (shifts[i] ?? 0) + 'px' }"
    >
      <div :ref="(el) => setCardRef(el as HTMLElement | null, i)" class="cell">
        <ArticleCard :article="a" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ArticleCard from './ArticleCard.vue';
import type { ArticleBrief } from '../types';

const props = defineProps<{ articles: ArticleBrief[] }>();

const wrapEl = ref<HTMLElement | null>(null);
const size = reactive({ w: 0, h: 0 });
type Curve = {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ca: string;
  cb: string;
  dur: number;
  delay: number;
};
const paths = ref<Curve[]>([]);

const cardEls: (HTMLElement | null)[] = [];
function setCardRef(el: HTMLElement | null, i: number) {
  cardEls[i] = el;
}

/** 稳定的伪随机（同一个 seed/salt 永远得到同一个值），用于按文章 id 派生布局 */
function prand(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** 0..1 的随机链，取值范围 -1..1 */
function rnd(seed: number, salt: number): number {
  return prand(seed, salt) * 2 - 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 连线配色池（淡蓝系，逐条随机取两色做呼吸变化）*/
const CURVE_COLORS = ['#8fc3de', '#5fa8cc', '#3490bf', '#a8d2e6', '#6fb4d4', '#c6e3f2'];

/**
 * 每张卡片的横向位置：以文章 id 为种子生成随机比例（-1..1），
 * 每篇各不相关（而非固定序列循环），刷新后位置不变。
 */
const shifts = ref<number[]>([]);

/** 计算横向偏移，返回是否发生变化（有变化需等过渡结束再重测连线）*/
function applyShifts(): boolean {
  const wrap = wrapEl.value;
  if (!wrap) return false;
  const w = wrap.getBoundingClientRect().width;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 720;
  const maxTravel = Math.max(0, (w - Math.min(470, w)) / 2);
  const next = props.articles.map((a, i) => {
    if (narrow) return 0;
    // 以文章 id 为种子：方向随机、幅度随机，少数卡片留在靠中线
    const dir = rnd(a.id, 7);
    const mag = 0.35 + Math.abs(rnd(a.id, 13)) * 0.65;
    let frac = (dir < 0 ? -1 : 1) * mag;
    if (prand(a.id, 19) < 0.2) frac *= 0.25;
    return Math.round(clamp(frac, -1, 1) * maxTravel);
  });
  const changed =
    next.length !== shifts.value.length ||
    next.some((v, i) => Math.abs(v - (shifts.value[i] ?? 0)) > 1);
  if (changed) shifts.value = next;
  return changed;
}

/** 把折点串成平滑曲线（Catmull-Rom → 三次贝塞尔），纵向保持单调 */
function smoothPath(points: { x: number; y: number }[]): string {
  const f = (n: number) => n.toFixed(1);
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    // 控制点 y 夹在两端之间，避免曲线上下回抽
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    d += ` C ${f(c1x)} ${f(c1y)}, ${f(c2x)} ${f(c2y)}, ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

let ro: ResizeObserver | null = null;
let raf = 0;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
/** 首次量完并应用位置前先隐藏，避免卡片先从中间跳到正确位置 */
const ready = ref(false);
/** 只有在窗口 resize 时才开位移过渡，加载/翻页都直接出现在正确位置 */
const animate = ref(false);
let animateTimer: ReturnType<typeof setTimeout> | null = null;

/** 卡片位移带过渡时，位移改变后需等过渡结束再量一次，否则曲线会量到中间帧 */
function settle(ms = 480) {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(measure, ms);
}

function onResize() {
  // 拖动窗口时允许平滑位移
  animate.value = true;
  if (animateTimer) clearTimeout(animateTimer);
  animateTimer = setTimeout(() => {
    animate.value = false;
  }, 600);
  schedule();
}

type Pt = { id: number; x: number; yTop: number; yBottom: number };

function measure() {
  const wrap = wrapEl.value;
  if (!wrap) return;
  // 先应用横向偏移；位移变了本次不量（卡片尚未移到新位置），稍后再量
  if (applyShifts()) {
    schedule();
    settle(animate.value ? 520 : 140);
    return;
  }
  const wRect = wrap.getBoundingClientRect();
  size.w = Math.round(wRect.width);
  size.h = Math.round(wRect.height);

  const pts: Pt[] = [];
  wrap.querySelectorAll<HTMLElement>('.row').forEach((row) => {
    const el = row.querySelector<HTMLElement>('.cell');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const id = Number(row.dataset.articleId ?? 0);
    pts.push({
      id,
      x: r.left - wRect.left + r.width / 2,
      yTop: r.top - wRect.top,
      yBottom: r.bottom - wRect.top,
    });
  });

  const list: Curve[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const x1 = a.x;
    const y1 = a.yBottom + 4;
    const x2 = b.x;
    const y2 = b.yTop - 4;
    const seed = a.id || i + 1;
    // 中间多段插值：纵向拖动 + 横向随机摆动（两端收敛到卡片中心）
    const span = Math.max(1, y2 - y1);
    const segs = clamp(Math.round(span / 48), 3, 9);
    const amp = Math.min(210, 110 + Math.abs(x2 - x1) * 0.3);
    const mid: { x: number; y: number }[] = [];
    for (let k = 1; k < segs; k++) {
      const t = k / segs;
      const envelope = Math.sin(Math.PI * t); // 两端为 0，中间最强
      const jitter = rnd(seed, 30 + k) * amp * envelope;
      mid.push({
        x: clamp(x1 + (x2 - x1) * t + jitter, 26, Math.max(26, size.w - 26)),
        y: y1 + span * t,
      });
    }
    const d = smoothPath([{ x: x1, y: y1 }, ...mid, { x: x2, y: y2 }]);
    // 每条曲线自己的两色与节奏，避免整页同步呼吸
    const ia = Math.floor(prand(seed, 3) * CURVE_COLORS.length);
    let ib = Math.floor(prand(seed, 4) * CURVE_COLORS.length);
    if (ib === ia) ib = (ib + 2) % CURVE_COLORS.length;
    list.push({
      d,
      x1,
      y1,
      x2,
      y2,
      ca: CURVE_COLORS[ia],
      cb: CURVE_COLORS[ib],
      dur: 4.5 + prand(seed, 5) * 7,
      delay: -prand(seed, 6) * 12,
    });
  }
  paths.value = list;
}

function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(measure);
}

onMounted(async () => {
  await nextTick();
  measure(); // 第一次：算出横向位置
  await nextTick();
  measure(); // 第二次：卡片已在最终位置，量连线
  ready.value = true;
  window.addEventListener('resize', onResize);
  // 字体/图片加载后高度会变，观察容器与每张卡片
  ro = new ResizeObserver(schedule);
  if (wrapEl.value) ro.observe(wrapEl.value);
  document.fonts?.ready.then(schedule).catch(() => undefined);
});

watch(
  () => props.articles,
  async () => {
    await nextTick();
    schedule();
  },
  { deep: false }
);

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  if (settleTimer) clearTimeout(settleTimer);
  if (animateTimer) clearTimeout(animateTimer);
  window.removeEventListener('resize', onResize);
  ro?.disconnect();
});
</script>

<style scoped>
.timeline {
  position: relative;
  width: 100%;
  padding: 8px 0 12px;
  /* 首次算好位置前不显示，避免卡片从中间滑动到目标位置 */
  visibility: hidden;
}

.timeline.ready {
  visibility: visible;
}

.links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 0;
}

.curve {
  fill: none;
  stroke: var(--ca, #3490bf);
  stroke-linecap: round;
  filter: drop-shadow(0 0 5px rgba(140, 198, 226, 0.4));
  /* 每条曲线的时长/延迟由内联样式覆盖，节奏各不相同 */
  animation: curve-tint 7s ease-in-out infinite;
}

.node {
  fill: var(--accent);
  filter: drop-shadow(0 0 8px rgba(180, 218, 238, 0.9));
}

@keyframes curve-tint {
  0%,
  100% {
    stroke: var(--ca);
    opacity: 0.85;
  }
  50% {
    stroke: var(--cb);
    opacity: 0.5;
  }
}

.row {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  margin-bottom: 176px;
}

.row:last-child {
  margin-bottom: 0;
}

.cell {
  width: min(470px, 100%);
  transform: translateX(var(--shift, 0));
}

/* 仅窗口 resize 时才过渡，加载与翻页直接定位 */
.timeline.animate .cell {
  transition: transform 0.45s ease;
}

@media (max-width: 720px) {
  .cell {
    width: 100%;
  }
  .row {
    margin-bottom: 64px;
  }
}
</style>
