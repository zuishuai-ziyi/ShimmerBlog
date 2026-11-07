<template>
  <header class="topbar-zone">
    <div class="topbar glass">
      <router-link to="/" class="brand">
        <img :src="site.info.logoUrl || '/logo.png'" :alt="site.info.title" class="logo" />
        <span class="brand-name">{{ site.info.title }}</span>
      </router-link>

      <nav class="nav">
        <!-- 轮询更新中：半透明白色旋转指示器（首页按钮左侧） -->
        <span v-if="polling.busy" class="nav-poll" aria-hidden="true"></span>
        <router-link to="/" class="nav-link" exact-active-class="active">首页</router-link>
        <router-link to="/about" class="nav-link" active-class="active">关于</router-link>

        <template v-if="auth.user">
          <router-link to="/console" class="user-chip" title="控制台">
            <img class="avatar" :src="auth.user.avatar_url || defaultAvatar" alt="" />
            <span class="uname" :style="auth.user.name_color ? { color: auth.user.name_color } : undefined">{{ auth.user.name }}</span>
          </router-link>
        </template>
        <router-link v-else to="/login" class="btn-login">登录</router-link>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import { usePollingStore } from '../stores/polling';
import { computed } from 'vue';
import bundledAvatar from '../assets/default-avatar.svg';

const auth = useAuthStore();
const site = useSiteStore();
// 轮询状态：有请求在途时顶栏显示加载指示器
const polling = usePollingStore();
// 用户默认头像：后台可设置，未设置时用内置图
const defaultAvatar = computed(() => site.info.defaultAvatarUrl || bundledAvatar);
</script>

<style scoped>
.topbar-zone {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

/* 常驻胶囊：不再有「撑满顶部 → 收缩」的展开态，
   始终浮在视口上方、与顶部留出距离 */
.topbar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(760px, calc(100vw - 32px));
  padding: 8px 18px;
  margin-top: 14px;
  border-radius: 999px;
  background: var(--glass-bg-strong);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.35);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}

.logo {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.brand-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #ffffff;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 轮询加载指示器：半透明白色圆环（currentColor 跟随导航文字色，深浅主题都可见） */
.nav-poll {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  /* 回退：不支持 color-mix 的旧浏览器也能看到圆环轨迹 */
  border: 2px solid rgba(255, 255, 255, 0.25);
  border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  animation: nav-poll-spin 0.7s linear infinite;
  flex: 0 0 auto;
  color: var(--text-dim);
}

@keyframes nav-poll-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-poll {
    animation-duration: 2.4s;
  }
}

.nav-link {
  color: var(--text-dim);
  text-decoration: none;
  font-size: 15px;
  padding: 7px 14px;
  border-radius: 999px;
  transition: color 0.2s, background 0.2s;
}

.nav-link:hover {
  color: var(--text);
  background: rgba(140, 198, 226, 0.12);
}

.nav-link.active {
  color: #ffffff;
  background: var(--fill);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 6px;
  padding: 5px 14px 5px 6px;
  border-radius: 999px;
  background: rgba(140, 198, 226, 0.12);
  border: 1px solid var(--glass-border);
  color: var(--text);
  text-decoration: none;
  transition: background 0.2s;
}

.user-chip:hover {
  background: rgba(140, 198, 226, 0.22);
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.uname {
  font-size: 14px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 同属玻璃蓝家族（与用户胶囊一致），但提高底色/描边亮度，作为唯一的主行动入口 */
.btn-login {
  margin-left: 6px;
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  text-decoration: none;
  background: rgba(140, 198, 226, 0.26);
  border: 1px solid rgba(140, 198, 226, 0.26);
  transition: background 0.25s ease, border-color 0.25s ease;
}

.btn-login:hover {
  background: rgba(140, 198, 226, 0.38);
  border-color: rgba(140, 198, 226, 0.45);
}

@media (max-width: 560px) {
  .brand-name {
    display: none;
  }
}
</style>
