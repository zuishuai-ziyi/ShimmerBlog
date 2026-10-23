<template>
  <canvas ref="canvasEl" class="starfield" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * 星空背景：纯黑画布上大量向上漂浮的白点。
 * 每颗星的大小 / 速度 / 基础透明度 / 闪烁相位均随机；飘出顶部后从底部重生。
 */
interface Star {
  x: number;
  y: number;
  r: number;      // 半径（大小随机）
  speed: number;  // 向上速度（随机）
  alpha: number;  // 基础透明度（随机）
  phase: number;  // 闪烁相位
  twinkle: number;// 闪烁频率
}

const canvasEl = ref<HTMLCanvasElement | null>(null);
let cleanup: (() => void) | null = null;

onMounted(() => {
  const canvas = canvasEl.value!;
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let stars: Star[] = [];
  let raf = 0;
  let last = performance.now();

  function spawn(fromBottom: boolean): Star {
    return {
      x: Math.random() * w,
      y: fromBottom ? h + 4 : Math.random() * h,
      r: 0.4 + Math.random() * 1.8,
      speed: 0.15 + Math.random() * 0.85,
      alpha: 0.25 + Math.random() * 0.75,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.5 + Math.random() * 1.6,
    };
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(90, Math.round((w * h) / 8500));
    stars = Array.from({ length: count }, () => spawn(false));
  }

  function frame(now: number) {
    const dt = Math.min(50, now - last);
    last = now;
    const k = dt / 16.7; // 归一到 60fps 步长
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.y -= s.speed * k;
      if (s.y < -6) {
        stars[i] = spawn(true);
        continue;
      }
      const tw = 0.6 + 0.4 * Math.sin((now / 1000) * s.twinkle + s.phase);
      ctx.globalAlpha = Math.min(1, s.alpha * tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
});

onBeforeUnmount(() => cleanup?.());
</script>

<style scoped>
.starfield {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: #000;
}
</style>
