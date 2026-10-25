（本项目使用 GLM 5.3, DeepSeek-V4 等模型构建）
# 微光博客 · ShimmerBlog

一个「在深空里写字」的个人博客：纯黑星空背景 + 蓝色毛玻璃前景（白字、无渐变），卡片沿时间轴错落排布，顶栏是常驻的胶囊形浮层。

前后端分离，自带后台控制台（文章、用户、站点配置全都能在页面里改）。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Node.js 24 · Express 5 · MySQL 8（mysql2）· JWT · bcryptjs · multer · nodemailer |
| 前端 | Vue 3.5 · TypeScript · Vite · Pinia · Vue Router · axios · marked + DOMPurify |
| 视觉 | 纯 CSS（自定义属性色板 + backdrop-filter 毛玻璃）+ Canvas 星空 |

## 目录结构

```
ShimmerBlog/
├── server/                 # Express API（默认 3010）
│   ├── src/
│   │   ├── index.js        # 启动 + 未捕获异常落盘 crash.log
│   │   ├── app.js          # 路由挂载 / 上传静态 / 前端 SPA 托管 / 统一错误处理
│   │   ├── config.js       # .env 读取
│   │   ├── db.js           # 连接池 + initDatabase()（建库建表 + 管理密码种子）
│   │   ├── uploads.js      # multer（头像 / 文章配图）
│   │   ├── routes/         # auth / articles / admin / site / health
│   │   ├── middleware/     # authRequired / adminRequired
│   │   ├── services/       # mailer（验证码/欢迎/测试邮件）· settings（站点配置 + 邮件模板注册表）
│   │   └── scripts/        # smoke-*.mjs 冒烟脚本、seed-demo.mjs 演示数据
│   └── uploads/            # 运行期上传文件（不提交）
├── web/                    # Vue SPA（dev 5180）
│   └── src/
│       ├── components/     # StarField / TopBar / SiteFooter / TimelineList / ArticleCard / ArticleEditor
│       ├── views/          # Home / Article / About / Login / AuthCallback / Console
│       ├── stores/         # auth（登录态）· site（站点配置）
│       ├── styles/tokens.css  # 9 色板 + 玻璃变量
│       └── api/http.ts     # axios 实例（自动带 Bearer）
├── .github/workflows/      # deploy.yml：推 main 自动构建部署
├── style.txt               # 配色来源
└── logo.png
```

## 快速开始

前置：Node.js ≥ 20、MySQL 8 已启动。

```bash
# 1) 后端依赖与配置
cd server && npm install
cp .env.example .env        # 按需修改；注意下列「坑」

# 2) 前端依赖
cd ../web && npm install

# 3) 启动后端（首次启动会自动建库建表 + 创建管理员）
cd ../server && npm start

# 4) 启动前端
cd ../web && npm run dev
```

打开 http://127.0.0.1:5180/ 。后台登录密码初始为 server/.env 的 `ADMIN_PASSWORD`（开发默认 `shimmer-admin`；首次启动自动以它种子到数据库，之后以数据库为准），登录后台后请在「站点设置 → 修改密码」中立即更换。

### `.env` 两个坑

1. **密码含 `#`、`$` 等字符必须用单引号包住**，否则 dotenv 会把 `#` 之后当注释截断：
   `DB_PASSWORD='p@ss#word$1'`
2. `JWT_SECRET` 务必改成足够长的随机串。

