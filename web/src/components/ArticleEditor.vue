<template>
  <section class="editor glass">
    <header class="head">
      <h2>{{ isNew ? '新建文章' : '编辑文章' }}</h2>
      <div class="head-actions">
        <button class="btn-ghost" type="button" @click="$emit('cancel')">取消</button>
        <button class="btn" :disabled="saving" @click="save('draft')">{{ saving ? '保存中…' : '存草稿' }}</button>
        <button class="btn" :disabled="saving" @click="save('published')">
          {{ saving ? '发布中…' : isNew ? '发布' : '保存并发布' }}
        </button>
      </div>
    </header>

    <div class="field">
      <label>标题</label>
      <input v-model.trim="form.title" maxlength="200" placeholder="给这篇文章起个名字" />
    </div>

    <div class="field">
      <label>简介（显示在时间轴卡片上，最多 500 字）</label>
      <textarea v-model="form.summary" rows="2" maxlength="500" placeholder="一两句话说明这篇写的是什么" />
    </div>

    <div class="field">
      <label class="content-label">
        正文（支持 Markdown）
        <span class="tools">
          <label class="upload">
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
import { computed, onMounted, reactive, ref } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import http, { errMsg, isCaptchaFailure } from '../api/http';
import type { Article } from '../types';
import { useSiteStore } from '../stores/site';
import CaptchaDialog from './CaptchaDialog.vue';

const props = defineProps<{ articleId?: number }>();
const emit = defineEmits<{ (e: 'saved'): void; (e: 'cancel'): void }>();

const isNew = computed(() => !props.articleId);
const saving = ref(false);
const uploading = ref(false);
const error = ref('');
const notice = ref('');
const preview = ref(false);
const contentEl = ref<HTMLTextAreaElement | null>(null);
const form = reactive({ title: '', summary: '', content: '' });

const previewHtml = computed(() =>
  DOMPurify.sanitize(marked.parse(form.content || '', { breaks: true, async: false }) as string)
);

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
    form.title = data.article.title;
    form.summary = data.article.summary ?? '';
    form.content = data.article.content;
  } catch (e) {
    error.value = errMsg(e);
  }
});

async function save(status: 'draft' | 'published') {
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
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const payload = { ...form, status, captcha };
    if (isNew.value) {
      const { data } = await http.post<{ article: Article }>('/articles', payload);
      notice.value = '已创建';
      emit('saved');
      // 新建成功后留在编辑器里编辑刚创建的文章
      if (data.article) {
        form.content = data.article.content;
      }
    } else {
      await http.put(`/articles/${props.articleId}`, payload);
      notice.value = status === 'published' ? '已发布' : '已保存草稿';
      emit('saved');
    }
  } catch (e) {
    if (isCaptchaFailure(e)) throw e; // 验证码未通过：抛给弹窗处理（弹窗内提示+自动换题），吞掉会被弹窗误认为成功而关闭
    error.value = errMsg(e);
  } finally {
    saving.value = false;
  }
}

async function onUpload(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
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
  color: var(--accent);
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
</style>
