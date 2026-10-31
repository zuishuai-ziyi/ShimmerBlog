<template>
  <div class="login-page">
    <div class="panel">
      <div v-if="mode !== 'forgot'" ref="tabsEl" class="tabs">
        <button type="button" :class="{ on: mode === 'login' }" @click="switchMode('login')">登录</button>
        <button type="button" v-if="site.info.registerOpen" :class="{ on: mode === 'register' }" @click="switchMode('register')">
          注册
        </button>
        <!-- 活动页签蓝色指示条：平滑滑动而非消失后出现 -->
        <span class="tabs-slider" :style="sliderStyle" aria-hidden="true"></span>
      </div>

      <form v-if="mode !== 'forgot'" @submit.prevent="submit">
        <div class="field">
          <label>邮箱</label>
          <input v-model.trim="form.email" type="email" placeholder="you@example.com" autocomplete="email" required />
        </div>

        <div class="field">
          <label>密码</label>
          <input
            v-model="form.password"
            type="password"
            :placeholder="mode === 'register' ? '至少 6 位' : '请输入密码'"
            :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
            required
          />
        </div>

        <div v-if="mode === 'register'" class="field">
          <label>昵称（可选）</label>
          <input v-model.trim="form.name" type="text" placeholder="留空则用邮箱前缀" maxlength="50" />
        </div>

        <div v-if="mode === 'register'" class="field">
          <label>邮箱验证码</label>
          <div class="code-row">
            <input
              v-model.trim="form.code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="6 位数字"
              autocomplete="one-time-code"
              required
            />
            <button type="button" class="btn-ghost" :disabled="counting || sending" @click="sendCode">
              {{ counting ? `${countdown}s 后重发` : sending ? '发送中…' : '发送验证码' }}
            </button>
          </div>
        </div>

        <p v-if="error" class="error-tip">{{ error }}</p>
        <p v-if="notice" class="notice">{{ notice }}</p>

        <button class="btn submit" type="submit" :disabled="loading">
          {{ loading ? '处理中…' : mode === 'register' ? '验证并注册' : '登录' }}
        </button>

        <p v-if="mode === 'login'" class="forgot-tip">
          <button type="button" class="forgot-link" @click="switchMode('forgot')">忘记密码？</button>
          验证邮箱后即可恢复密码
        </p>
      </form>

      <!-- 忘记密码：邮箱验证码重置 -->
      <form v-if="mode === 'forgot'" @submit.prevent="submitReset">
        <p class="forgot-title">通过注册邮箱验证重置密码</p>

        <div class="field">
          <label>注册邮箱</label>
          <input v-model.trim="form.email" type="email" placeholder="you@example.com" autocomplete="email" required />
        </div>

        <div class="field">
          <label>邮箱验证码</label>
          <div class="code-row">
            <input v-model.trim="form.code" type="text" inputmode="numeric" maxlength="6" placeholder="6 位数字" required />
            <button type="button" class="btn-ghost" :disabled="counting || sending" @click="sendCode">
              {{ counting ? `${countdown}s 后重发` : sending ? '发送中…' : '发送验证码' }}
            </button>
          </div>
          <p v-if="devCode" class="dev-tip">开发模式验证码：<strong>{{ devCode }}</strong></p>
        </div>

        <div class="field">
          <label>新密码</label>
          <input v-model="form.password" type="password" placeholder="至少 6 位" autocomplete="new-password" required />
        </div>

        <p v-if="error" class="error-tip">{{ error }}</p>
        <p v-if="notice" class="notice">{{ notice }}</p>

        <button class="btn submit" type="submit" :disabled="loading">
          {{ loading ? '提交中…' : '重置密码' }}
        </button>

        <p class="forgot-tip"><button type="button" class="forgot-link" @click="switchMode('login')">返回登录</button></p>
      </form>

      <div v-if="(site.info.githubEnabled || site.info.googleEnabled) && mode !== 'forgot'" class="third">
        <div class="sep"><span>或使用以下方式继续</span></div>
        <a v-if="site.info.githubEnabled" class="btn-third btn-github" href="/api/auth/github">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          使用 GitHub 继续
        </a>
        <a v-if="site.info.googleEnabled" class="btn-third btn-google" href="/api/auth/google">
          <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          使用 Google 继续
        </a>
      </div>
    </div>
    <CaptchaDialog v-model:open="captchaOpen" :action="captchaAction" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import http, { errMsg, isCaptchaRequired, isCaptchaFailure } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import CaptchaDialog from '../components/CaptchaDialog.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const site = useSiteStore();

const mode = ref<'login' | 'register' | 'forgot'>('login');
const loading = ref(false);
const sending = ref(false);
const error = ref('');
const notice = ref('');
const devCode = ref('');
const form = reactive({ email: '', password: '', name: '', code: '' });

const counting = ref(false);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

if (!site.loaded) site.fetch();

const redirect = computed(() => {
  const r = route.query.redirect;
  return typeof r === 'string' && r.startsWith('/') ? r : '/';
});

function switchMode(m: 'login' | 'register' | 'forgot') {
  mode.value = m;
  error.value = '';
  notice.value = '';
  devCode.value = '';
  if (m === 'login') form.password = '';
  if (m === 'forgot' || m === 'register') form.code = '';
}

type Captcha = { key: string; value: string };

/** 行为验证（GoCaptcha）：启用时先弹窗，验证通过后再真正提交 */
const captchaOpen = ref(false);
type CaptchaKind = 'submit' | 'sendCode';
const captchaPending = ref<CaptchaKind>('submit');
const needCaptcha = computed(() => site.info.captchaEnabled);

