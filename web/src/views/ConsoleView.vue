<template>
  <main class="console page">
    <header class="page-head">
      <h1>控制台</h1>
      <p class="muted">管理你的文章与个人设置</p>
    </header>

    <nav class="tabs glass">
      <button v-for="t in tabs" :key="t.key" :class="{ on: tab === t.key }" @click="tab = t.key">
        {{ t.label }}
      </button>
      <span class="spacer" />
      <router-link class="back" to="/">← 回到首页</router-link>
    </nav>

    <!-- ================= 我的文章 ================= -->
    <section v-if="tab === 'articles'">
      <!-- 编辑器 / 详情 / 列表三者互斥：编辑中优先，其次详情，最后列表 -->
      <ArticleEditor
        v-if="editing !== null"
        :key="editing"
        :article-id="editing > 0 ? editing : undefined"
        :hide-review="editingFromDetail && !!detail && !!detailReview"
        @saved="onSaved"
        @cancel="onEditorCancel"
      >
        <!-- 从详情进入编辑：审核状态仍显示在同一位置（标题输入框上方），数据沿用详情不重新请求 -->
        <template v-if="editingFromDetail && detailReview && detail" #review>
          <ArticleReviewPanel :review="detailReview" :article="detail" />
        </template>
      </ArticleEditor>

      <!-- ---------- 文章详情（在 /console 内展开，不新增路由） ---------- -->
      <article v-else-if="detailOpen" class="detail glass">
        <div class="detail-bar">
          <button class="back-btn" type="button" @click="closeDetail">← 返回列表</button>
          <button v-if="detail" class="btn" type="button" @click="editFromDetail">编辑</button>
        </div>

        <p v-if="detailLoading" class="muted detail-state">正在加载…</p>
        <p v-else-if="detailError" class="error-tip detail-state">{{ detailError }}</p>

        <template v-else-if="detail">
          <!-- 审核状态：常驻在标题上方（从详情进入编辑时由 ArticleEditor 的 #review 插槽渲染同一份） -->
          <ArticleReviewPanel v-if="detailReview" :review="detailReview" :article="detail" />

          <h1 class="detail-title">{{ detail.title }}</h1>

          <div class="detail-meta">
            <img class="avatar small" :src="detail.author_avatar || defaultAvatar" alt="" />
            <span
              class="detail-author"
              :style="detail.author_name_color ? { color: detail.author_name_color } : undefined"
              >{{ detail.author_name }}</span
            >
            <span class="sep">·</span>
            <time>{{ formatDateTime(detail.published_at || detail.created_at) }}</time>
            <span v-for="(c, i) in detailChips" :key="`${c.cls}-${i}`" class="chip" :class="c.cls">
              {{ c.text }}
            </span>
          </div>

          <p v-if="detail.summary" class="detail-lead">{{ detail.summary }}</p>

          <hr class="detail-rule" />

          <ArticlePreview :content="detail.content || ''" />
        </template>
      </article>

      <template v-else>
        <div class="toolbar">
          <span class="muted">共 {{ mine.length }} 篇</span>
          <button class="btn" @click="startNew">＋ 新建文章</button>
        </div>

        <p v-if="loadingMine" class="muted">加载中…</p>
        <p v-else-if="!mine.length" class="muted empty">还没有文章，点右上角新建第一篇吧。</p>

        <ul v-else class="rows glass">
          <li v-for="a in mine" :key="a.id" class="row">
            <div class="row-main">
              <div class="row-title">
                <span class="dot" :class="dotClass(a)" />
                <router-link :to="`/article/${a.id}`">{{ a.title }}</router-link>
                <span v-if="a.status === 'draft' && reviewStateOf(a) === 'none'" class="chip draft">草稿</span>
                <span
                  v-else-if="a.status === 'draft' && reviewStateOf(a) === 'pending'"
                  class="chip pending"
                >
                  {{ pendingStatusLabel(a.review) }}
                </span>
                <span
                  v-else-if="a.status === 'draft' && reviewStateOf(a) === 'rejected'"
                  class="chip rejected"
                  :title="rejectTip"
                >
                  {{ rejectedStatusLabel(a.review) }}
                </span>
                <span v-if="a.status === 'published' && reviewStateOf(a) === 'pending'" class="chip pending">
                  {{ pendingStatusLabel(a.review) }}
                </span>
                <span
                  v-if="a.status === 'published' && reviewStateOf(a) === 'rejected'"
                  class="chip rejected"
                  :title="rejectTip"
                >
                  {{ rejectedStatusLabel(a.review) }}
                </span>
                <span v-if="a.pinned" class="chip pin">置顶</span>
              </div>
              <div class="row-meta">
                <span>{{ formatDateTime(a.published_at || a.created_at) }}</span>
                <span v-if="a.summary">· {{ a.summary.slice(0, 60) }}</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="link-btn" @click="openDetail(a.id)">详情</button>
              <button class="link-btn danger" @click="remove(a)">删除</button>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <!-- ================= 个人设置 ================= -->
    <section v-else class="stack">
      <form class="glass form-card" @submit.prevent="saveProfile">
        <h2>公开资料</h2>
        <div class="profile-row">
          <img class="avatar big" :src="auth.user?.avatar_url || defaultAvatar" :alt="auth.user?.name" />
          <label class="upload-chip">
            <input type="file" accept="image/*" hidden @change="uploadAvatar" />
            {{ uploadingAvatar ? '上传中…' : '更换头像' }}
          </label>
          <button
            v-for="p in oauthAvatarSources"
            :key="p"
            class="upload-chip"
            type="button"
            :disabled="refreshingAvatar"
            @click="refreshOAuthAvatar(p)"
          >
            {{ oauthAvatarLabel(p) }}
          </button>
          <router-link class="space-link" :to="`/space/${auth.user?.id}`">我的空间 →</router-link>
        </div>
        <div class="field">
          <label>昵称</label>
          <input v-model.trim="profileName" maxlength="50" />
        </div>
        <div class="field">
          <label>简介（展示在个人空间）</label>
          <textarea v-model="profileBio" rows="3" maxlength="500" placeholder="介绍一下自己（最多 500 字）" />
        </div>
        <p v-if="profileError" class="error-tip">{{ profileError }}</p>
        <p v-if="profileNotice" class="notice">{{ profileNotice }}</p>
        <div class="form-actions">
          <button class="btn" type="submit" :disabled="savingProfile">{{ savingProfile ? '保存中…' : '保存资料' }}</button>
        </div>
      </form>

      <!-- ======== 账户设置（邮箱 / 密码 / 第三方账号绑定） ======== -->
      <section class="glass form-card account-card">
        <h2>账户设置</h2>
        <div class="field">
          <label>邮箱</label>
          <input :value="auth.user?.email || '（未绑定）'" disabled />
        </div>

        <!-- 修改/设置密码：点开弹窗，用邮箱验证码改密 -->
        <div class="pw-entry-wrap">
          <button class="pw-entry" type="button" :disabled="!auth.user?.email" @click="openChangePassword">
            <span class="pw-entry-main">
              <span class="pw-entry-title">{{ auth.user?.has_password ? '修改密码' : '设置密码' }}</span>
              <span class="pw-entry-desc">
                {{ auth.user?.has_password ? '通过邮箱验证码重设登录密码' : '通过邮箱验证码设置登录密码' }}
              </span>
            </span>
            <span class="pw-entry-arrow" aria-hidden="true">→</span>
          </button>
          <p v-if="!auth.user?.email" class="field-hint">当前账号未绑定邮箱，绑定邮箱后才能修改密码。</p>
        </div>

        <!-- 第三方账号绑定：直接列在卡片内（不再套小节标题与分隔线） -->
        <div v-for="p in bindProviders" :key="p" class="bind-row">
          <span class="bind-name">{{ p === 'github' ? 'GitHub' : 'Google' }}</span>
          <span :class="['bind-state', bound(p) ? 'on' : 'off']">{{ bound(p) ? '已绑定' : '未绑定' }}</span>
          <button
            v-if="bound(p)"
            class="btn-ghost danger"
            type="button"
            :disabled="!!binding || !!bindLoading"
            @click="unbind(p)"
          >
            {{ binding === p ? '解绑中…' : '解除绑定' }}
          </button>
          <!-- 绑定必须走 XHR：整页 <a href> 不会带 Authorization 头，后端 authRequired 会判成未登录 -->
          <button
            v-else-if="p === 'github' ? site.info.githubEnabled : site.info.googleEnabled"
            class="btn-ghost bind-link"
            type="button"
            :disabled="!!binding || !!bindLoading"
            @click="bind(p)"
          >绑定 {{ p === 'github' ? 'GitHub' : 'Google' }}</button>
          <span v-else class="bind-na">站点未启用</span>
        </div>
        <p class="field-hint">绑定后可用对应第三方账号一键登录；解绑前请确保仍有密码或其他第三方可登录。</p>

        <!-- 账户卡提示：改密结果与第三方绑定结果共用同一处提示，避免提示显示在用户看不到的卡片里 -->
        <p v-if="bindError" class="error-tip">{{ bindError }}</p>
        <p v-if="accountNotice || bindNotice" class="notice">{{ accountNotice || bindNotice }}</p>

        <div class="form-actions">
          <button class="btn-ghost logout" type="button" @click="doLogout">退出登录</button>
        </div>
      </section>

      <!-- 验证码弹窗必须放在本 section 内：资料页激活时才挂载，避免放在其它 tab 的分支里导致不渲染 -->
      <CaptchaDialog v-model:open="profileCaptchaOpen" :action="doSaveProfileWithCaptcha" />
      <!-- ======== 通知订阅（邮件） ======== -->
      <div class="glass form-card">
        <h2>通知订阅</h2>
        <p class="field-hint">
          通知通过邮件发送，收件地址为账号邮箱：<span class="notify-email">{{ notifyEmail || '（未绑定）' }}</span>
        </p>
        <p v-if="notifySmtpMissing" class="field-hint notify-warn">
          站点尚未配置邮件服务，通知暂时无法发送。
        </p>
        <label v-for="item in notifyItems" :key="item.key" class="notify-row">
          <input v-model="notifyPrefs[item.key]" type="checkbox" />
          <span class="notify-text">
            <span class="notify-label">{{ item.label }}</span>
            <span class="notify-desc">{{ item.desc }}</span>
          </span>
        </label>
        <div class="form-actions">
          <span class="notify-msg">
            <span v-if="notifyMsg" :class="notifyMsgOk ? 'notice' : 'error-tip'">{{ notifyMsg }}</span>
          </span>
          <button class="btn" type="button" :disabled="savingNotify" @click="saveNotifyPrefs">
            {{ savingNotify ? '保存中…' : '保存通知设置' }}
          </button>
        </div>
      </div>

      <!-- 修改/设置密码弹窗：同样放在本 section 内（否则资料页切走后不渲染） -->
      <ChangePasswordDialog v-model:open="changePasswordOpen" @success="onPasswordChanged" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isAxiosError } from 'axios';
