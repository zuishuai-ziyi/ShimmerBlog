<template>
  <section class="editor glass">
    <header class="head">
      <h2>{{ isNew ? '新建文章' : '编辑文章' }}</h2>
      <div class="head-actions">
        <button class="btn-ghost" type="button" @click="$emit('cancel')">取消</button>
        <button class="btn" :disabled="saving || locked" @click="save('draft')">
          {{ saving ? '保存中…' : '存草稿' }}
        </button>
        <button class="btn" :disabled="saving || locked" @click="save('published')">
          {{ saving ? '发布中…' : isNew ? '发布' : '保存并发布' }}
        </button>
      </div>
    </header>

    <!-- ===== 审核状态区块 ===== -->
    <!--
      默认用下面的内置横幅；调用方用 #review 插槽接管（如详情页把审核状态放在标题上方）时，
      传 hide-review 关掉内置横幅，避免同一份审核信息重复出现。
    -->
    <slot name="review" />
    <div v-if="reviewBanner && !hideReview" class="review-banner" :class="reviewBanner.tone">
      <div class="review-main">
        <span class="review-badge">{{ reviewBanner.badge }}</span>
        <span class="review-text">{{ reviewBanner.text }}</span>
      </div>
      <ReviewSteps :steps="review?.steps || []" />
      <p v-if="reviewBanner.detail" class="review-detail">{{ reviewBanner.detail }}</p>
      <p v-if="reviewBanner.hint" class="review-hint">{{ reviewBanner.hint }}</p>
    </div>

    <div class="field">
      <label>标题</label>
      <input v-model.trim="form.title" maxlength="200" :disabled="locked" placeholder="给这篇文章起个名字" />
    </div>

    <div class="field">
      <label>简介（显示在时间轴卡片上，最多 500 字）</label>
      <textarea
        v-model="form.summary"
        rows="2"
        maxlength="500"
        :disabled="locked"
        placeholder="一两句话说明这篇写的是什么"
      />
    </div>

    <div class="field">
      <label class="content-label">
        正文（支持 Markdown）
        <span class="tools">
          <label v-if="!locked" class="upload">
            <input type="file" accept="image/*" hidden @change="onUpload" />
            {{ uploading ? '上传中…' : '插入图片' }}
          </label>
          <button type="button" class="link-btn" @click="preview = !preview">
            {{ preview ? '继续编辑' : '预览' }}
          </button>
        </span>
      </label>

      <textarea
        v-if="!preview"
        ref="contentEl"
        v-model="form.content"
        class="content"
        rows="18"
        :disabled="locked"
        placeholder="用 Markdown 写正文…"
      />
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else class="prose preview-box" v-html="previewHtml" />
      <CaptchaDialog v-model:open="captchaOpen" :action="captchaAction" />
    </div>

    <p v-if="error" class="error-tip">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import axios from 'axios';
import http, { errMsg, isCaptchaFailure } from '../api/http';
import type { Article, ArticleReview } from '../types';
import { useSiteStore } from '../stores/site';
import CaptchaDialog from './CaptchaDialog.vue';
import ReviewSteps from './ReviewSteps.vue';

const props = defineProps<{
  articleId?: number;
  /** 调用方已自行渲染审核状态区块（#review 插槽）时置 true，隐藏内置审核横幅 */
  hideReview?: boolean;
}>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'cancel'): void }>();

const isNew = computed(() => !props.articleId);
const saving = ref(false);
const uploading = ref(false);
const error = ref('');
const notice = ref('');
const preview = ref(false);
const contentEl = ref<HTMLTextAreaElement | null>(null);
const form = reactive({ title: '', summary: '', content: '' });

/* ---- 审核状态 ---- */
/** 后端返回的审核信息（仅待审/被拒时存在） */
const review = ref<ArticleReview | null>(null);
/** 审核中：表单只读，不能编辑也不能保存 */
const locked = computed(() => review.value?.state === 'pending');
/** 线上文章状态：已发布文章改存草稿会立即下线，保存前需确认 */
const articleStatus = ref<Article['status'] | null>(null);

const STAGE_TEXT: Record<string, string> = {
  ai: 'AI 审核中',
  human: '待人工审核',
  done: '审核中',
};

/**
 * 横幅标题：后端给出当前步骤时用动态文案（正在 AI 审核 / 正在人工审核），
 * 没有当前步骤时退回按阶段取的旧文案。
 */
function stageTitle(r: ArticleReview): string {
  if (r.current_stage === 'ai') return '正在 AI 审核';
  if (r.current_stage === 'human') return '正在人工审核';
  return STAGE_TEXT[r.record?.stage ?? 'ai'] ?? '审核中';
}

