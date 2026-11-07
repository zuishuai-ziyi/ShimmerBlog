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
          <CaptchaDialog v-model:open="gateCaptchaOpen" :action="doLoginWithCaptcha" inline />
          </div>
      </div>
      <SiteFooter tone="light" />
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
          <button :class="{ on: tab === 'review' }" @click="tab = 'review'">审核</button>
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
              <h2>行为验证码</h2>
              <p class="hint">
                启用后，登录、注册、发送邮件验证码、发布文章、上传图片、修改资料与后台登录均需先完成验证。
                支持 GoCaptcha 点选（自建 go-captcha-service）、天爱滑块（自建 tianai-captcha）与 Google reCAPTCHA v2 勾选框（官方国内镜像 recaptcha.net，大陆可达）。
              </p>
              <label class="row check"><input type="checkbox" v-model="captchaEnabledBool" /><span>启用行为验证码</span></label>
              <label class="row">
                <span>验证服务</span>
                <select v-model="captchaForm.captcha_provider">
                  <option value="gocaptcha">GoCaptcha 点选（自建服务）</option>
                  <option value="tianai">天爱滑块（自建 tianai-captcha）</option>
                  <option value="recaptcha">Google reCAPTCHA v2 勾选框</option>
                </select>
              </label>
              <template v-if="captchaForm.captcha_provider === 'gocaptcha'">
                <label class="row"><span>服务地址</span><input v-model.trim="captchaForm.captcha_api" placeholder="https://go-captcha.xiaoziyi.com" /></label>
                <label class="row"><span>实例 ID</span><input v-model.trim="captchaForm.captcha_id" placeholder="click-default-ch" /></label>
                <label class="row"><span>内部校验地址</span><input v-model.trim="captchaForm.captcha_verify_api" placeholder="可选，留空用服务地址；同机可填 http://127.0.0.1:9700" /></label>
              </template>
              <template v-else-if="captchaForm.captcha_provider === 'tianai'">
                <label class="row"><span>服务地址</span><input v-model.trim="captchaForm.captcha_api" placeholder="https://tianai-captcha.xiaoziyi.com" /></label>
                <label class="row"><span>内部校验地址</span><input v-model.trim="captchaForm.captcha_verify_api" placeholder="可选，留空用服务地址；同机可填 http://127.0.0.1:21001" /></label>
                <p class="hint">前端取题与后端二次验证（/check2）都用服务地址；SDK 静态资源已随站点发布在 /tac/ 下，无需额外配置。</p>
              </template>
              <template v-else-if="captchaForm.captcha_provider === 'recaptcha'">
                <label class="row"><span>Site Key</span><input v-model.trim="captchaForm.recaptcha_site_key" placeholder="6Le…" /></label>
                <label class="row">
                  <span>Secret Key</span>
                  <input v-model.trim="captchaForm.recaptcha_secret_key" type="password" :placeholder="rcSecretSet ? '已配置，留空保持不变' : '6Le…'" />
                </label>
                <label class="row"><span>校验地址</span><input v-model.trim="captchaForm.recaptcha_verify_api" placeholder="可选，留空用 https://recaptcha.net/recaptcha/api/siteverify" /></label>
              </template>
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

            <div class="card">
              <h2>第三方头像</h2>
              <p class="hint">第三方登录头像转存本站时的下载限制：重定向跟随上限 0–12 跳、总超时 1–300 秒；注册/登录时后台异步下载，不阻塞用户操作。</p>
              <label class="row"><span>重定向跳数上限</span><input v-model.trim="oauthForm.avatar_redirect_hops" type="number" min="0" max="12" /></label>
              <label class="row"><span>下载超时（秒）</span><input v-model.trim="oauthForm.avatar_timeout_seconds" type="number" min="1" max="300" /></label>
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
          <!-- ============ 审核 ============ -->
          <section v-if="tab === 'review'" class="pane">
            <!-- 审核流程 -->
            <div class="card">
              <h2>审核流程</h2>
              <p class="hint">
                启用后新发布的文章按阶段顺序送审。当前顺序：<b>{{ reviewStageLabel }}</b>；至少启用一个阶段才能保存。
                只启用一个阶段时该阶段直接终审（通过即发布、拒绝即驳回），动作下拉不可修改。
              </p>
              <label class="row check"><input type="checkbox" v-model="reviewFlowEnabled" /><span>启用审核流程</span></label>

              <div class="rv-stage">
                <div class="rv-stage-head">
                  <label class="row check"><input type="checkbox" v-model="aiEnabled" /><span>AI 审核</span></label>
                  <div class="rv-order">
                    <span class="dim">顺序</span>
                    <label class="rv-opt"><input type="radio" name="rv-ai-order" :checked="aiOrder === 1" :disabled="!aiEnabled" @change="setAiOrder(1)" />第 1 步</label>
                    <label class="rv-opt"><input type="radio" name="rv-ai-order" :checked="aiOrder === 2" :disabled="!aiEnabled" @change="setAiOrder(2)" />第 2 步</label>
                  </div>
                </div>
                <label class="row"><span>通过后</span>
                  <select :value="aiOnApprove" :disabled="!aiEnabled || onlyOneStage" @change="setAiApprove">
                    <option value="final_approve">直接通过（终审）</option>
                    <option value="next" :disabled="aiIsLast">交给下一阶段</option>
                  </select>
                </label>
                <label class="row"><span>拒绝后</span>
                  <select :value="aiOnReject" :disabled="!aiEnabled || onlyOneStage" @change="setAiReject">
                    <option value="final_reject">直接拒绝（终审）</option>
                    <option value="next" :disabled="aiIsLast">交给下一阶段</option>
                  </select>
                </label>
              </div>

              <div class="rv-stage">
                <div class="rv-stage-head">
                  <label class="row check"><input type="checkbox" v-model="humanEnabled" /><span>人工审核</span></label>
                  <div class="rv-order">
                    <span class="dim">顺序</span>
                    <label class="rv-opt"><input type="radio" name="rv-human-order" :checked="humanOrder === 1" :disabled="!humanEnabled" @change="setHumanOrder(1)" />第 1 步</label>
                    <label class="rv-opt"><input type="radio" name="rv-human-order" :checked="humanOrder === 2" :disabled="!humanEnabled" @change="setHumanOrder(2)" />第 2 步</label>
                  </div>
                </div>
                <label class="row"><span>通过后</span>
                  <select :value="humanOnApprove" :disabled="!humanEnabled || onlyOneStage" @change="setHumanApprove">
                    <option value="final_approve">直接通过（终审）</option>
                    <option value="next" :disabled="humanIsLast">交给下一阶段</option>
                  </select>
                </label>
                <label class="row"><span>拒绝后</span>
                  <select :value="humanOnReject" :disabled="!humanEnabled || onlyOneStage" @change="setHumanReject">
                    <option value="final_reject">直接拒绝（终审）</option>
                    <option value="next" :disabled="humanIsLast">交给下一阶段</option>
                  </select>
                </label>
              </div>

              <div class="ops inline">
                <button class="primary" :disabled="saving || !reviewStages.length" @click="saveReviewFlow">{{ saving ? '保存中…' : '保存审核流程' }}</button>
                <span v-if="flash && flashScope === 'flow'" class="flash">{{ flash }}</span>
              </div>
            </div>

            <!-- AI 审核配置 -->
            <div class="card">
              <h2>AI 审核配置</h2>
              <p class="hint">AI 审核使用兼容 OpenAI 协议的接口；API Key 留空表示保持原值不变，勾选「清除」则保存后清空已配置的 Key。</p>
              <div class="grid">
                <label class="row"><span>接口地址</span><input v-model.trim="reviewAiCfg.base_url" placeholder="https://api.openai.com/v1" autocomplete="off" /></label>
                <label class="row"><span>API Key</span><input v-model="reviewAiCfg.api_key" type="password" :placeholder="aiKeySet ? '已配置，留空保持不变' : '未配置'" autocomplete="new-password" /></label>
                <label class="row"><span>模型</span><input v-model.trim="reviewAiCfg.model" placeholder="gpt-4o-mini" autocomplete="off" /></label>
                <label class="row"><span>思考强度</span>
                  <select :value="reviewAiCfg.thinking" @change="setAiThinking">
                    <option value="off">不使用</option>
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                  </select>
                </label>
                <label class="row"><span>温度</span>
                  <input :value="aiTemperature" type="number" min="0" max="2" step="0.1" @input="onAiTempInput($event)" />
                </label>
                <label class="row"><span>超时（秒）</span>
                  <input :value="aiTimeout" type="number" min="5" max="300" step="1" @input="onAiTimeoutInput($event)" />
                </label>
              </div>
              <label class="row check"><input type="checkbox" v-model="aiClearKey" /><span>清除已配置的 API Key（保存后生效）</span></label>

              <div class="rv-strict">
                <span class="dim">审核严格度</span>
                <label class="rv-opt"><input type="radio" name="rv-strict" :checked="reviewAiCfg.strictness === 'loose'" @change="setStrictness('loose')" />宽松</label>
                <label class="rv-opt"><input type="radio" name="rv-strict" :checked="reviewAiCfg.strictness === 'standard'" @change="setStrictness('standard')" />标准</label>
                <label class="rv-opt"><input type="radio" name="rv-strict" :checked="reviewAiCfg.strictness === 'strict'" @change="setStrictness('strict')" />严格</label>
                <label class="rv-opt"><input type="radio" name="rv-strict" :checked="reviewAiCfg.strictness === 'custom'" @change="setStrictness('custom')" />自定义</label>
              </div>
              <div v-if="reviewAiCfg.strictness === 'custom'" class="rv-custom">
                <p class="hint">自定义审核标准：以下内容将作为审核标准的全文发送给 AI。</p>
                <textarea v-model="reviewAiCfg.custom_prompt" class="ta mono" rows="6" spellcheck="false" placeholder="例如：拒绝人身攻击、泄露他人隐私、虚假广告等内容……" />
              </div>

              <div class="ops inline">
                <button class="primary" :disabled="saving" @click="saveReviewAi">{{ saving ? '保存中…' : '保存 AI 配置' }}</button>
                <button class="ghost" :disabled="aiTestBusy" @click="openAiTest">{{ aiTestBusy ? '测试中…' : '测试 AI 审核' }}</button>
                <span v-if="flash && flashScope === 'ai'" class="flash">{{ flash }}</span>
              </div>
            </div>

            <!-- 审核员管理 -->
            <div class="card">
              <h2>审核员管理 <small>{{ reviewers.length }} 人</small></h2>
              <div class="rv-new">
                <input v-model.trim="reviewerForm.username" placeholder="用户名" autocomplete="off" />
                <input v-model.trim="reviewerForm.display_name" placeholder="显示名（可选）" autocomplete="off" />
                <input v-model.trim="reviewerForm.email" type="email" placeholder="邮箱（可选，用于接收审核通知）" autocomplete="off" />
                <input v-model="reviewerForm.password" type="password" placeholder="初始密码（8-72 位）" autocomplete="new-password" />
                <button class="primary" :disabled="reviewerBusy" @click="createReviewer">{{ reviewerBusy ? '创建中…' : '新增审核员' }}</button>
              </div>
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr><th>ID</th><th>用户名</th><th>显示名</th><th>邮箱</th><th>状态</th><th>创建时间</th><th>最后登录</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in reviewers" :key="r.id">
                      <td class="dim">{{ r.id }}</td>
                      <td>{{ r.username }}</td>
                      <td>{{ r.display_name || '—' }}</td>
                      <td>
                        <span v-if="r.email">{{ r.email }}</span>
                        <span v-else class="dim">未设置</span>
                      </td>
                      <td>
                        <button class="pill" :class="r.status" @click="toggleReviewer(r)">
                          {{ r.status === 'active' ? '正常' : '已禁用' }}
                        </button>
                      </td>
                      <td class="dim">{{ fmtDate(r.created_at) }}</td>
                      <td class="dim">{{ r.last_login_at ? fmtDateTime(r.last_login_at) : '从未登录' }}</td>
                      <td class="row-ops">
                        <button class="ghost sm" @click="openSetEmail(r)">设置邮箱</button>
                        <button class="ghost sm" @click="openResetPwd(r)">重置密码</button>
                        <button class="ghost sm danger" @click="removeReviewer(r)">删除</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!reviewers.length" class="hint">还没有审核员。</p>
              <div class="ops inline">
                <button class="ghost sm" @click="loadReviewers">刷新列表</button>
                <span v-if="flash && flashScope === 'reviewer'" class="flash">{{ flash }}</span>
              </div>
            </div>

            <!-- 审核记录 -->
            <div class="card">
              <div class="list-head">
                <h2>审核记录 <small>{{ recordTotal }} 条</small></h2>
                <button class="ghost sm" :disabled="recordsBusy" @click="loadRecords()">{{ recordsBusy ? '加载中…' : '刷新' }}</button>
              </div>
              <div class="rv-filters">
                <label class="rv-filter">
                  <span class="dim">状态</span>
                  <select :value="recordStatus" @change="setRecordStatus">
                    <option value="all">全部</option>
                    <option value="pending">待审核</option>
                    <option value="approved">已通过</option>
                    <option value="rejected">已拒绝</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </label>
                <label class="rv-filter">
                  <span class="dim">阶段</span>
                  <select :value="recordStage" @change="setRecordStage">
                    <option value="all">全部</option>
                    <option value="ai">AI 审核</option>
                    <option value="human">人工审核</option>
                  </select>
                </label>
              </div>
              <div class="tbl-wrap">
                <table class="tbl">
                  <thead>
                    <tr><th>ID</th><th>标题</th><th>作者</th><th>文章状态</th><th>记录状态</th><th>阶段</th><th>AI 结果</th><th>审核员</th><th>创建时间</th><th>决定时间</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in records" :key="r.id">
                      <td class="dim">{{ r.id }}</td>
                      <td class="title-cell"><a :href="`/article/${r.article_id}`" target="_blank">{{ r.title }}</a></td>
                      <td>{{ r.author_name }}</td>
                      <td><span class="pill" :class="r.article_status">{{ r.article_status }}</span></td>
                      <td><span class="pill" :class="r.status">{{ recordStatusText(r.status) }}</span></td>
                      <td>{{ r.stage ? stageText(r.stage) : '—' }}</td>
                      <td class="rv-ai">
                        <template v-if="r.ai_error">
                          <span class="rv-err">出错：{{ r.ai_error }}</span>
                        </template>
                        <template v-else-if="r.ai_verdict">
                          <div>{{ r.ai_verdict }}</div>
                          <div v-if="r.ai_reason" class="dim">{{ r.ai_reason }}</div>
                        </template>
                        <span v-else class="dim">—</span>
                      </td>
                      <td class="dim">{{ r.reviewer_id ?? '—' }}</td>
                      <td class="dim">{{ fmtDateTime(r.created_at) }}</td>
                      <td class="dim">{{ r.decided_at ? fmtDateTime(r.decided_at) : '—' }}</td>
                      <td class="row-ops">
                        <button v-if="r.status === 'pending' && r.stage === 'ai' && r.ai_error" class="ghost sm" @click="retryAi(r)">重试 AI</button>
                        <button v-if="r.status === 'pending'" class="ghost sm" @click="forceApprove(r)">强制通过</button>
                        <button v-if="r.status === 'pending'" class="ghost sm danger" @click="openForceReject(r)">强制拒绝</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!records.length" class="hint">没有匹配的审核记录。</p>
              <div class="rv-pager">
                <button class="ghost sm" :disabled="recordPage <= 1" @click="gotoRecordPage(recordPage - 1)">上一页</button>
                <span class="dim">第 {{ recordPage }} / {{ recordTotalPages }} 页</span>
                <button class="ghost sm" :disabled="recordPage >= recordTotalPages" @click="gotoRecordPage(recordPage + 1)">下一页</button>
                <span v-if="flash && flashScope === 'record'" class="flash">{{ flash }}</span>
              </div>
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

    <!-- 测试 AI 审核弹层 -->
    <div v-if="aiTestOpen" class="modal-mask" @click.self="aiTestOpen = false">
      <div class="modal wide">
        <h3>测试 AI 审核</h3>
        <input v-model.trim="aiTestTitle" placeholder="标题（可选）" />
        <textarea v-model="aiTestContent" class="ta mono" rows="6" placeholder="粘贴要送审的正文内容…" />
        <div class="modal-ops">
          <button class="ghost" @click="aiTestOpen = false">关闭</button>
          <button class="primary" :disabled="aiTestBusy" @click="runAiTest">{{ aiTestBusy ? '测试中…' : '开始测试' }}</button>
        </div>
        <p v-if="aiTestResult" class="hint rv-pre" :class="{ ok: aiTestOk }">{{ aiTestResult }}</p>
      </div>
    </div>

    <!-- 重置审核员密码弹层 -->
    <div v-if="rwdOpen" class="modal-mask" @click.self="rwdOpen = false">
      <div class="modal">
        <h3>重置审核员密码</h3>
        <p class="hint">{{ rwdTarget?.username }}</p>
        <input v-model="rwdValue" type="password" placeholder="新密码（8-72 位）" autocomplete="new-password" />
        <div class="modal-ops">
          <button class="ghost" @click="rwdOpen = false">取消</button>
          <button class="primary" @click="submitResetPwd">保存</button>
        </div>
        <p v-if="rwdMsg" class="hint">{{ rwdMsg }}</p>
      </div>
    </div>

    <!-- 设置审核员邮箱弹层 -->
    <div v-if="emOpen" class="modal-mask" @click.self="emOpen = false">
      <div class="modal">
        <h3>设置审核员邮箱</h3>
        <p class="hint">{{ emTarget?.username }}</p>
        <input v-model.trim="emValue" type="email" placeholder="邮箱（留空表示不接收通知邮件）" autocomplete="off" />
        <div class="modal-ops">
          <button class="ghost" @click="emOpen = false">取消</button>
          <button class="primary" @click="submitSetEmail">保存</button>
        </div>
        <p v-if="emMsg" class="hint">{{ emMsg }}</p>
      </div>
    </div>

    <!-- 强制拒绝弹层 -->
    <div v-if="rejectOpen" class="modal-mask" @click.self="rejectOpen = false">
      <div class="modal">
        <h3>强制拒绝</h3>
        <p class="hint">{{ rejectTarget?.title }}</p>
        <textarea v-model="rejectNote" class="ta mono" rows="4" placeholder="拒绝理由（可选）" />
        <div class="modal-ops">
          <button class="ghost" @click="rejectOpen = false">取消</button>
          <button class="primary" @click="submitForceReject">确认拒绝</button>
        </div>
        <p v-if="rejectMsg" class="hint">{{ rejectMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import adminHttp, { ADMIN_UNAUTHORIZED_EVENT, errMsg } from '../api/adminHttp';
import { isCaptchaFailure } from '../api/http';
import { useAdminStore } from '../stores/admin';
import { useSiteStore } from '../stores/site';
import { useSilentPolling } from '../stores/polling';
import SiteFooter from '../components/SiteFooter.vue';
import CaptchaDialog from '../components/CaptchaDialog.vue';
import defaultAvatar from '../assets/default-avatar.svg';

const admin = useAdminStore();
// 已有本地令牌时先进入「验证中」态，避免过期令牌先渲染后台内容再跳回登录门
const booting = ref(!!admin.token && !admin.checked);

type Tab = 'site' | 'mail' | 'oauth' | 'users' | 'articles' | 'review';
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
    // 登录成功：清掉「登录状态已过期」等登录门提示
    gateError.value = '';
    await bootstrap();
    await Promise.all([loadUsers(), loadArticles()]);
  } catch (e) {
    if (isCaptchaFailure(e)) throw e; // 验证码未通过：抛给弹窗处理（弹窗内提示+自动换题），吞掉会被弹窗误认为成功而关闭
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

/* ---- 会话过期提示 ---- */
/**
 * 会话过期（401）时在登录门给出可见提示，避免用户被静默退回登录门却不知原因。
 *
 * api/adminHttp.ts 的响应拦截器会广播 ADMIN_UNAUTHORIZED_EVENT：
 * - detail.hadToken === true  → 原本有令牌但已失效（会话过期）→ 提示重新登录
 * - detail.hadToken === false → 本来就没登录（登录门下的正常 401）→ 不提示
 *
 * 文案只写在视图层：store 只负责复位登录态，不携带 UI 文案。
 */
function onAdminUnauthorized(e: Event) {
  const hadToken = (e as CustomEvent<{ hadToken?: boolean }>).detail?.hadToken === true;
  if (!hadToken) return;
  gateError.value = '登录状态已过期，请重新登录';
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
/** flash 展示位置（site/mail/... 用空串；审核区按区块区分，避免多个提示同时出现） */
const flashScope = ref('');
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function showFlash(msg: string) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ''), 2600);
}

