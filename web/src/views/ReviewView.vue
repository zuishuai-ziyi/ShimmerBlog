<template>
  <div class="review">
    <!-- 校验登录状态中：已过期令牌不会先闪出工作台 -->
    <div v-if="booting" class="boot">正在验证登录状态…</div>

    <!-- ======== 登录门 ======== -->
    <div v-else-if="!reviewer.authed" class="gate">
      <div class="gate-card">
        <h1><span class="grad">ShimmerBlog</span> 审核后台</h1>
        <p class="gate-sub">审核员登录后进入工作台</p>
        <form @submit.prevent="onFormSubmit">
          <label class="field">
            <span>用户名</span>
            <input v-model.trim="username" type="text" placeholder="审核员账号" autocomplete="username" />
          </label>
          <label class="field">
            <span>密码</span>
            <input v-model="password" type="password" placeholder="密码" autocomplete="current-password" />
          </label>
          <button class="primary wide" type="submit" :disabled="busy">
            {{ busy ? '登录中…' : '登录' }}
          </button>
        </form>
        <p v-if="gateError" class="gate-err">{{ gateError }}</p>
        <!-- 行为验证码：后端返回 CAPTCHA_REQUIRED 时展开（与 AdminView 一致放在 form 外，避免误触发表单提交） -->
        <CaptchaDialog v-model:open="gateCaptchaOpen" :action="onCaptchaDone" inline />
      </div>
    </div>

    <!-- ======== 工作台 ======== -->
    <div v-else class="shell">
      <header class="top">
        <div class="brand"><span class="grad">ShimmerBlog</span><b>审核后台</b></div>
        <div class="top-right">
          <span class="who">{{ reviewer.reviewer?.display_name || reviewer.reviewer?.username || '审核员' }}</span>
          <button class="ghost sm" @click="logout">退出</button>
        </div>
      </header>

      <nav class="tabs">
        <button :class="{ on: tab === 'queue' }" @click="tab = 'queue'">审核队列</button>
        <button :class="{ on: tab === 'history' }" @click="tab = 'history'">我的审核记录</button>
        <button :class="{ on: tab === 'account' }" @click="tab = 'account'">账号设置</button>
      </nav>

      <main class="main">
        <!-- ============ 审核队列 ============ -->
        <section v-if="tab === 'queue'" class="pane queue">
          <div class="card list-card">
            <div class="list-head">
              <h2>待审队列</h2>
              <span class="dim">共 {{ queueTotal }} 条</span>
            </div>
            <p v-if="queueLoading" class="hint">加载中…</p>
            <p v-else-if="!queue.length" class="hint">暂无待审内容</p>
            <ul v-else class="qlist">
              <li
                v-for="it in queue"
                :key="it.id"
                class="qitem"
                :class="{ on: it.id === currentId }"
                @click="openRecord(it.id)"
              >
                <div class="qtitle">{{ it.title }}</div>
                <div class="qmeta">
                  <img class="mini-avatar" :src="it.author_avatar || fallbackAvatar" alt="" />
                  <span class="qname">{{ it.author_name }}</span>
                  <span class="dim">{{ fmt(it.created_at) }}</span>
                </div>
                <div class="qtags">
                  <span v-if="it.article_status === 'published'" class="pill update">更新审</span>
                  <span class="pill" :class="aiBadge(it).cls">{{ aiBadge(it).text }}</span>
                  <span v-if="it.ai_error" class="ai-err" :title="it.ai_error">{{ it.ai_error }}</span>
                </div>
              </li>
            </ul>
            <div class="pager">
              <button class="ghost sm" :disabled="queuePage <= 1" @click="gotoQueuePage(queuePage - 1)">上一页</button>
              <span class="dim">第 {{ queuePage }} / {{ queuePages }} 页</span>
              <button class="ghost sm" :disabled="queuePage >= queuePages" @click="gotoQueuePage(queuePage + 1)">下一页</button>
            </div>
          </div>

          <div class="card detail-card">
            <p v-if="recordLoading" class="hint">正在加载详情…</p>
            <div v-else-if="!record" class="empty">
              从左侧选择一条待审内容，查看完整正文与 AI 意见
            </div>
            <template v-else>
              <div class="list-head">
                <h2>{{ record.title }}</h2>
                <span v-if="(record.article_status || currentItem?.article_status) === 'published'" class="pill update">更新审</span>
              </div>
              <div class="dmeta">
                <img class="mini-avatar" :src="record.author_avatar || currentItem?.author_avatar || fallbackAvatar" alt="" />
                <span class="qname">{{ record.author_name || currentItem?.author_name || '未知作者' }}</span>
                <span class="dim">提交于 {{ fmt(record.created_at) }}</span>
                <span v-if="stageLabel" class="dim">{{ stageLabel }}</span>
              </div>
              <div v-if="record.stages?.length" class="stages">
                <span
                  v-for="s in record.stages"
                  :key="s"
                  class="pill stage"
                  :class="{ cur: s === record.stage }"
                >{{ s }}</span>
              </div>
              <!-- 审核流程步骤条（后端附带的 steps） -->
              <div v-if="recordSteps.length" class="flow-row">
                <span class="dim flow-label">审核流程</span>
                <ReviewSteps :steps="recordSteps" compact />
              </div>
              <p v-if="record.summary" class="summary">{{ record.summary }}</p>

              <!-- AI 意见 -->
              <div class="ai-box" :class="aiBadge(record).cls">
                <div class="ai-head">
                  <span class="pill" :class="aiBadge(record).cls">{{ aiBadge(record).text }}</span>
                  <span class="dim">AI 初审意见</span>
                </div>
                <p v-if="record.ai_reason" class="ai-reason">{{ record.ai_reason }}</p>
                <p v-else-if="!record.ai_error" class="ai-reason dim">AI 未给出理由</p>
                <p v-if="record.ai_error" class="ai-reason err">{{ record.ai_error }}</p>
              </div>

              <!-- 正文预览 -->
              <h3 class="sec">正文预览</h3>
              <div class="prose-box">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="prose" v-html="recordHtml"></div>
              </div>

              <!-- 流转记录 -->
              <template v-if="record.actions?.length">
                <h3 class="sec">流转记录</h3>
                <ul class="trail">
                  <li v-for="(a, i) in record.actions" :key="i">
                    <span class="pill" :class="a.action === 'reject' ? 'bad' : a.action === 'approve' ? 'ok' : 'none'">
                      {{ actionLabel(a.action) }}
                    </span>
                    <span class="who-mini">{{ actorLabel(a.actor_type) }} · {{ a.actor_name }}</span>
                    <span class="dim">{{ fmt(a.created_at) }}</span>
                    <span v-if="a.note" class="note">{{ a.note }}</span>
                  </li>
                </ul>
              </template>

              <!-- 操作区 -->
              <div class="ops">
                <button class="primary ok" :disabled="deciding || record.status !== 'pending'" @click="decide('approve')">
                  {{ deciding ? '提交中…' : '通过' }}
                </button>
                <button class="primary bad" :disabled="deciding || record.status !== 'pending'" @click="openReject">拒绝</button>
                <span class="dim">通过后内容按当前阶段发布/生效；拒绝需填写备注（可留空）</span>
              </div>
            </template>
          </div>
        </section>

        <!-- ============ 我的审核记录 ============ -->
        <section v-else-if="tab === 'history'" class="pane">
          <div class="card">
            <div class="list-head">
              <h2>我的审核记录</h2>
              <span class="dim">共 {{ historyTotal }} 条</span>
            </div>
            <p v-if="historyLoading" class="hint">加载中…</p>
            <p v-else-if="!historyItems.length" class="hint">还没有审核记录</p>
            <div v-else class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>作者</th>
                    <th>结果</th>
                    <th>时间</th>
                    <th>拒绝备注</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="h in historyItems" :key="h.id">
                    <td class="title-cell">{{ h.title }}</td>
                    <td>{{ h.author_name }}</td>
                    <td>
                      <span class="pill" :class="h.status === 'approved' ? 'ok' : 'bad'">
                        {{ h.status === 'approved' ? '已通过' : '已拒绝' }}
                      </span>
                    </td>
                    <td class="dim">{{ fmt(h.decided_at || h.created_at) }}</td>
                    <td class="note-cell">{{ h.reject_note || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="pager">
              <button class="ghost sm" :disabled="historyPage <= 1" @click="gotoHistoryPage(historyPage - 1)">上一页</button>
              <span class="dim">第 {{ historyPage }} / {{ historyPages }} 页</span>
              <button class="ghost sm" :disabled="historyPage >= historyPages" @click="gotoHistoryPage(historyPage + 1)">下一页</button>
            </div>
          </div>
        </section>

        <!-- ============ 账号设置 ============ -->
        <section v-else class="pane">
          <div class="card narrow">
            <h2>修改密码</h2>
            <p class="hint">新密码至少 8 位。修改后下次登录使用新密码。</p>
            <label class="row"><span>当前密码</span><input v-model="oldPwd" type="password" autocomplete="current-password" /></label>
            <label class="row"><span>新密码</span><input v-model="newPwd" type="password" autocomplete="new-password" /></label>
            <label class="row"><span>确认新密码</span><input v-model="confirmPwd" type="password" autocomplete="new-password" /></label>
            <div class="ops">
              <button class="primary" :disabled="pwdSaving" @click="savePassword">
                {{ pwdSaving ? '提交中…' : '保存' }}
              </button>
              <span v-if="pwdMsg" class="flash" :class="{ bad: !pwdOk }">{{ pwdMsg }}</span>
            </div>
          </div>

          <!-- ======== 审核通知 ======== -->
          <div class="card narrow spaced">
            <h2>审核通知</h2>
            <label class="check-row">
              <input v-model="notifyNewTask" type="checkbox" />
              <span>有新审核任务时给我发邮件</span>
            </label>
            <p class="hint">
              <template v-if="reviewerEmail">通知将发送至 {{ reviewerEmail }}</template>
              <template v-else>通知邮箱：未设置</template>
            </p>
            <p v-if="!reviewerEmail" class="hint">请联系管理员在后台为你的账号填写邮箱，否则收不到通知邮件。</p>
            <div class="ops">
              <button class="primary" :disabled="notifySaving" @click="saveNotifyPrefs">
                {{ notifySaving ? '提交中…' : '保存' }}
              </button>
              <span v-if="notifyMsg" class="flash" :class="{ bad: !notifyOk }">{{ notifyMsg }}</span>
            </div>
          </div>
        </section>
      </main>

      <p v-if="flash" class="flash-bar" :class="{ bad: flashBad }">{{ flash }}</p>
    </div>

    <!-- ======== 拒绝备注弹层 ======== -->
    <div v-if="rejectOpen" class="modal-mask" @click.self="rejectOpen = false">
      <div class="modal">
        <h3>拒绝该内容</h3>
        <p class="hint">备注可留空，最多 500 字。</p>
        <textarea v-model="rejectNote" class="ta" rows="5" maxlength="500" placeholder="填写拒绝理由（可留空）" />
        <p class="dim count">{{ rejectNote.length }}/500</p>
        <div class="modal-ops">
          <button class="ghost" @click="rejectOpen = false">取消</button>
          <button class="primary bad" :disabled="deciding" @click="submitReject">确认拒绝</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import CaptchaDialog from '../components/CaptchaDialog.vue';
import ReviewSteps from '../components/ReviewSteps.vue';
import defaultAvatar from '../assets/default-avatar.svg';
import { useReviewerStore } from '../stores/reviewer';
import { useSiteStore } from '../stores/site';
import { useSilentPolling } from '../stores/polling';
import { formatDateTime } from '../utils/format';
import type { ReviewStep } from '../types';
import {
  apiChangePassword,
  apiDecide,
  apiHistory,
  apiNotifyPrefs,
  apiQueue,
  apiRecord,
  apiUpdateNotifyPrefs,
  errMsg,
  isCaptchaFailure,
  isCaptchaRequired,
  isConflict,
  REVIEW_UNAUTHORIZED_EVENT,
  type HistoryItem,
  type QueueItem,
  type ReviewRecord,
} from '../api/review';

const reviewer = useReviewerStore();
const site = useSiteStore();
// 已有本地令牌时先进入「验证中」态，避免过期令牌先渲染工作台内容再跳回登录门
const booting = ref(!!reviewer.token && !reviewer.checked);

type Tab = 'queue' | 'history' | 'account';
const tab = ref<Tab>('queue');

const fallbackAvatar = computed(() => site.info.defaultAvatarUrl || defaultAvatar);

function fmt(v: string | null | undefined): string {
  return formatDateTime(v) || '—';
}

/* ---------------- 登录门 ---------------- */
const username = ref('');
const password = ref('');
const busy = ref(false);
const gateError = ref('');
const gateCaptchaOpen = ref(false);

if (!site.loaded) site.fetch();

/** 提交登录；captcha 由验证码弹窗回传（key/value） */
async function submitLogin(captcha?: { key: string; value: string }) {
  busy.value = true;
  gateError.value = '';
  try {
    await reviewer.login(username.value.trim(), password.value, captcha);
    password.value = '';
    // 登录成功：清掉「登录状态已过期」等登录门提示
    gateError.value = '';
    await bootstrap();
  } catch (e) {
    // 验证码未通过：抛给验证码弹窗，由弹窗内部提示并自动换题
    if (isCaptchaFailure(e)) throw e;
    // 需要行为验证码：展开验证码面板，验证后自动重试
    if (isCaptchaRequired(e)) {
      gateCaptchaOpen.value = true;
      return;
    }
    gateError.value = errMsg(e);
  } finally {
    busy.value = false;
  }
}

async function onFormSubmit() {
  if (!username.value.trim()) {
    gateError.value = '请输入审核员账号';
    return;
  }
  if (!password.value) {
    gateError.value = '请输入密码';
    return;
  }
  try {
    await submitLogin();
  } catch {
    /* 验证码类错误已由验证码弹窗处理 */
  }
}

async function onCaptchaDone(c: { key: string; value: string }) {
  await submitLogin(c);
}

function logout() {
  reviewer.logout();
  currentId.value = null;
  record.value = null;
  queue.value = [];
  historyItems.value = [];
}

/* ---------------- 会话过期提示 ---------------- */
/**
 * 会话过期（401）时给出可见提示，避免用户被静默退回登录门却不知原因。
 *
 * api/review.ts 的响应拦截器会广播 REVIEW_UNAUTHORIZED_EVENT：
 * - detail.hadToken === true  → 原本有令牌但已失效（会话过期）→ 提示重新登录
 * - detail.hadToken === false → 本来就没登录（登录门下的正常 401）→ 不提示
 *
 * 文案只写在视图层：store 只负责复位登录态，不携带 UI 文案。
 */
function onReviewUnauthorized(e: Event) {
  const hadToken = (e as CustomEvent<{ hadToken?: boolean }>).detail?.hadToken === true;
  if (!hadToken) return;
  gateError.value = '登录状态已过期，请重新登录';
}

/* ---------------- 通用提示 ---------------- */
const flash = ref('');
const flashBad = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function showFlash(msg: string, bad = false) {
  flash.value = msg;
  flashBad.value = bad;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    flash.value = '';
    flashBad.value = false;
  }, 3200);
}