/** 顶部横幅：审核中显示阶段与 AI 建议，被拒显示拒绝理由 */
const reviewBanner = computed(() => {
  const r = review.value;
  if (!r) return null;
  const record = r.record;
  if (r.state === 'pending') {
    const verdictText =
      record?.ai_verdict === 'approve'
        ? 'AI 建议：通过'
        : record?.ai_verdict === 'reject'
          ? 'AI 建议：不通过'
          : '';
    const reason = record?.ai_reason ? `理由：${record.ai_reason}` : '';
    const detail = [verdictText, reason].filter(Boolean).join(' ');
    return {
      tone: 'pending',
      badge: '审核中',
      text: stageTitle(r),
      detail,
      hint: '审核期间无法编辑，请等待审核结果。',
    };
  }
  // rejected：人工拒绝理由优先，没有则退回 AI 理由
  const reason = record?.reject_note || record?.ai_reason || '';
  return {
    tone: 'rejected',
    badge: '审核未通过',
    text: '上次提交未通过审核',
    detail: reason ? `拒绝理由：${reason}` : '',
    hint: '可以修改后重新提交，重新提交后将再次进入审核流程。',
  };
});

const previewHtml = computed(() =>
  DOMPurify.sanitize(marked.parse(form.content || '', { breaks: true, async: false }) as string)
);

/* ---- 审核状态轮询 ---- */
/** 轮询间隔：5s */
const POLL_INTERVAL = 5000;
let pollTimer: ReturnType<typeof setInterval> | undefined;

/** 打开编辑器时的表单快照：用于判断用户是否有未保存修改 */
const baseline = ref({ title: '', summary: '', content: '' });
/** 有未保存修改时不再自动刷新审核状态，避免覆盖正在编辑的内容 */
const dirty = computed(
  () =>
    form.title !== baseline.value.title ||
    form.summary !== baseline.value.summary ||
    form.content !== baseline.value.content
);

/**
 * 静默轮询审核状态（仅编辑已有文章时）：
 *  - 页面不可见 / 用户有未保存修改 → 跳过
 *  - 只更新审核相关字段（review / status），绝不覆盖标题、简介、正文
 */
async function pollReview() {
  if (!props.articleId) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  if (dirty.value) return;
  try {
    const { data } = await http.get<{ article: Article }>(`/articles/${props.articleId}`);
    const article = data.article;
    if (!article) return;
    review.value = article.review ?? null;
    articleStatus.value = article.status;
  } catch {
    // 轮询失败静默忽略（不弹错误提示）
  }
}

/* ---- 行为验证（GoCaptcha）：仅新建文章与上传图片需要（后端只保护这两个接口） ---- */
const site = useSiteStore();
type Captcha = { key: string; value: string };
const captchaOpen = ref(false);
type CaptchaKind = 'save' | 'upload';
const captchaPending = ref<CaptchaKind>('save');
const captchaStatus = ref<'draft' | 'published'>('published');
const captchaFile = ref<File | null>(null);

function requestCaptcha(kind: CaptchaKind): boolean {
  if (!site.info.captchaEnabled) return true;
  captchaPending.value = kind;
  captchaOpen.value = true;
  return false;
}

const captchaAction = async (c: Captcha) => {
  if (captchaPending.value === 'save') await doSave(captchaStatus.value, c);
  else if (captchaFile.value) await doUpload(captchaFile.value, c);
};

onMounted(async () => {
  if (!props.articleId) return;
  try {
    const { data } = await http.get<{ article: Article }>(`/articles/${props.articleId}`);
    const article = data.article;
    review.value = article.review ?? null;
    articleStatus.value = article.status;
    // 待审/被拒时线上仍是旧版，作者提交的新版在 snapshot 里
    const snap = article.review?.snapshot;
    form.title = snap?.title ?? article.title;
    form.summary = snap?.summary ?? article.summary ?? '';
    form.content = snap?.content ?? article.content;
    // 记录初始值：之后据此判断用户是否有未保存修改
    baseline.value = { title: form.title, summary: form.summary, content: form.content };
  } catch (e) {
    error.value = errMsg(e);
  }
  // 启动审核状态轮询（仅已有文章的编辑场景）
  pollTimer = setInterval(pollReview, POLL_INTERVAL);
});

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
});

async function save(status: 'draft' | 'published') {
  if (locked.value) {
    error.value = '文章正在审核中，暂时无法编辑';
    return;
  }
  if (!form.title) {
    error.value = '请填写标题';
    return;
  }
  if (!form.content.trim()) {
    error.value = '正文不能为空';
    return;
  }
  captchaStatus.value = status;
  if (isNew.value && requestCaptcha('save')) await doSave(status);
  else if (!isNew.value) await doSave(status);
}

async function doSave(status: 'draft' | 'published', captcha?: Captcha) {
  // 已发布的文章改存草稿会立即下线，先确认
  if (!isNew.value && status === 'draft' && articleStatus.value === 'published') {
    if (!confirm('该文章已发布，存为草稿会立即下线，确认？')) return;
  }
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const payload = { ...form, status, captcha };
    if (isNew.value) {
      await http.post<{ article: Article }>('/articles', payload);
      notice.value = '已创建';
      emit('saved');
    } else {
      const { data } = await http.put<{ message?: string }>(`/articles/${props.articleId}`, payload);
      notice.value = data?.message || (status === 'published' ? '已发布' : '已保存草稿');
      emit('saved');
    }
  } catch (e) {
    if (isCaptchaFailure(e)) throw e; // 验证码未通过：抛给弹窗处理（弹窗内提示+自动换题），吞掉会被弹窗误认为成功而关闭
    error.value = reviewPendingMessage(e) ?? errMsg(e);
  } finally {
    saving.value = false;
  }
}

