<template>
  <div class="admin">
    <!-- 校验登录状态中：已过期令牌不会先闪出后台内容 -->
    <div v-if="booting" class="boot">正在验证登录状态…</div>

    <!-- ======== 登录门 ======== -->
    <div v-else-if="!admin.authed" class="gate-col">
      <div class="gate">
        <div class="gate-card">
          <h1><span class="grad">ShimmerBlog</span> 管理后台</h1>
          <p class="gate-sub">请输入管理密码进入</p>
          <form @submit.prevent="doLogin">
            <input
              v-model="password"
              type="password"
              placeholder="管理密码"
              autocomplete="current-password"
            />
            <button type="submit" :disabled="busy">{{ busy ? '验证中…' : '进入后台' }}</button>
          </form>
          <p v-if="gateError" class="gate-err">{{ gateError }}</p>
          <p class="gate-hint">管理密码与用户账号无关，仅用于本后台。</p>
          </div>
      </div>
      <SiteFooter tone="light" />
      <CaptchaDialog v-model:open="gateCaptchaOpen" :action="doLoginWithCaptcha" />
    </div>

    <!-- ======== 后台主体 ======== -->
    <div v-else class="shell">
      <aside class="side">
        <div class="side-brand"><span class="grad">ShimmerBlog</span><br />管理后台</div>
        <nav>
          <button :class="{ on: tab === 'site' }" @click="tab = 'site'">站点</button>
          <button :class="{ on: tab === 'mail' }" @click="tab = 'mail'">邮件</button>
          <button :class="{ on: tab === 'oauth' }" @click="tab = 'oauth'">第三方登录</button>
          <button :class="{ on: tab === 'users' }" @click="tab = 'users'">用户</button>
          <button :class="{ on: tab === 'articles' }" @click="tab = 'articles'">文章</button>
        </nav>
        <div class="side-foot">
          <button class="ghost" @click="changePwd">改管理密码</button>
          <button class="ghost danger" @click="logout">退出</button>
        </div>
      </aside>

      <div class="main-col">
        <main class="main">
          <!-- ============ 站点 ============ -->
          <section v-if="tab === 'site'" class="pane">
            <div class="card">
              <h2>站点信息</h2>
              <label class="row"><span>主标题</span><input v-model.trim="siteForm.site_title" /></label>
              <label class="row"><span>副标题</span><input v-model.trim="siteForm.site_subtitle" /></label>
              <label class="row"><span>站点描述</span><input v-model="siteForm.site_description" /></label>
                  <label class="row"><span>关于页副标题</span><input v-model="siteForm.about_subtitle" placeholder="留空用默认：一个会发光的角落" /></label>
            </div>

            <div class="card">
              <h2>站点 Logo</h2>
              <div class="logo-box">
                <img v-if="logoUrl" :src="logoUrl" alt="logo" class="logo-preview" />
                <span v-else class="logo-empty">未设置（使用默认 logo.png）</span>
                <div class="logo-ops">
                  <label class="file-btn">
                    上传新 Logo
                    <input type="file" accept="image/*" hidden @change="uploadLogo" />
                  </label>
                  <button v-if="logoUrl" class="ghost danger" @click="removeLogo">恢复默认</button>
                </div>
              </div>

              <h2 class="mt">用户默认头像</h2>
              <div class="logo-box">
                <img v-if="defaultAvatarUrl" :src="defaultAvatarUrl" alt="默认头像" class="logo-preview" />
                <span v-else class="logo-empty">未设置（使用内置 default 头像）</span>
                <div class="logo-ops">
                  <label class="file-btn">
                    上传默认头像
                    <input type="file" accept="image/*" hidden @change="uploadDefaultAvatar" />
                  </label>
                  <button v-if="defaultAvatarUrl" class="ghost danger" @click="removeDefaultAvatar">恢复内置</button>
                </div>
              </div>
            </div>

            <div class="card">
              <h2>关于页面内容（HTML）</h2>
              <p class="hint">留空则显示内置介绍。仅允许文本、链接、图片、标题、列表等安全标签。</p>
              <textarea v-model="siteForm.about_html" class="ta mono" rows="10" spellcheck="false" />
            </div>

            <div class="card">
              <h2>行为验证码（GoCaptcha）</h2>
              <p class="hint">
                启用后，登录、注册、发送邮件验证码、发布文章、上传图片、修改资料与后台登录均需先完成点选验证。
                需先部署 go-captcha-service 并绑定域名。
              </p>
              <label class="row check"><input type="checkbox" v-model="captchaEnabledBool" /><span>启用行为验证码</span></label>
              <label class="row"><span>服务地址</span><input v-model.trim="captchaForm.captcha_api" placeholder="https://go-captcha.xiaoziyi.com" /></label>
              <label class="row"><span>实例 ID</span><input v-model.trim="captchaForm.captcha_id" placeholder="click-default-ch" /></label>
              <label class="row"><span>内部校验地址</span><input v-model.trim="captchaForm.captcha_verify_api" placeholder="可选，留空用服务地址；同机可填 http://127.0.0.1:9700" /></label>
              <p class="hint" :class="{ ok: captchaOn }">{{ captchaOn ? '✓ 当前已生效：访客与后台均需完成验证' : '当前未启用' }}</p>
              <div class="ops inline">
                <button class="primary" :disabled="saving" @click="saveCaptchaSettings">{{ saving ? '保存中…' : '保存验证码设置' }}</button>
              </div>
            </div>

            <div class="ops">
              <button class="primary" :disabled="saving" @click="saveSettings(['site_title', 'site_subtitle', 'site_description', 'about_subtitle', 'about_html'])">
                {{ saving ? '保存中…' : '保存站点设置' }}
              </button>
              <span v-if="flash" class="flash">{{ flash }}</span>
            </div>
          </section>

          <!-- ============ 邮件 ============ -->
          <section v-if="tab === 'mail'" class="pane">
            <div class="card">
              <h2>邮件模板</h2>
              <p class="hint">所有系统邮件的主题与正文均可自定义，留空使用内置默认；点击占位符可插入到正文光标处。</p>

              <div v-for="t in mailTemplates" :key="t.kind" class="tpl">
                <div class="tpl-head">
                  <div>
                    <div class="tpl-name">{{ t.label }}</div>
                    <div class="tpl-desc">{{ t.desc }}</div>
                  </div>
                  <button class="ghost sm" type="button" @click="resetTpl(t)">恢复默认</button>
                </div>
                <label class="row"><span>主题</span><input v-model="mailForm[t.subjectKey]" :placeholder="'默认：' + t.defaultSubject" /></label>
                <div class="body-row"><span>正文</span>
                  <textarea
                    :ref="(el) => setBodyRef(t.kind, el)"
                    v-model="mailForm[t.bodyKey]"
                    class="ta mono"
                    rows="5"
                    spellcheck="false"
                    :placeholder="'默认：' + t.defaultBody"
                  />
                </div>
                <div class="ph-row">
                  <span class="ph-label">占位符</span>
                  <button v-for="p in t.placeholders" :key="p" type="button" class="ph-chip" @click="insertPh(t, p)">{{ p }}</button>
                </div>
              </div>
            </div>

            <div class="card">
              <h2>SMTP 发信配置</h2>
              <p class="hint status" :class="{ ok: smtpEnabled }">{{ smtpEnabled ? '● 已配置，可以发信' : '○ 未配置（将无法发送任何邮件）' }}</p>
              <div class="grid">
                <label class="row"><span>SMTP 主机</span><input v-model.trim="mailForm.smtp_host" placeholder="smtp.example.com" /></label>
                <label class="row"><span>端口</span><input v-model.trim="mailForm.smtp_port" placeholder="465" /></label>
                <label class="row"><span>发件人</span><input v-model.trim="mailForm.smtp_from" placeholder="ShimmerBlog &lt;no-reply@example.com&gt;" /></label>
                <p class="hint">发件人必须包含邮箱地址，推荐格式：<code>名称 &lt;邮箱&gt;</code>；只填名称会导致外域邮箱拒收（信封无地址）。</p>
                <label class="row"><span>账号</span><input v-model.trim="mailForm.smtp_user" /></label>
                <label class="row"><span>密码/授权码</span><input v-model="mailForm.smtp_pass" type="password" :placeholder="smtpPassSet ? '已配置，留空保持不变' : '未配置'" /></label>
                <label class="row check"><input type="checkbox" v-model="smtpSecureBool" /><span>SSL/TLS（465 端口通常勾选）</span></label>
              </div>
            </div>

            <div class="card">
              <h2>发送测试邮件</h2>
              <p class="hint">使用「测试邮件」模板向指定邮箱发一封真实邮件，验证 SMTP 配置。</p>
              <div class="row send-row">
                <input v-model.trim="testTo" placeholder="接收邮箱" />
                <button class="ghost" :disabled="testing" @click="sendTest">{{ testing ? '发送中…' : '发送' }}</button>
              </div>
              <p v-if="testResult" class="hint" :class="{ ok: testOk }">{{ testResult }}</p>
            </div>

            <div class="ops">
              <button class="primary" :disabled="saving" @click="saveMailSettings">
                {{ saving ? '保存中…' : '保存邮件设置' }}
              </button>
              <span v-if="flash" class="flash">{{ flash }}</span>
            </div>
          </section>

          <!-- ============ 第三方登录 ============ -->
          <section v-if="tab === 'oauth'" class="pane">
            <div class="card">
              <h2>GitHub 登录</h2>
              <p class="hint status" :class="{ ok: githubEnabled }">{{ githubEnabled ? '● 已配置，登录页展示 GitHub 按钮' : '○ 未配置（配置后登录页自动展示）' }}</p>
              <p class="hint">
                在 <a :href="ghAppUrl" target="_blank" rel="noopener">GitHub OAuth Apps</a> 创建应用，
                授权回调地址填：<code>{{ callbackBase }}/api/auth/github/callback</code>
              </p>
              <label class="row"><span>Client ID</span><input v-model.trim="oauthForm.github_client_id" placeholder="Ov23li… / Iv1.…" autocomplete="off" /></label>
              <label class="row"><span>Client Secret</span><input v-model="oauthForm.github_client_secret" type="password" :placeholder="ghSecretSet ? '已配置，留空保持不变' : '未配置'" autocomplete="new-password" /></label>
            </div>

            <div class="card">
              <h2>Google 登录</h2>
              <p class="hint status" :class="{ ok: googleEnabled }">{{ googleEnabled ? '● 已配置，登录页展示 Google 按钮' : '○ 未配置（配置后登录页自动展示）' }}</p>
              <p class="hint">
                在 <a :href="ggAppUrl" target="_blank" rel="noopener">Google Cloud 控制台</a> 创建 OAuth 客户端（Web 应用），
                已获授权的重定向 URI 填：<code>{{ callbackBase }}/api/auth/google/callback</code>
              </p>
              <label class="row"><span>Client ID</span><input v-model.trim="oauthForm.google_client_id" placeholder="xxxxx.apps.googleusercontent.com" autocomplete="off" /></label>
              <label class="row"><span>Client Secret</span><input v-model="oauthForm.google_client_secret" type="password" :placeholder="ggSecretSet ? '已配置，留空保持不变' : '未配置'" autocomplete="new-password" /></label>
            </div>

            <div class="card">
              <h2>出站代理（可选）</h2>
              <p class="hint">服务器直连不了 GitHub / Google API（如国内服务器）时填写 HTTP(S) 代理，例如 <code>http://127.0.0.1:7890</code>；留空直连。仅作用于服务器侧的令牌换取与用户信息请求；访客浏览器仍需能自行打开 GitHub / Google 授权页。</p>
              <label class="row"><span>代理地址</span><input v-model.trim="oauthForm.oauth_proxy_url" placeholder="http://127.0.0.1:7890" autocomplete="off" /></label>
            </div>

            <div class="ops">
              <button class="primary" :disabled="saving" @click="saveOauthSettings">
                {{ saving ? '保存中…' : '保存第三方登录设置' }}
              </button>
              <span v-if="flash" class="flash">{{ flash }}</span>
            </div>
          </section>

          <!-- ============ 用户 ============ -->
          <section v-if="tab === 'users'" class="pane">
            <div class="card">
              <div class="list-head">
                <h2>用户管理 <small>{{ userTotal }} 人</small></h2>
                <input v-model.trim="userQuery" class="search" placeholder="搜索邮箱 / 昵称…" @input="searchUsers" />
              </div>
              <div class="default-color">
                <span class="dim">默认用户名颜色（未自定义时显示）</span>
                <input type="color" v-model="siteForm.default_name_color" />
                <code class="dim">{{ siteForm.default_name_color }}</code>
                <button class="ghost sm" :disabled="saving" @click="saveSettings(['default_name_color'])">保存</button>
              </div>
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr><th>ID</th><th>用户</th><th>名称颜色</th><th>权限</th><th>状态</th><th>注册时间</th><th></th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="u in users" :key="u.id">
                      <td class="dim">{{ u.id }}</td>
                      <td>
                        <div class="cell-user">
                          <img :src="u.avatar_url || defaultAvatar" class="mini-avatar" alt="" />
                          <div>
                            <div class="u-name" :style="u.name_color ? { color: u.name_color } : undefined">{{ u.name }}</div>
                            <div class="dim">{{ u.email }}<template v-if="u.github_id"> · GitHub</template><template v-if="u.google_id"> · Google</template></div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div class="color-cell">
                          <input type="color" :value="toHex6(u.name_color || siteForm.default_name_color)" @input="setColor(u, $event)" />
                          <code class="dim">{{ u.name_color || ('默认 ' + siteForm.default_name_color) }}</code>
                        </div>
                      </td>
                      <td>
                        <label class="perm"><input type="checkbox" :checked="hasPerm(u, 'post')" @change="setPerm(u, 'post', $event)" />发布文章</label>
                      </td>
                      <td>
                        <button class="pill" :class="u.status" @click="toggleStatus(u)">
                          {{ u.status === 'active' ? '正常' : '已禁用' }}
                        </button>
                      </td>
                      <td class="dim">{{ fmtDate(u.created_at) }}</td>
                      <td class="row-ops">
                        <a class="ghost sm" :href="`/space/${u.id}`" target="_blank">空间</a>
                        <button class="ghost sm" @click="openEdit(u)">编辑</button>
                        <button class="ghost sm danger" @click="removeUser(u)">删除</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!users.length" class="hint">没有匹配的用户。</p>
            </div>
          </section>

          <!-- ============ 文章 ============ -->
          <section v-if="tab === 'articles'" class="pane">
            <div class="card">
              <div class="list-head">
                <h2>文章管理 <small>{{ articleTotal }} 篇（含草稿）</small></h2>
                <input v-model.trim="articleQuery" class="search" placeholder="搜索标题…" @input="searchArticles" />
              </div>
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr><th>ID</th><th>标题</th><th>作者</th><th>状态</th><th>置顶</th><th>更新时间</th><th></th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in articles" :key="a.id">
                      <td class="dim">{{ a.id }}</td>
                      <td class="title-cell"><a :href="`/article/${a.id}`" target="_blank">{{ a.title }}</a></td>
                      <td>
                        <span :style="a.author_name_color ? { color: a.author_name_color } : undefined">{{ a.author_name }}</span>
                        <small v-if="a.status === 'draft'" class="dim"> · 草稿</small>
                      </td>
                      <td><span class="pill" :class="a.status">{{ a.status === 'published' ? '已发布' : '草稿' }}</span></td>
                      <td>
                        <button class="pill" :class="{ pinned: !!a.pinned }" @click="togglePin(a)">
                          {{ a.pinned ? '已置顶' : '未置顶' }}
                        </button>
                      </td>
                      <td class="dim">{{ fmtDate(a.updated_at) }}</td>
                      <td><button class="ghost sm danger" @click="deleteArticle(a)">删除</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!articles.length" class="hint">没有匹配的文章。</p>
            </div>
          </section>
        </main>
        <SiteFooter tone="light" />
      </div>
    </div>

    <!-- 改管理密码弹层 -->
    <div v-if="pwdOpen" class="modal-mask" @click.self="pwdOpen = false">
      <div class="modal">
        <h3>修改管理密码</h3>
        <input v-model="newPwd" type="password" placeholder="新密码（至少 6 位）" />
        <div class="modal-ops">
          <button class="ghost" @click="pwdOpen = false">取消</button>
          <button class="primary" :disabled="saving" @click="savePwd">保存</button>
        </div>
        <p v-if="pwdMsg" class="hint" :class="{ ok: pwdOk }">{{ pwdMsg }}</p>
      </div>
    </div>
    <!-- 编辑用户弹层 -->
    <div v-if="editOpen" class="modal-mask" @click.self="editOpen = false">
      <div class="modal">
        <h3>编辑用户</h3>
        <input v-model.trim="editForm.name" placeholder="昵称" />
        <input v-model.trim="editForm.email" placeholder="绑定邮箱" />
        <input v-model="editForm.password" type="password" placeholder="新密码（留空不改）" />
        <p class="hint">改邮箱后用户需重新验证（验证码登录即可完成）。</p>
        <div class="modal-ops">
          <button class="ghost" @click="editOpen = false">取消</button>
          <button class="primary" @click="saveEdit">保存</button>
        </div>
        <p v-if="editMsg" class="hint">{{ editMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import adminHttp, { errMsg } from '../api/adminHttp';
import { isCaptchaFailure } from '../api/http';
import { useAdminStore } from '../stores/admin';
import { useSiteStore } from '../stores/site';
import SiteFooter from '../components/SiteFooter.vue';
import CaptchaDialog from '../components/CaptchaDialog.vue';
import defaultAvatar from '../assets/default-avatar.svg';

const admin = useAdminStore();
// 已有本地令牌时先进入「验证中」态，避免过期令牌先渲染后台内容再跳回登录门
const booting = ref(!!admin.token && !admin.checked);

type Tab = 'site' | 'mail' | 'oauth' | 'users' | 'articles';
const tab = ref<Tab>('site');

/* ---- 登录门 ---- */
const password = ref('');
const busy = ref(false);
const gateError = ref('');
const site = useSiteStore();
const gateCaptchaOpen = ref(false);
const gateCaptchaArg = ref<{ key: string; value: string } | undefined>(undefined);

if (!site.loaded) site.fetch();

async function doLogin() {
  if (!password.value) return;
  // 启用行为验证码时先弹窗验证，验证通过后带 captcha 提交
  if (site.info.captchaEnabled && !gateCaptchaArg.value) {
    gateCaptchaOpen.value = true;
    return;
  }
  busy.value = true;
  gateError.value = '';
  try {
    await admin.login(password.value, gateCaptchaArg.value);
    password.value = '';
    await bootstrap();
    await Promise.all([loadUsers(), loadArticles()]);
  } catch (e) {
    if (isCaptchaFailure(e)) return; // 验证码未通过：弹窗内已提示并自动换题
    gateError.value = errMsg(e);
  } finally {
    busy.value = false;
    gateCaptchaArg.value = undefined;
  }
}

async function doLoginWithCaptcha(c: { key: string; value: string }) {
  gateCaptchaArg.value = c;
  try {
    await doLogin();
  } finally {
    // 成功时 doLogin 已把 arg 清空；失败时也清空以便下次重新弹窗
    gateCaptchaArg.value = undefined;
  }
}

function logout() {
  admin.logout();
}

/* ---- 管理密码 ---- */
const pwdOpen = ref(false);
const newPwd = ref('');
const pwdMsg = ref('');
const pwdOk = ref(false);

function changePwd() {
  newPwd.value = '';
  pwdMsg.value = '';
  pwdOpen.value = true;
}

async function savePwd() {
  pwdMsg.value = '';
  try {
    await adminHttp.put('/admin/password', { password: newPwd.value });
    pwdOk.value = true;
    pwdMsg.value = '已更新，下次登录使用新密码。';
  } catch (e) {
    pwdOk.value = false;
    pwdMsg.value = errMsg(e);
  }
}

/* ---- 通用保存 ---- */
const saving = ref(false);
const flash = ref('');
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function showFlash(msg: string) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ''), 2600);
}