import http, { errMsg, isCaptchaRequired, isCaptchaFailure } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { useSiteStore } from '../stores/site';
import { useSilentPolling } from '../stores/polling';
import CaptchaDialog from '../components/CaptchaDialog.vue';
import ChangePasswordDialog from '../components/ChangePasswordDialog.vue';
import { formatDateTime } from '../utils/format';
import { pendingStatusLabel, rejectedStatusLabel } from '../utils/review';
import type { Article, ArticleBrief, ArticleReview, ReviewState } from '../types';
import type { User } from '../stores/auth';
import bundledAvatar from '../assets/default-avatar.svg';
import ArticleEditor from '../components/ArticleEditor.vue';
import ArticlePreview from '../components/ArticlePreview.vue';
import ArticleReviewPanel from '../components/ArticleReviewPanel.vue';

// 用户默认头像：后台可设置，未设置时用内置图
const site = useSiteStore();
const defaultAvatar = computed(() => site.info.defaultAvatarUrl || bundledAvatar);

const tabs = [
  { key: 'articles', label: '我的文章' },
  { key: 'profile', label: '个人设置' },
] as const;
const tab = ref<'articles' | 'profile'>('articles');

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
/** 轮询总开关：只有已登录才轮询（未登录时接口会 401） */
const canPoll = computed(() => !!auth.token);