``.env` 关键项见 `server/.env.example`：`PORT`、`JWT_SECRET`、`DB_*`、`ADMIN_PASSWORD`（管理后台密码，首次启动建库时写入哈希；不设管理员邮箱，无管理员用户）、`GITHUB_CLIENT_ID/SECRET`（可留空，后台填）、`SMTP_*`（可留空）。

## 站点配置（可在后台改，不必改 .env）

登录管理员 → 控制台 → **站点配置**：

| 键 | 作用 |
| --- | --- |
| `site_title` / `site_subtitle` | 顶栏标题、首页副标题与浏览器标题 |
| `site_description` | 站点描述（关于页/SEO 用） |
| `register_open` | 关闭后 `/api/auth/register` 返回 403，登录页隐藏注册 tab |
| `github_client_id` / `github_client_secret` | 填好即启用 GitHub 登录；留空/清空即关闭 |
| `google_client_id` / `google_client_secret` | 填好即启用 Google 登录；留空/清空即关闭 |
| `oauth_proxy_url` | 可选。服务器侧访问 GitHub/Google API 走的 HTTP(S) 代理（如 `http://127.0.0.1:7890`），供国内服务器使用第三方登录；留空直连 |
| `web_origin` | 第三方登录回调后跳回的前端地址（生产环境改成你的域名） |

- 后台存的值优先于 `.env`；密钥字段读接口只返回掩码（`__KEEP__` 表示保持原值，`__CLEAR__` 表示清空）。
- **关于页副标题**：后台「站点」页可自定义关于页标题下方的副标题（`about_subtitle`）；留空时使用内置默认「一个会发光的角落」。
- **站点 Logo / 用户默认头像**：后台「站点」页上传（`POST/DELETE /api/admin/logo`、`POST/DELETE /api/admin/default-avatar`）。默认头像对所有无头像用户生效（文章卡/文章页/顶栏/控制台/空间页统一回退到 `GET /api/site` 的 `defaultAvatarUrl`）；未设置时使用内置 `web/src/assets/default-avatar.svg`。
- **第三方登录（后台「第三方登录」页）**：GitHub / Google 各填一对 Client ID / Secret 即启用（登录页自动出现对应按钮），清空即关闭。后台会直接展示当前环境的回调地址。
  - GitHub：GitHub → Settings → Developer settings → OAuth Apps，Authorization callback URL 填 `https://你的域名/api/auth/github/callback`（本地联调填 `http://127.0.0.1:3010/api/auth/github/callback`）。
  - Google：Google Cloud 控制台 → API 和服务 → 凭据，创建 OAuth 客户端（Web 应用），已获授权的重定向 URI 填 `https://你的域名/api/auth/google/callback`（本地联调填 `http://127.0.0.1:3010/api/auth/google/callback`）。注意 Google 对未验证应用默认只允许「测试用户」登录。
  - 回调后按第三方 id 找用户 → 否则按已验证邮箱并档 → 否则建新号（视为已验证邮箱），随后带 token 跳回 `web_origin/auth/callback`。
  - **国内服务器**：直连不了 GitHub/Google API 时，在后台「第三方登录」页填「出站代理」（或环境变量 `OAUTH_PROXY_URL`），令牌换取与用户信息请求自动走代理；访客浏览器仍需能自行打开 GitHub / Google 授权页。
- **邮件（验证码 / 欢迎 / 测试）**：配置 SMTP 后验证码发到邮箱；未配置时后端把验证码打到服务端控制台，并在 `/api/auth/send-code` 响应里带 `devCode`（前端会显示「开发模式验证码」）。生产环境请务必配置 SMTP。
- **注册需邮箱验证**：注册表单须先点「发送验证码」（`POST /api/auth/send-code` 带 `purpose=register`，邮箱已被占用时直接 409），再带 6 位验证码提交；后端校验通过后建号并直接标记 `email_verified=1`，不再存在未验证账号。测试脚本统一用 `server/scripts/_test-lib.mjs` 的 `registerUser()` 完成「发码→取码→注册」。
- **邮件模板全自定义（后台「邮件」页）**：验证码、注册欢迎、后台测试三类邮件的主题与正文均可在后台自定义并持久化，置空即回退内置默认；正文支持占位符 `{site}`（站点名）/ `{code}`（验证码）/ `{name}`（用户昵称），点击占位符 chip 插入光标处。新用户注册（含验证码首登自动注册、GitHub/Google 首次授权）后自动发送欢迎邮件（SMTP 未配置时静默跳过，不影响注册流程）。
- **发件人格式**：必须包含邮箱地址，推荐 `名称 <you@domain.com>`；只填名称会被自动包装成 `"名称" <SMTP 账号>`（否则 nodemailer 拿不到地址，信封 Return-Path 为空、无 From 头，外域邮箱会拒收或进垃圾桶，且退信也发不回来）。