/* ---------------- 审核队列 ---------------- */
const queue = ref<QueueItem[]>([]);
const queueTotal = ref(0);
const queuePage = ref(1);
const queuePageSize = 20;
const queueLoading = ref(false);

const currentId = ref<number | null>(null);
const record = ref<ReviewRecord | null>(null);
/**
 * 详情里的审核步骤：后端 /review/records/:id 附带 steps。
 * api/review.ts 的类型未同步该字段，这里本地收窄后取用。
 */
const recordSteps = computed<ReviewStep[]>(() => {
  const r = record.value as (ReviewRecord & { steps?: ReviewStep[] }) | null;
  return r?.steps ?? [];
});
/**
 * 当前环节的可读标签：优先后端下发的 current_stage_label（如「人工审核」），
 * 缺失时按 record.stage（ai / human）在 steps 里找同 key 的 label；
 * 都拿不到就返回空串（不再把 ai / human 这种原始 key 显示出来）。
 */
const stageLabel = computed<string>(() => {
  const r = record.value as
    | (ReviewRecord & { current_stage?: 'ai' | 'human' | null; current_stage_label?: string | null })
    | null;
  if (!r) return '';
  if (r.current_stage_label) return r.current_stage_label;
  const steps = recordSteps.value;
  const byStage = steps.find((s) => s.key === r.stage);
  if (byStage) return byStage.label;
  const byCurrent = steps.find((s) => s.key === r.current_stage);
  return byCurrent?.label ?? '';
});
/** 服务端详情接口可能不返回作者/文章状态字段，缺失时退回队列列表项取值 */
const currentItem = computed<QueueItem | null>(
  () => queue.value.find((q) => q.id === currentId.value) ?? null,
);
const recordLoading = ref(false);
const deciding = ref(false);

