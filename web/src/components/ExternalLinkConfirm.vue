<script lang="ts">
/**
 * 外链确认气泡：点击站外链接时在链接旁弹出，确认后才新标签页打开。
 * 锚点位置只用 DOMRect 的这 6 个数值，方便父组件传递。
 */
export interface ExternalLinkAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
</script>

<script setup lang="ts">
/**
 * 外链确认气泡（自绘浮层，非模态）：
 * - 不用 showModal()：原生 dialog 顶层会压住 Google 挑战弹层（z-index ≈ 2e9），
 *   这里改用 Teleport to body + position: fixed 自绘，无遮罩、不锁滚动；
 * - 位置：水平对齐锚点中心并在视口内夹紧（左右各留 12px），
 *   垂直优先放在锚点下方，空间不足翻到上方，箭头方向随之切换；
 * - 关闭：取消按钮 / Esc / 点击气泡外 / 页面滚动 / 窗口缩放，均不跳转。
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  /** 完整外链地址（绝对 URL） */
  href: string;
  /** 被点击链接在视口中的位置 */
  anchor: ExternalLinkAnchor | null;
  /** 关闭后把焦点还给这个元素（通常是原链接） */
  returnFocusEl?: HTMLElement | null;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

/* 气泡最大宽度（与样式里的 min(268px, calc(100vw - 24px)) 对应） */
const POP_MAX_WIDTH = 268;
/* 气泡与视口边缘的最小留白 */
const VIEWPORT_PAD = 12;
/* 气泡与锚点之间的间距（箭头长度也在其中） */
const ANCHOR_GAP = 12;
/* 首帧还没量到真实高度时的兜底估算 */
const POP_FALLBACK_HEIGHT = 168;
/* 箭头（气泡轮廓上的小三角）：根部半宽与高度，两腰 45° */
const ARROW_HALF = 6;
const ARROW_HEIGHT = 6;

const uid = useId();
const titleId = `ext-link-title-${uid}`;
/* 气泡阴影用的 SVG 滤镜 id（每个实例唯一） */
const shadowFilterId = `ext-link-shadow-${uid}`;

const popEl = ref<HTMLElement | null>(null);
const goBtn = ref<HTMLButtonElement | null>(null);

/* 气泡在视口中的落点 */
const pos = reactive({ left: 0, top: 0 });
/* 气泡在锚点的上方还是下方（决定箭头朝向） */
const placement = ref<'top' | 'bottom'>('bottom');
/* 箭头横坐标（相对气泡左边缘） */
const arrowLeft = ref(0);
/* 气泡实测尺寸，用于视口内夹紧与上下翻转判断 */
const measured = reactive({ width: 0, height: 0 });
/* 气泡圆角半径：从计算样式读取，与 --radius-lg 保持一致 */
const radius = ref(0);

const popStyle = computed(() => ({
  left: `${pos.left}px`,
  top: `${pos.top}px`,
}));

/** 箭头在气泡轮廓上的横坐标：始终指向锚点中心，
 *  但要夹在圆角之外（圆角半径 + 箭头半宽），否则箭头会压在圆弧上、接缝明显 */
const arrowX = computed(() => {
  const w = measured.width || POP_MAX_WIDTH;
  const min = radius.value + ARROW_HALF;
  const max = Math.max(min, w - min);
  return Math.min(Math.max(arrowLeft.value, min), max);
});

/* 气泡外形路径（圆角矩形 + 箭头） */
const shapePath = computed(() => {
  const w = measured.width;
  const h = measured.height;
  if (!w || !h) return '';
  // placement=bottom：气泡在锚点下方 → 箭头长在气泡顶部朝上；反之长在底部朝下
  return buildOutline(w, h, radius.value, arrowX.value, placement.value === 'top' ? 'bottom' : 'top');
});

/**
 * 生成气泡外形路径：圆角矩形 + 一个小三角（箭头）。
 * 三角与边框共用同一条闭合路径：
 *  - 填充一次成形，不会因半透明叠加而出现深色接缝；
 *  - 描边自然绕过箭头、与边框连成一体，箭头根部不会出现第四条横线。
 * edge='top' 箭头长在顶部（朝上），edge='bottom' 长在底部（朝下）。
 */
