<template>
  <div class="about">
    <header class="head">
      <h1 class="page-title">关于</h1>
      <p class="muted">{{ site.info.aboutSubtitle }}</p>
    </header>

    <!-- 后台配置了自定义内容时优先生效，否则展示内置介绍 -->
    <template v-if="site.info.aboutHtml">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <section class="block glass custom" v-html="aboutHtml" />
    </template>

    <template v-else>
      <section class="block glass">
        <h2>这是什么</h2>
        <p>
          微光博客是一个个人博客站点：黑色的深空背景，向上漂浮的星点，浅蓝色的毛玻璃前景。
          文章按发布时间从新到旧沿时间轴排布，每一篇由一段光弧连向下一篇。
        </p>
      </section>

      <section class="block glass">
        <h2>技术构成</h2>
        <ul>
          <li><strong>前端</strong>：Vue 3 + TypeScript + Vite，Pinia 状态管理，Vue Router 路由</li>
          <li><strong>后端</strong>：Node.js + Express 5，JWT 鉴权</li>
          <li><strong>数据</strong>：MySQL 8（用户、文章、邮箱验证码、站点配置）</li>
          <li><strong>登录方式</strong>：邮箱密码、邮箱验证码、GitHub OAuth</li>
        </ul>
      </section>

      <section class="block glass">
        <h2>怎么用</h2>
        <ol>
          <li>注册账号或用邮箱验证码 / GitHub 登录</li>
          <li>进入控制台，新建文章，支持 Markdown 与配图</li>
          <li>保存草稿或直接发布，发布后会出现在首页时间轴上</li>
        </ol>
      </section>

      <section class="block glass">
        <h2>配色</h2>
        <p class="muted">取色自站点色板，由深到浅：</p>
        <div class="palette">
          <span v-for="c in palette" :key="c" class="swatch" :style="{ background: c }" :title="c" />
        </div>
      </section>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useSiteStore } from '../stores/site';

const site = useSiteStore();
const palette = ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8'];

// 管理员在后台以 HTML 编辑关于页；此处渲染前做最小净化（仅保留文本与链接/标题/列表等安全标签）
const ALLOWED = new Set(['P', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'CODE', 'PRE', 'BLOCKQUOTE', 'A', 'SPAN', 'IMG']);
const aboutHtml = computed(() => {
  if (!site.loaded) site.fetch();
  const html = site.info.aboutHtml || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('*').forEach((el) => {
    if (!ALLOWED.has(el.tagName)) {
      el.replaceWith(...el.childNodes);
      return;
    }
    [...el.attributes].forEach((attr) => {
      const ok =
        (attr.name === 'href' && el.tagName === 'A') ||
        (attr.name === 'src' && el.tagName === 'IMG' && /^https?:|^\/uploads\//.test(attr.value)) ||
        (attr.name === 'title');
      if (!ok) el.removeAttribute(attr.name);
    });
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return doc.body.innerHTML;
});

onMounted(() => {
  if (!site.loaded) site.fetch();
});
</script>

<style scoped>
.about {
  max-width: 760px;
  margin: 0 auto;
  padding: 130px 22px 90px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.head {
  margin-bottom: 6px;
}

.block {
  padding: 24px 28px;
}

.block :deep(h2) {
  font-size: 17px;
  font-weight: 700;
  color: var(--accent);
  margin: 0 0 12px;
  letter-spacing: 0.5px;
}

.block :deep(h3) {
  font-size: 15px;
  color: var(--accent);
  margin: 16px 0 8px;
}

.block :deep(p) {
  font-size: 14.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.86);
  margin: 0 0 10px;
}

.block :deep(ul),
.block :deep(ol) {
  padding-left: 1.3em;
  font-size: 14.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.86);
  margin: 0 0 10px;
}

.block :deep(li) {
  margin: 4px 0;
}

.block :deep(a) {
  color: var(--accent);
}

.block :deep(img) {
  max-width: 100%;
  border-radius: 10px;
}

.block :deep(blockquote) {
  margin: 10px 0;
  padding: 6px 14px;
  border-left: 3px solid var(--accent);
  color: rgba(255, 255, 255, 0.72);
}

.block h2 {
  font-size: 17px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 12px;
  letter-spacing: 0.5px;
}

.block p {
  font-size: 14.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.86);
}

.block ul,
.block ol {
  padding-left: 1.3em;
  font-size: 14.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.86);
}

.block li {
  margin: 4px 0;
}

.block strong {
  color: var(--accent);
  font-weight: 600;
}

.palette {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.swatch {
  flex: 1;
  height: 30px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
}
</style>
