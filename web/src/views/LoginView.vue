<template>
  <div class="login-page">
    <div class="panel">
      <div v-if="mode !== 'forgot'" class="tabs">
        <button type="button" :class="{ on: mode === 'login' }" @click="switchMode('login')">登录</button>
        <button type="button" v-if="site.info.registerOpen" :class="{ on: mode === 'register' }" @click="switchMode('register')">
          注册
        </button>
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

        <p v-if="error" class="error-tip">{{ error }}</p>
        <p v-if="notice" class="notice">{{ notice }}</p>

        <button class="btn submit" type="submit" :disabled="loading">
          {{ loading ? '处理中…' : mode === 'register' ? '注册并登录' : '登录' }}
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

      <div v-if="site.info.githubEnabled && mode !== 'forgot'" class="third">
        <div class="sep"><span>或</span></div>
        <a class="btn-github" href="/api/auth/github">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
            />
          </svg>
          使用 GitHub 登录
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import http, { errMsg } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';

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
  if (m === 'forgot') form.code = '';
}

async function submit() {
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
      });
      await auth.setToken(data.token);
      router.replace(redirect.value);
      return;
    }
    const { data } = await http.post('/auth/login', { email: form.email, password: form.password });
    await auth.setToken(data.token);
    router.replace(redirect.value);
  } catch (e) {
    error.value = errMsg(e);
  } finally {
    loading.value = false;
  }
}

/** 发送邮箱验证码（忘记密码重置用） */
async function sendCode() {
  if (!form.email) {
    error.value = '请先填写注册邮箱';
    return;
  }
  sending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const { data } = await http.post('/auth/send-code', { email: form.email, purpose: 'reset' });
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
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}

.tabs button.on {
  color: #ffffff;
  border-bottom-color: var(--accent);
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

.btn-github {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 11px 0;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s;
}

.btn-github:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* 登录页不用毛玻璃：面板改半透明深色（背景星空直接透出） */
.panel {
  background: rgb(10 18 28 / 55%);
  border: 1px solid rgb(140 198 226 / 20%);
}
</style>
