<script setup lang="ts">
/**
 * GoCaptcha 行为验证弹窗：封装 go-captcha-vue 的 Click 点选组件。
 * 用法：
 *   <CaptchaDialog v-model:open="open" title="发布文章" :action="doSave" />
 *   open.value = true 打开弹窗；弹窗内部取题、点选，confirm 后调用 action({key, value})，
 *   action 成功 → 自动关闭；action 抛错 → 弹窗内展示错误并自动换题（key 已消费不能复用）。
 * 未启用验证码（site.info.captchaEnabled=false）时直接执行 action，不弹窗。
 */
import { ref, watch, computed } from 'vue';
import { Click } from 'go-captcha-vue';
import 'go-captcha-vue/dist/style.css';
import { useSiteStore } from '../stores/site';

const props = defineProps<{
  open: boolean;
  title?: string;
  action: (captcha: { key: string; value: string }) => Promise<void>;
}>();
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>();

const site = useSiteStore();

const loading = ref(false);
const busy = ref(false);
const error = ref('');
const loadError = ref('');
const captchaKey = ref('');
const image = ref('');
const thumb = ref('');
const width = ref(300);
const height = ref(220);
const thumbWidth = ref(150);
const thumbHeight = ref(40);
const dots = ref<Array<{ key: number; index: number; x: number; y: number }>>([]);

const config = computed(() => ({
  width: width.value,
  height: height.value,
  thumbWidth: thumbWidth.value,
  thumbHeight: thumbHeight.value,
  title: '请点选图中文字',
}));

async function load() {
  error.value = '';
  loadError.value = '';
  dots.value = [];
  if (!site.info.captchaApi) {
    loadError.value = '验证码服务未配置';
    return;
  }
  loading.value = true;
  try {
    const base = site.info.captchaApi.replace(/\/+$/, '');
    const r = await fetch(`${base}/api/v1/public/get-data?id=${encodeURIComponent(site.info.captchaId || 'click-default-ch')}`);
    const j = await r.json();
    if (!r.ok || j?.code !== 200 || !j?.data?.captcha_key) throw new Error(j?.message || '加载失败');
    captchaKey.value = j.data.captcha_key;
    image.value = j.data.master_image_base64;
    thumb.value = j.data.thumb_image_base64;
    width.value = j.data.master_width || 300;
    height.value = j.data.master_height || 220;
    thumbWidth.value = j.data.thumb_width || 150;
    thumbHeight.value = j.data.thumb_height || 40;
  } catch {
    loadError.value = '验证码加载失败，请检查网络或稍后再试';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) load();
  }
);

function close() {
  emit('update:open', false);
}

async function refresh() {
  await load();
}

async function onConfirm(list: Array<{ x: number; y: number }>, reset: () => void) {
  if (busy.value || loading.value) return;
  error.value = '';
  if (!list.length) {
    error.value = '请先按顺序点击图中的文字';
    reset();
    return;
  }
  busy.value = true;
  try {
    const value = list.map((d) => `${d.x},${d.y}`).join(',');
    await props.action({ key: captchaKey.value, value });
    close();
  } catch (e: any) {
    // key 已在后端消费/失败，必须换题重试
    error.value = e?.message || '操作失败，请重试';
    reset();
    await refresh();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="captcha-overlay" @click.self="close">
      <div class="captcha-modal" role="dialog" aria-modal="true" :aria-label="title || '安全验证'">
        <div class="captcha-head">
          <span class="captcha-title">{{ title || '安全验证' }}</span>
          <button class="captcha-close" type="button" aria-label="关闭" @click="close">×</button>
        </div>
        <p class="captcha-sub">完成下方验证后将继续操作</p>

        <div v-if="loadError" class="captcha-error">
          <span>{{ loadError }}</span>
          <button class="captcha-retry" type="button" @click="load">重试</button>
        </div>
        <div v-else class="captcha-body">
          <Click
            :config="config"
            :data="{ image, thumb }"
            :events="{ refresh, close, confirm: onConfirm }"
          />
          <p v-if="error" class="captcha-error">{{ error }}</p>
          <p v-if="busy" class="captcha-busy">正在验证…</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.captcha-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 45%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.captcha-modal {
  width: min(360px, calc(100vw - 32px));
  padding: 18px 18px 16px;
  border-radius: var(--radius-lg, 16px);
  background: var(--glass-bg, rgb(16 24 36 / 88%));
  border: 1px solid var(--glass-border, rgb(255 255 255 / 12%));
  box-shadow: 0 24px 60px rgb(0 0 0 / 35%);
  color: var(--text, #e8eef6);
}

.captcha-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.captcha-title {
  font-size: 16px;
  font-weight: 600;
}

.captcha-close {
  border: none;
  background: none;
  color: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
  padding: 2px 6px;
}

.captcha-close:hover {
  opacity: 1;
}

.captcha-sub {
  margin: 6px 0 12px;
  font-size: 12.5px;
  opacity: 0.65;
}

.captcha-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.captcha-error {
  margin: 0;
  font-size: 13px;
  color: #ff8f8f;
  display: flex;
  align-items: center;
  gap: 10px;
}

.captcha-retry {
  border: 1px solid rgb(255 255 255 / 25%);
  background: rgb(255 255 255 / 8%);
  color: inherit;
  border-radius: 8px;
  padding: 3px 12px;
  font-size: 12.5px;
  cursor: pointer;
}

.captcha-busy {
  margin: 0;
  font-size: 12.5px;
  opacity: 0.7;
}
</style>

<style>
/* go-captcha-vue 内部非 scoped 样式适配（弹窗内） */
.captcha-modal .go-captcha,
.captcha-modal .go-captcha * {
  box-sizing: border-box;
}
</style>
