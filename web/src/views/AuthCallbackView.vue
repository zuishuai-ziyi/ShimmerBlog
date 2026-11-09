<template>
  <div class="cb-page">
    <p class="muted">{{ msg }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const msg = ref('正在完成登录…');

onMounted(async () => {
  // 第三方绑定回调（auth.js bindRedirect：?bind=ok|fail&reason=…）
  const bind = route.query.bind;
  if (bind === 'ok' || bind === 'fail') {
    const reason = typeof route.query.reason === 'string' ? route.query.reason : '';
    if (bind === 'ok') {
      msg.value = '绑定成功，正在返回个人中心…';
      try {
        await auth.fetchMe();
      } catch {
        /* 未登录时跳转后由路由守卫处理 */
      }
      setTimeout(() => router.replace({ path: '/console', query: { bind: 'ok' } }), 1200);
    } else {
      // reason 现在是后端的稳定错误码（gone/dup/server），这里只做透传；
      // 具体中文文案在控制台按码映射后展示，此处不直接渲染原始值
      msg.value = '绑定失败，正在返回个人中心…';
      setTimeout(() => router.replace({ path: '/console', query: { bind: 'fail', reason } }), 2500);
    }
    return;
  }

  const token = route.query.token;
  if (typeof token !== 'string' || !token) {
    msg.value = '登录回调缺少凭证，请返回重新登录。';
    setTimeout(() => router.replace('/login'), 1500);
    return;
  }
  await auth.setToken(token);
  msg.value = '登录成功，正在跳转…';
  router.replace('/');
});
</script>

<style scoped>
.cb-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding-top: 80px;
}
</style>