/** 退出登录：清凭证回首页 */
function doLogout() {
  auth.logout();
  router.push('/');
}

/* ---------- 我的文章 ---------- */
const mine = ref<ArticleBrief[]>([]);
const loadingMine = ref(false);
const editing = ref<number | null>(null);

/* ---------- 文章详情（页内展开，不新增路由） ---------- */
/** 当前详情文章 id；null = 未打开详情 */
const detailId = ref<number | null>(null);
const detail = ref<Article | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
/** 详情视图是否打开（与 editing / 列表三者互斥） */
const detailOpen = computed(() => detailId.value !== null);
/** 编辑器是由详情页的「编辑」打开的：保存 / 取消后回到详情而不是列表 */
const editingFromDetail = ref(false);

/** 拉取单篇文章详情（作者视角，含 review.steps 等审核步骤信息） */
async function loadDetail(id: number | null = detailId.value) {
  if (id === null) return;
  detailLoading.value = true;
  detailError.value = '';
  try {
    const { data } = await http.get<{ article: Article }>(`/articles/${id}`);
    // 请求期间已切到别的文章 / 已返回列表 → 丢弃这次响应
    if (detailId.value !== id) return;
    detail.value = data.article;
  } catch (e) {
    if (detailId.value !== id) return;
    detailError.value = errMsg(e);
  } finally {
    if (detailId.value === id) detailLoading.value = false;
  }
}

/** 列表行「详情」：打开详情视图并拉取数据 */
async function openDetail(id: number) {
  detailId.value = id;
  detail.value = null;
  detailError.value = '';
  await loadDetail(id);
}

/** 详情页「返回列表」 */
function closeDetail() {
  detailId.value = null;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = false;
}

/** 详情页「编辑」：记住来源，保存 / 取消后回到详情 */
function editFromDetail() {
  const id = detailId.value;
  if (id === null) return;
  editingFromDetail.value = true;
  startEdit(id);
}

/** 详情里的审核信息（仅待审 / 被拒时后端返回；其余情况为 null，不渲染审核区块） */
const detailReview = computed<ArticleReview | null>(() => detail.value?.review ?? null);
/** 详情头部的状态标签：文案与配色沿用列表的 chip（带环节的当前状态） */
type DetailChip = { text: string; cls: string };

const detailChips = computed<DetailChip[]>(() => {
  const a = detail.value;
  if (!a) return [];
  const out: DetailChip[] = [];
  const rs = a.review_state ?? 'none';
  if (a.status === 'draft') {
    if (rs === 'pending') out.push({ text: pendingStatusLabel(a.review), cls: 'pending' });
    else if (rs === 'rejected') out.push({ text: rejectedStatusLabel(a.review), cls: 'rejected' });
    else out.push({ text: '草稿', cls: 'draft' });
  } else {
    out.push({ text: '已发布', cls: 'published' });
    if (rs === 'pending') out.push({ text: pendingStatusLabel(a.review), cls: 'pending' });
    else if (rs === 'rejected') out.push({ text: rejectedStatusLabel(a.review), cls: 'rejected' });
  }
  if (a.pinned) out.push({ text: '置顶', cls: 'pin' });
  return out;
});

/**
 * 加载我的文章。
 * silent=true 用于后台轮询：不动 loading 骨架（不闪、不重置列表与滚动位置）。
 */
async function loadMine(silent = false) {
  if (!silent) loadingMine.value = true;
  try {
    const { data } = await http.get<{ items: ArticleBrief[] }>('/articles/mine');
    mine.value = data.items ?? [];
  } catch (e) {
    // 轮询失败不打扰用户（只记日志，不弹提示）
    if (!silent) console.warn(errMsg(e));
  } finally {
    if (!silent) loadingMine.value = false;
  }
}

/* ---------- 审核状态轮询 ---------- */
/** 轮询间隔：5s */
const POLL_INTERVAL = 5000;

/**
 * 静默轮询审核状态。跳过的场景：
 *  - 不在「我的文章」列表页（切到其它 tab）
 *  - 编辑器打开中（正在改稿，由 ArticleEditor 自行轮询，避免打断输入）
 *  - 页面不可见（切到其它标签页，由 useSilentPolling 统一处理）
 * 详情视图打开时照常轮询，但只做静默刷新：不碰 detailLoading，也不重置详情状态。
 * useSilentPolling 内部已把请求包进 polling.track：顶栏指示器随轮询请求亮起 / 熄灭。
 */
const minePolling = useSilentPolling(
  async () => {
    await loadMine(true);
    // 详情打开时顺带刷新单篇，让审核步骤 / 状态跟着推进
    await refreshDetailSilently();
  },
  POLL_INTERVAL,
  () => tab.value === 'articles' && editing.value === null,
  () => canPoll.value,
);

/** 详情对外可见状态的签名：只有这些字段变了才替换 detail（避免正文重复渲染 / 闪烁） */
function detailSignature(a: Article): string {
  const r = a.review;
  // 步骤签名带上 note / error：只改审核意见（或 AI 初审失败标记）时详情也要静默刷新
  const steps = (r?.steps ?? [])
    .map((s) => [s.key, s.state, s.note ?? '', s.error ? 1 : 0, s.at ?? ''].join(':'))
    .join(',');
  return [a.updated_at, a.status, a.review_state ?? 'none', r?.state ?? '', r?.current_stage ?? '', steps].join('|');
}

/** 详情视图的静默刷新：失败不打扰，内容未变则不替换 */
async function refreshDetailSilently() {
  const id = detailId.value;
  if (id === null || detailLoading.value) return;
  try {
    const { data } = await http.get<{ article: Article }>(`/articles/${id}`);
    if (detailId.value !== id) return;
    const next = data.article;
    if (!next) return;
    const cur = detail.value;
    if (cur && detailSignature(cur) === detailSignature(next)) return;
    detail.value = next;
    detailError.value = '';
  } catch {
    // 轮询失败静默忽略（不弹错误提示）
  }
}