const queuePages = computed(() => Math.max(1, Math.ceil(queueTotal.value / queuePageSize)));

async function loadQueue(silent = false) {
  if (!silent) queueLoading.value = true;
  try {
    const data = await apiQueue(queuePage.value, queuePageSize);
    queue.value = data.items || [];
    queueTotal.value = data.total || 0;
    if (data.page && data.page !== queuePage.value) queuePage.value = data.page;
  } catch (e) {
    // 轮询失败静默（不弹提示），手动刷新才提示
    if (!silent) showFlash(errMsg(e), true);
  } finally {
    if (!silent) queueLoading.value = false;
  }
}

async function gotoQueuePage(p: number) {
  if (p < 1 || p > queuePages.value) return;
  queuePage.value = p;
  currentId.value = null;
  record.value = null;
  await loadQueue();
}

async function openRecord(id: number) {
  currentId.value = id;
  recordLoading.value = true;
  try {
    record.value = await apiRecord(id);
  } catch (e) {
    record.value = null;
    showFlash(errMsg(e), true);
  } finally {
    recordLoading.value = false;
  }
}

/* ---------------- 裁决 ---------------- */
const rejectOpen = ref(false);
const rejectNote = ref('');

function openReject() {
  rejectNote.value = '';
  rejectOpen.value = true;
}

