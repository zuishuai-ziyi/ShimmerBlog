<template>
  <canvas ref="canvasEl" class="star-transition-layer" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { starTransition } from '../utils/starTransition';

/** 星光过渡层：覆盖在页面内容之上、顶栏之下，只承接路由切换时的粒子动画 */
const canvasEl = ref<HTMLCanvasElement | null>(null);

onMounted(() => starTransition.attach(canvasEl.value!));
onBeforeUnmount(() => starTransition.detach());
</script>

<style scoped>
.star-transition-layer {
  position: fixed;
  inset: 0;
  z-index: 30; /* 内容(1) < 星光层 < 顶栏(50) */
  pointer-events: none;
}
</style>
