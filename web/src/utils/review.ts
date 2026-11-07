import type { ReviewStep } from '../types';

/**
 * 审核状态的展示文案（列表 chip / 详情胶囊共用）。
 *
 * 只做「当前状态」这一种口径：带环节名，例如「人工审核中」「人工审核未通过」。
 * 环节名一律取后端下发的中文标签（current_stage_label / steps[].label），
 * 前端不硬编码「人工」「AI」，只在后端没给标签时按 current_stage 兜底。
 */
export interface ReviewStatusSource {
  /** 当前所在环节 */
  current_stage?: 'ai' | 'human' | null;
  /** 当前环节的中文标签（后端 stageLabel：'AI 审核' / '人工审核'） */
  current_stage_label?: string | null;
  /** 环节步骤（含 label / state），被拒时用来定位被拒环节 */
  steps?: ReviewStep[] | null;
}

/** 环节名兜底：后端未给 current_stage_label 时按 current_stage 推导 */
function stageName(stage?: 'ai' | 'human' | null): string {
  if (stage === 'ai') return 'AI 审核';
  if (stage === 'human') return '人工审核';
  return '';
}

/** 待审中的当前状态：「人工审核中」/「AI 审核中」 */
export function pendingStatusLabel(review?: ReviewStatusSource | null): string {
  const name = review?.current_stage_label || stageName(review?.current_stage);
  return name ? `${name}中` : '审核中';
}

/** 被拒的状态：指向被拒的那个环节，「人工审核未通过」/「AI 审核未通过」 */
export function rejectedStatusLabel(review?: ReviewStatusSource | null): string {
  const rejected = (review?.steps ?? []).find((s) => s.state === 'rejected');
  const name = rejected?.label || review?.current_stage_label || stageName(review?.current_stage);
  return name ? `${name}未通过` : '审核未通过';
}
