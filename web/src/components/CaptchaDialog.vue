<script setup lang="ts">
/**
 * GoCaptcha 行为验证弹窗：封装 go-captcha-vue 的 Click 点选组件。
 * 用法：
 *   <CaptchaDialog v-model:open="open" :action="doSave" />
 *   open.value = true 打开弹窗；弹窗内部取题、点选，confirm 后调用 action({key, value})，
 *   action 成功 → 自动关闭；
 *   action 抛验证码类错误（CAPTCHA_FAILED/CAPTCHA_UNAVAILABLE）→ 弹窗内下方小字提示并自动换题，
 *   用户只需重新点选，无需重试整个操作（key 已消费不能复用）；
 *   其他业务错误（如密码错误）→ 关闭弹窗，由表单层展示错误。
 * 交互：原生 <dialog>.showModal()——打开时焦点困在弹窗内（Tab 不会落到背景元素）、
 *   页面滚动锁定、点击遮罩空白不关闭（Esc/× 可关闭）。
 * 未启用验证码（site.info.captchaEnabled=false）时父组件不会打开本弹窗。
 */
import { ref, watch, computed, onBeforeUnmount, nextTick } from 'vue';
import { Click } from 'go-captcha-vue';
import 'go-captcha-vue/dist/style.css';
import { useSiteStore } from '../stores/site';
import { errMsg, isCaptchaFailure } from '../api/http';

const props = defineProps<{
  open: boolean;
  action: (captcha: { key: string; value: string }) => Promise<void>;
}>();
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>();

const site = useSiteStore();

const dlgEl = ref<HTMLDialogElement | null>(null);
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

function lockScroll() {
  document.documentElement.style.overflow = 'hidden';
}

function restoreScroll() {
  document.documentElement.style.overflow = '';
}

watch(
  () => props.open,
  async (v) => {
    if (v) {
      await nextTick();
      const d = dlgEl.value;
      if (d && !d.open) {
        d.showModal(); // 原生模态：焦点困住 + 置顶层，背景不可交互
        lockScroll();
      }
      load();
    } else {
      const d = dlgEl.value;
      if (d?.open) d.close();
    }
  }
);

/** 原生 dialog 的 close 事件（Esc / 程序关闭都会触发） */
function onDialogClose() {
  restoreScroll();
  emit('update:open', false);
}

onBeforeUnmount(restoreScroll);

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
    if (isCaptchaFailure(e)) {
      // 验证码未通过/失效/服务不可用：先换新题再设置提示（load() 会清 error，反序会被清掉），
      // 失败原因显示在点选组件下方小字，直接重新点选即可
      reset();
      await refresh();
      error.value = errMsg(e);
    } else {
      // 业务错误（如密码错误、昵称占用）：关闭弹窗，由表单层展示，避免误导为验证码问题
      close();
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <dialog ref="dlgEl" class="captcha-modal" aria-labelledby="captcha-dlg-title" @close="onDialogClose">
    <div class="captcha-head">
      <span id="captcha-dlg-title" class="captcha-title">安全验证</span>
      <button class="captcha-close" type="button" aria-label="关闭" @click="close">×</button>
    </div>
    <p class="captcha-sub">请完成验证以继续</p>

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
      <p v-if="error" class="captcha-result">{{ error }}</p>
      <p v-if="busy" class="captcha-busy">正在验证…</p>
    </div>
  </dialog>
</template>

<style scoped>
dialog.captcha-modal {
  margin: auto;
  width: min(360px, calc(100vw - 32px));
  padding: 18px 18px 16px;
  border-radius: 16px;
  background: var(--glass-bg, rgb(16 24 36 / 92%));
  border: 1px solid var(--glass-border, rgb(255 255 255 / 12%));
  box-shadow: 0 24px 60px rgb(0 0 0 / 35%);
  color: var(--text, #e8eef6);
}

dialog.captcha-modal::backdrop {
  background: rgb(0 0 0 / 45%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
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

/* 验证结果：弹窗内下方小字 */
.captcha-result {
  margin: 0;
  font-size: 12px;
  color: #ff9d9d;
  opacity: 0.9;
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
