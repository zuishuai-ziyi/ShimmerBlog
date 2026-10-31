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
      setTimeout(() => router.replace('/console'), 1200);
    } else {
      msg.value = `绑定失败：${reason || '未知原因'}`;
      setTimeout(() => router.replace('/console'), 2500);
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