## API 概览

| 方法 & 路径 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查（含数据库连通性） |
| `GET /api/site` | 公开站点信息（标题/副标题/是否开放注册/GitHub 与 Google 是否可用/关于页副标题 aboutSubtitle） |
| `POST /api/auth/register` | 邮箱 + 密码 + **邮箱验证码**注册（验证码校验通过即视为邮箱已验证） |
| `POST /api/auth/login` | 密码登录（15 分钟 10 次限流） |
| `POST /api/auth/send-code` | 发送 6 位邮箱验证码（10 分钟有效、一次性；`purpose`：`login` / `register` / `reset`——`register` 要求邮箱未被占用，`reset` 仅向已注册邮箱发送） |
| `POST /api/auth/login/code` | 验证码登录（邮箱不存在则自动注册） |
| `POST /api/auth/reset-password` | 忘记密码：邮箱验证码重置密码（每小时 10 次限流） |
| `GET /api/auth/github` · `/api/auth/github/callback` | GitHub OAuth（未配置返回 501） |
| `GET /api/auth/google` · `/api/auth/google/callback` | Google OAuth（OIDC，未配置返回 501） |
| `GET /api/auth/me` · `PUT /api/auth/profile` · `POST /api/auth/avatar` | 当前用户 / 改名 / 换头像 |
| `GET /api/articles` | 公开文章列表（分页，置顶优先，按发布时间倒序） |
| `GET /api/articles/:id` | 文章详情（草稿仅作者或管理员可见） |
| `GET /api/articles/mine` | 我的文章（含草稿） |
| `POST /api/articles` · `PUT /api/articles/:id` · `DELETE /api/articles/:id` | 发布 / 编辑 / 删除（作者或管理员） |
| `POST /api/articles/:id/pin` | 置顶 / 取消置顶（管理员） |
| `POST /api/articles/upload-image` | 正文插图上传 |
| `GET /api/admin/users` · `PATCH /api/admin/users/:id` · `DELETE /api/admin/users/:id` | 用户列表 / 禁用启用・权限・名字颜色・改名・改绑邮箱・重置密码 / 删除用户（彻底删除：该用户所有信息清除，文章经外键级联删除，原邮箱可重新注册） |
| `GET /api/admin/settings` · `PUT /api/admin/settings` | 站点配置读写（含邮件模板与默认值元数据，管理员） |

## 界面实现要点

