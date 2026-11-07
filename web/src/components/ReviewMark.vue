<template>
  <!--
    流程阶段的状态标记：空心简笔画（描边 SVG，不用实心色块 / emoji）。
    颜色由外层上下文决定：在 ReviewSteps 里继承 --rs-* 主题变量，在别处回退到主题 --accent / danger / --orange。
  -->
  <span class="review-mark" :class="tone" :style="{ '--rm-size': `${size}px` }" aria-hidden="true">
    <svg :width="size" :height="size" viewBox="0 0 20 20" fill="none" class="rm-svg">
      <circle cx="10" cy="10" r="8.1" stroke="currentColor" stroke-width="1.875" />
      <!-- 已通过：勾 -->
      <path
        v-if="tone === 'done'"
        d="M6.1 10.4l2.7 2.7 5.1-5.4"
        stroke="currentColor"
        stroke-width="1.875"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <!-- 进行中：短横线 -->
      <path
        v-else-if="tone === 'current'"
        d="M6.5 10h7"
        stroke="currentColor"
        stroke-width="1.875"
        stroke-linecap="round"
      />
      <!-- 未通过：叉 -->
      <path
        v-else-if="tone === 'rejected'"
        d="M7.1 7.1l5.8 5.8M12.9 7.1l-5.8 5.8"
        stroke="currentColor"
        stroke-width="1.875"
        stroke-linecap="round"
      />
      <!-- AI 初审失败：感叹号（与「未通过」同为空心圆，靠符号 + 琥珀色区分） -->
      <g v-else-if="tone === 'error'">
        <path d="M10 5.9v5" stroke="currentColor" stroke-width="1.875" stroke-linecap="round" />
        <circle cx="10" cy="14.2" r="0.95" fill="currentColor" />
      </g>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewStepState } from '../types';

const props = withDefaults(
  defineProps<{
    /** 步骤状态：done / current / pending / rejected */
    state: ReviewStepState;
    /** AI 初审失败标记：优先于 state 决定图标 */
    error?: boolean;
    /** 图标边长（px），约 16-18 为常规，紧凑场景可再小一点 */
    size?: number;
  }>(),
  { error: false, size: 16 }
);

/** 图标形态：error 优先（state 此时可能仍是 done） */
const tone = computed(() => (props.error ? 'error' : props.state));
</script>

<style scoped>
.review-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--rm-size, 16px);
  height: var(--rm-size, 16px);
  /* 尚未进行：中性暗淡色。
     独立回退色（rgba(255,255,255,.45)），不再继承 --text-3 这类中性文字色——
     否则「未开始」的圆与旁边的中性文字同色、深色前台里看不出差别；
     浅色审核后台由 ReviewSteps 的 --rs-faint 接管，其 --text-3 取值不受影响。 */
  color: var(--rs-faint, var(--rm-pending, rgba(255, 255, 255, 0.45)));
}

/* 已通过 / 进行中：强调蓝 */
.review-mark.done,
.review-mark.current {
  color: var(--rs-accent, var(--blue, var(--accent, rgb(140 198 226))));
}

/* 未通过：danger 红 */
.review-mark.rejected {
  color: var(--rs-danger, var(--red, #ff8a8a));
}

/* AI 初审失败：琥珀 */
.review-mark.error {
  color: var(--rs-warn, var(--orange, #f0b429));
}

.rm-svg {
  display: block;
}

/* 进行中：轻脉冲环，提示当前停留在这一步 */
.review-mark.current {
  border-radius: 50%;
  animation: rm-pulse 1.8s ease-out infinite;
}

@keyframes rm-pulse {
  0% {
    box-shadow: 0 0 0 0 var(--rs-ring, rgba(140, 198, 226, 0.3));
  }
  70% {
    box-shadow: 0 0 0 6px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* 尊重系统「减少动态效果」设置 */
@media (prefers-reduced-motion: reduce) {
  .review-mark.current {
    animation: none;
  }
}
</style>
