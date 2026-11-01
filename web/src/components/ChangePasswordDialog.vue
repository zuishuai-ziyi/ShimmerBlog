<script setup lang="ts">
/**
 * 修改/设置密码弹窗（个人资料页）：
 * - 流程：邮箱验证码 + 新密码 → PUT /auth/password（带 code 时无需 currentPassword）；
 * - 发码：POST /auth/send-code { email, purpose: 'change-password' }，
 *   站点开启行为验证时先弹 CaptchaDialog 验证再发码；后端回 CAPTCHA_REQUIRED 时同样补弹一次（验证通过自动重试）；
 * - 与 CaptchaDialog 保持同一套开合行为：原生 <dialog> + show() 非模态 + 自绘遮罩 + 页面滚动锁定 + Esc 关闭，
 *   不用 showModal() 是因为顶层会压过 Google 挑战弹层（z-index ≈ 2e9）导致挑战图被遮挡；
 *   校验（6 位验证码 / 密码 ≥6 位 / 两次一致）全在前端做，失败信息就地展示在表单内。
 * 用法：
 *   <ChangePasswordDialog v-model:open="open" @success="onChanged" />
 *   success 事件参数：(user: User | null, message?: string)——message 取后端返回文案
 *   （「密码已修改」/「密码已设置」），由调用方自行展示，避免与后端语义不一致。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import http, { errMsg, isCaptchaRequired, isCaptchaFailure } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import CaptchaDialog from './CaptchaDialog.vue';
import type { User } from '../stores/auth';

const props = defineProps<{
  open: boolean;
  /** 是否已设置密码：缺省读登录态（has_password 决定文案「修改密码 / 设置密码」） */
  hasPassword?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'success', user: User | null, message?: string): void;
}>();

const auth = useAuthStore();
const site = useSiteStore();

type Captcha = { key: string; value: string };

const email = computed(() => auth.user?.email || '');
const hasPassword = computed(() => props.hasPassword ?? !!auth.user?.has_password);

/* ---------- 表单状态 ---------- */
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const notice = ref('');
const devCode = ref('');
const sending = ref(false);
const saving = ref(false);
const counting = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function resetForm() {
  code.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  error.value = '';
  notice.value = '';
  devCode.value = '';
  // 有意不重置 counting / countdown / timer：60s 重发冷却跨「关窗→重开」保持，
  // 防止用户关掉弹窗就绕过重发节流反复发码（发码有频率成本）。
}

/* ---------- 行为验证码（内嵌 CaptchaDialog，验证通过自动续跑） ---------- */
const captchaOpen = ref(false);
const captchaAction = async (c: Captcha) => {
  await doSendCode(c);
};

/** 发码：直发；站点开启行为验证或后端要验证码时，先过 CaptchaDialog 再重试 */
async function sendCode() {
  if (!email.value) {
    error.value = '当前账号未绑定邮箱，无法使用验证码改密';
    return;
  }
  if (counting.value || sending.value) return;
  error.value = '';
  notice.value = '';
  if (site.info.captchaEnabled) {
    captchaOpen.value = true;
    return;
  }
  await doSendCode();
}

async function doSendCode(captcha?: Captcha) {
  sending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const { data } = await http.post<{ sent?: boolean; via?: string; devCode?: string }>('/auth/send-code', {
      email: email.value,
      purpose: 'change-password',
      captcha,
    });
    devCode.value = data.devCode || '';
    notice.value = '验证码已发送，10 分钟内有效';
    counting.value = true;
    countdown.value = 60;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) {
        counting.value = false;
        if (timer) clearInterval(timer);
        timer = null;
      }
    }, 1000);
  } catch (e) {
    if (isCaptchaFailure(e)) throw e; // 交回验证码弹窗：提示原因并自动换题
    if (isCaptchaRequired(e) && !captcha) {
      // 缺行为验证 → 弹验证码窗，验证通过后自动重试发码
      captchaOpen.value = true;
      return;
    }
    error.value = errMsg(e);
  } finally {
    sending.value = false;
  }
}

/* ---------- 提交改密 ---------- */
async function submit() {
  if (saving.value) return;
  error.value = '';
  notice.value = '';
  const c = code.value.trim();
  if (!/^\d{6}$/.test(c)) {
    error.value = '请输入 6 位邮箱验证码';
    return;
  }
  if (newPassword.value.length < 6) {
    error.value = '新密码至少 6 位';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致';
    return;
  }
  saving.value = true;
  try {
    const { data } = await http.put<{ user?: User; message: string }>('/auth/password', {
      code: c,
      newPassword: newPassword.value,
    });
    if (data.user) auth.user = data.user;
    notice.value = data.message || '密码已修改';
    // 连后端文案一起抛出去：OAuth-only 首设时后端返回「密码已设置」，由调用方按实际语义展示
    emit('success', data.user ?? null, data.message || '密码已修改');
    // 成功提示约 1s 后自动关闭并重置表单
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => close(), 1000);
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    saving.value = false;
  }
}

/* ---------- 弹窗开合（与 CaptchaDialog 同款：非模态 + 自绘遮罩 + 锁滚动 + Esc） ---------- */
const dlgEl = ref<HTMLDialogElement | null>(null);

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
      resetForm();
      // 清掉上一次成功后遗留的「1s 自动关闭」定时器：
      // 否则用户关掉弹窗后马上重开，悬挂的 timer 会把新弹窗立刻又关掉
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      await nextTick();
      const d = dlgEl.value;
      if (d && !d.open) {
        d.show();
        window.addEventListener('keydown', onEscKey, true);
        lockScroll();
      }
    } else {
      const d = dlgEl.value;
      if (d?.open) d.close();
    }
  },
  { immediate: true }
);

