<template>
  <div class="login-page">
    <div class="panel">
      <!-- 「忘记密码」属于登录流程的子页：页签常驻并继续高亮「登录」，
           否则切到重置页时整条页签消失（面板高度突跳、指示条停在旧位置） -->
      <div ref="tabsEl" class="tabs">
        <button type="button" :class="{ on: tabActive === 'login' }" @click="switchMode('login')">登录</button>
        <button type="button" v-if="site.info.registerOpen" :class="{ on: tabActive === 'register' }" @click="switchMode('register')">
          注册
        </button>
        <!-- 活动页签蓝色指示条：平滑滑动而非消失后出现 -->
        <span class="tabs-slider" :style="sliderStyle" aria-hidden="true"></span>
      </div>

      <div ref="swapHost" class="swap-host">
        <Transition name="swap" mode="out-in" v-on="swapHandlers">
          <form v-if="mode !== 'forgot'" :key="mode" @submit.prevent="submit">
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
          <form v-else key="forgot" @submit.prevent="submitReset">
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
        </Transition>
      </div>

      <!-- 第三方登录：按后端下发的已启用 provider 动态渲染（github / google / 其他 OAuth2） -->
      <div v-if="site.info.oauthProviders.length > 0 && mode !== 'forgot'" class="third">
        <div class="sep"><span>或使用以下方式继续</span></div>
        <a
          v-for="p in site.info.oauthProviders"
          :key="p.slug"
          class="btn-third"
          :class="`btn-${p.type}`"
          :href="'/api/auth/' + p.slug"
        >
          <!-- 图标：管理员可在后台指定内置图标或上传自定义图片；未设置时按 type / slug 自动回退 -->
          <OauthIcon :icon="p.icon" :icon-url="p.icon_url" :type="p.type" :slug="p.slug" :size="16" />
          使用 {{ p.name }} 继续
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
import { usePaneSwap } from '../utils/usePaneSwap';
import CaptchaDialog from '../components/CaptchaDialog.vue';
import OauthIcon from '../components/OauthIcon.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const site = useSiteStore();

const mode = ref<'login' | 'register' | 'forgot'>('login');
// 页签高亮：忘记密码是登录流程的子页，页签仍停在「登录」
const tabActive = computed(() => (mode.value === 'forgot' ? 'login' : mode.value));
// 页内三态切换：淡入 + 微位移，外面那层宿主负责补间高度（离场期间容器不能塌陷）
const { swapHost, swapHandlers } = usePaneSwap();
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
const sliderStyle = ref<{ left: string; width: string; transition?: string }>({ left: '0px', width: '0px' });
let sliderReady = false; // 首次定位前禁用过渡：进入页面时蓝线直接就位，不播放入场动画
function updateSlider() {
  const wrap = tabsEl.value;
  if (!wrap) return;
  const btn = wrap.querySelector('button.on') as HTMLElement | null;
  if (!btn) return;
  sliderStyle.value = {
    left: `${btn.offsetLeft}px`,
    width: `${btn.offsetWidth}px`,
    transition: sliderReady ? undefined : 'none',
  };
  if (!sliderReady) requestAnimationFrame(() => (sliderReady = true));
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