const siteForm = reactive({ site_title: '', site_subtitle: '', site_description: '', about_subtitle: '', about_html: '', default_name_color: '' });
const oauthForm = reactive({ github_client_id: '', github_client_secret: '', google_client_id: '', google_client_secret: '', oauth_proxy_url: '' });
const githubEnabled = ref(false);
const googleEnabled = ref(false);
const ghSecretSet = ref(false);
const ggSecretSet = ref(false);
// 行为验证码（GoCaptcha）
const captchaForm = reactive({ captcha_api: '', captcha_verify_api: '', captcha_id: 'click-default-ch' });
const captchaEnabledBool = ref(false);
const captchaOn = ref(false);
// 回调地址以站点配置 web_origin 为准（与后端 redirect_uri 同源：本地 http://localhost:5180，线上域名）；装载配置前先展示当前访问地址
const callbackBase = ref(window.location.origin);
const ghAppUrl = 'https://github.com/settings/developers';
const ggAppUrl = 'https://console.cloud.google.com/apis/credentials';

/** 后端返回的邮件模板元数据（每种邮件一份：标签 / 占位符 / 内置默认） */
interface TplMeta {
  kind: string;
  label: string;
  desc: string;
  placeholders: string[];
  subjectKey: string;
  bodyKey: string;
  defaultSubject: string;
  defaultBody: string;
}