async function decide(action: 'approve' | 'reject', note?: string) {
  const id = currentId.value;
  if (!id) return;
  deciding.value = true;
  try {
    await apiDecide(id, action, note);
    rejectOpen.value = false;
    showFlash(action === 'approve' ? '✓ 已通过' : '✓ 已拒绝');
    currentId.value = null;
    record.value = null;
    await loadQueue();
  } catch (e) {
    // 409：已被处理（或不在人工阶段）→ 提示并刷新列表
    if (isConflict(e)) {
      rejectOpen.value = false;
      showFlash('该记录已被处理，已刷新列表', true);
      currentId.value = null;
      record.value = null;
      await loadQueue();
      return;
    }
    showFlash(errMsg(e), true);
  } finally {
    deciding.value = false;
  }
}

async function submitReject() {
  if (rejectNote.value.length > 500) {
    showFlash('拒绝备注最多 500 字', true);
    return;
  }
  await decide('reject', rejectNote.value);
}

/* ---------------- 我的审核记录 ---------------- */
const historyItems = ref<HistoryItem[]>([]);
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPageSize = 20;
const historyLoading = ref(false);

const historyPages = computed(() => Math.max(1, Math.ceil(historyTotal.value / historyPageSize)));

async function loadHistory(silent = false) {
  if (!silent) historyLoading.value = true;
  try {
    const data = await apiHistory(historyPage.value, historyPageSize);
    historyItems.value = data.items || [];
    historyTotal.value = data.total || 0;
    if (data.page && data.page !== historyPage.value) historyPage.value = data.page;
  } catch (e) {
    if (!silent) showFlash(errMsg(e), true);
  } finally {
    if (!silent) historyLoading.value = false;
  }
}

async function gotoHistoryPage(p: number) {
  if (p < 1 || p > historyPages.value) return;
  historyPage.value = p;
  await loadHistory();
}