function startNew() {
  editingFromDetail.value = false;
  editing.value = 0;
}

function startEdit(id: number) {
  editing.value = id;
}

/* ---------- 审核状态 ---------- */
/** 列表接口只返回 review_state，缺省按 none（未进入审核）处理 */
function reviewStateOf(a: ArticleBrief): ReviewState {
  return a.review_state ?? 'none';
}

/** 状态圆点：已发布恒为绿；草稿在审核中转蓝、被拒转红 */
function dotClass(a: ArticleBrief): string {
  if (a.status === 'published') return 'published';
  const rs = reviewStateOf(a);
  if (rs === 'pending') return 'pending';
  if (rs === 'rejected') return 'rejected';
  return 'draft';
}

/** 列表不带拒绝理由（只在文章详情里），这里给可执行提示 */
const rejectTip = '上次提交未通过审核，点「详情」查看拒绝理由，可在详情里点「编辑」重新提交';

/**
 * 保存成功后回列表（来源是详情页则回到详情并重新拉取详情数据）。
 * 新建 / 列表进来的编辑保持原有的「回列表」行为。
 */
async function onSaved() {
  const backToDetail = editingFromDetail.value;
  editing.value = null;
  editingFromDetail.value = false;
  await loadMine();
  if (backToDetail && detailId.value !== null) await loadDetail();
}

/** 编辑器「取消」：来源是详情页则回到详情（detail 状态保留，不重新拉取） */
function onEditorCancel() {
  editing.value = null;
  editingFromDetail.value = false;
}

async function remove(a: ArticleBrief) {
  if (!confirm(`确定删除《${a.title}》？此操作不可恢复。`)) return;
  try {
    await http.delete(`/articles/${a.id}`);
    mine.value = mine.value.filter((x) => x.id !== a.id);
  } catch (e) {
    alert(errMsg(e));
  }
}

/* ---------- 个人设置 ---------- */
const profileName = ref('');
const profileBio = ref('');
const savingProfile = ref(false);
const profileError = ref('');
const profileNotice = ref('');
const uploadingAvatar = ref(false);

/** 服务端资料快照：昵称 / 简介最后一次已知的服务端值（与服务端一致：昵称、简介都会 trim） */
const profileBaseline = ref({ name: '', bio: '' });
/** 用户改了昵称 / 简介但还没保存：轮询不得回填输入框（避免覆盖正在输入的内容） */
const profileDirty = computed(
  () =>
    profileName.value.trim() !== profileBaseline.value.name.trim() ||
    profileBio.value.trim() !== profileBaseline.value.bio.trim()
);

watch(
  () => auth.user,
  (u) => {
    if (!u) return;
    // 用户正在编辑（未保存）时不回填输入框：轮询只更新展示性字段
    if (!profileDirty.value) {
      profileName.value = u.name;
      profileBio.value = u.bio || '';
    }
    // 基线始终跟随服务端最新值：保存成功后 dirty 自然归零
    profileBaseline.value = { name: (u.name || '').trim(), bio: (u.bio || '').trim() };
  },
  { immediate: true }
);

async function saveProfile() {
  // 正常修改零打扰：直接保存；后端检测到频繁修改（10 分钟内第 3 次起）才回 CAPTCHA_REQUIRED，
  // 届时自动弹出验证窗，验证通过后自动重试
  await doSaveProfile();
}

const profileCaptchaOpen = ref(false);
const doSaveProfileWithCaptcha = async (c: { key: string; value: string }) => {
  await doSaveProfile(c);
};

async function doSaveProfile(captcha?: { key: string; value: string }) {
  savingProfile.value = true;
  profileError.value = '';
  profileNotice.value = '';
  try {
    const { data } = await http.put('/auth/profile', { name: profileName.value, bio: profileBio.value, captcha });
    if (data.user) auth.user = data.user;
    // 与服务端对齐（服务端可能对昵称做了规范化）：保存成功后「未保存修改」判定回到干净状态
    if (data.user) {
      profileName.value = data.user.name ?? '';
      profileBio.value = data.user.bio || '';
    }
    profileNotice.value = '已保存';
  } catch (e) {
    if (isCaptchaRequired(e)) {
      // 风控触发：不打扰文案，直接弹验证窗（验证通过后自动重试）
      profileError.value = '';
      profileNotice.value = '';
      profileCaptchaOpen.value = true;
      return;
    }
    if (isCaptchaFailure(e)) throw e; // 验证码未通过：抛给弹窗处理（弹窗内提示+自动换题），吞掉会被弹窗误认为成功而关闭
    profileError.value = errMsg(e);
  } finally {
    savingProfile.value = false;
  }
}

async function uploadAvatar(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  uploadingAvatar.value = true;
  profileError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await http.post<{ user: any }>('/auth/avatar', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (data.user) auth.user = data.user;
    profileNotice.value = '头像已更新';
  } catch (e) {
    profileError.value = errMsg(e);
  } finally {
    uploadingAvatar.value = false;
  }
}

/** 手动从第三方同步头像（仅绑定过 GitHub/Google 的用户可见；绑定了多个时分开两个按钮让用户选择来源） */
const refreshingAvatar = ref(false);
const oauthAvatarSources = computed(() => {
  const list: Array<'github' | 'google'> = [];
  if (auth.user?.github_id) list.push('github');
  if (auth.user?.google_id) list.push('google');
  return list;
});
function oauthAvatarLabel(p: 'github' | 'google') {
  if (refreshingAvatar.value) return '同步中…';
  return oauthAvatarSources.value.length > 1 ? `从 ${p === 'github' ? 'GitHub' : 'Google'} 同步头像` : '从第三方同步头像';
}
async function refreshOAuthAvatar(provider?: 'github' | 'google') {
  if (refreshingAvatar.value) return;
  refreshingAvatar.value = true;
  profileError.value = '';
  try {
    const { data } = await http.post<{ user: any }>('/auth/avatar/refresh-oauth', provider ? { provider } : {});
    if (data.user) auth.user = data.user;
    profileNotice.value = '已从第三方同步头像';
  } catch (e) {
    profileError.value = errMsg(e);
  } finally {
    refreshingAvatar.value = false;
  }
}

