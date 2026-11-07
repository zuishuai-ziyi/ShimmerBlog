/** 文章审核状态：none=无需审核/无审核记录，pending=待审，rejected=上次提交被拒 */
export type ReviewState = 'none' | 'pending' | 'rejected';

/** 审核流转阶段：ai=AI 审核中，human=待人工，done=已结束 */
export type ReviewStage = 'ai' | 'human' | 'done';

/** AI 审核结论 */
export type AiVerdict = 'approve' | 'reject' | null;

/**
 * 审核步骤状态：
 * done=已通过该步骤，current=正在该步骤，pending=尚未开始，rejected=在该步骤被拒
 */
export type ReviewStepState = 'done' | 'current' | 'pending' | 'rejected';

/** 审核流程中的一个步骤（后端 describeStages 输出） */
export interface ReviewStep {
  key: 'ai' | 'human';
  label: string;
  state: ReviewStepState;
  /** 该步骤的流水时间（ISO 字符串）；该步骤还没有流水时为 null */
  at?: string | null;
  /** 该步骤的意见（AI 理由 / 审核备注 / AI 错误信息）；无则为 null */
  note?: string | null;
  /**
   * AI 初审失败标记：后端在该步骤匹配到 ai_error 流水时置 true。
   * 此时 state 可能仍是 done（AI 报错后流程已转人工），仅供展示层区分。
   */
  error?: boolean;
  /** 失败步骤的展示文案（如「AI 初审失败」），仅 error=true 时存在 */
  error_label?: string;
}

/** 审核流水中一条动作的操作者类型（对应 review_actions.actor_type） */
export type ReviewActorType = 'author' | 'ai' | 'reviewer' | 'admin' | 'system';

/**
 * 审核流水中的一条动作（后端 review_actions 表，最近一次审核记录的全部流水）。
 * action 常见值：submit（送审）/ ai_approve / ai_reject / ai_error / ai_retry /
 * approve / reject（人工裁决）/ final_approve / final_reject / force_approve /
 * force_reject / release / cancel。
 */
export interface ReviewAction {
  id: number;
  actor_type: ReviewActorType;
  /** 操作者展示名：作者名 / 'AI' / 审核员用户名 / 'system' */
  actor_name: string;
  action: string;
  /** 这一步的可见意见（AI 理由 / 审核备注 / 错误信息），可能为 null */
  note: string | null;
  /** 原始时间戳 */
  created_at: string;
}

export interface ArticleBrief {
  id: number;
  title: string;
  summary: string;
  status: 'draft' | 'published';
  pinned: 0 | 1;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_name: string;
  author_name_color: string | null;
  author_avatar: string | null;
  /** 审核状态（后端关闭审核或旧数据时缺省，等同 none） */
  review_state?: ReviewState;
  /** 审核进度（列表接口附带）：待审/被拒时存在，null 表示未进入审核 */
  review?:
    | {
        state: 'pending' | 'rejected';
        steps?: ReviewStep[];
        current_stage?: 'ai' | 'human' | null;
        current_stage_label?: string | null;
      }
    | null;
}

/** 一条审核记录 */
export interface ReviewRecord {
  id: number;
  stage: ReviewStage;
  ai_verdict: AiVerdict;
  ai_reason: string | null;
  reject_note: string | null;
  /** 终结时间（通过/拒绝时写入）；未终结为 null */
  decided_at?: string | null;
  created_at: string;
  /** 当前步骤序号（0 起） */
  stage_index?: number;
  /** 完整流程阶段序列 */
  stages?: string[];
  /** 步骤状态（前端进度条用） */
  steps?: ReviewStep[];
  /** 当前所在步骤：ai / human，无则 null */
  current_stage?: 'ai' | 'human' | null;
  /** 当前步骤的展示文案 */
  current_stage_label?: string | null;
}

/** 作者提交、等待审核的版本快照（pending 时线上仍是旧版） */
export interface ReviewSnapshot {
  title: string;
  summary: string;
  content: string;
}

/** 文章详情附带的审核信息（作者视角） */
export interface ArticleReview {
  state: 'pending' | 'rejected';
  record: ReviewRecord;
  snapshot: ReviewSnapshot;
  /** 当前步骤序号（0 起） */
  stage_index?: number;
  /** 完整流程阶段序列 */
  stages?: string[];
  /** 步骤状态（前端进度条用） */
  steps?: ReviewStep[];
  /** 当前所在步骤：ai / human，无则 null */
  current_stage?: 'ai' | 'human' | null;
  /** 当前步骤的展示文案 */
  current_stage_label?: string | null;
  /** 审核流水（时间正序）：仅详情接口在作者/管理员视角返回，列表接口不带 */
  actions?: ReviewAction[];
}

export interface Article extends Omit<ArticleBrief, 'author_id' | 'author_avatar' | 'review'> {
  content: string;
  author_id: number;
  author_name: string;
  author_name_color: string | null;
  author_avatar: string | null;
  /** 待审/被拒时后端额外返回；无审核时缺省 */
  review?: ArticleReview;
}