/* ---------------- 账号设置 ---------------- */
const oldPwd = ref('');
const newPwd = ref('');
const confirmPwd = ref('');
const pwdMsg = ref('');
const pwdOk = ref(false);
const pwdSaving = ref(false);

async function savePassword() {
  pwdMsg.value = '';
  pwdOk.value = false;
  if (!oldPwd.value) {
    pwdMsg.value = '请输入当前密码';
    return;
  }
  if (newPwd.value.length < 8) {
    pwdMsg.value = '新密码至少 8 位';
    return;
  }
  if (newPwd.value !== confirmPwd.value) {
    pwdMsg.value = '两次输入的新密码不一致';
    return;
  }
  pwdSaving.value = true;
  try {
    await apiChangePassword(oldPwd.value, newPwd.value);
    pwdOk.value = true;
    pwdMsg.value = '✓ 密码已更新，下次登录使用新密码。';
    oldPwd.value = '';
    newPwd.value = '';
    confirmPwd.value = '';
  } catch (e) {
    pwdMsg.value = errMsg(e);
  } finally {
    pwdSaving.value = false;
  }
}

/* ---------------- 审核通知 ---------------- */
const notifyNewTask = ref(false);
const notifyMsg = ref('');
const notifyOk = ref(false);
const notifySaving = ref(false);
/** 当前审核员自己的收件地址（后台未填写时为空） */
const reviewerEmail = computed(() => (reviewer.reviewer?.email || '').trim());

/**
 * 读取通知订阅：优先用 /review/me 返回的 reviewer.notify；
 * 字段缺失时再请求独立的 GET /review/notify-prefs（接口未上线则保持默认，不打扰）。
 */
async function loadNotifyPrefs() {
  const fromMe = reviewer.reviewer?.notify?.new_task;
  if (typeof fromMe === 'boolean') {
    notifyNewTask.value = fromMe;
    return;
  }
  try {
    const p = await apiNotifyPrefs();
    notifyNewTask.value = p.new_task;
  } catch {
    /* 接口未就绪：保持默认值 */
  }
}

async function saveNotifyPrefs() {
  notifyMsg.value = '';
  notifyOk.value = false;
  notifySaving.value = true;
  try {
    await apiUpdateNotifyPrefs({ new_task: notifyNewTask.value });
    notifyOk.value = true;
    notifyMsg.value = '已保存';
  } catch (e) {
    notifyMsg.value = errMsg(e);
  } finally {
    notifySaving.value = false;
  }
}

/* ---------------- 展示辅助 ---------------- */
/** 外链以新窗口打开时补 rel，避免 opener 劫持 */
function addSafeRel(node: Element) {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
}