/* ---------- 通知订阅（邮件） ---------- */
/** 通知开关：登录提醒 + 三种审核结果提醒 */
type NotifyKey = 'login' | 'review_pending' | 'review_approved' | 'review_rejected';

const notifyItems: Array<{ key: NotifyKey; label: string; desc: string }> = [
  { key: 'login', label: '登录时', desc: '账号在新设备登录时给我发邮件' },
  { key: 'review_pending', label: '文章进入审核时', desc: '文章提交后进入审核流程时通知我' },
  { key: 'review_approved', label: '文章通过审核时', desc: '文章审核通过时通知我' },
  { key: 'review_rejected', label: '文章未通过审核时', desc: '文章审核未通过时通知我，并带上原因' },
];

const notifyPrefs = reactive<Record<NotifyKey, boolean>>({
  login: false,
  review_pending: false,
  review_approved: false,
  review_rejected: false,
});
/** 服务端通知开关快照：最后一次已知的服务端值 */
const notifyBaseline = reactive<Record<NotifyKey, boolean>>({
  login: false,
  review_pending: false,
  review_approved: false,
  review_rejected: false,
});
/** 用户改了通知开关但还没保存：轮询不得回填勾选状态 */
const notifyDirty = computed(() => notifyItems.some((i) => notifyPrefs[i.key] !== notifyBaseline[i.key]));
const notifyEmail = ref('');
const notifySmtpConfigured = ref(true);
const notifyLoaded = ref(false);
const savingNotify = ref(false);
const notifyMsg = ref('');
const notifyMsgOk = ref(true);
/** 站点未配 SMTP：提醒用户通知发不出去 */
const notifySmtpMissing = computed(() => notifyLoaded.value && !notifySmtpConfigured.value);

/** 读取通知订阅；接口失败只静默降级，不影响其它 tab */
async function loadNotifyPrefs() {
  try {
    const { data } = await http.get<{
      prefs?: Partial<Record<NotifyKey, boolean>>;
      email?: string;
      smtp_configured?: boolean;
    }>('/auth/notify-prefs');
    const p = data?.prefs ?? {};
    const next = {
      login: !!p.login,
      review_pending: !!p.review_pending,
      review_approved: !!p.review_approved,
      review_rejected: !!p.review_rejected,
    };
    // 用户改了开关但还没保存时不回填：轮询只更新展示性字段（收件邮箱 / SMTP 状态）
    if (!notifyDirty.value) {
      notifyPrefs.login = next.login;
      notifyPrefs.review_pending = next.review_pending;
      notifyPrefs.review_approved = next.review_approved;
      notifyPrefs.review_rejected = next.review_rejected;
    }
    // 基线始终跟随服务端最新值：保存成功后 dirty 自然归零
    notifyBaseline.login = next.login;
    notifyBaseline.review_pending = next.review_pending;
    notifyBaseline.review_approved = next.review_approved;
    notifyBaseline.review_rejected = next.review_rejected;
    notifyEmail.value = data?.email || auth.user?.email || '';
    notifySmtpConfigured.value = data?.smtp_configured !== false;
    notifyLoaded.value = true;
  } catch {
    // 接口未上线 / 网络异常：保持默认值，不打扰其它功能
    notifyLoaded.value = false;
  }
}

async function saveNotifyPrefs() {
  savingNotify.value = true;
  notifyMsg.value = '';
  try {
    await http.put('/auth/notify-prefs', { prefs: { ...notifyPrefs } });
    notifyMsgOk.value = true;
    notifyMsg.value = '已保存';
    // 与服务端对齐：保存成功后「未保存修改」判定回到干净状态
    for (const item of notifyItems) notifyBaseline[item.key] = notifyPrefs[item.key];
  } catch (e) {
    notifyMsgOk.value = false;
    notifyMsg.value = errMsg(e);
  } finally {
    savingNotify.value = false;
  }
}

// 切到「个人设置」时刷新一次订阅状态（避免打开页面时读到旧值）
watch(tab, (t) => {
  if (t === 'profile') loadNotifyPrefs();
});

/* ---------- 个人设置轮询（30s） ---------- */
/** 个人设置轮询间隔：30s（资料变动不频繁，比文章列表慢） */
const PROFILE_POLL_INTERVAL = 30000;

/** 改密弹窗是否打开（提前声明：profileBusy 会引用它，避免声明顺序造成 TDZ 隐患） */
const changePasswordOpen = ref(false);

/** 资料正在提交 / 上传 / 同步：此时暂停轮询，避免回填的旧值盖掉刚保存的新值 */
const profileBusy = computed(
  () =>
    savingProfile.value ||
    savingNotify.value ||
    uploadingAvatar.value ||
    refreshingAvatar.value ||
    // 改密弹窗打开中：弹窗内依赖 auth.user（邮箱 / 是否已设密码），
    // 轮询的 fetchMe 会把旧登录态灌回去，导致弹窗状态与提示错乱
    changePasswordOpen.value
);

/**
 * 静默轮询个人设置的数据。数据分两处：
 *  - auth.user：头像 / 邮箱 / 是否已设密码 / 第三方绑定状态（纯展示，直接刷新）
 *  - 通知订阅：收件邮箱 / SMTP 是否已配置 / 各提醒开关
 * 表单里「改了但还没保存」的字段（昵称 / 简介 / 通知开关）由 dirty 守卫保护，
 * 轮询只回填展示性字段，绝不覆盖用户正在输入的内容。
 */
async function pollProfile() {
  await auth.fetchMe();
  await loadNotifyPrefs();
}

// 个人设置：30s 静默刷新。跳过：未登录 / 非个人设置 tab / 正在提交或上传 / 页面隐藏。
const profilePolling = useSilentPolling(
  pollProfile,
  PROFILE_POLL_INTERVAL,
  () => tab.value === 'profile' && !profileBusy.value,
  () => canPoll.value,
);