- **星空**（`web/src/components/StarField.vue`）：`<canvas>` 全屏绘制，星点半径 0.4–1.9、速度 0.15–1.0、基础透明度 0.25–1.0、闪烁频率均随机；每帧 `y -= speed * dt/16.7` 向上漂浮，飘出顶部后从底部重生；数量按视口面积自适应（`max(120, w*h/2400)`，1444×828 视口约 500 颗）。纯黑底 + 纯星点，无光晕。
- **毛玻璃 / 透明卡**（`web/src/styles/tokens.css`）：`.glass { background: rgb(61 120 169 / 50%); backdrop-filter: blur(18px) saturate(140%); border: 1px solid rgb(20 138 195 / 45%) }`——顶栏浮层用更实的 `rgb(61 103 125 / 64%)`，关于页区块等仍用玻璃蓝；**文章卡片不用玻璃**：半透明蓝底 `rgb(52 128 191 / 28%)`（比玻璃面的 52% 透明度高，星空可透出）、无 backdrop-filter，细描边 `rgb(140 198 226 / 22%)` + 圆角，hover 提亮到 `rgb(61 140 205 / 42%)` 与边框提亮；输入框提示文本 `::placeholder` 全局设 `rgba(233 244 250 / 60%)`（默认浏览器灰在深底上太暗）；正文与标题统一纯白 `#fff`，全站不使用渐变（按钮/选中态/徽标为半透明白 `rgb(255 255 255 / 15%)`，叠在深底上成淡白胶囊）。色板仍取自 `style.txt`（`#03045e → #caf0f8` 共 9 色）。
- **透明色要按「叠黑后的最终效果」调**：rgba 叠在纯黑上亮度 = 颜色 × alpha——`rgb(61 120 169 / 50%)` 实际渲染为 `rgb(31,60,85)`；卡片 hover `rgb(61 140 205 / 52%)` → `rgb(32,73,107)`（更亮、不位移）；顶栏胶囊 `rgb(61 103 125 / 64%)` → `rgb(39,66,80)`；输入框 `rgb(180 218 238 / 16%)` 叠在面板上 → `rgb(52,98,121)`。实心填充已改半透明白 `--fill: rgb(255 255 255 / 15%)` / `--fill-hover: rgb(255 255 255 / 25%)`；强调色（边框/细线/标签/聚焦环）从同一色相提亮为 `rgb(140,198,226)`。顶栏收缩成胶囊后 `margin-top: 14px`，与视口顶部留空。
- **「登录」按钮**刻意不用工具栏那套玻璃蓝或 `--fill`，改用 `var(--accent)` 淡蓝实心底 + 深色字（对比度 9.03:1），在胶囊里一眼可辨；无阴影、hover 只换底色不位移。
- **胶囊顶栏**（`TopBar.vue`）：常驻胶囊形浮层，不再有「撑满顶部 → 收缩」的展开态——宽度恒为 `min(760px, 100vw - 32px)`、圆角 `999px`、内边距 `8px 18px`、`margin-top: 14px` 与视口顶部留出距离、背景固定 `--glass-bg-strong`；因此不需要滚动监听，滚动时外观也不变化。
- **时间轴**（`TimelineList.vue`）：卡片横向偏移以文章 id 为种子伪随机生成，刷新后位置不变；用 `getBoundingClientRect` 实测每张卡片位置后，在覆盖层 SVG 里用 Catmull-Rom → 三次贝塞尔（张力 1/4，转折圆滑）连接「上一张底部中心 → 下一张顶部中心」，无端点圆点；连线本身近乎透明（opacity 0.18、固定不变、无呼吸动画），每条线上叠一条白色长脉冲（`#ffffff`、opacity 0.38，亮段约线长 45%，间隔段 > 线长保证单光效）以恒定 160px/s 自下而上匀速巡游，走完后停约 1.2s 再重新出现（时长 = 线长/速度，逐条实测 `getTotalLength()`，节奏约 6–10s 贴近旧闪烁感）；`ResizeObserver` + 字体加载后重算；窄于 720px 时归零偏移保证可读。
- **关于页**：普通文档流自上而下排布（4 个玻璃区块 + 配色色板）。

## 验证

```bash
cd server
node scripts/smoke-auth.mjs       # 19 项：注册（含邮箱验证码校验）/登录/验证码/OAuth 占位/头像/改名
node scripts/smoke-articles.mjs   # 24 项：草稿可见性/权限/分页/置顶/图片上传/测试用户自清理
node scripts/smoke-admin.mjs      # 61 项：用户管理/扩展操作/删除用户/站点配置/密钥掩码/第三方登录与出站代理配置/注册开关/邮件模板元数据
node scripts/e2e-mail-tpl.mjs     # 20 项：邮件模板全自定义（元数据/持久化/渲染/置空回退默认+还原原值，测试用户自清理）
cd ../web && npm run build        # vue-tsc 类型检查 + 生产构建
```

冒烟脚本会创建 `@shimmer.dev` / `@test.local` 测试账号与少量文章，跑完请自行清理（或用管理员在控制台删除）。

## 部署（GitHub Actions 自动部署）