const recordHtml = computed(() => {
  const c = record.value?.content ?? '';
  if (!c) return '';
  const raw = marked.parse(c, { breaks: true, async: false }) as string;
  DOMPurify.addHook('afterSanitizeAttributes', addSafeRel);
  try {
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
});

interface Badge {
  cls: string;
  text: string;
}

function aiBadge(it: { ai_verdict: QueueItem['ai_verdict']; ai_error: string | null }): Badge {
  if (it.ai_error) return { cls: 'warn', text: 'AI 审核失败' };
  if (it.ai_verdict === 'approve') return { cls: 'ok', text: 'AI 建议通过' };
  if (it.ai_verdict === 'reject') return { cls: 'bad', text: 'AI 建议拒绝' };
  return { cls: 'none', text: 'AI 无结论' };
}

const ACTION_LABELS: Record<string, string> = {
  approve: '通过',
  reject: '拒绝',
  create: '提交',
  created: '提交',
  submit: '提交审核',
  ai_review: 'AI 审核',
  ai_approve: 'AI 建议通过',
  ai_reject: 'AI 建议拒绝',
  ai_error: 'AI 审核失败',
  ai_retry: '重试 AI 审核',
  manual_review: '人工复核',
  final_approve: '终审通过',
  final_reject: '终审拒绝',
  force_approve: '强制通过',
  force_reject: '强制拒绝',
  cancel: '已取消',
};

const ACTOR_LABELS: Record<string, string> = {
  ai: 'AI',
  reviewer: '审核员',
  system: '系统',
  user: '作者',
  author: '作者',
  admin: '管理员',
};

function actionLabel(a: string): string {
  return ACTION_LABELS[a] || a;
}

function actorLabel(t: string): string {
  return ACTOR_LABELS[t] || t;
}

/* ---------------- 生命周期 ---------------- */
async function bootstrap() {
  queuePage.value = 1;
  await loadQueue();
}

watch(tab, (t) => {
  if (t === 'history') loadHistory();
  if (t === 'account') loadNotifyPrefs();
});

/* ---------------- 轮询 ---------------- */
/**
 * 轮询总开关：只有「已登录且会话已校验」才允许轮询。
 * 登录门（!reviewer.authed）下轮询每 5s 会拿到一次 401，曾触发整页 reload →
 * 登录界面反复自动刷新（表单与验证码实例反复销毁重建）。因此未登录时根本不创建定时器：
 * 登录成功后才启动，登出 / 401 失效后立即停止。
 */
const canPoll = computed(() => reviewer.authed && reviewer.checked);

// 审核队列：5s 静默刷新。跳过：未登录 / 非队列 tab / 正在裁决 / 正在写拒绝备注 / 页面隐藏。
// 不动 currentId 与 record（当前选中详情不会被清空），也不弹提示。
const queuePolling = useSilentPolling(
  () => loadQueue(true),
  5000,
  () => canPoll.value && tab.value === 'queue' && !deciding.value && !rejectOpen.value,
  () => canPoll.value,
);
// 我的审核记录：5s 静默刷新（同样跳过未登录 / 非历史 tab 与页面隐藏）。
const historyPolling = useSilentPolling(
  () => loadHistory(true),
  5000,
  () => canPoll.value && tab.value === 'history' && !deciding.value,
  () => canPoll.value,
);

// 登录成功 → 开轮询；登出 / 401 失效 → 立即停掉定时器（未登录时不再打接口）
watch(canPoll, (ok) => {
  if (ok) {
    queuePolling.start();
    historyPolling.start();
  } else {
    queuePolling.stop();
    historyPolling.stop();
  }
});

onMounted(async () => {
  // 会话过期提示：组件自己监听（store 已清空登录态，文案留在视图层）
  window.addEventListener(REVIEW_UNAUTHORIZED_EVENT, onReviewUnauthorized);
  // 无论有无令牌都先校验一次会话：过期令牌不会闪现工作台内容
  await reviewer.check();
  booting.value = false;
  if (!reviewer.authed) return;
  await bootstrap();
  // 预取通知订阅（账号设置面板用）
  loadNotifyPrefs();
});

onUnmounted(() => {
  // 解绑，避免重复绑定与内存泄漏
  window.removeEventListener(REVIEW_UNAUTHORIZED_EVENT, onReviewUnauthorized);
});
</script>

<style>
/* 审核路由底色：与后台一致，避免切换路由时露出黑色底（非 scoped，仅作用于 .review-route） */
html.review-route,
html.review-route body {
  background: #f4f7fc;
}
</style>

<style scoped>
/* 审核后台：沿用管理后台的白蓝浅色风格，独立于前台星空页面 */
.review {
  --bg: #f4f7fc;
  --surface: #ffffff;
  --border: #e4eaf4;
  --border-strong: #d5deed;
  --text-1: #16233f;
  --text-2: #46566f;
  --text-3: #8593ab;
  --blue: #2563eb;
  --blue-deep: #1d4ed8;
  --blue-soft: #eef4ff;
  --ring: rgba(37, 99, 235, 0.14);
  --green: #15803d;
  --green-soft: #edfaf2;
  --red: #d3384a;
  --red-soft: #fdf1f3;
  --orange: #b45309;
  --orange-soft: #fff7ed;

  position: fixed;
  inset: 0;
  z-index: 60;
  overflow-y: auto;
  background: var(--bg);
  color: var(--text-1);
  font-size: 14px;
}

.review input,
.review select,
.review textarea {
  color: var(--text-1);
}

.review ::placeholder {
  color: #a9b4c6;
  opacity: 1;
}

.grad {
  background: linear-gradient(115deg, #2563eb 10%, #38bdf8 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.boot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-size: 13.5px;
  color: var(--text-3);
}

/* ---------------- 登录门 ---------------- */
.gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background:
    radial-gradient(900px 460px at 14% -10%, rgba(37, 99, 235, 0.13), transparent 62%),
    radial-gradient(760px 420px at 88% 110%, rgba(56, 189, 248, 0.12), transparent 60%),
    linear-gradient(180deg, #f7faff 0%, #edf3fc 100%);
}

.gate-card {
  width: min(400px, calc(100vw - 40px));
  padding: 40px 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 24px 60px -24px rgba(23, 43, 99, 0.28);
}

.gate-card h1 {
  font-size: 21px;
  margin: 0 0 8px;
  color: var(--text-1);
  letter-spacing: 0.2px;
}

.gate-sub {
  margin: 0 0 24px;
  color: var(--text-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.field > span {
  font-size: 13px;
  color: var(--text-3);
}

.gate-card input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  background: #fbfcfe;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  color: var(--text-1);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.gate-card input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--ring);
  background: #fff;
}

.gate-err {
  color: var(--red);
  font-size: 13px;
  margin: 14px 0 0;
}

/* ---------------- 主体 ---------------- */
.shell {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 28px;
  background: rgba(244, 247, 252, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 16px;
  color: var(--text-1);
}

.brand b {
  font-weight: 700;
  font-size: 15px;
}

.brand::after {
  content: '';
  width: 28px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--blue), #38bdf8);
  align-self: center;
}

.top-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.who {
  font-size: 13.5px;
  color: var(--text-2);
  font-weight: 600;
}

.tabs {
  display: flex;
  gap: 6px;
  padding: 16px 28px 0;
}

.tabs button {
  padding: 9px 18px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 13.5px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tabs button:hover {
  background: #eef3fb;
  color: var(--text-1);
}

.tabs button.on {
  background: var(--blue-soft);
  color: var(--blue);
  font-weight: 600;
  border-color: rgba(37, 99, 235, 0.28);
}

.main {
  flex: 1;
  padding: 20px 28px 80px;
  max-width: 1280px;
  width: 100%;
  box-sizing: border-box;
}

.pane {
  animation: pane-in 0.2s ease;
}

@keyframes pane-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---------------- 卡片 ---------------- */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 24px 24px;
  box-shadow: 0 1px 2px rgba(23, 43, 99, 0.04);
}

.card.narrow {
  max-width: 560px;
}

/* 账号设置里的第二张卡片（审核通知） */
.card.narrow.spaced {
  margin-top: 16px;
}

.card h2,
.list-head h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.card h2::before,
.list-head h2::before {
  content: '';
  width: 4px;
  height: 15px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--blue), #5ea0ff);
  flex: none;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.hint {
  color: var(--text-3);
  font-size: 12.5px;
  margin: 6px 0 14px;
}

.dim {
  color: var(--text-3);
  font-size: 12.5px;
}

.empty {
  padding: 60px 10px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}

/* ---------------- 队列 ---------------- */
.queue {
  display: grid;
  grid-template-columns: minmax(300px, 380px) 1fr;
  gap: 18px;
  align-items: start;
}

.qlist {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}

.qitem {
  padding: 12px 12px;
  border-radius: 11px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.qitem:hover {
  background: #f7faff;
}

.qitem.on {
  background: var(--blue-soft);
  border-color: rgba(37, 99, 235, 0.32);
}

.qtitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.5;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.qmeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-2);
}

.mini-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border);
  flex: none;
}