// 登录成功 → 开轮询；登出 / 401 失效 → 立即停掉定时器（未登录时不再打接口）
watch(canPoll, (ok) => {
  if (ok) {
    minePolling.start();
    profilePolling.start();
  } else {
    minePolling.stop();
    profilePolling.stop();
  }
});

// ===== 修改/设置密码：弹窗内用邮箱验证码改密（逻辑在 ChangePasswordDialog.vue） =====
/** 账户设置卡（邮箱/密码/第三方绑定）的提示与错误：改密结果展示在本卡内，不混到公开资料卡 */
const accountNotice = ref('');
/** 未绑定邮箱时无法用验证码改密（按钮已禁用，这里再挡一道） */
function openChangePassword() {
  if (!auth.user?.email) return;
  profileError.value = '';
  changePasswordOpen.value = true;
}
/** 弹窗内改密成功：同步登录态并在账户设置卡底部提示（文案取后端 message，区分「已修改」/「已设置」） */
function onPasswordChanged(user: User | null, message?: string) {
  if (user) auth.user = user;
  accountNotice.value = message || '密码已修改';
  // 改密提示归账户卡：清掉公开资料卡里可能残留的旧提示，以及上一轮绑定/解绑的旧提示
  // （两者共用同一段提示位，不清会出现「刚解绑 GitHub 却显示密码已修改」）
  profileError.value = '';
  profileNotice.value = '';
  bindError.value = '';
  bindNotice.value = '';
}

