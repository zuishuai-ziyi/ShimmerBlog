<template>
  <StarField />
  <TopBar />
  <div class="app-shell">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import StarField from './components/StarField.vue';
import TopBar from './components/TopBar.vue';
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #000;
  color: var(--text);
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

.app-shell {
  position: relative;
  z-index: 1;
}

/* 页面通用容器 */
.page {
  max-width: var(--content-w);
  margin: 0 auto;
  padding: 120px 22px 80px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  background: none;
  color: #ffffff;
}

.muted {
  color: var(--text-dim);
  font-size: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.field > label {
  font-size: 13px;
  color: var(--text-dim);
}

input,
textarea,
select {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  /* 输入框：比所在毛玻璃面板更亮一档（淡蓝），避免叠加纯黑后发黑 */
  background: var(--field-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus,
textarea:focus,
select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(140, 198, 226, 0.16);
}

textarea {
  resize: vertical;
  line-height: 1.7;
}

button {
  font-family: inherit;
  cursor: pointer;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  background: var(--fill);
  border: none;
  border-radius: 999px;
  transition: filter 0.2s, transform 0.15s;
}

.btn:hover:not(:disabled) {
  background: var(--fill-hover);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-ghost {
  padding: 9px 18px;
  font-size: 14px;
  color: var(--text);
  background: rgba(140, 198, 226, 0.1);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s;
}

.btn-ghost:hover {
  background: rgba(140, 198, 226, 0.2);
}

.btn-danger {
  padding: 9px 18px;
  font-size: 14px;
  color: #ffd9d9;
  background: rgba(220, 60, 60, 0.18);
  border: 1px solid rgba(255, 120, 120, 0.4);
  border-radius: 999px;
}

.btn-danger:hover {
  background: rgba(220, 60, 60, 0.3);
}

.error-tip {
  color: #ff9b9b;
  font-size: 13px;
  margin-top: 6px;
}
</style>