.qname {
  color: var(--text-2);
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qtags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.ai-err {
  font-size: 11.5px;
  color: var(--orange);
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

/* ---------------- 详情 ---------------- */
.detail-card {
  min-height: 320px;
}

.dmeta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--text-2);
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.stages {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

/* 审核流程步骤条 */
.flow-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.flow-label {
  font-size: 12.5px;
  flex: 0 0 auto;
}

.summary {
  margin: 0 0 14px;
  padding-left: 12px;
  border-left: 2px solid rgba(37, 99, 235, 0.45);
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.7;
}

.ai-box {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  background: #f8fafd;
  margin-bottom: 16px;
}

.ai-box.ok {
  background: var(--green-soft);
  border-color: rgba(21, 128, 61, 0.25);
}

.ai-box.bad {
  background: var(--red-soft);
  border-color: rgba(211, 56, 74, 0.25);
}

.ai-box.warn {
  background: var(--orange-soft);
  border-color: rgba(180, 83, 9, 0.28);
}

.ai-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.ai-reason {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-reason.err {
  color: var(--orange);
  margin-top: 4px;
}

.sec {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
  margin: 18px 0 10px;
}

.prose-box {
  max-height: 46vh;
  overflow-y: auto;
  padding: 16px 18px;
  background: #fbfcfe;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.prose {
  font-size: 14.5px;
  line-height: 1.85;
  color: var(--text-1);
  word-break: break-word;
}

.prose :deep(h1),
.prose :deep(h2),
.prose :deep(h3),
.prose :deep(h4) {
  margin: 1.4em 0 0.6em;
  color: var(--text-1);
  font-weight: 700;
  line-height: 1.4;
}

.prose :deep(h1) {
  font-size: 1.4em;
}
.prose :deep(h2) {
  font-size: 1.25em;
}
.prose :deep(h3) {
  font-size: 1.1em;
}

.prose :deep(p) {
  margin: 0.85em 0;
}

.prose :deep(a) {
  color: var(--blue);
  text-decoration: none;
  border-bottom: 1px solid rgba(37, 99, 235, 0.4);
}

.prose :deep(ul),
.prose :deep(ol) {
  margin: 0.85em 0;
  padding-left: 1.5em;
}

.prose :deep(li) {
  margin: 0.3em 0;
}

.prose :deep(blockquote) {
  margin: 1em 0;
  padding: 8px 16px;
  border-left: 3px solid rgba(37, 99, 235, 0.4);
  background: var(--blue-soft);
  border-radius: 0 10px 10px 0;
  color: var(--text-2);
}

.prose :deep(code) {
  padding: 2px 6px;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: var(--blue-deep);
  background: var(--blue-soft);
  border-radius: 6px;
}

.prose :deep(pre) {
  margin: 1em 0;
  padding: 14px 16px;
  overflow-x: auto;
  background: #f2f5fa;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.prose :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-1);
}

.prose :deep(img) {
  max-width: 100%;
  border-radius: 12px;
  margin: 1em 0;
}

.prose :deep(table) {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
  font-size: 13.5px;
}

.prose :deep(th),
.prose :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--border);
  text-align: left;
}

.prose :deep(th) {
  background: var(--blue-soft);
  color: var(--blue-deep);
}

.trail {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.trail li {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f4fa;
  font-size: 12.5px;
}

.trail li:last-child {
  border-bottom: 0;
}

.who-mini {
  color: var(--text-2);
  font-weight: 600;
}

.trail .note {
  color: var(--text-2);
  flex-basis: 100%;
  padding-left: 2px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---------------- 记录表 ---------------- */
.tbl-wrap {
  overflow-x: auto;
}

.tbl {
  width: 100%;
  border-collapse: collapse;
}

.tbl th {
  text-align: left;
  font-size: 12px;
  color: var(--text-3);
  font-weight: 500;
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.tbl td {
  padding: 11px 10px;
  border-bottom: 1px solid #f0f4fa;
  vertical-align: middle;
  font-size: 13px;
}

.tbl tbody tr:last-child td {
  border-bottom: 0;
}

.tbl tbody tr:hover {
  background: #f7faff;
}

.title-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-1);
}

.note-cell {
  max-width: 260px;
  color: var(--text-2);
  word-break: break-word;
  white-space: pre-wrap;
}

/* ---------------- 徽标 ---------------- */
.pill {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: #fff;
  color: var(--text-2);
  font-size: 11.5px;
  white-space: nowrap;
}

.pill.ok {
  color: var(--green);
  border-color: rgba(21, 128, 61, 0.35);
  background: var(--green-soft);
}

.pill.bad {
  color: var(--red);
  border-color: rgba(211, 56, 74, 0.35);
  background: var(--red-soft);
}

.pill.warn {
  color: var(--orange);
  border-color: rgba(180, 83, 9, 0.32);
  background: var(--orange-soft);
}

.pill.update {
  color: var(--blue);
  border-color: rgba(37, 99, 235, 0.4);
  background: var(--blue-soft);
}

.pill.none {
  color: var(--text-3);
  background: #f6f8fc;
}

.pill.stage.cur {
  color: var(--blue);
  border-color: rgba(37, 99, 235, 0.4);
  background: var(--blue-soft);
  font-weight: 600;
}

/* ---------------- 按钮 ---------------- */
.primary {
  padding: 10px 24px;
  border: 0;
  border-radius: 9px;
  background: linear-gradient(180deg, #3574f2, var(--blue));
  color: #fff;
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  box-shadow: 0 8px 18px -8px rgba(37, 99, 235, 0.5);
  transition: background 0.15s;
}

.primary:hover:not(:disabled) {
  background: linear-gradient(180deg, #2c69e6, var(--blue-deep));
}

.primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.primary.wide {
  width: 100%;
  letter-spacing: 2px;
  margin-top: 6px;
}

.primary.ok {
  background: linear-gradient(180deg, #1a9a4b, var(--green));
  box-shadow: 0 8px 18px -8px rgba(21, 128, 61, 0.5);
}

.primary.ok:hover:not(:disabled) {
  background: linear-gradient(180deg, #157f3e, #106c33);
}

.primary.bad {
  background: linear-gradient(180deg, #e04b5d, var(--red));
  box-shadow: 0 8px 18px -8px rgba(211, 56, 74, 0.5);
}

.primary.bad:hover:not(:disabled) {
  background: linear-gradient(180deg, #cc3b4c, #b32e3f);
}

.ghost {
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.ghost:hover:not(:disabled) {
  color: var(--blue);
  border-color: #a9c4f7;
  background: #f7faff;
}

.ghost.sm {
  padding: 4px 11px;
  font-size: 12.5px;
  border-radius: 8px;
}

.ghost:disabled {
  opacity: 0.5;
  cursor: default;
}

.ops {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  flex-wrap: wrap;
}

/* ---------------- 表单行 ---------------- */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.row > span {
  width: 92px;
  flex: none;
  color: var(--text-3);
  font-size: 13px;
}

.row input {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  background: #fbfcfe;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-1);
  font-size: 13.5px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.row input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--ring);
  background: #fff;
}

/* 复选框行（如审核通知开关） */
.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  color: var(--text-1);
  cursor: pointer;
}

/* 全局 input 规则给了 width:100% + padding，复选框会被拉伸占满整行 */
.check-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  padding: 0;
  margin: 0;
  flex: none;
  accent-color: var(--blue);
  cursor: pointer;
}

/* ---------------- 提示 / 弹层 ---------------- */
.flash {
  color: var(--green);
  font-size: 13px;
}

.flash.bad {
  color: var(--red);
}

.flash-bar {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  z-index: 80;
  padding: 10px 20px;
  border-radius: 999px;
  background: #16233f;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 12px 30px -10px rgba(15, 26, 46, 0.5);
}

.flash-bar.bad {
  background: var(--red);
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 26, 46, 0.42);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: min(420px, calc(100vw - 40px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 26px;
  box-shadow: 0 24px 60px -24px rgba(23, 43, 99, 0.4);
}

.modal h3 {
  margin: 0 0 6px;
  font-size: 15px;
  color: var(--text-1);
}

.ta {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: #fbfcfe;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.7;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.ta:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--ring);
  background: #fff;
}

.count {
  text-align: right;
  margin: 6px 0 0;
}

.modal-ops {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

@media (max-width: 900px) {
  .queue {
    grid-template-columns: 1fr;
  }
  .main {
    padding: 18px 16px 80px;
  }
  .top,
  .tabs {
    padding-left: 16px;
    padding-right: 16px;
  }
  .card {
    padding: 18px 16px 20px;
  }
}
</style>