推送到 `main` 即在 Actions 里构建并部署到 `192` 的 `/www/wwwroot/ShimmerBlog`（宝塔面板服务器），也可在 Actions 页面手动触发（`.github/workflows/deploy.yml`）。

一次部署做四件事（部署后服务器上的 `web/dist` 由 Node 直接托管，单端口 3010 同时提供 API 与前端）：`web` 上 `npm ci && npm run build` → `rsync` 后端源码与 `web/dist` 到服务器（`.env`、`node_modules`、`server/uploads`、日志既不覆盖也不删除）→ 服务器 `npm ci --omit=dev` 并重启宝塔 Node 项目 → `curl /api/health` 健康检查（失败即红并打印最近日志）。

### 1. 仓库 Secrets

| Secret | 内容 |
| --- | --- |
| `SSH_HOST` | 服务器地址 |
| `SSH_PORT` | SSH 端口 |
| `SSH_USER` | 部署用户（需可写 `/www/wwwroot` 并能重启服务） |
| `SSH_PRIVATE_KEY` | 该用户 SSH 私钥全文 |

本地已登录 `gh` 时可直接写入：`gh secret set SSH_PRIVATE_KEY --repo <owner>/<repo> < ~/.ssh/<私钥>`。私钥只放 Secrets，绝不入库。

### 2. 服务器一次性准备（宝塔）

1. **数据库**：MySQL 建库 `shimmerblog`（`utf8mb4`），建一个仅授权该库的账号。
2. **`server/.env`**（放服务器上，不入库）：`PORT=3010`、`JWT_SECRET` 用随机长串、`DB_*` 指向上面的库、`ADMIN_PASSWORD` 首次启动写入管理员哈希、SMTP 与生产域名按实际填。
3. **宝塔「网站 → Node 项目 → 添加」**：项目名 `ShimmerBlog`（须与 workflow 里 `NODE_PROJECT` 一致）、项目目录 `/www/wwwroot/ShimmerBlog/server`、启动命令 `npm run start`、端口 `3010`。宝塔会生成重启脚本 `/www/server/nodejs/vhost/scripts/ShimmerBlog.sh` 与 pid 文件，workflow 依赖它们重启；找不到脚本时退化为 `nohup npm run start`。
4. **站点**：宝塔「Node 项目」会自动生成一条 `proxy_pass http://127.0.0.1:3010` 的整站反代站点——直接给它绑定域名、申请 SSL 即可。**不需要**另建静态站点，也**不需要** Nginx 做 `/api`、`/uploads` 的部分路径反代：前端构建产物由 Node 自己托管（`server/src/app.js` 用 `express.static` 提供 `web/dist` 并做 SPA history 回退，路径默认 `../web/dist`，可用环境变量 `WEB_DIST` 覆盖；`/assets` 带 hash 长缓存，入口 HTML 不缓存）。
5. 首次部署前建好目录：`mkdir -p /www/wwwroot/ShimmerBlog/server /www/wwwroot/ShimmerBlog/web/dist`，属主 `www:www`。

### 3. 部署后自检

`curl https://<域名>/api/health` 返回 `{"ok":true,"db":true}`；后台「站点配置 → 前端地址（`web_origin`）」填生产域名。

## 开发注意

- 前端 dev server 绑定 `127.0.0.1:5180`（不是 `localhost`，避免 IPv6/IPv4 解析差异），并通过 Vite 代理把 `/api`、`/uploads` 转发到 `127.0.0.1:3010`。
- 生产部署见上方「部署」一节（GitHub Actions 自动 rsync + 重启宝塔 Node 项目）。手工部署等价于：`cd web && npm run build` → `rsync` 到服务器 → `server` 目录 `npm ci --omit=dev` → 重启 Node。**前端由 Node 托管**（`web/dist` 存在即自动生效，开发时没有 dist 也不影响），因此生产只暴露一个 3010 端口；`web_origin` 改生产域名。
- 上传文件在 `server/uploads/`（头像 `avatars/`、配图 `images/`），已加入 `.gitignore`，备份时别漏。