// ===== 第 63 轮：第三方账号绑定/解绑 =====
const bindProviders = ['github', 'google'] as const;
type BindProvider = (typeof bindProviders)[number];
function bound(p: BindProvider) {
  return p === 'github' ? !!auth.user?.github_id : !!auth.user?.google_id;
}
const binding = ref<'' | BindProvider>('');
/** 绑定流程进行中（正在换取第三方授权地址），用于按钮禁用与防重复点击 */
const bindLoading = ref<'' | BindProvider>('');
const bindNotice = ref('');
const bindError = ref('');
/** 第三方绑定失败的错误码 → 中文文案（后端只往 URL 里放稳定错误码，异常文本不会外泄） */
const BIND_FAIL_TEXT: Record<string, string> = {
  gone: '账号不存在或已注销',
  dup: '该第三方账号已绑定其他本站账号',
  server: '绑定失败，请稍后重试',
};
/** 未知/缺失错误码的兜底文案（也兼容旧链接里遗留的自由文本 reason） */
const BIND_FAIL_FALLBACK = '绑定失败，请稍后重试';
/** 绑定失败提示文案：错误码 → 中文；未知码（含旧链接里的自由文本）走兜底文案 */
function bindFailText(code: string): string {
  // 用 hasOwnProperty 取值：reason 来自 URL，可能 'constructor' 这类原型属性名
  const text = Object.prototype.hasOwnProperty.call(BIND_FAIL_TEXT, code)
    ? BIND_FAIL_TEXT[code]
    : '';
  if (!text) return BIND_FAIL_FALLBACK;
  // server 的文案本身已含「绑定失败」，其余补前缀说明是绑定环节出的问题
  return text.startsWith('绑定失败') ? text : `绑定失败：${text}`;
}
/** 绑定第三方账号：先用带 Authorization 头的 XHR 换授权地址，再整页跳到第三方授权页 */
async function bind(p: BindProvider) {
  if (binding.value || bindLoading.value) return;
  bindLoading.value = p;
  // 与解绑提示共用同一段提示位：先清掉旧结果，避免本次结果被旧提示盖住
  bindNotice.value = '';
  bindError.value = '';
  try {
    const { data } = await http.get<{ url?: string }>(`/auth/bind/${p}?json=1`);
    if (!data?.url) {
      bindError.value = '未获取到第三方授权地址，请稍后重试';
      bindLoading.value = '';
      return;
    }
    // 整页跳转到第三方授权页（页面会卸载，loading 态随之消失）
    window.location.href = data.url;
    // 兜底：万一跳转没发生，3 秒后恢复按钮，避免 loading 卡死
    setTimeout(() => {
      bindLoading.value = '';
    }, 3000);
  } catch (e) {
    // 网络层失败（断网/被拦截）时 axios 没有 response，errMsg 只会给出英文的 Network Error，这里转成中文提示
    if (isAxiosError(e) && !e.response) {
      bindError.value = '网络连接失败，请检查网络后重试';
      bindLoading.value = '';
      return;
    }
    // 登录态失效（401）：按项目既有约定清掉本地凭证并跳登录页，登录后回到控制台继续绑定
    if (isAxiosError(e) && e.response?.status === 401) {
      auth.clear();
      bindLoading.value = '';
      router.replace({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
    const msg = errMsg(e);
    // 令牌失效时后端返回「未登录 / 登录已过期」，转成可操作的提示
    bindError.value = /未登录|过期|失效/.test(msg) ? '登录状态已失效，请重新登录后再绑定' : msg;
    bindLoading.value = '';
  }
}
async function unbind(p: BindProvider) {
  if (binding.value) return;
  binding.value = p;
  // 与改密提示共用同一段提示位：先清掉上一次改密结果，否则本次解绑结果会被旧提示盖住
  accountNotice.value = '';
  bindNotice.value = '';
  bindError.value = '';
  try {
    const { data } = await http.delete<{ user: any; message: string }>(`/auth/oauth/${p}`);
    if (data.user) auth.user = data.user;
    bindNotice.value = data.message || '已解绑';
  } catch (e) {
    bindError.value = errMsg(e);
  } finally {
    binding.value = '';
  }
}

onMounted(async () => {
  if (!auth.ready) await auth.fetchMe();
  await loadMine();
  // 从文章页点「编辑」进来时，直接打开对应文章的编辑器
  const editId = Number(route.query.edit);
  if (Number.isInteger(editId) && editId > 0) {
    tab.value = 'articles';
    editing.value = editId;
  }
  // 轮询由 useSilentPolling 统一管理（挂载即启动，非目标 tab / 页面隐藏时自动跳过）
  // 通知订阅：个人设置里的邮件开关
  loadNotifyPrefs();
  // 第三方绑定回调结果（AuthCallbackView 带 ?bind=ok|fail&reason=… 跳回）：在账户设置卡里提示
  const bindResult = route.query.bind;
  if (bindResult === 'ok' || bindResult === 'fail') {
    if (bindResult === 'ok') {
      // 绑定成功后刷新用户信息，否则「已绑定 / 未绑定」徽标仍显示旧状态
      await auth.fetchMe();
      bindNotice.value = '绑定成功';
    } else {
      // reason 只可能是后端的稳定错误码；未知码（含旧链接里的自由文本）走兜底文案
      const code = typeof route.query.reason === 'string' ? route.query.reason : '';
      bindError.value = bindFailText(code);
    }
    // 提示在「个人设置」卡里，切到该标签页才能直接看到结果
    tab.value = 'profile';
    // 清掉 query，避免刷新页面时重复提示
    router.replace({ path: '/console' });
  }
});
</script>

<style scoped>
.console {
  padding: 120px 22px 80px;
  max-width: 1020px;
}

.page-head {
  margin-bottom: 18px;
}

.page-head h1 {
  font-size: 26px;
  color: #ffffff;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.tabs button {
  padding: 8px 16px;
  font-size: 14px;
  color: var(--text-dim);
  background: transparent;
  border: none;
  border-radius: 999px;
  transition: color 0.2s, background 0.2s;
}

.tabs button.on {
  color: #ffffff;
  background: var(--fill);
}

/* 悬停态与顶栏「首页 / 关于」一致 */
.tabs button:hover:not(.on) {
  color: var(--text);
  background: rgba(140, 198, 226, 0.12);
}

.spacer {
  flex: 1;
}

/* 小字返回链接：只做文字色过渡，不加悬停底色 */
.back {
  font-size: 13px;
  color: var(--text-dim);
  text-decoration: none;
  padding-right: 6px;
  transition: color 0.25s ease;
}

.back:hover {
  color: var(--accent);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.toolbar .muted {
  margin-right: auto;
}

.rows {
  list-style: none;
  padding: 6px;
  display: grid;
  gap: 2px;
  min-width: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  min-width: 0;
  flex-wrap: wrap;
  transition: background 0.2s;
}

.row:hover {
  background: rgba(150, 205, 232, 0.07);
}

.row-main {
  min-width: 0;
  flex: 1 1 200px;
  overflow: hidden;
  /* 给状态圆点左侧光晕留出裁剪余量（padding 反向 offset，内容位置不变） */
  padding-left: 10px;
  margin-left: -10px;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #ffffff;
  flex-wrap: wrap;
}

.row-title a {
  color: inherit;
  text-decoration: none;
  overflow-wrap: anywhere;
  transition: color 0.25s ease;
}

.row-title a:hover {
  color: var(--accent);
}

.row-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-dim);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-meta span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-actions {
  display: flex;
  gap: 12px;
  flex: none;
  margin-left: auto;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.dot.published {
  background: #63e6be;
  box-shadow: 0 0 8px #63e6be;
}

.dot.draft {
  background: #f0b429;
}

/* 审核中：蓝色 */
.dot.pending {
  background: #5eb0f0;
  box-shadow: 0 0 8px #5eb0f0;
}

/* 审核被拒：红色 */
.dot.rejected {
  background: #ff8a8a;
  box-shadow: 0 0 8px #ff8a8a;
}

.chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1.6;
  font-weight: 600;
}

.chip.draft {
  color: #f0b429;
  background: rgba(240, 180, 41, 0.14);
}

.chip.pin {
  color: var(--accent);
  background: rgba(140, 198, 226, 0.16);
}

/* 已发布：绿色 */
.chip.published {
  color: #63e6be;
  background: rgba(99, 230, 190, 0.14);
}

/* 审核中：蓝色 */
.chip.pending {
  color: #5eb0f0;
  background: rgba(94, 176, 240, 0.16);
}

/* 审核被拒：红色 */
.chip.rejected {
  color: #ff8a8a;
  background: rgba(255, 138, 138, 0.14);
}

.link-btn {
  font-size: 13px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s, opacity 0.2s;
}

.link-btn:hover {
  color: var(--accent);
}

.link-btn.danger {
  color: #ff8a8a;
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--glass-border);
}

.avatar.big {
  width: 64px;
  height: 64px;
}

/* ---------- 文章详情（/console 页内展开，不新增路由） ---------- */
.detail {
  max-width: 820px;
  margin: 0 auto;
  padding: 22px 34px 44px;
  min-width: 0;
}

.detail-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-dim);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 9px;
  margin-left: -9px;
  border-radius: 999px;
  transition: color 0.2s, background 0.2s;
}

.back-btn:hover {
  color: var(--text);
  background: var(--fill);
}

/* 「编辑」固定在右侧，与返回按钮分离 */
.detail-bar .btn {
  margin-left: auto;
}

.detail-state {
  padding: 30px 0;
  text-align: center;
}

.detail-title {
  font-size: 26px;
  line-height: 1.35;
  color: #ffffff;
  margin: 4px 0 12px;
  overflow-wrap: anywhere;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--text-dim);
}

.detail-meta .avatar.small {
  width: 24px;
  height: 24px;
}

.detail-author {
  color: #ffffff;
}

.detail-meta .sep {
  opacity: 0.5;
}

.detail-lead {
  margin-top: 14px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}


.detail-rule {
  margin: 22px 0 18px;
  border: none;
  border-top: 1px solid var(--glass-border);
}

@media (max-width: 640px) {
  .detail {
    padding: 16px 18px 32px;
  }

  .detail-title {
    font-size: 21px;
  }
}

.empty {
  padding: 40px 0;
  text-align: center;
}

.stack {
  display: grid;
  gap: 16px;
}

.form-card {
  padding: 24px 26px 28px;
  display: grid;
  gap: 14px;
}

