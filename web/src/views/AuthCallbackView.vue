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