const siteForm = reactive({ site_title: '', site_subtitle: '', site_description: '', about_subtitle: '', about_html: '', default_name_color: '' });
const oauthForm = reactive({ github_client_id: '', github_client_secret: '', google_client_id: '', google_client_secret: '', oauth_proxy_url: '', avatar_redirect_hops: '12', avatar_timeout_seconds: '60' });
const githubEnabled = ref(false);
const googleEnabled = ref(false);
const ghSecretSet = ref(false);
const ggSecretSet = ref(false);
// 行为验证码（GoCaptcha 点选 / reCAPTCHA v2 勾选框，后台可切换）
const captchaForm = reactive({
  captcha_provider: 'gocaptcha',
  captcha_api: '',
  captcha_verify_api: '',
  captcha_id: 'click-default-ch',
  recaptcha_site_key: '',
  recaptcha_secret_key: '',
  recaptcha_verify_api: '',
});
const captchaEnabledBool = ref(false);
const captchaOn = ref(false);
const rcSecretSet = ref(false);
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
    avatar_redirect_hops: data.settings.avatar_redirect_hops ?? '12',
    avatar_timeout_seconds: data.settings.avatar_timeout_seconds ?? '60',
  });
  githubEnabled.value = !!data.githubEnabled;
  googleEnabled.value = !!data.googleEnabled;
  ghSecretSet.value = data.settings.github_client_secret === '__KEEP__';
  ggSecretSet.value = data.settings.google_client_secret === '__KEEP__';
  if (data.settings.web_origin) callbackBase.value = data.settings.web_origin;
  Object.assign(captchaForm, {
    captcha_provider: data.settings.captcha_provider === 'recaptcha' ? 'recaptcha' : data.settings.captcha_provider === 'tianai' ? 'tianai' : 'gocaptcha',
    captcha_api: data.settings.captcha_api ?? '',
    captcha_verify_api: data.settings.captcha_verify_api ?? '',
    captcha_id: data.settings.captcha_id ?? 'click-default-ch',
    recaptcha_site_key: data.settings.recaptcha_site_key ?? '',
    recaptcha_secret_key: '',
    recaptcha_verify_api: data.settings.recaptcha_verify_api ?? '',
  });
  rcSecretSet.value = data.settings.recaptcha_secret_key === '__KEEP__';
  captchaEnabledBool.value = data.settings.captcha_enabled === '1';
  captchaOn.value = !!data.captchaEnabled;
  logoUrl.value = data.settings.site_logo_url ?? '';
  defaultAvatarUrl.value = data.settings.default_avatar_url ?? '';
  applyReviewSettings((data.settings ?? {}) as Record<string, unknown>);
  settingsReady.value = true;
}