const mailTemplates = ref<TplMeta[]>([]);
const mailForm = reactive<Record<string, string>>({});
const smtpSecureBool = ref(false);
const smtpEnabled = ref(false);
const smtpPassSet = ref(false);
const logoUrl = ref('');
const defaultAvatarUrl = ref('');
// 站点/邮件设置是否已从后端加载成功；未加载前禁止保存，防止空表单覆盖线上配置。
const settingsReady = ref(false);

async function bootstrap() {
  const { data } = await adminHttp.get('/admin/settings');
  Object.assign(siteForm, {
    site_title: data.settings.site_title ?? '',
    site_subtitle: data.settings.site_subtitle ?? '',
    site_description: data.settings.site_description ?? '',
    about_subtitle: data.settings.about_subtitle ?? '',
    about_html: data.settings.about_html ?? '',
    default_name_color: data.settings.default_name_color ?? '',
  });
  mailTemplates.value = data.mailTemplates ?? [];
  for (const t of mailTemplates.value) {
    mailForm[t.subjectKey] = data.settings[t.subjectKey] ?? '';
    mailForm[t.bodyKey] = data.settings[t.bodyKey] ?? '';
  }
  Object.assign(mailForm, {
    smtp_host: data.settings.smtp_host ?? '',
    smtp_port: data.settings.smtp_port ?? '',
    smtp_from: data.settings.smtp_from ?? '',
    smtp_user: data.settings.smtp_user ?? '',
    smtp_pass: data.settings.smtp_pass ?? '',
    smtp_secure: data.settings.smtp_secure ?? '',
  });
  smtpSecureBool.value = mailForm.smtp_secure === '1';
  smtpEnabled.value = !!data.smtpEnabled;
  smtpPassSet.value = data.settings.smtp_pass === '__KEEP__';
  Object.assign(oauthForm, {
    github_client_id: data.settings.github_client_id ?? '',
    github_client_secret: data.settings.github_client_secret ?? '',
    google_client_id: data.settings.google_client_id ?? '',
    google_client_secret: data.settings.google_client_secret ?? '',
    oauth_proxy_url: data.settings.oauth_proxy_url ?? '',
  });
  githubEnabled.value = !!data.githubEnabled;
  googleEnabled.value = !!data.googleEnabled;
  ghSecretSet.value = data.settings.github_client_secret === '__KEEP__';
  ggSecretSet.value = data.settings.google_client_secret === '__KEEP__';
  if (data.settings.web_origin) callbackBase.value = data.settings.web_origin;
  Object.assign(captchaForm, {
    captcha_api: data.settings.captcha_api ?? '',
    captcha_verify_api: data.settings.captcha_verify_api ?? '',
    captcha_id: data.settings.captcha_id ?? 'click-default-ch',
  });
  captchaEnabledBool.value = data.settings.captcha_enabled === '1';
  captchaOn.value = !!data.captchaEnabled;
  logoUrl.value = data.settings.site_logo_url ?? '';
  defaultAvatarUrl.value = data.settings.default_avatar_url ?? '';
  settingsReady.value = true;
}