/** 返回 true = 未启用验证直接执行；false = 已打开弹窗，由 captchaAction 接管 */
function requestCaptcha(kind: CaptchaKind): boolean {
  if (!needCaptcha.value) return true;
  captchaPending.value = kind;
  captchaOpen.value = true;
  return false;
}

const captchaAction = async (c: Captcha) => {
  if (captchaPending.value === 'sendCode') await doSendCode(c);
  else await doSubmit(c);
};

async function submit() {
  if (loading.value) return;
  // 注册：发码时已验过一次（验证码信用），先直接提交；信用缺失时后端回 CAPTCHA_REQUIRED 再弹窗补验
  if (mode.value === 'register') {
    await doSubmit();
    return;
  }
  if (requestCaptcha('submit')) await doSubmit();
}

async function doSubmit(captcha?: Captcha) {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  notice.value = '';
  try {
    if (mode.value === 'register') {
      const { data } = await http.post('/auth/register', {
        email: form.email,
        password: form.password,
        name: form.name || undefined,
        code: form.code,
        captcha,
      });
      await auth.setToken(data.token);
      router.replace(redirect.value);
      return;
    }
    const { data } = await http.post('/auth/login', { email: form.email, password: form.password, captcha });
    await auth.setToken(data.token);
    router.replace(redirect.value);
  } catch (e) {
    if (isCaptchaRequired(e)) {
      // 注册信用缺失/过期 → 补一次行为验证，确认后自动重提交
      requestCaptcha('submit');
      return;
    }
    if (isCaptchaFailure(e)) throw e; // 验证码未通过：抛给弹窗处理（弹窗内提示+自动换题），吞掉会被弹窗误认为成功而关闭
    error.value = errMsg(e);
  } finally {
    loading.value = false;
  }
}

/** 发送邮箱验证码：注册用 register，忘记密码用 reset */
async function sendCode() {
  if (!form.email) {
    error.value = '请先填写邮箱';
    return;
  }
  if (requestCaptcha('sendCode')) await doSendCode();
}

async function doSendCode(captcha?: Captcha) {
  sending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const purpose = mode.value === 'register' ? 'register' : 'reset';
    const { data } = await http.post('/auth/send-code', { email: form.email, purpose, captcha });
    notice.value = '验证码已发送，10 分钟内有效';
    devCode.value = data.devCode || '';
    counting.value = true;
    countdown.value = 60;
    timer && clearInterval(timer);
    timer = setInterval(() => {
      countdown.value -= 1;
      if (countdown.value <= 0) {
        counting.value = false;
        timer && clearInterval(timer);
        timer = null;
      }
    }, 1000);
  } catch (e) {
    if (isCaptchaFailure(e)) throw e; // 验证码未通过：抛给弹窗处理（弹窗内提示+自动换题），吞掉会被弹窗误认为成功而关闭
    error.value = errMsg(e);
  } finally {
    sending.value = false;
  }
}

/** 验证邮箱后重置密码 */
async function submitReset() {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  notice.value = '';
  try {
    await http.post('/auth/reset-password', {
      email: form.email,
      code: form.code,
      password: form.password,
    });
    form.password = '';
    form.code = '';
    mode.value = 'login';
    notice.value = '密码已重置，请使用新密码登录';
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  window.removeEventListener('resize', updateSlider);
});

// ===== 页签指示条滑动 =====
const tabsEl = ref<HTMLElement | null>(null);
const sliderStyle = ref<{ left: string; width: string }>({ left: '0px', width: '0px' });
function updateSlider() {
  const wrap = tabsEl.value;
  if (!wrap) return;
  const btn = wrap.querySelector('button.on') as HTMLElement | null;
  if (!btn) return;
  sliderStyle.value = { left: `${btn.offsetLeft}px`, width: `${btn.offsetWidth}px` };
}
watch([mode, (): boolean | undefined => site.info.registerOpen], () => nextTick(updateSlider));
onMounted(() => {
  updateSlider();
  window.addEventListener('resize', updateSlider);
});
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120px 22px 60px;
}

.panel {
  width: min(430px, 100%);
  padding: 30px 32px 34px;
  border-radius: 20px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
}

.tabs {
  position: relative;
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}

.tabs button {
  flex: 1;
  padding: 10px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-dim);
  background: transparent;
  border: none;
  transition: color 0.2s;
}

.tabs button.on {
  color: #ffffff;
}

/* 活动页签指示条：单条元素随选中页签平滑滑动 */
.tabs-slider {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
  transition: left 0.25s ease, width 0.25s ease;
  pointer-events: none;
}

.forgot-tip {
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-dim);
  text-align: center;
}

.forgot-link {
  padding: 0;
  font-size: 13px;
  color: var(--accent);
  background: none;
  border: none;
}

.forgot-link:hover {
  text-decoration: underline;
}

.forgot-title {
  margin-bottom: 16px;
  font-size: 13.5px;
  color: var(--text-dim);
  text-align: center;
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

.submit {
  width: 100%;
  margin-top: 8px;
  padding: 12px 0;
  font-size: 15px;
}

.notice {
  font-size: 13px;
  color: var(--accent);
  margin-top: 8px;
}

.hint-tip {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-dim);
}

.third {
  margin-top: 22px;
}

.sep {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-dim);
  font-size: 12px;
  margin-bottom: 16px;
}

.sep::before,
.sep::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(150, 205, 232, 0.2);
}

.btn-third {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 11px 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  text-decoration: none;
  background: var(--fill);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s;
}

.btn-third:hover {
  background: var(--fill-hover);
}

.btn-third + .btn-third {
  margin-top: 10px;
}

/* 与其他页面卡片完全统一：同一套玻璃蓝底色/描边/圆角（全局已无模糊） */
.panel {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
}
</style>
