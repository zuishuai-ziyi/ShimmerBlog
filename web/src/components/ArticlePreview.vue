<template>
  <!-- Markdown 正文预览：渲染管线与 ArticleView 完全一致（marked + DOMPurify，保留 target 属性），样式取自 ArticleView 的 .prose -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="prose" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps<{ content: string }>();

/** 与 ArticleView 的 html 计算属性保持同一套解析 / 清洗参数 */
const html = computed(() => {
  const raw = marked.parse(props.content ?? '', { breaks: true, async: false }) as string;
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
});
</script>

<style scoped>
/* Markdown 正文（与 web/src/views/ArticleView.vue 的 .prose 保持一致，仅拆成独立组件复用） */
.prose {
  font-size: 15.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.92);
  word-break: break-word;
}

.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3),
.prose :deep(h4) {
  margin: 1.6em 0 0.7em;
  color: #ffffff;
  font-weight: 700;
  line-height: 1.4;
}

.prose :deep(h1) {
  font-size: 1.5em;
}
.prose :deep(h2) {
  font-size: 1.3em;
}
.prose :deep(h3) {
  font-size: 1.12em;
}

.prose :deep(p) {
  margin: 0.9em 0;
}

.prose :deep(a) {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px solid rgba(140, 198, 226, 0.4);
  transition: color 0.2s, border-color 0.2s;
}

.prose :deep(a:hover) {
  color: var(--accent);
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0.9em 0;
  padding-left: 1.5em;
}

.prose :deep(li) {
  margin: 0.35em 0;
}

.prose :deep(blockquote) {
  margin: 1.1em 0;
  padding: 8px 16px;
  border-left: 3px solid rgba(140, 198, 226, 0.45);
  background: rgba(140, 198, 226, 0.07);
  border-radius: 0 10px 10px 0;
  color: var(--text-dim);
}

.prose :deep(code) {
  padding: 2px 6px;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--accent);
  background: rgb(9 34 46 / 60%);
  border-radius: 6px;
}

.prose :deep(pre) {
  margin: 1.1em 0;
  padding: 16px 18px;
  overflow-x: auto;
  background: rgb(9 34 46 / 60%);
  border: 1px solid rgba(150, 205, 232, 0.18);
  border-radius: 14px;
}

.prose :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 13.5px;
  line-height: 1.7;
}

.prose :deep(img) {
  max-width: 100%;
  border-radius: 12px;
  margin: 1em 0;
}

.prose :deep(table) {
  width: 100%;
  margin: 1.1em 0;
  border-collapse: collapse;
  font-size: 14px;
}

.prose :deep(th),
.prose :deep(td) {
  padding: 8px 12px;
  border: 1px solid rgba(150, 205, 232, 0.22);
  text-align: left;
}

.prose :deep(th) {
  background: rgba(140, 198, 226, 0.12);
  color: var(--accent);
}

.prose :deep(hr) {
  margin: 1.8em 0;
  border: none;
  height: 1px;
  background: rgba(150, 205, 232, 0.25);
}
</style>