.form-card h2 {
  font-size: 15px;
  color: var(--accent);
  margin-top: 6px;
}

.form-card h2:first-child {
  margin-top: 0;
}

.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

/* 退出登录放在左侧，与右侧「保存资料」区分主次；悬停变红 */
.form-actions .logout {
  margin-right: auto;
  /* 全局 .btn-ghost 只过渡 background，这里补上文字色与边框色的过渡 */
  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

.form-actions .logout:hover {
  color: #ff8a8a;
  background: rgba(255, 138, 138, 0.14);
  border-color: rgba(255, 138, 138, 0.42);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.space-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
  transition: color 0.25s ease;
}

.space-link:hover {
  color: #ffffff;
}

.upload-chip {
  font-size: 13px;
  color: var(--accent);
  background: transparent;
  border: 1px dashed var(--glass-border);
  border-radius: 999px;
  padding: 7px 16px;
  cursor: pointer;
  transition: color 0.25s ease, background 0.25s ease, border-color 0.25s ease;
}

/* 与站内其他胶囊按钮一致的悬停反馈（无位移，只变色） */
.upload-chip:hover {
  color: var(--text);
  background: rgba(140, 198, 226, 0.14);
  border-color: rgba(140, 198, 226, 0.55);
}

.notice {
  font-size: 13px;
  color: var(--accent);
}

/* ===== 修改密码入口（邮箱栏下方，点开弹窗） ===== */
.pw-entry-wrap {
  display: grid;
  gap: 6px;
}

.pw-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  text-align: left;
  color: var(--text);
  background: var(--accent-faint);
  border: 1px solid var(--glass-border);
  border-radius: 12px; /* 与卡内输入框圆角一致 */
  transition: background 0.25s ease, border-color 0.25s ease;
}

/* 悬停只变色不位移（与站内胶囊按钮一致） */
.pw-entry:hover:not(:disabled) {
  background: rgba(140, 198, 226, 0.14);
  border-color: rgba(140, 198, 226, 0.55);
}

.pw-entry:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.pw-entry-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.pw-entry-title {
  font-size: 14px;
  font-weight: 600;
}

.pw-entry-desc {
  font-size: 12.5px;
  color: var(--text-dim);
}

.pw-entry-arrow {
  margin-left: auto;
  flex: none;
  font-size: 14px;
  color: var(--accent);
  transition: color 0.25s ease;
}

.pw-entry:hover:not(:disabled) .pw-entry-arrow {
  color: #ffffff;
}

/* ===== 第三方绑定行（直接排在账户设置卡内，无小节标题） ===== */
.bind-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}
/* 分隔线只画在两行之间：bind-row 不再是卡内最后一个 div，不能再用 :last-of-type 判断 */
.bind-row + .bind-row {
  /* 同上：--border 前台未定义，直接写实值 */
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}
.bind-name {
  min-width: 72px;
  font-weight: 600;
  font-size: 14px;
}
.bind-state {
  font-size: 12.5px;
  padding: 2px 10px;
  border-radius: 999px;
}
.bind-state.on {
  /* 与站内既有绿（.dot.published）统一 */
  color: #63e6be;
  background: rgba(52, 211, 153, 0.12);
}
.bind-state.off {
  /* 前台未定义 --text-3（仅 AdminView 局部有），直接写实值 */
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.06);
}
.bind-row .btn-ghost {
  margin-left: auto;
}
/* 解绑按钮：与「退出登录」同族的危险色 */
.bind-row .btn-ghost.danger {
  color: #ff9b9b;
  background: rgba(255, 138, 138, 0.1);
  border-color: rgba(255, 138, 138, 0.32);
  transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}
.bind-row .btn-ghost.danger:hover:not(:disabled) {
  background: rgba(255, 138, 138, 0.18);
  border-color: rgba(255, 138, 138, 0.5);
}
.bind-row .btn-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.bind-row .bind-link {
  text-decoration: none;
  margin-left: auto;
}
.bind-na {
  margin-left: auto;
  font-size: 12.5px;
  /* 前台未定义 --text-3，直接写实值 */
  color: rgba(255, 255, 255, 0.5);
}
.field-hint {
  font-size: 12.5px;
  line-height: 1.6;
  /* 前台未定义 --text-3，直接写实值 */
  color: rgba(255, 255, 255, 0.5);
}

/* ===== 通知订阅 ===== */
.notify-email {
  color: var(--accent);
}

/* SMTP 未配置：柔和提醒（不是报错） */
.notify-warn {
  color: #f0b429;
}

.notify-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--border, rgba(255, 255, 255, 0.1));
  cursor: pointer;
}

.notify-row:last-of-type {
  border-bottom: none;
}

/* 全局 input 规则给了 width:100% + padding，复选框会被拉伸占满整行；
   这里改成自绘玻璃勾选框：appearance:none + 20×20 + 圆角 6px */
.notify-row input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  padding: 0;
  margin: 0;
  flex: none;
  position: relative;
  border-radius: 6px;
  border: 1px solid var(--glass-border);
  background: var(--field-bg);
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

/* 悬停：边框提亮 + 淡蓝底 */
.notify-row input[type='checkbox']:hover {
  border-color: var(--accent);
  background: rgba(140, 198, 226, 0.1);
}

.notify-row input[type='checkbox']:checked {
  background: var(--accent);
  border-color: var(--accent);
}

/* 对勾用深色：--accent 是浅蓝，白勾对比度不足 */
.notify-row input[type='checkbox']:checked::after {
  content: '';
  position: absolute;
  left: 5.5px;
  top: 2px;
  width: 5px;
  height: 9px;
  border: solid #08131f;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.notify-row input[type='checkbox']:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(140, 198, 226, 0.28);
}

.notify-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.notify-label {
  font-size: 14px;
  color: #ffffff;
}

.notify-desc {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-3, rgba(255, 255, 255, 0.5));
}

/* 行内提示：复用 .notice / .error-tip 配色，去掉块级偏移 */
.notify-msg .notice,
.notify-msg .error-tip {
  margin-top: 0;
}
</style>