async function saveSettings(keys: string[]): Promise<boolean> {
  if (!settingsReady.value) {
    showFlash('配置尚未加载完成，请刷新页面后再保存');
    return false;
  }
  saving.value = true;
  try {
    const body: Record<string, unknown> = {};
    for (const k of keys) {
      body[k] =
        (siteForm as Record<string, unknown>)[k] ??
        (mailForm as Record<string, unknown>)[k] ??
        (oauthForm as Record<string, unknown>)[k] ??
        (reviewSettingsForm as Record<string, unknown>)[k];
    }
    // 只有本次提交涉及 smtp_secure 时才带上，避免保存审核设置时误改邮件开关
    if (keys.includes('smtp_secure')) body.smtp_secure = smtpSecureBool.value;
    const { data } = await adminHttp.put('/admin/settings', body);
    smtpEnabled.value = !!data.smtpEnabled;
    githubEnabled.value = !!data.githubEnabled;
    googleEnabled.value = !!data.googleEnabled;
    if (logoUrl.value && keys.includes('site_title')) await refreshSite();
    showFlash('✓ 已保存');
    return true;
  } catch (e) {
    showFlash('保存失败：' + errMsg(e));
    return false;
  } finally {
    saving.value = false;
  }
}

async function saveMailSettings() {
  const keys = mailTemplates.value.flatMap((t) => [t.subjectKey, t.bodyKey]);
  await saveSettings([...keys, 'smtp_host', 'smtp_port', 'smtp_from', 'smtp_user', 'smtp_pass', 'smtp_secure']);
}