async function saveSettings(keys: string[]) {
  if (!settingsReady.value) {
    showFlash('配置尚未加载完成，请刷新页面后再保存');
    return;
  }
  saving.value = true;
  try {
    const body: Record<string, unknown> = {};
    for (const k of keys) {
      body[k] = (siteForm as Record<string, unknown>)[k] ?? mailForm[k] ?? (oauthForm as Record<string, unknown>)[k];
    }
    body.smtp_secure = smtpSecureBool.value;
    const { data } = await adminHttp.put('/admin/settings', body);
    smtpEnabled.value = !!data.smtpEnabled;
    githubEnabled.value = !!data.githubEnabled;
    googleEnabled.value = !!data.googleEnabled;
    if (logoUrl.value && keys.includes('site_title')) await refreshSite();
    showFlash('✓ 已保存');
  } catch (e) {
    showFlash('保存失败：' + errMsg(e));
  } finally {
    saving.value = false;
  }
}

async function saveMailSettings() {
  const keys = mailTemplates.value.flatMap((t) => [t.subjectKey, t.bodyKey]);
  await saveSettings([...keys, 'smtp_host', 'smtp_port', 'smtp_from', 'smtp_user', 'smtp_pass']);
}

async function saveOauthSettings() {
  await saveSettings(['github_client_id', 'github_client_secret', 'google_client_id', 'google_client_secret', 'oauth_proxy_url']);
}