function buildOutline(w: number, h: number, r: number, cx: number, edge: 'top' | 'bottom'): string {
  const half = ARROW_HALF;
  const tail = ARROW_HEIGHT;
  const f = (n: number) => Math.round(n * 100) / 100;
  const p = (x: number, y: number) => `${f(x)} ${f(y)}`;
  const rr = f(r);
  if (edge === 'top') {
    // 顺时针：顶边（带箭头凸起）→ 右边 → 底边 → 左边
    return [
      `M ${p(cx - half, 0)}`,
      `L ${p(cx, -tail)}`,
      `L ${p(cx + half, 0)}`,
      `L ${p(w - r, 0)}`,
      `A ${rr} ${rr} 0 0 1 ${p(w, r)}`,
      `L ${p(w, h - r)}`,
      `A ${rr} ${rr} 0 0 1 ${p(w - r, h)}`,
      `L ${p(r, h)}`,
      `A ${rr} ${rr} 0 0 1 ${p(0, h - r)}`,
      `L ${p(0, r)}`,
      `A ${rr} ${rr} 0 0 1 ${p(r, 0)}`,
      'Z',
    ].join(' ');
  }
  // 顺时针：顶边 → 右边 → 底边（带箭头凸起）→ 左边
  return [
    `M ${p(r, 0)}`,
    `L ${p(w - r, 0)}`,
    `A ${rr} ${rr} 0 0 1 ${p(w, r)}`,
    `L ${p(w, h - r)}`,
    `A ${rr} ${rr} 0 0 1 ${p(w - r, h)}`,
    `L ${p(cx + half, h)}`,
    `L ${p(cx, h + tail)}`,
    `L ${p(cx - half, h)}`,
    `L ${p(r, h)}`,
    `A ${rr} ${rr} 0 0 1 ${p(0, h - r)}`,
    `L ${p(0, r)}`,
    `A ${rr} ${rr} 0 0 1 ${p(r, 0)}`,
    'Z',
  ].join(' ');
}

/** 量一次气泡实际尺寸（宽度由 CSS 固定，高度随 URL 行数变化）
 *  用 offsetWidth/offsetHeight 而不是 getBoundingClientRect()：入场动画带 scale(.98)，
 *  rect 会把缩放后的尺寸算进来，导致夹紧计算偏小。 */
function measure() {
  const el = popEl.value;
  if (!el) return;
  if (el.offsetWidth > 0) measured.width = el.offsetWidth;
  if (el.offsetHeight > 0) measured.height = el.offsetHeight;
  // 圆角半径与 SVG 轮廓共用同一个值，避免描边和气泡边框对不上
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  if (!Number.isNaN(r)) radius.value = r;
}

/** 依据锚点与视口计算气泡落点与箭头位置 */
function reposition() {
  const a = props.anchor;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = measured.width || POP_MAX_WIDTH;
  const h = measured.height || POP_FALLBACK_HEIGHT;

  if (!a) {
    // 没有锚点信息时贴视口顶部居中，保证气泡可见
    pos.left = Math.max(VIEWPORT_PAD, Math.round((vw - w) / 2));
    pos.top = VIEWPORT_PAD;
    placement.value = 'bottom';
    arrowLeft.value = Math.round(w / 2);
    return;
  }

  // 水平：气泡中心对齐锚点中心，再夹进视口（左右各留 12px）
  const anchorCx = a.left + a.width / 2;
  const maxLeft = Math.max(VIEWPORT_PAD, vw - VIEWPORT_PAD - w);
  const left = Math.min(Math.max(anchorCx - w / 2, VIEWPORT_PAD), maxLeft);

  // 垂直：默认在锚点下方；下方放不下翻到上方；两侧都放不下时选空间大的一侧并夹进视口
  const below = a.bottom + ANCHOR_GAP;
  const above = a.top - ANCHOR_GAP - h;
  let top: number;
  let place: 'top' | 'bottom';
  if (below + h + VIEWPORT_PAD <= vh) {
    top = below;
    place = 'bottom';
  } else if (above >= VIEWPORT_PAD) {
    top = above;
    place = 'top';
  } else if (vh - below >= a.top) {
    top = Math.max(VIEWPORT_PAD, Math.min(below, vh - VIEWPORT_PAD - h));
    place = 'bottom';
  } else {
    top = Math.max(VIEWPORT_PAD, above);
    place = 'top';
  }

  pos.left = left;
  pos.top = top;
  placement.value = place;
  // 箭头始终指向锚点中心；越界由轮廓路径按圆角与箭头半宽夹紧（见 arrowX）
  arrowLeft.value = anchorCx - left;
}

/* ---------- 关闭行为 ---------- */

function onCancel() {
  emit('cancel');
}

function onConfirm() {
  emit('confirm');
}

/** Esc 关闭（捕获阶段，按钮里也能响应） */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel');
}

/** 点击气泡外关闭；点在气泡内部（含箭头）不处理 */
function onPointerDown(e: PointerEvent) {
  const t = e.target as Node | null;
  if (t && popEl.value && popEl.value.contains(t)) return;
  emit('cancel');
}

/** 缩放会让气泡与锚点脱位，直接关闭 */
function onViewportChange() {
  emit('cancel');
}

/** 页面/窗口滚动会让气泡与锚点脱位，直接关闭；
 *  但气泡内部元素自身产生的滚动不关闭，否则在气泡里滚动就会把气泡关掉 */
function onScroll(e: Event) {
  const t = e.target;
  if (t instanceof Node && popEl.value?.contains(t)) return;
  emit('cancel');
}

function addListeners() {
  window.addEventListener('keydown', onKeydown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onViewportChange);
}

function removeListeners() {
  window.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onViewportChange);
}

/* ---------- 打开 / 关闭 ---------- */

