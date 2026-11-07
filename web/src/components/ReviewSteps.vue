<template>
  <!-- 审核流程步骤条：done=已通过 / current=进行中 / pending=未开始 / rejected=被拒 -->
  <ol v-if="steps.length" class="review-steps" :class="{ compact }">
    <template v-for="(s, i) in steps" :key="`${s.key}-${i}`">
      <li v-if="i > 0" class="sep" role="presentation" aria-hidden="true">{{ compact ? '›' : '→' }}</li>
      <li class="step" :class="[s.state, { error: s.error }]">
        <ReviewMark :state="s.state" :error="!!s.error" :size="compact ? 14 : 16" />
        <span class="label">{{ s.label }}</span>
        <span v-if="s.error" class="error-text">{{ s.error_label || 'AI 初审失败' }}</span>
        <span v-else-if="s.state === 'current'" class="state-text">进行中</span>
      </li>
    </template>
  </ol>
</template>

<script setup lang="ts">
import type { ReviewStep } from '../types';
import ReviewMark from './ReviewMark.vue';

withDefaults(defineProps<{ steps: ReviewStep[]; compact?: boolean }>(), { compact: false });
</script>

<style scoped>
/*
 * 主题变量兼容：前台是深色星空（--text / --accent / --glass-border / --text-dim），
 * 审核后台是白蓝浅色（--text-1 / --blue / --border / --text-3），两套变量名都取不到时回退到硬编码值。
 * ReviewMark 通过 CSS 变量继承复用这套配色。
 * --rs-faint 只在「浅色后台 --text-3」与「深色前台 0.45 淡白」之间二选一：
 * 中间不再夹 --text-dim（深色前台的中性文字色），否则「未开始」的圆与中性文字同色、看不出差别。
 */
.review-steps {
  --rs-fg: var(--text-1, var(--text, #ffffff));
  --rs-muted: var(--text-2, var(--text-dim, rgba(255, 255, 255, 0.72)));
  --rs-faint: var(--text-3, rgba(255, 255, 255, 0.45));
  --rs-accent: var(--blue, var(--accent, rgb(140 198 226)));
  --rs-danger: var(--red, #ff8a8a);
  /* AI 初审失败：浅色审核后台取 --orange，深色前台回退亮琥珀 */
  --rs-warn: var(--orange, #f0b429);
  --rs-warn-soft: var(--orange-soft, rgba(240, 180, 41, 0.18));
  --rs-line: var(--border, var(--glass-border, rgba(140, 198, 226, 0.32)));
  --rs-ring: var(--ring, rgba(140, 198, 226, 0.3));

  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 1.5;
}

.step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--rs-muted);
}

/* 步骤之间的连接符（compact 用更细的 ›） */
.sep {
  color: var(--rs-faint);
  font-size: 12px;
  user-select: none;
}

/* 步骤名 */
.label {
  color: inherit;
}

/* 已通过：强调色文字 */
.step.done .label {
  color: var(--rs-accent);
}

/* 进行中：文字提亮 */
.step.current .label {
  color: var(--rs-fg);
  font-weight: 600;
}

.state-text {
  font-size: 11.5px;
  color: var(--rs-accent);
}

/* 未开始：文字变淡 */
.step.pending .label {
  color: var(--rs-faint);
}

/* 被拒：红色文字 */
.step.rejected .label {
  color: var(--rs-danger);
}

/* AI 初审失败（error=true）：琥珀警示色 + 失败文案 */
.step.error .label {
  color: var(--rs-warn);
}

.error-text {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--rs-warn);
  background: var(--rs-warn-soft);
}

/* 紧凑模式：更小的标记与更细的分隔符 */
.review-steps.compact {
  font-size: 12px;
  gap: 3px 7px;
}

.compact .step {
  gap: 5px;
}

.compact .sep {
  font-size: 13px;
}
</style>