async function saveCaptchaSettings() {
  if (!settingsReady.value) {
    showFlash('配置尚未加载完成，请刷新页面后再保存');
    return;
  }
  saving.value = true;
  try {
    const { data } = await adminHttp.put('/admin/settings', {
      captcha_enabled: captchaEnabledBool.value ? '1' : '0',
      captcha_api: captchaForm.captcha_api,
      captcha_verify_api: captchaForm.captcha_verify_api,
      captcha_id: captchaForm.captcha_id,
    });
    captchaOn.value = !!data.captchaEnabled;
    await refreshSite();
    showFlash('✓ 已保存');
  } catch (e) {
    showFlash('保存失败：' + errMsg(e));
  } finally {
    saving.value = false;
  }
}

/* ---- 邮件模板编辑：占位符插入 / 恢复默认 ---- */
const bodyRefs = new Map<string, HTMLTextAreaElement>();

function setBodyRef(kind: string, el: unknown) {
  if (el instanceof HTMLTextAreaElement) bodyRefs.set(kind, el);
  else bodyRefs.delete(kind);
}

function insertPh(t: TplMeta, ph: string) {
  const ta = bodyRefs.get(t.kind);
  const v = String(mailForm[t.bodyKey] ?? '');
  if (!ta) {
    mailForm[t.bodyKey] = v + ph;
    return;
  }
  const s = ta.selectionStart ?? v.length;
  const e = ta.selectionEnd ?? s;
  mailForm[t.bodyKey] = v.slice(0, s) + ph + v.slice(e);
  requestAnimationFrame(() => {
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + ph.length;
  });
}