let opened = false;

watch(
  () => props.open,
  async (v) => {
    if (v) {
      if (opened) return;
      opened = true;
      await nextTick();
      measure();
      reposition();
      goBtn.value?.focus();
      addListeners();
    } else {
      if (!opened) return;
      opened = false;
      removeListeners();
      // 关闭后把焦点还给原链接，便于键盘用户继续操作
      props.returnFocusEl?.focus();
    }
  },
  { immediate: true }
);

/** 换了一个链接（或链接位置变了）：重新量尺寸并定位 */
watch(
  [() => props.href, () => props.anchor],
  async () => {
    if (!props.open) return;
    await nextTick();
    measure();
    reposition();
  }
);

onBeforeUnmount(removeListeners);
</script>

<template>
  <Teleport to="body">
    <Transition name="ext-pop">
      <!-- :data-placement 仅作 e2e / 调试锚点（气泡落点 top/bottom），无 CSS/JS 消费，勿删 -->
      <div
        v-if="open"
        ref="popEl"
        class="ext-link-pop"
        :data-placement="placement"
        :style="popStyle"
        role="dialog"
        aria-modal="false"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <!-- 气泡外形（圆角矩形 + 箭头）由一条 SVG 路径绘制：
             填充一次成形，箭头与本体之间不会出现半透明叠加的深色接缝；
             描边绕过箭头自然连成一体，箭头根部也不会多出一条横线 -->
        <svg
          class="ext-link-pop__shape"
          :width="measured.width"
          :height="measured.height"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter
              :id="shadowFilterId"
              x="-50%"
              y="-60%"
              width="200%"
              height="220%"
              color-interpolation-filters="sRGB"
            >
              <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.6" />
            </filter>
          </defs>
          <path class="ext-link-pop__outline" :d="shapePath" :filter="`url(#${shadowFilterId})`" />
        </svg>
        <p :id="titleId" class="ext-link-title">是否前往以下站点？</p>
        <p class="ext-link-url" :title="href">{{ href }}</p>
        <p class="ext-link-hint">该站点不属于本站，请仔细甄别后前往</p>
        <div class="ext-link-actions">
          <button type="button" class="ext-btn ext-btn--cancel" @click="onCancel">取消</button>
          <button ref="goBtn" type="button" class="ext-btn ext-btn--go" @click="onConfirm">前往</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 暗色玻璃气泡：1px 边框 + 克制阴影，无渐变、无霓虹
   外形（填充 + 边框 + 箭头）交给下面的 SVG 路径，这里只负责排版 */
.ext-link-pop {
  position: fixed;
  z-index: 1000;
  /* 气泡 SVG 外形（.ext-link-pop__shape 用 z-index:-1 压在文字下方）依赖父级建立层叠上下文，
     isolation 显式锁定它，防止后人删掉 z-index 后填充 + 描边整体消失 */
  isolation: isolate;
  box-sizing: border-box;
  width: min(268px, calc(100vw - 24px));
  padding: 13px 15px;
  border-radius: var(--radius-lg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  color: var(--text);
  outline: none;
}

/* 气泡外形层：贴着气泡盒子，箭头与阴影可以溢出盒子 */
.ext-link-pop__shape {
  position: absolute;
  left: 0;
  top: 0;
  z-index: -1;
  overflow: visible;
}

/* 外形轮廓：填充与边框一次画完，箭头根部不描边 → 不会出现第四条边 */
.ext-link-pop__outline {
  fill: var(--glass-bg-strong);
  stroke: var(--glass-border);
  stroke-width: 1;
}

/* 标题：比正文略大、字重 600 */
.ext-link-title {
  margin: 0 0 5px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text);
}

/* 目标地址：等宽小字，单独一行；最多 2 行后省略，避免超长 URL 撑爆气泡 */
.ext-link-url {
  margin: 0 0 7px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #e4ff00;
}

/* 提示语气：说明该站点的风险 */
.ext-link-hint {
  margin: 0 0 11px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-dim);
}

.ext-link-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 8px;
}

/* 按钮：圆角矩形（非胶囊），28px 高，0.2s 颜色过渡 */
.ext-btn {
  height: 28px;
  padding: 0 12px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  border-radius: 7px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.ext-btn:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

/* 次要按钮（取消）：透明底 + 细描边 */
.ext-btn--cancel {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: var(--text-dim);
}

.ext-btn--cancel:hover {
  border-color: rgba(255, 255, 255, 0.38);
  color: var(--text);
}

/* 主按钮（前往）：深蓝底 + 白字 */
.ext-btn--go {
  background: #1e40af;
  border: 1px solid transparent;
  color: #ffffff;
}

.ext-btn--go:hover {
  background: #1d4ed8;
  color: #ffffff;
}

.ext-btn--go:active {
  background: #1a369b;
}

/* 入场：淡入 + 轻微上移 + 缩放 */
.ext-pop-enter-active,
.ext-pop-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.ext-pop-enter-from,
.ext-pop-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}
</style>