/** 验证码弹窗关闭时会顺手解锁页面滚动；外层仍开着时补回锁定 */
watch(captchaOpen, (v) => {
  if (!v && props.open) nextTick(() => lockScroll());
});

/** 原生 dialog 的 close 事件（Esc / 程序关闭都会触发） */
function onDialogClose() {
  window.removeEventListener('keydown', onEscKey, true);
  restoreScroll();
  resetForm();
  // 内嵌验证码弹窗是本 dialog 的子节点：不显式关掉，下次打开会残留一层遮罩
  captchaOpen.value = false;
  emit('update:open', false);
}

/** 原生 Esc 触发的 cancel：统一由 close() 控制关闭时机 */
function onCancel(e: Event) {
  e.preventDefault();
  if (captchaOpen.value) return; // 验证码弹窗自己处理 Esc
  close();
}

function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (captchaOpen.value) return; // 验证码弹窗自己处理 Esc
  e.stopImmediatePropagation();
  close();
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  if (closeTimer) clearTimeout(closeTimer);
  window.removeEventListener('keydown', onEscKey, true);
  restoreScroll();
});

function close() {
  emit('update:open', false);
}
</script>

<template>
  <dialog ref="dlgEl" class="pw-modal" aria-labelledby="pw-dlg-title" @close="onDialogClose" @cancel="onCancel">
    <div class="pw-panel">
      <div class="pw-head">
        <span id="pw-dlg-title" class="pw-title">{{ hasPassword ? '修改密码' : '设置密码' }}</span>
        <button class="pw-close" type="button" aria-label="关闭" @click="close">×</button>
      </div>
      <p class="pw-sub">通过邮箱验证码{{ hasPassword ? '重设' : '设置' }}登录密码</p>

      <form class="pw-form" @submit.prevent="submit">
        <div class="field">
          <label>邮箱</label>
          <input :value="email || '（未绑定）'" disabled />
        </div>

        <div class="field">
          <label>邮箱验证码</label>
          <div class="code-row">
            <input
              v-model.trim="code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="6 位数字"
              autocomplete="one-time-code"
            />
            <button type="button" class="btn-ghost" :disabled="counting || sending || !email" @click="sendCode">
              {{ counting ? `${countdown}s 后重发` : sending ? '发送中…' : '发送验证码' }}
            </button>
          </div>
          <p v-if="devCode" class="dev-tip">开发模式验证码：<strong>{{ devCode }}</strong></p>
        </div>

        <div class="field">
          <label>新密码</label>
          <input v-model="newPassword" type="password" autocomplete="new-password" placeholder="至少 6 位" />
        </div>

        <div class="field">
          <label>确认新密码</label>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
        </div>

        <p v-if="error" class="error-tip">{{ error }}</p>
        <p v-if="notice" class="notice">{{ notice }}</p>

        <div class="pw-actions">
          <button class="btn-ghost" type="button" @click="close">取消</button>
          <button class="btn" type="submit" :disabled="saving">
            {{ saving ? '保存中…' : hasPassword ? '修改密码' : '设置密码' }}
          </button>
        </div>
      </form>
    </div>

    <!-- 行为验证码弹窗必须在本组件的渲染树内（不随父组件卸载而丢失） -->
    <CaptchaDialog v-model:open="captchaOpen" :action="captchaAction" />
  </dialog>
</template>

<style scoped>
/* 非模态全屏遮罩：show() 不进顶层，自绘遮罩；z-index 远小于 Google 挑战弹层（≈2e9） */
dialog.pw-modal {
  position: fixed;
  inset: 0;
  z-index: 99999;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  margin: 0;
  padding: 0;
  border: none;
  background: rgb(0 0 0 / 45%);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text, #e8eef6);
}

/* 关键：class 选择器的 display:flex 会覆盖 UA 对未打开 dialog 的 display:none，
   导致弹窗未 open 也常驻全屏可见——必须显式恢复隐藏 */
dialog.pw-modal:not([open]) {
  display: none;
}

.pw-panel {
  width: min(380px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  padding: 18px 20px 20px;
  border-radius: 16px;
  background: var(--glass-bg, rgb(16 24 36 / 92%));
  border: 1px solid var(--glass-border, rgb(255 255 255 / 12%));
  box-shadow: 0 24px 60px rgb(0 0 0 / 35%);
}

.pw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pw-title {
  font-size: 16px;
  font-weight: 600;
}

.pw-close {
  border: none;
  background: none;
  color: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;
  padding: 2px 6px;
}

.pw-close:hover {
  opacity: 1;
}

.pw-sub {
  margin: 6px 0 14px;
  font-size: 12.5px;
  color: var(--text-dim);
}

.pw-form {
  display: grid;
  gap: 14px;
}

/* 全局 .field 自带 14px 下边距，弹窗内改用 grid gap 统一节奏 */
.pw-form .field {
  margin-bottom: 0;
}

.code-row {
  display: flex;
  gap: 10px;
}

.code-row input {
  flex: 1;
}

.code-row button {
  flex: none;
  white-space: nowrap;
}

.dev-tip {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--accent);
}

.notice {
  font-size: 13px;
  color: var(--accent);
}

.pw-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