function resetTpl(t: TplMeta) {
  mailForm[t.subjectKey] = '';
  mailForm[t.bodyKey] = '';
  showFlash(`「${t.label}」已还原为默认内容，保存后生效`);
}

async function refreshSite() {
  await fetch('/api/site', { cache: 'no-store' }).catch(() => undefined);
}

async function uploadLogo(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await adminHttp.post('/admin/logo', fd);
    logoUrl.value = data.url;
    await refreshSite();
    showFlash('✓ Logo 已更新');
  } catch (err) {
    showFlash('上传失败：' + errMsg(err));
  }
  input.value = '';
}

async function removeLogo() {
  try {
    await adminHttp.delete('/admin/logo');
    logoUrl.value = '';
    await refreshSite();
    showFlash('✓ 已恢复默认 Logo');
  } catch (err) {
    showFlash('操作失败：' + errMsg(err));
  }
}

async function uploadDefaultAvatar(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await adminHttp.post('/admin/default-avatar', fd);
    defaultAvatarUrl.value = data.url;
    await refreshSite();
    showFlash('✓ 默认头像已更新');
  } catch (err) {
    showFlash('上传失败：' + errMsg(err));
  }
  input.value = '';
}

async function removeDefaultAvatar() {
  try {
    await adminHttp.delete('/admin/default-avatar');
    defaultAvatarUrl.value = '';
    await refreshSite();
    showFlash('✓ 已恢复内置头像');
  } catch (err) {
    showFlash('操作失败：' + errMsg(err));
  }
}

const testTo = ref('');
const testing = ref(false);
const testResult = ref('');
const testOk = ref(false);

async function sendTest() {
  testing.value = true;
  testResult.value = '';
  try {
    await adminHttp.post('/admin/mail/test', { to: testTo.value });
    testOk.value = true;
    testResult.value = '✓ 测试邮件已发送，请查收';
  } catch (e) {
    testOk.value = false;
    testResult.value = errMsg(e);
  } finally {
    testing.value = false;
  }
}

/* ---- 用户管理 ---- */
interface AdminUser {
  id: number;
  email: string | null;
  name: string;
  name_color: string | null;
  avatar_url: string | null;
  permissions: string[] | null;
  status: 'active' | 'disabled';
  github_id: number | null;
  google_id: string | null;
  created_at: string;
}

const users = ref<AdminUser[]>([]);
const userTotal = ref(0);
const userQuery = ref('');
let userSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadUsers() {
  try {
    const { data } = await adminHttp.get('/admin/users', { params: { q: userQuery.value || undefined } });
    users.value = data.items;
    userTotal.value = data.total;
  } catch (e) {
    showFlash(errMsg(e));
  }
}

function searchUsers() {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(loadUsers, 300);
}

function toHex6(c: string | null): string {
  if (!c) return '#ffffff';
  const v = c.startsWith('#') ? c.slice(1) : c;
  if (v.length === 3) return '#' + v.split('').map((ch) => ch + ch).join('');
  if (v.length === 6) return '#' + v;
  if (v.length === 8) return '#' + v.slice(0, 6);
  return '#ffffff';
}

async function patchUser(u: AdminUser, body: Record<string, unknown>) {
  try {
    const { data } = await adminHttp.patch(`/admin/users/${u.id}`, body);
    Object.assign(u, data.user);
    showFlash(`✓ 已更新「${u.name}」`);
  } catch (e) {
    showFlash('更新失败：' + errMsg(e));
  }
}

function setColor(u: AdminUser, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  // 选中的颜色与站点默认色相同 → 视为「跟随默认」存 null
  patchUser(u, { name_color: toHex6(v) === toHex6(siteForm.default_name_color) ? null : v });
}

function hasPerm(u: AdminUser, key: string): boolean {
  return u.permissions ? u.permissions.includes(key) : true; // null = 默认全开
}

function setPerm(u: AdminUser, key: string, e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  const current = u.permissions ? [...u.permissions] : ['post'];
  const next = on ? Array.from(new Set([...current, key])) : current.filter((p) => p !== key);
  patchUser(u, { permissions: next });
}