async function saveOauthSettings() {
  await saveSettings(['github_client_id', 'github_client_secret', 'google_client_id', 'google_client_secret', 'oauth_proxy_url', 'avatar_redirect_hops', 'avatar_timeout_seconds']);
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
      captcha_provider: captchaForm.captcha_provider,
      captcha_api: captchaForm.captcha_api,
      captcha_verify_api: captchaForm.captcha_verify_api,
      captcha_id: captchaForm.captcha_id,
      recaptcha_site_key: captchaForm.recaptcha_site_key,
      // 密码框留空 = 不修改（后端 __KEEP__ 语义），避免误清已配置的 Secret
      recaptcha_secret_key: captchaForm.recaptcha_secret_key || (rcSecretSet.value ? '__KEEP__' : ''),
      recaptcha_verify_api: captchaForm.recaptcha_verify_api,
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

/** 服务端最近一次返回的用户名称颜色（用于轮询时识别行内未保存的改色） */
const userColorSnapshot = new Map<number, string | null>();

/**
 * 加载用户列表。
 * silent=true 用于轮询：失败不弹提示，且保留用户行内尚未保存的改色（不重建编辑状态）。
 */
async function loadUsers(silent = false) {
  try {
    const { data } = await adminHttp.get('/admin/users', { params: { q: userQuery.value || undefined } });
    const items = (data.items || []) as AdminUser[];
    if (silent) {
      // 本地值与服务端快照不一致 → 视为用户尚未保存的行内改色，保留本地值
      const prev = new Map(users.value.map((u) => [u.id, u]));
      users.value = items.map((u) => {
        const old = prev.get(u.id);
        const localChanged = !!old && old.name_color !== userColorSnapshot.get(u.id);
        return localChanged ? { ...u, name_color: old.name_color } : u;
      });
    } else {
      users.value = items;
    }
    for (const u of items) userColorSnapshot.set(u.id, u.name_color);
    userTotal.value = data.total;
  } catch (e) {
    if (!silent) showFlash(errMsg(e));
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

/** 加载文章列表；silent=true 用于轮询（失败不弹提示） */
async function loadArticles(silent = false) {
  try {
    const { data } = await adminHttp.get('/admin/articles', { params: { q: articleQuery.value || undefined } });
    articles.value = data.items;
    articleTotal.value = data.total;
  } catch (e) {
    if (!silent) showFlash(errMsg(e));
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

/* ==================== 审核：流程 / AI 配置 / 审核员 / 审核记录 ==================== */
type ReviewStage = 'ai' | 'human';
type ReviewApproveAction = 'final_approve' | 'next';
type ReviewRejectAction = 'final_reject' | 'next';
type ReviewThinking = 'off' | 'low' | 'medium' | 'high';
type ReviewStrictness = 'loose' | 'standard' | 'strict' | 'custom';
type RecordStatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled';
type StageFilter = 'all' | 'ai' | 'human';

interface ReviewFlowCfg {
  enabled: boolean;
  stages: ReviewStage[];
  ai: { on_approve: ReviewApproveAction; on_reject: ReviewRejectAction };
  human: { on_approve: ReviewApproveAction; on_reject: ReviewRejectAction };
}

interface ReviewAiCfg {
  base_url: string;
  api_key: string;
  model: string;
  thinking: ReviewThinking;
  temperature: number;
  timeout_seconds: number;
  strictness: ReviewStrictness;
  custom_prompt: string;
}

interface Reviewer {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  status: 'active' | 'disabled';
  created_at: string;
  last_login_at: string | null;
}

interface ReviewRecord {
  id: number;
  article_id: number;
  article_status: string;
  author_name: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  stages: string[];
  stage: 'ai' | 'human' | null;
  ai_verdict: string | null;
  ai_reason: string | null;
  ai_error: string | null;
  reviewer_id: number | null;
  reject_note: string | null;
  created_at: string;
  decided_at: string | null;
}

/* ---- 通用小工具 ---- */
function selValue(ev: Event): string {
  const t = ev.target as HTMLSelectElement | null;
  return t ? t.value : '';
}
function toNum(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clampNum(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
function boolOf(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return fallback;
}
function parseJsonObj(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
/** 后端部分接口用 { message } 返回错误（如 ai-test 的 400） */
function revErr(e: unknown): string {
  if (e && typeof e === 'object') {
    const data = (e as { response?: { data?: { message?: string; error?: string } } }).response?.data;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
  }
  return errMsg(e);
}
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function stageText(s: string | null | undefined): string {
  if (s === 'ai') return 'AI 审核';
  if (s === 'human') return '人工审核';
  return '—';
}
function recordStatusText(s: string | null | undefined): string {
  if (s === 'pending') return '待审核';
  if (s === 'approved') return '已通过';
  if (s === 'rejected') return '已拒绝';
  if (s === 'cancelled') return '已取消';
  return s || '—';
}

/* ---- 审核流程 ---- */
const reviewSettingsForm = reactive({ review_flow: '', review_ai: '' });
const reviewFlowEnabled = ref(false);
const aiEnabled = ref(false);
const humanEnabled = ref(false);
const aiOrder = ref(1);
const humanOrder = ref(2);
const aiOnApprove = ref<ReviewApproveAction>('final_approve');
const aiOnReject = ref<ReviewRejectAction>('final_reject');
const humanOnApprove = ref<ReviewApproveAction>('final_approve');
const humanOnReject = ref<ReviewRejectAction>('final_reject');

const reviewStages = computed<ReviewStage[]>(() => {
  const list: ReviewStage[] = [];
  if (aiEnabled.value) list.push('ai');
  if (humanEnabled.value) list.push('human');
  const pos = (s: ReviewStage) => (s === 'ai' ? aiOrder.value : humanOrder.value);
  list.sort((a, b) => pos(a) - pos(b));
  return list;
});
const onlyOneStage = computed(() => reviewStages.value.length <= 1);
const aiIsLast = computed(() => {
  const s = reviewStages.value;
  return s.length > 0 && s[s.length - 1] === 'ai';
});
const humanIsLast = computed(() => {
  const s = reviewStages.value;
  return s.length > 0 && s[s.length - 1] === 'human';
});
const reviewStageLabel = computed(() => {
  const s = reviewStages.value;
  return s.length ? s.map(stageText).join(' → ') : '未启用任何阶段';
});

/** 只有一个阶段时固定终审；最后阶段的 next 归一化为终审（后端亦会归一化） */
function normalizeStageActions() {
  if (onlyOneStage.value) {
    if (aiEnabled.value) {
      aiOnApprove.value = 'final_approve';
      aiOnReject.value = 'final_reject';
    }
    if (humanEnabled.value) {
      humanOnApprove.value = 'final_approve';
      humanOnReject.value = 'final_reject';
    }
    return;
  }
  if (aiIsLast.value) {
    if (aiOnApprove.value === 'next') aiOnApprove.value = 'final_approve';
    if (aiOnReject.value === 'next') aiOnReject.value = 'final_reject';
  }
  if (humanIsLast.value) {
    if (humanOnApprove.value === 'next') humanOnApprove.value = 'final_approve';
    if (humanOnReject.value === 'next') humanOnReject.value = 'final_reject';
  }
}

function setAiOrder(n: number) {
  aiOrder.value = n;
  if (humanEnabled.value && humanOrder.value === n) humanOrder.value = n === 1 ? 2 : 1;
  normalizeStageActions();
}
function setHumanOrder(n: number) {
  humanOrder.value = n;
  if (aiEnabled.value && aiOrder.value === n) aiOrder.value = n === 1 ? 2 : 1;
  normalizeStageActions();
}
function setAiApprove(ev: Event) {
  aiOnApprove.value = selValue(ev) === 'next' ? 'next' : 'final_approve';
}
function setAiReject(ev: Event) {
  aiOnReject.value = selValue(ev) === 'next' ? 'next' : 'final_reject';
}
function setHumanApprove(ev: Event) {
  humanOnApprove.value = selValue(ev) === 'next' ? 'next' : 'final_approve';
}
function setHumanReject(ev: Event) {
  humanOnReject.value = selValue(ev) === 'next' ? 'next' : 'final_reject';
}

function buildReviewFlow(): ReviewFlowCfg {
  normalizeStageActions();
  return {
    enabled: reviewFlowEnabled.value,
    stages: reviewStages.value,
    ai: { on_approve: aiOnApprove.value, on_reject: aiOnReject.value },
    human: { on_approve: humanOnApprove.value, on_reject: humanOnReject.value },
  };
}

async function saveReviewFlow() {
  flashScope.value = 'flow';
  if (!reviewStages.value.length) {
    showFlash('至少启用一个审核阶段');
    return;
  }
  reviewSettingsForm.review_flow = JSON.stringify(buildReviewFlow());
  const ok = await saveSettings(['review_flow']);
  if (!ok) return;
  await loadReviewSettings();
  showFlash('✓ 审核流程已保存');
}

/* ---- AI 审核配置 ---- */
const reviewAiCfg = reactive<ReviewAiCfg>({
  base_url: '',
  api_key: '',
  model: '',
  thinking: 'off',
  temperature: 0.7,
  timeout_seconds: 60,
  strictness: 'standard',
  custom_prompt: '',
});
const aiKeySet = ref(false);
const aiClearKey = ref(false);
const aiTemperature = ref('0.7');
const aiTimeout = ref('60');

function setAiThinking(ev: Event) {
  const v = selValue(ev);
  reviewAiCfg.thinking = v === 'low' || v === 'medium' || v === 'high' ? v : 'off';
}
function setStrictness(v: string) {
  reviewAiCfg.strictness = v === 'loose' || v === 'strict' || v === 'custom' ? v : 'standard';
}
function onAiTempInput(ev: Event) {
  aiTemperature.value = (ev.target as HTMLInputElement).value;
}
function onAiTimeoutInput(ev: Event) {
  aiTimeout.value = (ev.target as HTMLInputElement).value;
}

function buildReviewAi(): ReviewAiCfg {
  const typed = reviewAiCfg.api_key.trim();
  return {
    base_url: reviewAiCfg.base_url.trim(),
    // '' = 保持原值；__CLEAR__ = 清空；其他 = 新值
    api_key: aiClearKey.value ? '__CLEAR__' : typed,
    model: reviewAiCfg.model.trim(),
    thinking: reviewAiCfg.thinking,
    temperature: clampNum(toNum(aiTemperature.value, 0.7), 0, 2, 0.7),
    timeout_seconds: Math.round(clampNum(toNum(aiTimeout.value, 60), 5, 300, 60)),
    strictness: reviewAiCfg.strictness,
    custom_prompt: reviewAiCfg.custom_prompt,
  };
}

async function saveReviewAi() {
  flashScope.value = 'ai';
  reviewSettingsForm.review_ai = JSON.stringify(buildReviewAi());
  const ok = await saveSettings(['review_ai']);
  if (!ok) return;
  await loadReviewSettings();
  showFlash('✓ AI 审核配置已保存');
}

/* ---- AI 审核测试 ---- */
const aiTestOpen = ref(false);
const aiTestTitle = ref('');
const aiTestContent = ref('');
const aiTestBusy = ref(false);
const aiTestResult = ref('');
const aiTestOk = ref(false);

function openAiTest() {
  aiTestTitle.value = '';
  aiTestContent.value = '';
  aiTestResult.value = '';
  aiTestOk.value = false;
  aiTestOpen.value = true;
}

async function runAiTest() {
  if (!aiTestContent.value.trim()) {
    aiTestOk.value = false;
    aiTestResult.value = '请先输入要测试的正文内容。';
    return;
  }
  aiTestBusy.value = true;
  aiTestResult.value = '';
  try {
    const { data } = await adminHttp.post('/admin/review/ai-test', {
      title: aiTestTitle.value || undefined,
      content: aiTestContent.value,
    });
    aiTestOk.value = true;
    aiTestResult.value = [
      `结论：${data.verdict ?? '—'}`,
      `理由：${data.reason ?? '—'}`,
      `置信度：${data.confidence ?? '—'}`,
      `模型：${data.model ?? '—'}`,
    ].join('\n');
  } catch (e) {
    aiTestOk.value = false;
    aiTestResult.value = '测试失败：' + revErr(e);
  } finally {
    aiTestBusy.value = false;
  }
}

/* ---- 审核员管理 ---- */
const reviewers = ref<Reviewer[]>([]);
const reviewerForm = reactive({ username: '', password: '', display_name: '', email: '' });
const reviewerBusy = ref(false);

async function loadReviewers() {
  try {
    const { data } = await adminHttp.get('/admin/reviewers');
    reviewers.value = Array.isArray(data.reviewers) ? (data.reviewers as Reviewer[]) : [];
  } catch (e) {
    flashScope.value = 'reviewer';
    showFlash('审核员列表加载失败：' + revErr(e));
  }
}

async function createReviewer() {
  flashScope.value = 'reviewer';
  const username = reviewerForm.username.trim();
  if (!username || !reviewerForm.password) {
    showFlash('用户名与初始密码不能为空');
    return;
  }
  if (username.length < 3 || username.length > 50) {
    showFlash('用户名长度需在 3-50 字之间');
    return;
  }
  if (reviewerForm.password.length < 8 || reviewerForm.password.length > 72) {
    showFlash('初始密码长度需在 8-72 位之间');
    return;
  }
  // 邮箱（可选）：宽松校验，与后端 EMAIL_RE 规则一致
  const email = reviewerForm.email.trim();
  if (email && (!email.includes('@') || !email.includes('.'))) {
    showFlash('邮箱格式不正确');
    return;
  }
  if (email.length > 255) {
    showFlash('邮箱最长 255 字');
    return;
  }
  reviewerBusy.value = true;
  try {
    await adminHttp.post('/admin/reviewers', {
      username,
      password: reviewerForm.password,
      display_name: reviewerForm.display_name.trim() || undefined,
      email: email || undefined,
    });
    reviewerForm.username = '';
    reviewerForm.password = '';
    reviewerForm.display_name = '';
    reviewerForm.email = '';
    showFlash('✓ 已新增审核员');
    await loadReviewers();
  } catch (e) {
    showFlash('新增失败：' + revErr(e));
  } finally {
    reviewerBusy.value = false;
  }
}

async function toggleReviewer(r: Reviewer) {
  const next = r.status === 'active' ? 'disabled' : 'active';
  try {
    await adminHttp.put(`/admin/reviewers/${r.id}`, { status: next });
    r.status = next;
    flashScope.value = 'reviewer';
    showFlash(next === 'active' ? '✓ 已启用该审核员' : '已禁用该审核员');
  } catch (e) {
    flashScope.value = 'reviewer';
    showFlash('操作失败：' + revErr(e));
  }
}

const rwdOpen = ref(false);
const rwdTarget = ref<Reviewer | null>(null);
const rwdValue = ref('');
const rwdMsg = ref('');

function openResetPwd(r: Reviewer) {
  rwdTarget.value = r;
  rwdValue.value = '';
  rwdMsg.value = '';
  rwdOpen.value = true;
}

async function submitResetPwd() {
  if (!rwdTarget.value) return;
  if (rwdValue.value.length < 8 || rwdValue.value.length > 72) {
    rwdMsg.value = '新密码长度需在 8-72 位之间';
    return;
  }
  try {
    await adminHttp.put(`/admin/reviewers/${rwdTarget.value.id}`, { password: rwdValue.value });
    rwdMsg.value = '已重置密码';
    flashScope.value = 'reviewer';
    showFlash('✓ 已重置密码');
    setTimeout(() => (rwdOpen.value = false), 700);
  } catch (e) {
    rwdMsg.value = '重置失败：' + revErr(e);
  }
}

const emOpen = ref(false);
const emTarget = ref<Reviewer | null>(null);
const emValue = ref('');
const emMsg = ref('');

/** 打开「设置邮箱」弹层，预填当前邮箱 */
function openSetEmail(r: Reviewer) {
  emTarget.value = r;
  emValue.value = r.email || '';
  emMsg.value = '';
  emOpen.value = true;
}

/** 保存审核员邮箱：留空即清空（后端置 NULL，该审核员不再接收通知邮件） */
async function submitSetEmail() {
  if (!emTarget.value) return;
  const em = emValue.value.trim();
  if (em && (!em.includes('@') || !em.includes('.'))) {
    emMsg.value = '邮箱格式不正确';
    return;
  }
  if (em.length > 255) {
    emMsg.value = '邮箱最长 255 字';
    return;
  }
  try {
    const { data } = await adminHttp.put(`/admin/reviewers/${emTarget.value.id}`, { email: em });
    const updated = data?.reviewer as Reviewer | undefined;
    if (updated) emTarget.value.email = updated.email ?? null;
    emMsg.value = '已保存';
    flashScope.value = 'reviewer';
    showFlash('✓ 已保存邮箱');
    setTimeout(() => (emOpen.value = false), 700);
  } catch (e) {
    emMsg.value = '保存失败：' + revErr(e);
  }
}

async function removeReviewer(r: Reviewer) {
  if (!confirm(`确定删除审核员「${r.username}」？该操作不可恢复。`)) return;
  try {
    await adminHttp.delete(`/admin/reviewers/${r.id}`);
    reviewers.value = reviewers.value.filter((x) => x.id !== r.id);
    flashScope.value = 'reviewer';
    showFlash('✓ 已删除审核员');
  } catch (e) {
    flashScope.value = 'reviewer';
    showFlash('删除失败：' + revErr(e));
  }
}

/* ---- 审核记录 ---- */
const records = ref<ReviewRecord[]>([]);
const recordTotal = ref(0);
const recordPage = ref(1);
const recordPageSize = ref(20);
const recordStatus = ref<RecordStatusFilter>('all');
const recordStage = ref<StageFilter>('all');
const recordsBusy = ref(false);
const recordTotalPages = computed(() => Math.max(1, Math.ceil(recordTotal.value / recordPageSize.value)));

async function loadRecords(silent = false) {
  if (!silent) recordsBusy.value = true;
  try {
    const { data } = await adminHttp.get('/admin/review/records', {
      params: { status: recordStatus.value, stage: recordStage.value, page: recordPage.value },
    });
    records.value = Array.isArray(data.items) ? (data.items as ReviewRecord[]) : [];
    recordTotal.value = Number(data.total ?? 0);
    if (data.pageSize) recordPageSize.value = Number(data.pageSize);
    if (data.page) recordPage.value = Number(data.page);
  } catch (e) {
    if (!silent) {
      flashScope.value = 'record';
      showFlash('审核记录加载失败：' + revErr(e));
    }
  } finally {
    if (!silent) recordsBusy.value = false;
  }
}

function setRecordStatus(ev: Event) {
  const v = selValue(ev);
  recordStatus.value =
    v === 'pending' || v === 'approved' || v === 'rejected' || v === 'cancelled' ? v : 'all';
  recordPage.value = 1;
  loadRecords();
}
function setRecordStage(ev: Event) {
  const v = selValue(ev);
  recordStage.value = v === 'ai' || v === 'human' ? v : 'all';
  recordPage.value = 1;
  loadRecords();
}
function gotoRecordPage(p: number) {
  const max = recordTotalPages.value;
  recordPage.value = clampNum(Math.round(p), 1, max, 1);
  loadRecords();
}

async function retryAi(r: ReviewRecord) {
  try {
    await adminHttp.post(`/admin/review/records/${r.id}/retry-ai`, {});
    flashScope.value = 'record';
    showFlash('✓ 已重新触发 AI 审核');
    await loadRecords();
  } catch (e) {
    flashScope.value = 'record';
    showFlash('重试失败：' + revErr(e));
  }
}

async function forceApprove(r: ReviewRecord) {
  if (!confirm(`确定强制通过「${r.title}」？`)) return;
  try {
    await adminHttp.post(`/admin/review/records/${r.id}/final`, { action: 'approve' });
    flashScope.value = 'record';
    showFlash('✓ 已强制通过');
    await loadRecords();
  } catch (e) {
    flashScope.value = 'record';
    showFlash('操作失败：' + revErr(e));
  }
}

const rejectOpen = ref(false);
const rejectTarget = ref<ReviewRecord | null>(null);
const rejectNote = ref('');
const rejectMsg = ref('');

function openForceReject(r: ReviewRecord) {
  rejectTarget.value = r;
  rejectNote.value = '';
  rejectMsg.value = '';
  rejectOpen.value = true;
}

async function submitForceReject() {
  if (!rejectTarget.value) return;
  try {
    await adminHttp.post(`/admin/review/records/${rejectTarget.value.id}/final`, {
      action: 'reject',
      note: rejectNote.value.trim() || undefined,
    });
    rejectOpen.value = false;
    flashScope.value = 'record';
    showFlash('✓ 已强制拒绝');
    await loadRecords();
  } catch (e) {
    rejectMsg.value = '操作失败：' + revErr(e);
  }
}

/* ---- 审核设置载入 ---- */
function applyReviewFlow(raw: Record<string, unknown>) {
  const rawStages = Array.isArray(raw.stages) ? raw.stages : [];
  const stages = rawStages.filter((s): s is ReviewStage => s === 'ai' || s === 'human');
  aiEnabled.value = stages.includes('ai');
  humanEnabled.value = stages.includes('human');
  const aiIdx = stages.indexOf('ai');
  const humanIdx = stages.indexOf('human');
  aiOrder.value = aiEnabled.value ? (aiIdx >= 0 ? aiIdx + 1 : 1) : 1;
  humanOrder.value = humanEnabled.value ? (humanIdx >= 0 ? humanIdx + 1 : 2) : 2;
  if (aiEnabled.value && humanEnabled.value && aiOrder.value === humanOrder.value) {
    humanOrder.value = aiOrder.value === 1 ? 2 : 1;
  }
  reviewFlowEnabled.value = boolOf(raw.enabled);
  const aiRaw = (raw.ai ?? {}) as Record<string, unknown>;
  const humanRaw = (raw.human ?? {}) as Record<string, unknown>;
  if (aiRaw.on_approve === 'final_approve' || aiRaw.on_approve === 'next') aiOnApprove.value = aiRaw.on_approve;
  if (aiRaw.on_reject === 'final_reject' || aiRaw.on_reject === 'next') aiOnReject.value = aiRaw.on_reject;
  if (humanRaw.on_approve === 'final_approve' || humanRaw.on_approve === 'next') humanOnApprove.value = humanRaw.on_approve;
  if (humanRaw.on_reject === 'final_reject' || humanRaw.on_reject === 'next') humanOnReject.value = humanRaw.on_reject;
  normalizeStageActions();
}

function applyReviewAi(raw: Record<string, unknown>) {
  reviewAiCfg.base_url = typeof raw.base_url === 'string' ? raw.base_url : '';
  const key = typeof raw.api_key === 'string' ? raw.api_key : '';
  aiKeySet.value = key === '__KEEP__';
  reviewAiCfg.api_key = '';
  reviewAiCfg.model = typeof raw.model === 'string' ? raw.model : '';
  const thinking = raw.thinking;
  reviewAiCfg.thinking = thinking === 'low' || thinking === 'medium' || thinking === 'high' ? thinking : 'off';
  reviewAiCfg.temperature = clampNum(toNum(raw.temperature, 0.7), 0, 2, 0.7);
  reviewAiCfg.timeout_seconds = Math.round(clampNum(toNum(raw.timeout_seconds, 60), 5, 300, 60));
  const strictness = raw.strictness;
  reviewAiCfg.strictness =
    strictness === 'loose' || strictness === 'strict' || strictness === 'custom' ? strictness : 'standard';
  reviewAiCfg.custom_prompt = typeof raw.custom_prompt === 'string' ? raw.custom_prompt : '';
  aiTemperature.value = String(reviewAiCfg.temperature);
  aiTimeout.value = String(reviewAiCfg.timeout_seconds);
  aiClearKey.value = false;
}

function applyReviewSettings(settings: Record<string, unknown>) {
  const flow = parseJsonObj(settings.review_flow);
  if (flow) applyReviewFlow(flow);
  const ai = parseJsonObj(settings.review_ai);
  if (ai) applyReviewAi(ai);
}

async function loadReviewSettings() {
  try {
    const { data } = await adminHttp.get('/admin/settings');
    applyReviewSettings((data.settings ?? {}) as Record<string, unknown>);
  } catch (e) {
    showFlash('审核配置重新加载失败：' + revErr(e));
  }
}

watch([aiEnabled, humanEnabled], () => normalizeStageActions());
watch(tab, (t) => {
  if (t === 'review') {
    loadReviewers();
    loadRecords();
  }
});

/* ---------------- 轮询（静默刷新，不重建表单状态） ---------------- */
/**
 * 轮询总开关：只有「已登录且会话已校验」才允许轮询。
 * 未登录时轮询会拿到 401，曾触发整页 reload（登录界面反复自动刷新），故未登录不创建定时器：
 * 登录成功后才启动，登出 / 401 失效后立即停止。
 */
const canPoll = computed(() => admin.authed && admin.checked);

// 审核记录：5s。跳过：未登录 / 非审核 tab / 页面隐藏。
// 不重跑 loadSettings / loadReviewSettings，不会覆盖未保存的审核流程与 AI 配置输入。
const recordsPolling = useSilentPolling(
  () => loadRecords(true),
  5000,
  () => canPoll.value && tab.value === 'review',
  () => canPoll.value,
);
// 用户：5s。跳过：未登录 / 非用户 tab / 搜索框有输入（避免打断筛选）/ 编辑弹窗打开中 / 页面隐藏。
const usersPolling = useSilentPolling(
  () => loadUsers(true),
  5000,
  () => canPoll.value && tab.value === 'users' && !userQuery.value.trim() && !editOpen.value,
  () => canPoll.value,
);
// 文章：5s。跳过：未登录 / 非文章 tab / 搜索框有输入 / 页面隐藏。
const articlesPolling = useSilentPolling(
  () => loadArticles(true),
  5000,
  () => canPoll.value && tab.value === 'articles' && !articleQuery.value.trim(),
  () => canPoll.value,
);

// 登录成功 → 开轮询；登出 / 401 失效 → 立即停掉定时器（未登录时不再打接口）
watch(canPoll, (ok) => {
  if (ok) {
    recordsPolling.start();
    usersPolling.start();
    articlesPolling.start();
  } else {
    recordsPolling.stop();
    usersPolling.stop();
    articlesPolling.stop();
  }
});

function fmtDate(s: string): string {
  return s ? new Date(s).toLocaleDateString('zh-CN') : '—';
}

onMounted(async () => {
  // 会话过期提示：组件自己监听（store 已清空登录态，文案留在视图层）
  window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onAdminUnauthorized);
  // 无论有无令牌都先校验一次会话：过期令牌不会闪现后台内容
  await admin.check();
  booting.value = false;
  if (!admin.authed) return;
  await bootstrap();
  await loadUsers();
  await loadArticles();
});

onUnmounted(() => {
  // 解绑，避免重复绑定与内存泄漏
  window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onAdminUnauthorized);
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
  /* 后台浅色主题：默认文字色为深色（覆盖全站暗色主题 body 的白色默认），
     未显式设色的元素全部继承深色，避免残留白字不可读 */
  color: var(--text-1);
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
.admin input,
.admin select,
.admin textarea {
  /* 后台浅色卡片：覆盖全局暗色主题给 input 的白字默认（漏网类型如 number/select 白字配近白底不可读） */
  color: var(--text-1);
}

.admin ::placeholder {
  /* 全局 ::placeholder 是暗色主题的半透明白，浅底上不可读 */
  color: #a9b4c6;
  opacity: 1;
}

.admin input[type='checkbox'] {
  /* 全局 input 规则给了 width:100% + padding，复选框被拉伸占满整行 */
  width: auto;
  padding: 0;
  flex: none;
}

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

/* ---- 审核区 ---- */
.admin input[type='radio'] {
  /* 全局 input 规则给了 width:100% + padding，单选框会被拉伸占满整行 */
  width: auto;
  padding: 0;
  flex: none;
}

.row select {
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

.row select:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--ring);
  background: #fff;
}

.row select:disabled {
  background: #f3f6fa;
  color: var(--text-3);
  cursor: not-allowed;
}

.rv-stage {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #fbfcfe;
}

.rv-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.rv-stage-head .row.check {
  margin-bottom: 0;
}

.rv-order {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.rv-opt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
}

.rv-strict {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin: 4px 0 12px;
}

.rv-custom {
  margin-top: 4px;
}

.rv-new {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.rv-new input {
  flex: 1 1 160px;
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

.rv-new input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px var(--ring);
  background: #fff;
}

.rv-filters {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.rv-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.rv-filter select {
  padding: 7px 10px;
  background: #fbfcfe;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-1);
  font-size: 13px;
  outline: none;
}

.rv-ai {
  max-width: 260px;
  font-size: 12.5px;
  line-height: 1.6;
}

.rv-err {
  color: var(--red);
}

.rv-pager {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.rv-pre {
  white-space: pre-wrap;
  margin: 12px 0 0;
}

.rv-pre.ok {
  color: var(--green);
}

.modal.wide {
  width: min(560px, calc(100vw - 40px));
}

.pill.pending {
  color: #b45309;
  border-color: rgba(217, 119, 6, 0.35);
  background: #fff7ed;
  cursor: default;
}

.pill.approved {
  color: var(--green);
  border-color: rgba(21, 128, 61, 0.35);
  background: var(--green-soft);
  cursor: default;
}

.pill.rejected {
  color: var(--red);
  border-color: rgba(211, 56, 74, 0.4);
  background: var(--red-soft);
  cursor: default;
}

.pill.cancelled {
  color: var(--text-3);
  background: #f6f8fc;
  cursor: default;
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