async function onUpload(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || locked.value) return;
  if (requestCaptcha('upload')) {
    await doUpload(file);
  } else {
    captchaFile.value = file;
  }
}

async function doUpload(file: File, captcha?: Captcha) {
  uploading.value = true;
  error.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    if (captcha) fd.append('captcha', JSON.stringify(captcha));
    const { data } = await http.post<{ url: string }>('/articles/upload-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const snippet = `\n![${file.name}](${data.url})\n`;
    insertAtCursor(snippet);
  } catch (e) {
    if (isCaptchaFailure(e)) throw e; // 验证码未通过：抛给弹窗处理（弹窗内提示+自动换题），吞掉会被弹窗误认为成功而关闭
    error.value = errMsg(e);
  } finally {
    uploading.value = false;
    captchaFile.value = null;
  }
}

/** 审核中的文章再次保存发布 → 后端 409 REVIEW_PENDING，取后端提示文案 */
function reviewPendingMessage(e: unknown): string | null {
  if (!axios.isAxiosError(e)) return null;
  const body = e.response?.data as
    | { code?: string; message?: string; error?: string; data?: { code?: string; message?: string } }
    | undefined;
  const code = body?.code ?? body?.data?.code;
  if (code !== 'REVIEW_PENDING') return null;
  return body?.message || body?.error || body?.data?.message || '文章正在审核中';
}

function insertAtCursor(text: string) {
  const el = contentEl.value;
  if (!el) {
    form.content += text;
    return;
  }
  const start = el.selectionStart ?? form.content.length;
  const end = el.selectionEnd ?? start;
  form.content = form.content.slice(0, start) + text + form.content.slice(end);
}
</script>

<style scoped>
.editor {
  padding: 24px 26px 28px;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.head h2 {
  font-size: 17px;
  color: var(--accent);
}

.head-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.content-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload,
.link-btn {
  font-size: 12.5px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.content {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13.5px;
  line-height: 1.8;
}

.preview-box {
  min-height: 200px;
  padding: 16px 18px;
  background: rgb(9 34 46 / 45%);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  font-size: 14.5px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.92);
}

.preview-box :deep(h1),
.preview-box :deep(h2),
.preview-box :deep(h3) {
  color: #ffffff;
  margin: 0.8em 0 0.4em;
}

.preview-box :deep(a) {
  color: var(--link);
  text-decoration: none;
  /* 参考 www 站正文链接：默认无下划线，悬停时由左侧展开 2px 渐变下划线 */
  background: linear-gradient(to right, var(--link-underline), var(--link-underline)) right bottom no-repeat;
  background-size: 0 2px;
  transition: background-size 0.3s ease, color 0.3s ease;
}

.preview-box :deep(a:hover) {
  color: var(--link-hover);
  background-position: left bottom;
  background-size: 100% 2px;
}

.preview-box :deep(a:active) {
  color: var(--link-active);
}

.preview-box :deep(code) {
  padding: 2px 6px;
  background: rgb(9 34 46 / 65%);
  border-radius: 6px;
  color: var(--accent);
}

.preview-box :deep(pre) {
  padding: 14px;
  background: rgb(9 34 46 / 65%);
  border-radius: 12px;
  overflow-x: auto;
}

.preview-box :deep(img) {
  max-width: 100%;
  border-radius: 10px;
}

.preview-box :deep(blockquote) {
  padding-left: 12px;
  border-left: 3px solid rgba(140, 198, 226, 0.45);
  color: var(--text-dim);
}

.notice {
  font-size: 13px;
  color: var(--accent);
  margin-top: 8px;
}

/* ===== 审核状态横幅 ===== */
.review-banner {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid;
}

.review-banner.pending {
  border-color: rgba(94, 176, 240, 0.42);
  background: rgba(94, 176, 240, 0.1);
}

.review-banner.rejected {
  border-color: rgba(255, 138, 138, 0.42);
  background: rgba(255, 138, 138, 0.1);
}

.review-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.review-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.review-banner.pending .review-badge {
  color: #5eb0f0;
  background: rgba(94, 176, 240, 0.18);
}

.review-banner.rejected .review-badge {
  color: #ff8a8a;
  background: rgba(255, 138, 138, 0.18);
}

.review-text {
  font-size: 13.5px;
  color: #ffffff;
}

.review-detail,
.review-hint {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
}

.review-detail {
  color: rgba(255, 255, 255, 0.88);
}

.review-hint {
  color: var(--text-dim);
}

/* 审核中：表单只读 */
.editor input:disabled,
.editor textarea:disabled {
  opacity: 0.75;
  cursor: not-allowed;
}
</style>