function toggleStatus(u: AdminUser) {
  patchUser(u, { status: u.status === 'active' ? 'disabled' : 'active' });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const editOpen = ref(false);
const editTarget = ref<AdminUser | null>(null);
const editForm = reactive({ name: '', email: '', password: '' });
const editMsg = ref('');

function openEdit(u: AdminUser) {
  editTarget.value = u;
  editForm.name = u.name;
  editForm.email = u.email ?? '';
  editForm.password = '';
  editMsg.value = '';
  editOpen.value = true;
}

async function saveEdit() {
  const u = editTarget.value;
  if (!u) return;
  if (!editForm.name.trim()) { editMsg.value = '昵称不能为空'; return; }
  if (editForm.email && !EMAIL_RE.test(editForm.email)) { editMsg.value = '邮箱格式不正确'; return; }
  if (editForm.password && editForm.password.length < 6) { editMsg.value = '新密码至少 6 位'; return; }
  const body: Record<string, unknown> = {};
  if (editForm.name.trim() !== u.name) body.name = editForm.name.trim();
  if (editForm.email !== (u.email ?? '')) body.email = editForm.email;
  if (editForm.password) body.password = editForm.password;
  if (!Object.keys(body).length) { editOpen.value = false; return; }
  try {
    const { data } = await adminHttp.patch(`/admin/users/${u.id}`, body);
    Object.assign(u, data.user);
    editOpen.value = false;
    showFlash(`✓ 已更新「${u.name}」`);
  } catch (e) {
    editMsg.value = errMsg(e);
  }
}

async function removeUser(u: AdminUser) {
  const what = `${u.name}（${u.email ?? '无邮箱'}）`;
  if (!confirm(`确定删除用户「${what}」？\n删除后该用户的所有信息将被清除，其文章将一并删除，且不可恢复。`)) return;
  try {
    await adminHttp.delete(`/admin/users/${u.id}`);
    users.value = users.value.filter((x) => x.id !== u.id);
    showFlash(`已删除「${what}」`);
  } catch (e) {
    showFlash('删除失败：' + errMsg(e));
  }
}

/* ---- 文章管理 ---- */
interface AdminArticle {
  id: number;
  title: string;
  status: 'draft' | 'published';
  pinned: number;
  author_name: string;
  author_name_color: string | null;
  updated_at: string;
}

const articles = ref<AdminArticle[]>([]);
const articleTotal = ref(0);
const articleQuery = ref('');
let articleSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadArticles() {
  try {
    const { data } = await adminHttp.get('/admin/articles', { params: { q: articleQuery.value || undefined } });
    articles.value = data.items;
    articleTotal.value = data.total;
  } catch (e) {
    showFlash(errMsg(e));
  }
}

function searchArticles() {
  clearTimeout(articleSearchTimer);
  articleSearchTimer = setTimeout(loadArticles, 300);
}

async function togglePin(a: AdminArticle) {
  try {
    const { data } = await adminHttp.patch(`/admin/articles/${a.id}`, { pinned: a.pinned ? 0 : 1 });
    a.pinned = data.pinned;
  } catch (e) {
    showFlash(errMsg(e));
  }
}

async function deleteArticle(a: AdminArticle) {
  if (!confirm(`确定删除「${a.title}」？此操作不可恢复。`)) return;
  try {
    await adminHttp.delete(`/admin/articles/${a.id}`);
    await loadArticles();
    showFlash('✓ 已删除');
  } catch (e) {
    showFlash('删除失败：' + errMsg(e));
  }
}

function fmtDate(s: string): string {
  return s ? new Date(s).toLocaleDateString('zh-CN') : '—';
}

onMounted(async () => {
  // 无论有无令牌都先校验一次会话：过期令牌不会闪现后台内容
  await admin.check();
  booting.value = false;
  if (!admin.authed) return;
  await bootstrap();
  await loadUsers();
  await loadArticles();
});
</script>

<style scoped>
/* 独立后台风格：白蓝配色 —— 冷白面板 + 湛蓝强调，与前台星空深蓝呼应但更轻盈 */
.admin {
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
  min-height: 100vh;
  background: var(--bg);
  color: var(--text-1);
  font-size: 14px;
}

.grad {
  background: linear-gradient(115deg, #2563eb 10%, #38bdf8 90%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* 校验登录状态中 */
.boot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-size: 13.5px;
  color: var(--text-3);
}

/* 登录门：内容列 + 底部页脚，整体撑满视口 */
.gate-col {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 登录门 */
.gate {
  flex: 1 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
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

.gate-card form {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.gate-card button {
  padding: 12px 0;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, #3574f2, var(--blue));
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 8px 18px -8px rgba(37, 99, 235, 0.55);
  transition: background 0.15s, transform 0.1s;
}

.gate-card button:hover {
  background: linear-gradient(180deg, #2c69e6, var(--blue-deep));
}

.gate-card button:active {
  transform: translateY(1px);
}

.gate-err {
  color: var(--red);
  font-size: 13px;
  margin: 14px 0 0;
}

.gate-hint {
  color: var(--text-3);
  font-size: 12.5px;
  margin: 16px 0 0;
}

/* 主体布局 */
.shell {
  display: flex;
  min-height: 100vh;
}

/* 右侧内容列：内容撑开 + 页脚贴底 */
.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.side {
  width: 212px;
  flex: none;
  padding: 28px 16px 22px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 26px;
  position: sticky;
  top: 0;
  height: 100vh;
  box-sizing: border-box;
}

.side-brand {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
  line-height: 1.5;
  padding: 0 8px;
}

.side-brand span {
  font-size: 17px;
}

.side-brand::after {
  content: '';
  display: block;
  width: 28px;
  height: 3px;
  margin-top: 10px;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--blue), #38bdf8);
}

.side nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.side nav button {
  text-align: left;
  padding: 10px 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.side nav button:hover {
  background: #f2f6fd;
  color: var(--text-1);
}

.side nav button.on {
  background: var(--blue-soft);
  color: var(--blue);
  font-weight: 600;
}

.side-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.main {
  flex: 1;
  padding: 36px 46px 64px;
  max-width: 1020px;
  box-sizing: border-box;
}

/* 卡片 */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px 28px 26px;
  margin-bottom: 18px;
  box-shadow: 0 1px 2px rgba(23, 43, 99, 0.04);
}

.card h2,
.pane > .card .list-head h2 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.card h2::before {
  content: '';
  width: 4px;
  height: 15px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--blue), #5ea0ff);
  flex: none;
}

.card h2.mt {
  margin-top: 26px;
}

.card h2 small {
  color: var(--text-3);
  font-weight: 400;
  font-size: 12.5px;
}

.card .hint {
  margin-top: -6px;
}

/* 表单行 */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.row:last-child {
  margin-bottom: 0;
}

.row > span {
  width: 100px;
  flex: none;
  color: var(--text-3);
  font-size: 13px;
}

.row input[type='text'],
.row input:not([type]),
.row input[type='password'],
.row input[type='email'] {
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

.row input::placeholder,
.ta::placeholder,
.search::placeholder {
  color: #a9b4c6;
}

.row input:focus,
.ta:focus,
.search:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--ring);
  background: #fff;
}

.row.check {
  gap: 8px;
}

.row.check span {
  width: auto;
  color: var(--text-2);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 26px;
}

.body-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.body-row > span {
  width: 100px;
  flex: none;
  color: var(--text-3);
  font-size: 13px;
  padding-top: 10px;
}

.ta {
  flex: 1;
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

.mono {
  font-family: ui-monospace, Consolas, monospace;
}

.hint {
  color: var(--text-3);
  font-size: 12.5px;
  margin: 6px 0 14px;
}

.hint.ok {
  color: var(--green);
}

.hint.status {
  margin-top: -8px;
}

.hint code {
  color: var(--blue);
  background: var(--blue-soft);
  border-radius: 5px;
  padding: 1px 6px;
}

.ops {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 22px;
}

.ops.inline {
  margin-top: 6px;
}

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

.primary:hover {
  background: linear-gradient(180deg, #2c69e6, var(--blue-deep));
}

.primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.ghost {
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.ghost:hover {
  color: var(--blue);
  border-color: #a9c4f7;
  background: #f7faff;
}

.ghost.sm {
  padding: 4px 11px;
  font-size: 12.5px;
  border-radius: 8px;
}

.ghost.danger {
  color: var(--red);
  border-color: rgba(211, 56, 74, 0.35);
}

.ghost.danger:hover {
  color: var(--red);
  border-color: var(--red);
  background: var(--red-soft);
}

.flash {
  color: var(--green);
  font-size: 13px;
}

/* 邮件模板卡片 */
.tpl {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px 14px;
  margin-bottom: 14px;
  background: #fcfdff;
}

.tpl:last-child {
  margin-bottom: 0;
}

.tpl-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.tpl-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
}

.tpl-desc {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}

.ph-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.ph-label {
  font-size: 12px;
  color: var(--text-3);
}

.ph-chip {
  padding: 2px 10px;
  border: 1px solid #c4d5f5;
  border-radius: 999px;
  background: var(--blue-soft);
  color: var(--blue);
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.ph-chip:hover {
  background: #dfeaff;
  border-color: #9db9f7;
}

/* Logo */
.logo-box {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 14px 16px;
  background: #f8fafd;
  border: 1px solid var(--border);
  border-radius: 12px;
}

.logo-preview {
  width: 46px;
  height: 46px;
  object-fit: contain;
  border-radius: 9px;
  background: #fff;
  border: 1px solid var(--border);
  padding: 3px;
}

.logo-empty {
  color: var(--text-3);
  font-size: 13px;
}

.logo-ops {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.file-btn {
  padding: 8px 14px;
  border: 1px dashed #b3c4e2;
  border-radius: 9px;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  background: #fff;
  transition: color 0.15s, border-color 0.15s;
}

.file-btn:hover {
  color: var(--blue);
  border-color: var(--blue);
}

.send-row {
  max-width: 440px;
}

.send-row input {
  background: #fff;
}

/* 列表 */
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.default-color {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: -4px 0 14px;
}

.default-color input[type='color'] {
  width: 34px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}

.list-head h2 {
  margin-bottom: 0 !important;
}

.search {
  width: 240px;
  padding: 8px 12px;
  background: #fbfcfe;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-1);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

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
}
.row-ops {
  white-space: nowrap;
  display: flex;
  gap: 6px;
  align-items: center;
}

.tbl tbody tr:last-child td {
  border-bottom: 0;
}

.tbl tbody tr {
  transition: background 0.12s;
}

.tbl tbody tr:hover {
  background: #f7faff;
}

.tbl a {
  color: var(--text-1);
  text-decoration: none;
  transition: color 0.15s;
}

.tbl a:hover {
  color: var(--blue);
}

.title-cell {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mini-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border);
}

.u-name {
  font-weight: 600;
  font-size: 13.5px;
}

.dim {
  color: var(--text-3);
  font-size: 12.5px;
}

.color-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-cell input[type='color'] {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}

.perm {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
}

.pill {
  padding: 3px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: #fff;
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.12s;
}

.pill.pinned {
  color: var(--blue);
  border-color: rgba(37, 99, 235, 0.45);
  background: var(--blue-soft);
}

.pill.published {
  color: var(--green);
  border-color: rgba(21, 128, 61, 0.35);
  background: var(--green-soft);
  cursor: default;
}

.pill.draft {
  color: var(--text-3);
  background: #f6f8fc;
  cursor: default;
}

.pill.active {
  color: var(--green);
  border-color: rgba(21, 128, 61, 0.35);
  background: var(--green-soft);
}

.pill.disabled {
  color: var(--red);
  border-color: rgba(211, 56, 74, 0.4);
  background: var(--red-soft);
}

/* 弹层 */
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
  width: min(380px, calc(100vw - 40px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 26px;
  box-shadow: 0 24px 60px -24px rgba(23, 43, 99, 0.4);
}

.modal h3 {
  margin: 0 0 16px;
  font-size: 15px;
  color: var(--text-1);
}

.modal input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  background: #fbfcfe;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-1);
  font-size: 13.5px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.modal input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--ring);
}

.modal-ops {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 720px) {
  .side {
    width: 64px;
    padding: 18px 8px;
  }
  .side-brand {
    display: none;
  }
  .side nav button {
    padding: 10px 0;
    text-align: center;
    font-size: 12px;
  }
  .main {
    padding: 22px 16px 60px;
  }
  .grid {
    grid-template-columns: 1fr;
  }
  .card {
    padding: 18px 16px 20px;
  }
  .row > span,
  .body-row > span {
    width: 84px;
  }
}
</style>
