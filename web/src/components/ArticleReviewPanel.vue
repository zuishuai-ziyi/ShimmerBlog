<template>
  <!--
    审核状态区块：步骤条 + 当前状态胶囊 + 每步时间/意见 + 本次提交版本。
    详情视图与「从详情进入编辑」共用同一份（编辑时挂在 ArticleEditor 的 review 插槽里），
    数据都来自详情接口，切换编辑器不重新请求、不闪烁。
  -->
  <section class="review-box" :class="review.state">
    <div class="review-head">
      <span class="review-badge">{{ statusLabel }}</span>
    </div>

    <ReviewSteps :steps="steps" />

    <ul v-if="steps.length" class="review-list">
      <li
        v-for="(s, i) in steps"
        :key="`${s.key}-${i}`"
        class="review-item"
        :class="[s.state, { error: s.error }]"
      >
        <div class="review-item-head">
          <ReviewMark :state="s.state" :error="!!s.error" />
          <span class="review-item-name">{{ s.label }}</span>
          <span class="review-item-state">{{ stepStateText(s) }}</span>
          <time v-if="s.at" class="review-item-at">{{ formatDateTime(s.at) }}</time>
        </div>
        <p v-if="s.note" class="review-item-note">{{ s.note }}</p>
      </li>
    </ul>

    <p v-if="hint" class="review-hint">{{ hint }}</p>

    <details v-if="snapshot" class="review-snapshot">
      <summary>查看本次提交的版本（与线上版本不同）</summary>
      <p v-if="snapshotTitle" class="review-snapshot-title">{{ snapshotTitle }}</p>
      <ArticlePreview :content="snapshot.content || ''" />
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Article, ArticleReview, ReviewSnapshot, ReviewStep, ReviewStepState } from '../types';
import { formatDateTime } from '../utils/format';
import { pendingStatusLabel, rejectedStatusLabel } from '../utils/review';
import ArticlePreview from './ArticlePreview.vue';
import ReviewMark from './ReviewMark.vue';
import ReviewSteps from './ReviewSteps.vue';

const props = defineProps<{
  /** 详情接口返回的审核信息（pending / rejected） */
  review: ArticleReview;
  /** 同一篇文章（用于判断本次提交版本是否与线上不同） */
  article: Article;
}>();

const steps = computed<ReviewStep[]>(() => props.review.steps ?? []);

/** 当前状态胶囊：带环节名，「人工审核中」/「人工审核未通过」 */
const statusLabel = computed(() =>
  props.review.state === 'pending' ? pendingStatusLabel(props.review) : rejectedStatusLabel(props.review)
);

const STEP_STATE_TEXT: Record<ReviewStepState, string> = {
  done: '已通过',
  current: '进行中',
  pending: '未开始',
  rejected: '已拒绝',
};

function stepStateText(step: ReviewStep): string {
  // AI 初审失败：state 可能是 done（AI 报错后已转人工），文案单独区分
  if (step.error) return step.error_label || 'AI 初审失败';
  return STEP_STATE_TEXT[step.state] ?? '';
}

/** 审核期间/被拒后的操作限制提示（已发布文章重新送审时线上仍是旧版） */
const hint = computed(() => {
  const a = props.article;
  if (props.review.state === 'pending') {
    return a.status === 'published' ? '审核期间线上展示的仍是上一版内容。' : '审核期间无法编辑，通过后自动发布。';
  }
  return '可以点右上角「编辑」修改后重新提交。';
});

/**
 * 已发布文章送审 / 被拒时线上仍是旧版，本次提交的版本只存在于 review.snapshot；
 * 只要标题 / 简介 / 正文任一与线上不同就展示（只改标题或摘要重新送审时正文其实相同）。
 */
const snapshot = computed<ReviewSnapshot | null>(() => {
  const a = props.article;
  const snap = props.review.snapshot;
  if (a.status !== 'published' || !snap) return null;
  const differs =
    (snap.title ?? '') !== (a.title ?? '') ||
    (snap.summary ?? '') !== (a.summary ?? '') ||
    (snap.content ?? '') !== (a.content ?? '');
  return differs ? snap : null;
});

/** 快照标题与线上标题不一致时提示提交版本标题（避免一句话重复两遍） */
const snapshotTitle = computed(() => {
  const snap = snapshot.value;
  const a = props.article;
  if (!snap || !a) return '';
  return snap.title && snap.title !== a.title ? `标题：${snap.title}` : '';
});
</script>

<style scoped>
.review-box {
  display: grid;
  gap: 12px;
  /* 位于文章标题上方，与前后的返回栏 / 标题留出间距 */
  margin: 0 0 18px;
  padding: 16px 18px 14px;
  border-radius: 14px;
  border: 1px solid rgba(94, 176, 240, 0.28);
  background: rgba(94, 176, 240, 0.06);
  min-width: 0;
}

.review-box.rejected {
  border-color: rgba(255, 138, 138, 0.28);
  background: rgba(255, 138, 138, 0.06);
}

.review-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}

.review-badge {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  color: #5eb0f0;
  background: rgba(94, 176, 240, 0.16);
}

.review-box.rejected .review-badge {
  color: #ff8a8a;
  background: rgba(255, 138, 138, 0.14);
}

.review-list {
  list-style: none;
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 0;
}

.review-item {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  min-width: 0;
}

.review-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.review-item-name {
  color: #ffffff;
}

.review-item.pending .review-item-name,
.review-item.done .review-item-name {
  color: var(--text-dim);
}

.review-item-state {
  flex: none;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.07);
}

.review-item.done .review-item-state {
  color: #63e6be;
  background: rgba(99, 230, 190, 0.14);
}

.review-item.current .review-item-state {
  color: #5eb0f0;
  background: rgba(94, 176, 240, 0.16);
}

.review-item.rejected .review-item-state {
  color: #ff8a8a;
  background: rgba(255, 138, 138, 0.14);
}

/* AI 初审失败（步骤 state 可能仍是 done，用暖色区分） */
.review-item.error .review-item-state {
  color: #ffc078;
  background: rgba(255, 192, 120, 0.14);
}

.review-item-at {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.review-item-note {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.review-hint {
  font-size: 12.5px;
  color: var(--text-dim);
}

/* 已发布文章送审时，折叠展示「本次提交的版本」 */
.review-snapshot {
  border-top: 1px dashed var(--glass-border);
  padding-top: 10px;
  font-size: 13px;
}

.review-snapshot summary {
  cursor: pointer;
  color: var(--accent);
  list-style: none;
  user-select: none;
}

.review-snapshot summary::-webkit-details-marker {
  display: none;
}

.review-snapshot summary::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.2s;
}

.review-snapshot[open] summary::before {
  content: '▾ ';
}

.review-snapshot-title {
  margin-top: 8px;
  font-size: 13px;
  color: #ffffff;
}

.review-snapshot .prose {
  margin-top: 8px;
  font-size: 14.5px;
}
</style>
