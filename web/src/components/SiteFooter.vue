<template>
  <footer class="site-footer" :class="tone">
    <a
      class="footer-text link"
      href="https://beian.miit.gov.cn/"
      target="_blank"
      rel="noopener noreferrer"
    >蜀ICP备2025165930号</a>
    <span class="footer-text">Copyright © {{ years }} ZiYi.</span>
  </footer>
</template>

<script setup lang="ts">
// tone：dark = 前台（与 www 的 .beian-box 一致）；light = 后台白蓝主题
withDefaults(defineProps<{ tone?: 'dark' | 'light' }>(), { tone: 'dark' });

// 版权年份：起始 2025，结束年份跟随当前年份（2026 年显示「2025 ~ 2026」）
const startYear = 2025;
const now = new Date().getFullYear();
const years = now > startYear ? `${startYear} ~ ${now}` : String(startYear);
</script>

<style scoped>
/* 高度固定 52px：后台布局用 calc(100vh - 52px) 扣除页脚，保证页脚正好贴视口底部 */
.site-footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  width: 100%;
  height: 52px;
  padding: 0 22px;
  box-sizing: border-box;
  /* 与 www 项目 .beian-box 一致：整条深灰半透明底带 */
  background-color: rgba(46, 46, 46, 0.5);
}

.footer-text {
  margin-left: 20px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  line-height: 1.8;
  color: #ababab;
  text-decoration: none;
  transition: color 0.2s;
}

/* 首项不留左外边距，整行保持视觉居中 */
.footer-text:first-child {
  margin-left: 0;
}

/* 备案链接：悬停仅微亮 */
a.footer-text.link:hover {
  color: #c3c3c3;
}

/* 后台：白蓝主题的浅色底带 */
.site-footer.light {
  background-color: #eef2f9;
  border-top: 1px solid #e4eaf4;
}

.site-footer.light .footer-text {
  color: #8290a8;
}

.site-footer.light a.footer-text.link:hover {
  color: #5b6b86;
}
</style>
