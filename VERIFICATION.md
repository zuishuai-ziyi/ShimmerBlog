# 端到端验证记录（task-7）

验证时间：2026-10-23　环境：Windows 11 · Node.js 24.18.0 · MySQL 8.0.46 · Chrome（DevTools MCP 实测）

## 1. 构建与接口

| 项目 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| 类型检查 + 生产构建 | `cd web && npm run build`（`vue-tsc --noEmit && vite build`） | ✅ 0 错误 |
| 用户系统冒烟 | `node server/scripts/smoke-auth.mjs` | ✅ 13 pass / 0 fail |
| 文章系统冒烟 | `node server/scripts/smoke-articles.mjs` | ✅ 22 PASS / 0 FAIL |
| 后台管理冒烟 | `node server/scripts/smoke-admin.mjs` | ✅ 31 passed / 0 failed |
| 健康检查 | `GET /api/health`（直连 3010 与 Vite 代理 5180 各一次） | ✅ `{ok:true, db:true}` |

数据库终态：`shimmerblog` 4 表（users / articles / email_codes / settings）、1 个管理员、8 篇已发布演示文章（无草稿、无置顶）、GitHub 密钥与 SMTP 均为空（未配置状态）。

## 2. 界面规格逐条核对（浏览器实测）

| 需求 | 实测证据 | 结论 |
| --- | --- | --- |
| 纯黑背景 | `getComputedStyle(document.body).backgroundColor` = `rgb(0, 0, 0)` | ✅ |
| 配色取自 style.txt（9 色） | `--c-950 #03045e` / `--c-800 #023e8a` / `--c-700 #0077b6` / `--c-600 #0096c7` / `--c-500 #00b4d8` / `--c-400 #48cae4` / `--c-300 #90e0ef` / `--c-200 #ade8f4` / `--c-100 #caf0f8` | ✅ |
| 前景蓝色半透明毛玻璃（白字、无渐变） | 卡片 `backdrop-filter: blur(18px)`、`background: rgba(0,119,182,0.42)`、边框 `rgba(72,202,228,0.45)`；顶栏同款（文字 `rgb(255,255,255)`，全页 `background-image` 含 gradient 的元素数 = 0） | ✅ |
| 星星大小/速度/透明度随机 | `StarField.vue`：`r = 0.4 + rand*1.8`、`speed = 0.15 + rand*0.85`、`alpha = 0.25 + rand*0.75`、`twinkle = 0.5 + rand*1.6`、`phase` 随机 | ✅ |
| 星星向上移动 | canvas 采样 0.9s：亮像素 2442 → 2492，亮度质心 y 632.26 → 610.31（上移） | ✅ |
| 顶栏左侧 Logo + 标题 | `.topbar` 文本 `微光博客`，含 `<img src="/logo.png">` | ✅ |
| 顶栏右侧导航 + 用户信息 | 登录态文本 `微光博客 首页 关于 管理员`（含头像图）；未登录 `微光博客 首页 关于 登录 / 注册` | ✅ |
| 滚动收缩为胶囊并悬浮 | 顶部时：包裹层 `position: fixed`、宽 1433px、圆角 0px；滚动 600/900px 后：`top = 0` 仍可见、宽 760px、圆角 999px、`transition: width .35s` | ✅ |
| 文章卡片含标题与简介 | `.cell` 内标题 + 3 行截断简介 + 作者/日期 | ✅ |
| 点击卡片进入文章页 | 点击首卡 → `/article/4`，`h1` = 「在深空里写字」，`.prose` 渲染正常 | ✅ |
| 文章按发布时间从上到下 | 8 张卡片 `getBoundingClientRect().top` 严格递增；发布时间 2026-10-23 → 09-06 递减 | ✅ |
| 卡片横坐标不固定 | 卡片中心 x = [646, 774, 680, 800, 662, 742, 784, 672]（8 个互不相同） | ✅ |
| 卡片间淡蓝曲线连接 | 覆盖层 SVG 内 7 条贝塞尔曲线（n 张卡 → n-1 条） | ✅ |
| 关于页自上而下正常排布 | 4 个 `.block.glass`：left 均为 358、top 220/379/609/808 递增、`position: static`，另含 9 色色板块 | ✅ |
| 窄屏可用 | 视口宽 493px：首页 / 关于 / 文章详情 `scrollWidth - clientWidth = 0`（无横向溢出） | ✅ |

## 3. 业务流程（真实 UI 操作）

| 流程 | 步骤 | 结果 |
| --- | --- | --- |
| 密码登录 | 登录页填 admin 账号 → 跳首页，`localStorage.sb_token` 有值，顶栏显示「管理员」 | ✅ |
| 验证码登录 | 切「验证码登录」→ 发码（开发模式回显 163059）→ 提交 → 跳 `/console`（`redirect` 参数生效） | ✅ |
| 登录守卫 | 清除 token 访问 `/console` → 302 到 `/login?redirect=/console` | ✅ |
| 注册 | 「注册」tab → 邮箱 + 密码 → 「注册并登录」→ 跳首页并持有 token | ✅ |
| 权限隔离 | 普通用户控制台仅 `[我的文章, 个人资料]`；管理员为 `[我的文章, 用户管理, 站点配置, 个人资料]` | ✅ |
| 普通用户发布 | 新建 → 标题/简介/正文 → 发布 → 列表出现；首页首条即该文章 | ✅ |
| 后台配置生效 | 站点配置改副标题保存 → `GET /api/site` 立即返回新值（已还原） | ✅ |
| GitHub 登录开关 | 填入 client id + secret → `/api/site` 返回 `githubEnabled: true`、登录页出现 GitHub 按钮（`href="/api/auth/github"`）；清空后按钮隐藏、接口 501 | ✅ |

验证产生的临时数据（`@test.local` 账号、测试文章、占位 OAuth 密钥）已全部清理，数据库恢复为「1 管理员 + 8 篇演示文章」。

## 4. 本轮修复

- `web/src/views/LoginView.vue`：登录/注册、密码/验证码切换按钮补 `type="button"`——原先位于 `<form>` 内且默认 `submit`，点 tab 会误提交表单（实测点击「注册」tab 直接触发登录请求）。
- `web/src/views/ConsoleView.vue`：窄屏横向溢出（`.rows` 网格项 `min-width: auto` + `.row-meta` `nowrap` 撑破容器）→ 补 `min-width: 0`、`flex-wrap: wrap`、`overflow: hidden`、`text-overflow: ellipsis`，493px 视口溢出归零。

## 5. 验收后收尾（3 处小问题）

- `web/src/views/ConsoleView.vue`：删除 `togglePin()` 里的死语句 `site.loaded && null;`。
- `web/src/views/ArticleView.vue`：文章页「编辑」链接由 `/console` 改为 `/console?edit=<id>`；`ConsoleView.vue` 的 `onMounted` 读取 `route.query.edit`，自动切到「我的文章」并打开该文编辑器（实测：`/article/4` 点击编辑 → `/console?edit=4`，标题框载入「在深空里写字」、简介 36 字、正文 244 字）。
- `web/src/views/HomeView.vue`：首页大标题改为读 `site.info.title`（原先硬编码「微光博客」）；标题以「博客」结尾时仍把前缀渲染为渐变高亮（实测默认值下 DOM 为 `<span class="shimmer">微光</span>博客`，视觉与改动前一致）。

改动后 `npm run build` 仍 0 错误；运行期仅 1 个 API 进程（3010）与 1 个 Vite 进程（5180）。

## 6. 视觉调整（用户要求：前景框蓝色、文字白色、不加渐变）

- `web/src/styles/tokens.css`：`--text: #fff`、`--text-dim: rgba(255,255,255,.72)`；`--glass-bg: rgba(0,119,182,.42)`、`--glass-bg-strong: rgba(2,62,138,.72)`、`--glass-border: rgba(72,202,228,.45)`；新增 `--fill: #0077b6` / `--fill-hover: #0096c7` 供实心按钮与选中态使用。
- 移除全站渐变：`App.vue`（`.page-title`、`.btn`）、`TopBar.vue`（`.brand-name`、`.nav-link.active`、`.btn-login`）、`ArticleCard.vue`（置顶徽标）、`ArticleView.vue`（`.tag`、`.rule`）、`ConsoleView.vue`（`.tabs button.on`、`.chip.admin`）、`HomeView.vue`（`.hero-title .shimmer` 的流光动画与 `@keyframes shine` 一并删除）、`TimelineList.vue`（SVG `linearGradient` 描边改为实心 `stroke="#48cae4" stroke-opacity="0.7"`，同时删掉不再使用的 `gid`）。
- 文字统一纯白：所有 `color: var(--c-100)` → `#fff`（文章标题、控制台标题、登录标题、编辑器标题、Markdown 正文 h1-h4），`rgba(233,247,251,.9/.85)` → `rgba(255,255,255,.92/.86)`（正文与关于页）。
- 实测（1440×900）：首页 `.cell .glass` = `rgba(0,119,182,0.42)` + `blur(18px)`、卡片标题 `rgb(255,255,255)`、`.hero-title` 纯白且 `.shimmer` 无背景无动画、`svg path.curve` stroke `#48cae4`；首页 / 文章 / 关于 / 登录 / 控制台五页扫描 `background-image` 含 `gradient` 的元素均为 **0**；登录与控制台主按钮 `rgb(0,119,182)` + 白字。`npm run build` 仍 0 错误。

## 7. 视觉调整第二轮（用户要求：hover 变淡不位移、去 Logo 光效、连线动画不同步、分布更宽）

- `web/src/components/ArticleCard.vue`：`.card` 过渡只保留 `background-color / border-color / box-shadow`（0.45s），删除 `transform` 与 `will-change`；`@media` 外的 `.card:hover` 改为 `background-color: rgba(72,202,228,.2)`、`border-color: rgba(202,240,248,.42)`——悬浮时卡片颜色逐渐变淡、不再上浮位移；`.read` 也去掉 `translateX`，仅做淡入。
- `web/src/components/TopBar.vue`：`.logo` 删除 `filter: drop-shadow(0 0 6px rgba(72,202,228,.45))`，Logo 无光效（实测 `getComputedStyle(logo).filter === "none"`）。
- `web/src/components/TimelineList.vue`：
  - 连线颜色改为「每条独立节奏」：`CURVE_COLORS = ['#90e0ef','#48cae4','#00b4d8','#ade8f4','#0077b6','#caf0f8']`，用稳定伪随机 `prand(i, salt)` 为第 i 条取两个色（`--ca`/`--cb`）与 `animationDuration` 4.5–11.5s、`animationDelay` -0–12s，`@keyframes curve-tint` 在 `--ca`↔`--cb` 之间呼吸（非渐变填充，纯 stroke 颜色插值）。伪随机以序号为种子，刷新/resize 不跳色。
  - 曲线弯曲随机化：控制点加横向抖动 `j1/j2 = (prand(i,1|2)-0.5)*2*jmin(150, |x2-x1|*0.45+45)`，`dy = max(24, (y2-y1)*0.46)`。
  - 卡片横向分布更宽：`SHIFT_FRAC = [-0.95,0.62,-0.48,1,-0.72,0.3,0.85,-0.55,0.12,-1,0.46,-0.24]` 按容器可用宽度 `(wrapW - 470)/2` 取比例（窄屏 <720px 归零）；`.row` 间距 68px → **112px**（移动端 44px）。
  - `web/src/styles/tokens.css` 新增 `--timeline-w: 1280px`，`web/src/views/HomeView.vue` 的 `.timeline-zone` 改用它（hero 仍 `--content-w: 880px`）。
  - 修正测量时序：位移有 0.4s 过渡，`applyShifts()` 返回变化时用 `settle()`（`setTimeout(measure, 480)`）在过渡结束后重测，否则连线会量到中间帧、锚点全部堆在容器中心。
- 实测（1440×900）：8 张卡片中心 x = `[331,967,522,1121,424,838,1060,493]`（8 个互不相同，最大跨度 **790px**），行间距 112px；7 条曲线 `getAttribute('d')` 起点与卡片中心一一对应（wrap 相对 255/891/446/1045/348/762/984），7 条曲线 `animationDuration`、`animationDelay`、计算后 `stroke` **均 7 个互不相同**；`.card:hover` 规则仅含 background-color/border-color，无 transform；`.logo` filter `none`；420×820 窄屏卡片中心全部归 246（单列）且 `docOverflow = 0`；`npm run build`（vue-tsc + vite）0 错误。

## 8. 视觉调整第三轮（要求：增加随机性而非放大间距、纵向拉大、连线中间多次随机弯曲）

- `web/src/components/TimelineList.vue` 布局随机化：横向位置不再用固定序列循环，改为**以文章 id 为种子**的伪随机——`dir = rnd(id,7)` 决定偏左/偏右，`mag = 0.35 + |rnd(id,13)|*0.65` 决定幅度，`prand(id,19) < 0.2` 的卡片留在靠中线（`frac *= 0.25`），最后乘以可用行程 `(wrapW - 470)/2`。每篇文章位置互不相关，且刷新后不跳动。
- 纵向间距：`.row { margin-bottom }` 112px → **176px**（移动端 64px），给曲线留出弯曲空间。
- 连线改为多段蛇形：以起点卡片 id 为种子，按纵向跨度取段数 `segs = clamp(round(span/48), 3, 9)`，每段锚点 `x = lerp(x1,x2,t) + rnd(id,30+k) * amp * sin(πt)`（`amp = min(210, 110 + |x2-x1|*0.3)`，两端包络为 0 以保证首尾落在卡片中心、范围夹在 26..wrapW-26），再用 Catmull-Rom → 三次贝塞尔（`smoothPath()`，控制点 y 夹在两端之间防止上下回抽）串成平滑曲线。
- 实测（1440×900，8 篇）：卡片中心 x = `[856,1021,1026,321,799,888,727,240]`（8 个互不相同，跨度 786px，左右两侧均有分布）；行间距 176px；7 条曲线起点/终点与相邻卡片中心**逐条对齐**（误差 ≤2px）；每条曲线含 3–4 个贝塞尔段、横向折返 1–4 次（真随机拐弯）；7 条曲线的 `animationDuration|animationDelay|stroke` 组合 7 个互不相同；`docOverflow = 0`。
- 420×820 窄屏：卡片中心全部 246（单列），曲线仍为 3 段、行间距 64px、`docOverflow = 0`。`npm run build`（vue-tsc + vite）0 错误。

## 9. 首屏定位修复（要求：卡片直接出现在正确位置，不要从中间滑出）

- 原因：`.cell` 原带 `transition: transform 0.4s`，而横向偏移由 JS 在挂载后算出——首帧是 `--shift: 0`（居中），随后才过渡到目标位置。
- 修复（`web/src/components/TimelineList.vue`）：
  - `.timeline { visibility: hidden }` + `.timeline.ready { visibility: visible }`，首次测量完成前不绘制；`onMounted` 里 `measure()`（算位置）→ `await nextTick()`（DOM 应用位移）→ `measure()`（量连线）→ `ready = true`，全部发生在首帧绘制前的同一个任务内。
  - 位移过渡只在窗口 resize 时开启：`.timeline.animate .cell { transition: transform .45s }`，`onResize()` 打上 `animate` 并在 600ms 后摘掉——加载、翻页都不再有位移动画。
  - `measure()` 中若 `applyShifts()` 发现位置变了则本次直接返回（不量连线，避免连到旧坐标），随后 `settle(animate ? 520 : 140)` 重测。`onBeforeUnmount` 清理 `animateTimer`。
- 实测（Chrome，逐帧采样 200 帧）：时间轴出现的第一帧 `ready=true`、`visibility=visible`、`.cell` `transitionDuration=0s`、`transform=matrix(1,0,0,1,216,0)` 已是最终值，卡片中心 `[856,1021,1026,…]`；同帧 7 条曲线起点与卡片中心完全一致（误差 0）——无「居中 → 滑出」过程。
- 窗口 resize 仍平滑：拖动时 `animate=true / duration 0.45s / transform 216→211.5→…`，1.2s 后 `animate=false / duration 0s`，`transform` 落到最终值 176，曲线与卡片中心误差 0，`docOverflow = 0`。`npm run build` 0 错误。

## 10. 视觉调整第四轮（要求：工具栏收缩后离顶部有距离；前景色用「淡」的最终效果，注意透明叠纯黑导致的偏差）

- 问题定位：毛玻璃颜色是 `rgba(0,119,182,.42)` 这类「透明色」，叠在纯黑上时最终亮度 = 颜色 × alpha，实际渲染成 `rgb(0,50,76)`（近乎黑的藏蓝），与「淡蓝」的设计意图相反。
- `web/src/styles/tokens.css`：改用「淡色 + 中等透明度」，并把这些颜色的合成值写进注释——
  `--glass-bg: rgba(122,200,240,.52)`（叠黑合成 ≈ `rgb(63,104,125)`）、`--glass-bg-strong: rgba(122,200,240,.64)`（≈ `rgb(78,128,154)`，用于顶栏浮层）、`--glass-border: rgba(170,228,250,.45)`。
- `web/src/components/ArticleCard.vue`：`@media` 外 `.card:hover` 的 `background-color` 由 `rgba(72,202,228,.2)`（叠黑后反而更黑）改为 `rgba(166,224,250,.56)`（叠黑 ≈ `rgb(93,125,140)`），比默认态 `rgb(63,104,125)` 更淡；边框 `rgba(210,242,252,.5)`。仍只有颜色过渡，无位移。
- `web/src/App.vue`：输入框由 `rgba(3,4,94,.35)`（在浅色面板里会挖出一块近黑）改为 `rgba(173,232,244,.16)`——叠在面板上 ≈ `rgb(81,124,144)`，比面板亮一档，字段边界靠 `--glass-border` 区分。
- `web/src/components/TopBar.vue`：新增 `topGap = shrunk ? '14px' : '0px'` 与 `topBorder = shrunk ? '1px' : '0px'`，绑定到 `margin-top` / `border-top-width`（替换原来的 `border-top: none`），并把两者加入 0.35s 过渡——收缩成胶囊后与视口顶部留 14px，且补上完整的一圈边框。
- 实测（1440×900 Chrome）：
  - 顶部未滚动：`.topbar` `top=0`、`height=68`、`width=1433`、`margin-top=0px`、`border-radius: 0px 0px 22px 22px`、`border-top-width=0px`、`background = rgba(122,200,240,.52)`。
  - 滚动 600px：`top=14`、`width=760`、`margin-top=14px`、`border-radius=999px`、`border-top-width=0.8px`、`background = rgba(122,200,240,.64)`（合成 `rgb(78,128,154)`）。
  - 卡片默认 `rgba(122,200,240,.52)` → 合成 `rgb(63,104,125)`；鼠标悬停（真实 hover）`rgb(166,224,250)` 56% → 合成 `rgb(93,125,140)`，`transform: none`，过渡属性仅 `background-color, border-color, box-shadow`。
  - 登录页面板：`rgba(122,200,240,.52)` + `blur(18px)` + 边框 `rgba(170,228,250,.45)`，叠黑 `rgb(63,104,125)`；输入框叠在面板上 `rgb(81,124,144)`，文字 `rgb(255,255,255)`。
- `npm run build`（`vue-tsc --noEmit && vite build`）0 错误。

## 11. 视觉调整第五轮（用户指定色值：`--glass-bg: rgb(52 144 191 / 52%)`、`--glass-bg-strong: rgb(61 103 125 / 64%)`，其余颜色同色相跟随）

- `web/src/styles/tokens.css` 换掉整组蓝色：`--glass-bg: rgb(52 144 191 / 52%)`（叠黑 ≈ `rgb(27,75,99)`）、`--glass-bg-strong: rgb(61 103 125 / 64%)`（≈ `rgb(39,66,80)`）、`--glass-border: rgb(140 198 226 / 45%)`、`--glass-hover: rgb(126 190 224 / 56%)`（≈ `rgb(71,106,125)`）、`--fill: rgb(52 144 191)` / `--fill-hover: rgb(66 160 207)`、`--accent: rgb(140 198 226)` / `--accent-soft` / `--accent-faint`、`--field-bg: rgb(180 218 238 / 16%)`。
- 其余文件里的旧青色系按色相族逐个归位（`sed` 批量 + 手工复核）：
  - `rgba(72,202,228,*)`（青 #48cae4）→ `rgba(140,198,226,*)`：`App.vue`（`.btn-ghost` 底/hover、聚焦环）、`TopBar.vue`（导航底/hover、登录按钮）、`LoginView.vue`（子页签底/选中底、分隔线）、`ConsoleView.vue`（选中页签底）、`ArticleView.vue`（`.tag`、`.rule`、引用左边线、code 底、表格线）、`ArticleEditor.vue`（引用左边线）、`TimelineList.vue`（节点 glow）。
  - `rgba(144,224,239,*)` → `rgba(150,205,232,*)`（表格/thead 线、代码块边框、分隔线）；`rgba(173,232,244,*)` → `rgba(180,218,238,*)`（时间轴节点光点）；`rgba(0,119,182,*)` → `rgba(52,144,191,*)`（卡片与登录按钮阴影、滚动条）；`rgba(202,240,248,*)` → `rgba(205,226,238,*)`（日期/作者等次要文字）。
  - 深色内嵌井（代码块/预览）由 `rgba(3,4,94,.3/.55/.6)`（蓝紫 `#03045e`）改为同族深青 `rgb(9 34 46 / 45%|60%|65%)`。
  - `var(--c-400)` / `var(--c-200)` 的直接引用（聚焦边框、子页签选中文字、编辑器小标题）改走 `var(--accent)`，避免与 style.txt 原色板混用。
  - `web/src/components/TimelineList.vue`：`CURVE_COLORS` 由 `['#90e0ef','#48cae4','#00b4d8','#ade8f4','#0077b6','#caf0f8']` 改为同族 `['#8fc3de','#5fa8cc','#3490bf','#a8d2e6','#6fb4d4','#c6e3f2']`，`stroke: var(--ca, #3490bf)`。
  - `web/src/App.vue` 输入框改用 `var(--field-bg)`。
- 实测（1440×900 Chrome）：
  - 首页卡片 `rgba(52,144,191,0.52)` → 叠黑 `rgb(27,75,99)`，`blur(18px)`，边框 `rgba(140,198,226,0.45)`；真实 hover → `rgba(126,190,224,0.56)` = `rgb(71,106,125)`，`transform: none`，过渡仅颜色三项。
  - 顶栏顶部：`top=0 / margin-top=0px / radius 0 0 22px 22px / border-top-width 0px / bg rgba(52,144,191,.52)`；滚动 700px：`top=14 / margin-top=14px / width=760 / radius=999px / border-top-width=0.8px / bg rgba(61,103,125,.64)` = `rgb(39,66,80)`。
  - 登录页：面板 `rgba(52,144,191,.52)` + `blur(18px)`、输入框 `rgba(180,218,238,.16)`（叠面板 ≈ `rgb(52,98,121)`）、提交按钮实心 `rgb(52,144,191)`、子页签选中底 `rgba(140,198,226,.18)`；7 条时间轴曲线 stroke 取样为 `rgb(104,173,209)` / `rgb(118,183,214)` / `rgb(181,217,235)` / `rgb(118,181,213)`（同族不同色，节奏互不相同）。
  - 旧色残留扫描：首页与登录页遍历全部元素的计算样式（背景/文字/边框/stroke），命中 `(72,202,228)` 或 `(0,119,182)` 的元素数 = **0**。
- `npm run build`（`vue-tsc --noEmit && vite build`）0 错误。
- 附加修正：`color: var(--c-300)`（style.txt 里的 `#90e0ef`）在 `ArticleCard.vue` / `ArticleEditor.vue` / `ArticleView.vue` / `ConsoleView.vue` / `LoginView.vue` / `AboutView.vue` 共 10 处全部改为 `var(--accent)`，`--c-*` 仅保留给关于页的 9 色板展示；四页（首页 / 文章 / 关于 / 控制台）重新扫描旧青色系计算样式残留 = 0（`.swatch` 色板块为故意展示原色，已排除）。

## 12. 视觉调整第六轮（用户指定：`--glass-hover: rgb(47 167 228 / 52%)`、`--fill: rgb(28 128 180)`；登录/注册按钮不得与工具栏同色）

- `web/src/styles/tokens.css`：`--glass-hover: rgb(47 167 228 / 52%)`（叠黑 ≈ `rgb(24,87,119)`，比默认态 `rgb(27,75,99)` 更亮更蓝）、`--fill: rgb(28 128 180)`、`--fill-hover: rgb(38 148 202)`；原 `rgba(52,144,191,*)` 系的阴影/滚动条统一改 `rgba(28,128,180,*)`，玻璃底色仍保持用户指定的 `rgb(52 144 191 / 52%)`。
- `web/src/components/TopBar.vue` `.btn-login`：不再用 `var(--fill)`（与工具栏同族蓝），改为提亮强调色 `var(--accent)`（`rgb(140,198,226)`）+ 深色字 `#06202c` + `box-shadow: 0 2px 14px rgba(140,198,226,.35)`，hover `rgb(168,214,236)`。
- 实测（1440×900 Chrome）：
  - 未登录首页 `.btn-login` 文本「登录 / 注册」，`background: rgb(140,198,226)`、`color: rgb(6,32,44)`、与工具栏背景 `rgba(52,144,191,.52)` 不相同（`sameAsTopbar: false`），文字对比度 **9.03:1**。
  - 卡片默认 `rgb(52,144,191) 52%` → 叠黑 `rgb(27,75,99)`；真实 hover `rgb(47,167,228) 52%` → 叠黑 `rgb(24,87,119)`，`transform: none`。
  - 导航选中项（首页/关于）实心 `rgb(28,128,180)`，与控制台 `.btn` 等实心元素一致。
- `npm run build`（`vue-tsc --noEmit && vite build`）0 错误。

## 13. 顶栏去掉展开态（用户要求：工具栏维持收缩状态，删除展开状态）

- `web/src/components/TopBar.vue` 重写为「常驻胶囊」：删除 `shrunk` 状态、`scroll` 监听、`onMounted/onBeforeUnmount` 以及 `wrapWidth/pad/radius/bg/topGap/topBorder` 五个 `v-bind()` 计算属性与其 0.35s 过渡；样式改为静态——
  `width: min(760px, calc(100vw - 32px))`、`padding: 8px 18px`、`margin-top: 14px`、`border-radius: 999px`、`background: var(--glass-bg-strong)`（`rgb(61 103 125 / 64%)`）、`backdrop-filter: blur(18px)`；模板上也不再挂 `:class="{ shrunk }"`。脚本只剩 `useAuthStore` / `useSiteStore` 两个 store 引用。
- 实测（1440×900 Chrome）：
  - 未滚动：`top=14`、`height=57`、`width=760`、`border-radius=999px`、`margin-top=14px`、`background=rgba(61,103,125,.64)`、`class="topbar glass"`（无 `shrunk`）。
  - 滚动 800px 后：`top/height/width/radius/background` 与未滚动**完全一致**（顶栏不再变化）。
  - 内容不被遮挡：首页首个卡片 `top=315`（> 胶囊底 71）；`.page` 上内边距 120px 同样大于 71。
  - 窄屏 502px 视口：胶囊 `width=470`（= `100vw-32`）、`nav` 右边界仍在内侧（`navOverflow = -19`）、品牌与导航间距 165px、`docOverflow=0`。
- `npm run build`（`vue-tsc --noEmit && vite build`）0 错误。

## 14. 边框色与「登录」按钮（用户要求：`--glass-border: rgb(20 138 195 / 45%)`；按钮文案改「登录」并去掉移动动画与阴影）

- `web/src/styles/tokens.css`：`--glass-border: rgb(20 138 195 / 45%)`（叠在玻璃面板 `rgb(27,75,99)` 上 ≈ `rgb(24,103,142)`），全站面板/输入框/分隔线随之更新。
- `web/src/components/TopBar.vue`：`.btn-login` 文案「登录 / 注册」→「登录」；删除 `box-shadow: 0 2px 14px rgba(140,198,226,.35)` 与 `transition` 里的 `transform`，hover 只保留 `background: rgb(168,214,236)`（原 `translateY(-1px)` 移除）。
- 实测（1440×900 Chrome，未登录）：按钮 `textContent = "登录"`、`background = rgb(140,198,226)`、`color = rgb(6,32,44)`、`box-shadow = none`、`transform = none`、`transition-property = background`；卡片 `border-color = rgba(20,138,195,0.45)`、`border-top-width = 0.8px`；根变量 `--glass-border: rgb(20 138 195 / 45%)`。
- `npm run build`（`vue-tsc --noEmit && vite build`）0 错误。

## 15. 滚动条颜色（用户要求：`rgb(83 155 216 / 50%)`）

- `web/src/styles/tokens.css` 的 `::-webkit-scrollbar-thumb` 由 `rgba(28,128,180,.5)` 改为 `rgb(83 155 216 / 50%)`（宽 10px、圆角 5px、轨道透明，均未变）。
- 实测：CSSOM 中 `::-webkit-scrollbar-thumb` 生效值为 `rgba(83, 155, 216, 0.5)`，首页文档高度 2948px > 视口，滚动条可见。`npm run build` 0 错误。

## 16. 玻璃底色微调 + 文章卡片毛玻璃（用户指定：`--glass-bg: rgb(52 128 191 / 52%)`、`--glass-hover: rgb(61 140 205 / 52%)`）

- `web/src/styles/tokens.css`：`--glass-bg` → `rgb(52 128 191 / 52%)`（叠黑 ≈ `rgb(27,67,99)`）、`--glass-hover` → `rgb(61 140 205 / 52%)`（叠黑 ≈ `rgb(32,73,107)`）；`--glass-blur` 由 `blur(18px)` 改为 `blur(18px) saturate(140%)`（毛玻璃透出的光更通透）。
- 毛玻璃此前「有 blur 但看不见」：卡片背后是纯黑 + 稀疏小星点，没有可被模糊的内容。`web/src/components/StarField.vue` 新增漂移光晕层：7–11 团深蓝光晕（色池 `0,119,182 / 0,150,199 / 0,180,216 / 72,202,228`，r=300–520px，v=2–7px/s，中心 alpha 0.16–0.26，`globalCompositeOperation='lighter'`），x 固定落在 `0.15w–0.85w` 内容带，出界从对侧回绕；光斑从卡片背后经过时 backdrop-filter 模糊出柔散光块，毛玻璃肉眼可辨。
- `web/src/components/ArticleCard.vue`：补玻璃质感细节——常态顶缘高光 `inset 0 1px 0 rgba(255,255,255,.14)` + 极淡内描边；hover 时高光加强至 `.22` 并加投影 `0 10px 34px rgba(2,62,138,.38)`。
- 实测（Chrome 5180，计算样式）：卡片 `backdrop-filter: blur(18px) saturate(1.4)`、`background: rgba(52,128,191,0.52)`；hover 后 `rgba(61,140,205,0.52)` + 边框 `rgba(186,222,240,0.5)`；截图可见光斑在卡内比卡外更柔散、hover 卡明显亮于邻卡。`npm run build`（`vue-tsc --noEmit && vite build`）0 错误。

## 17. 删除光斑 + 文章卡片改透明（用户要求：删除光斑；卡片改用透明效果）

- `web/src/components/StarField.vue`：整体移除第 16 轮加入的漂移光晕层（Glow 接口、GLOW_COLORS 色池、spawnGlow、resize/frame 中的光晕逻辑），恢复纯黑底 + 向上漂浮星点。
- `web/src/components/ArticleCard.vue`：去掉 `.glass` class，卡片不再用 `--glass-bg`/backdrop-filter——默认 `background: transparent`、细描边 `rgb(140 198 226 / 22%)`、圆角 `var(--radius-lg)`；删除玻璃高光内描边；hover 改为极淡蓝薄膜 `rgb(52 128 191 / 14%)` + 边框 `rgb(140 198 226 / 45%)` + 投影 `0 8px 28px rgba(2,62,138,.25)`。
- 实测（Chrome 5180，计算样式/截图）：卡片 `background: rgba(0,0,0,0)`、`backdrop-filter: none`，星点直接穿过卡片区域可见；CSSOM 中 `.card:hover` 规则 bg=`rgba(52,128,191,0.14)`。`npm run build` 0 错误。README 界面要点已同步。

## 18. 透明卡回调：保留背景色、只提高透明度（用户要求：卡片仍需要有背景颜色，只是增加透明度）

- `web/src/components/ArticleCard.vue`：默认态由 `transparent` 回调为半透明蓝底 `rgb(52 128 191 / 28%)`（颜色同 `--glass-bg` 色相，alpha 52% → 28%，叠黑 ≈ `rgb(15,36,53)`）；hover 同步回调为 `rgb(61 140 205 / 42%)`（叠黑 ≈ `rgb(26,59,86)`）。细描边、圆角、无 backdrop-filter、投影均沿用第 17 轮。
- 实测（Chrome 5180）：计算样式 bg=`rgba(52,128,191,0.28)`、border=`rgba(140,198,226,0.22)`；截图确认卡片有明显蓝底且星点可透出。`npm run build` 0 错误。README 已同步。

## 19. 玻璃底色第三次微调 + 输入框提示文本提亮（用户指定：`--glass-bg: rgb(61 120 169 / 50%)`；反馈输入框提示文本颜色太深）

- `web/src/styles/tokens.css`：`--glass-bg` → `rgb(61 120 169 / 50%)`（叠黑 ≈ `rgb(31,60,85)`；用户消息写作 `--glass-gb`，按上下文判定为 `--glass-bg` 笔误）。影响顶栏、关于页区块等所有 `.glass` 面；文章卡片半透明底 `rgb(52 128 191 / 28%)` 不变。
- 同文件新增全局 `::placeholder { color: rgba(233, 244, 250, 0.6); opacity: 1 }`——此前无任何 placeholder 规则，浏览器默认灰（约 #757575）在深色输入框上太暗。
- 实测（Chrome 5180 /login）：`--glass-bg` 计算值 `rgb(61 120 169 / 50%)`；邮箱输入框 `::placeholder` color=`rgba(233,244,250,0.6)`、opacity=1，截图确认「you@example.com」「请输入密码」清晰可读。`npm run build` 0 错误。README 已同步。

## 20. 顶栏选项卡去 font-weight + 填充色改半透明白（用户要求：删除顶部选项卡的 font-weight 属性；`--fill: rgb(255 255 255 / 15%)`）

- `web/src/components/TopBar.vue`：`.nav-link.active` 删除 `font-weight: 600`（三个 font-weight 中仅此一处属于导航选项卡；`.brand-name` 700 与 `.btn-login` 600 非选项卡，保留）。
- `web/src/styles/tokens.css`：`--fill: rgb(28 128 180)` → `rgb(255 255 255 / 15%)`；`--fill-hover` 同步改为 `rgb(255 255 255 / 25%)`（用户未指定 hover，按同系提亮一档补齐，避免残留实心蓝 hover）。使用方（首页「首页」激活态、ConsoleView 选中 tab/管理员徽标等）无需改动。
- 实测（Chrome 5180）：激活导航项 bg=`rgba(255,255,255,0.15)`、font-weight=`400`（无加粗）；根变量两值匹配。`npm run build` 0 错误。README 已同步。

## 21. 星空微调：最大星点变小 + 数量增加（用户要求：星星最大大小略微调小、数量增加）

- `web/src/components/StarField.vue`：`r` 由 `0.4 + random*1.8`（0.4–2.2px）改为 `0.4 + random*1.5`（0.4–1.9px），最大星点缩小约 14%；数量公式由 `max(90, w*h/8500)` 改为 `max(120, w*h/6500)`（1444×828 视口 141 → 184 颗，约 +30%）。速度/透明度/闪烁逻辑不变。
- 实测（Chrome 5180）：截图确认星空更密且无过大星点，画面依旧安静；`npm run build` 0 错误。README 已同步。

## 22. 星空数量增至约 500 颗（用户要求：当前视口下增加至约 500 颗）

- `web/src/components/StarField.vue`：数量公式 `max(120, w*h/6500)` → `max(120, w*h/2400)`；1444×828 视口 = 498 颗。星点大小/速度/透明度不变。
- 实测（Chrome 5180）：截图确认星空繁密但依旧安静、不干扰正文；`npm run build` 0 错误。README 已同步。

## 23. 时间轴连线：转折更平滑 + 去圆点 + 自下而上脉冲（用户要求：转折处更平滑、去除圆点、连线透明度不变且较高、加自下而上脉冲动画）

- `web/src/components/TimelineList.vue`：① `smoothPath` 的 Catmull-Rom 张力系数 1/6 → 1/4（控制点外扩，转折更圆滑）；② 删除两端 `<circle class="node">` 圆点及其样式；③ 每条连线叠加同 `d` 的 `.pulse` 亮脉冲路径（`pathLength="100"`、`stroke-dasharray: 7 93`、`#e8f6fd`、opacity 0.9），`@keyframes pulse-move` 让 `stroke-dashoffset` 0 → 100 递增——dashoffset 增大 = 图案朝路径起点移动 = 自下而上；每条时长 `dur/3`（约 1.5–3.8s）、延迟沿用各线随机 delay，节奏不同步。底线 `.curve` 与呼吸变色动画未动（透明度保持原状）。
- 实测（Chrome 5180）：`circle` 数 = 0，pulse/curve 各 7 条；`animationName = pulse-move`、dasharray `7px, 93px`；400ms 间隔采样 dashoffset 59.06 → 85.95（递增 = 向上）；截图确认转折圆润、脉冲可见。`npm run build` 0 错误。README 已同步。

## 24. 连线透明化 + 脉冲恒速慢速（用户 5 点要求：去透明度变化动画 / 连线几乎不可见 / 脉冲速度恒定不受线长影响 / 速度调慢似旧闪烁 / 脉冲淡色且透明度略高于连线）

- `web/src/components/TimelineList.vue`：
  - 删除 `curve-tint` 呼吸动画（stroke 与 opacity 同变的 keyframes 整体移除），`.curve` 固定 `opacity: 0.18`（近乎不可见、恒定）；`Curve` 类型去掉 `cb`/`dur`。
  - `.pulse` 改淡色 `#cfe9f8`、`opacity: 0.38`（略高于连线的 0.18）；去掉 `pathLength=100` 归一化，改为逐条实测：`measure()` 里用 detached `<path>` 的 `getTotalLength()` 取几何长度 `len`，内联 `stroke-dasharray: 8 ${len}` 与 `--plen`，keyframes `to { stroke-dashoffset: var(--plen) }`（递增 = 自下而上不变）。
  - **恒速**：`PULSE_SPEED = 40` px/s，`pdur = len / 40`——时长随线长伸缩、速度恒定；典型 240–320px 线走完 6–8s，节奏贴近此前 curve-tint 的 4.5–11.5s 闪烁带。随机 delay 沿用。
- 实测（Chrome 5180）：`curveOpacity = 0.18`、`curveAnim = none`；脉冲 `#cfe9f8`/0.38/`pulse-move` 运行中；WAAPI 读时钟 progress 0.5949 → 0.7386 持续推进；7 条脉冲速度全部 = 40.0 px/s；截图确认连线几乎隐形、脉冲淡亮可辨。`npm run build` 0 错误。README 已同步。
- 备注：页面在后台标签页时 `getComputedStyle().strokeDashoffset` 采样会被渲染节流冻结，动画推进要用 `element.getAnimations()[0].currentTime / progress` 验证。

## 25. 脉冲加长（用户：脉冲长度应很长）

- `web/src/components/TimelineList.vue`：脉冲亮段由固定 8px 改为 `dash = max(140, len * 0.45)`（约线长一半、短线下限 140px），`strokeDasharray: ${dash} ${len - dash}`（dash+gap = len，循环无缝）；`Curve` 类型加 `dash: number`。速度 40px/s、方向、颜色、透明度均不变。
- 实测：首条线 `stroke-dasharray: 140, 142.6`（len 282.6，覆盖 ~50%）；截图确认长光段沿整条 S 曲线延展、连线其余部分仍近乎隐形；`npm run build` 0 错误。README 已同步。

## 26. 脉冲白色 + 回第一版速度 + 单光效（用户：光效白色 / 速度改回第一版但仍不受线长影响 / 同一连线不出现两处光效）

- `web/src/components/TimelineList.vue`：
  - `.pulse` 颜色 `#cfe9f8` → `#ffffff`。
  - `PULSE_SPEED` 40 → **110 px/s**：第一版脉冲时长为 `dur/3`（dur ∈ 4.5–11.5s，即全程 1.5–3.8s、典型线约 90–120px/s），取中值 110 作为恒速——典型 283px 线 2.6s 走完，贴近第一版节奏；所有线严格 110px/s，与线长无关。
  - 亮段 `max(140, len*0.45)` → 纯 `len*0.45`（去掉 140px 下限）：旧下限使短线 dash > gap（239px 线 140/99），同一周期出现两段光；纯比例后 dash 恒 < gap，同一条线上最多一处光效。
- 实测：7 条线 color 全部 `rgb(255,255,255)`、speed 全部 110px/s、dash<gap 全部成立（如 127.2/155.4）；截图每条线仅一段白光；`npm run build` 0 错误。README 已同步。

## 27. 单光效修正：考虑亮段自身长度（用户：单光效实现不正确，没有考虑光效本身长度）

- 问题根因：第 26 轮 `stroke-dasharray: ${dash} ${len - dash}` 使图案周期 = 线长。dashoffset 动画把图案沿闭合周期位移一个线长时，长亮段必然在绕环边界处首尾同时可见——线两端各出现一段光（约半个周期时间都是双光）。
- 修正（`web/src/components/TimelineList.vue`）：间隔段改为整条线长 `stroke-dasharray: ${dash} ${len}`，图案周期 T = len + dash > len；keyframes 终值改为 `var(--tlen)`（= T，位移一个完整周期保持无缝）；`pdur = T / 110`（图案速度仍精确 110px/s，亮段在线上可见行进仍为 len/110，周期含亮段自身行程故略长）。
- 验证：刷新后 7 条线全部 `gap == len`、`patternSpeed = 110px/s`；**对每条线扫 400 个相位，任一时刻路径上可见亮段数最大值 = 1**（k∈{-1,0,1} 三个图案实例与 [0,len) 求交），数学上排除双光；截图确认每线仅一段白光。`npm run build` 0 错误。README 已同步。
- 几何结论：dash 循环要严格单实例，充要条件是周期 ≥ 线长 + 亮段长（间隔段 ≥ 线长）；仅 dash < gap（周期 = 线长）不够。

## 28. 光效提速 + 循环间停顿（用户：光效速度增加；光效结束后等待一会儿再重新出现）

- `web/src/components/TimelineList.vue`：`PULSE_SPEED` 110 → **160px/s**（所有线恒定不变）；新增 `PAUSE_SECONDS = 1.2`——图案周期改为 `T = 线长×1.45 + 停顿行程（1.2s × 160px/s = 192px）`，`pdur = T / 160`，`strokeDasharray` 间隔段 = `T − dash`，keyframes 位移仍 = `var(--tlen)`（无缝）。
- 效果：光效以 160px/s 走完线（典型 405px 线约 2.5s）后，线上空窗 **1.2s**，再从底部重新出现；周期 ≥ 线长 + 亮段的单光效条件仍满足。
- 验证：刷新后 7 条线 `patternSpeed = 160`、`darkSpan = 192px`（= 1.2s）、400 相位扫描亮段数 max = 1；`npm run build` 0 错误。README 已同步。

## 29. 子标题改为「追光的人，终会光芒万丈。」（用户要求）

- 改了三处（子标题链路：DB → 后端默认 → 前端默认）：
  - `server/src/services/settings.js` DEFAULTS.site_subtitle 更新（新库/新环境的默认值）；
  - MySQL `settings` 表 `site_subtitle` 行 UPDATE（运行时真源，原值为旧文案，覆盖代码默认）；
  - `web/src/stores/site.ts` 默认 info.subtitle 更新（后端不可用时的兜底文案）。
- 后端以 `node src/index.js` 直跑（端口 3010，settings 有进程内缓存，仅 DB 更新不生效）→ 重启后端进程后缓存重载；顺带清理了两个残留的旧 `node dist/index.js` 后端进程（19580/21956，未监听 3010 的僵尸实例），现由单一新进程（PID 10888）服务。
- 实测：`GET /api/site` 返回新 subtitle；首页渲染「追光的人，终会光芒万丈。」✓。README 未提及旧子标题，无需改。

## 30. 子标题去句号（用户：不要留下句号）

- 三处链路同步去掉尾部「。」：MySQL `settings` 表 `site_subtitle` 行、`server/src/services/settings.js` DEFAULTS、`web/src/stores/site.ts` 默认值，均为「追光的人，终会光芒万丈」。
- settings 进程内缓存 → 后端重启（新 PID 40416）。实测 `GET /api/site` 与首页渲染均为无句号文案；`npm run build` 0 错误。

## 31. 登录页仅保留密码登录 + 忘记密码提示（用户要求）

- `web/src/views/LoginView.vue`：
  - 删除登录方式切换（`.sub-tabs` 密码登录/验证码登录）与验证码表单块（验证码输入、发送按钮、开发模式验证码提示），删除 `way`/`sendCode`/`devCode`/倒计时相关全部脚本与样式；密码字段 v-if 去掉（登录/注册均恒显示）。
  - 登录表单下方新增提示行：`忘记密码？验证邮箱后即可恢复密码`（`.forgot-tip`，13px 暗色居中，仅登录模式显示）。
- 说明：后端 `/api/auth/send-code`、`/api/auth/login/code` 接口保留未动（仅前端不再提供验证码登录入口）；忘记密码恢复流程本身尚未实现，页面先展示提示文案。
- 实测（/login）：按钮仅 登录/注册/登录，表单字段仅 邮箱+密码，提示行渲染 ✓，验证码输入框不存在 ✓；`npm run build` 0 错误。

## 32. 忘记密码恢复流程（用户：先分批提交已有更改，再实现忘记密码的恢复流程）

- 先分 4 批提交了此前 8 项更改：`a13c2d4`（星空+连线光效）、`6aebf79`（子标题）、`3669cd4`（登录页简化）、`b61d09b`（style.txt 删除+文档）。
- 后端（`server/src/routes/auth.js`、`server/src/db.js`）：
  - `email_codes.purpose` ENUM 增加 `'reset'`（db.js 建表语句 + 线上库 ALTER）；
  - `/api/auth/send-code` 支持 `purpose: 'login' | 'reset'`；`reset` 仅向已注册且未禁用的邮箱发码（未注册 404、禁用 403，不泄露更多信息）；
  - 新增 `POST /api/auth/reset-password`：`{ email, code, password }`，校验 reset 验证码（一次性、10 分钟）后 bcrypt 更新 `password_hash` 并置 `email_verified=1`；每小时每邮箱 10 次限流。后端已重启（PID 39100）。
- 前端（`web/src/views/LoginView.vue`）：登录模式提示行中「忘记密码？」改为可点链接 → 进入忘记密码面板（注册邮箱 + 验证码 + 发送按钮（60s 倒计时）+ 新密码），提交成功后回登录模式并提示「密码已重置，请使用新密码登录」；忘记密码模式下隐藏登录/注册表单、注册 tab 与 GitHub 区块，提供「返回登录」。
- 端到端实测（一次性测试账号，完成后已从库中删除）：注册 → UI 点「忘记密码？」→ 发码（开发模式显示验证码）→ 填码+新密码提交 → 回登录显示成功提示；新密码登录 200、旧密码 401、未注册邮箱发码 404。首轮联调发现线上库 `purpose` ENUM 无 `reset` 导致 MySQL truncated 报错，ALTER 后通过。
- `npm run build` 0 错误。README API 表已补 `reset-password` 与 `purpose` 说明。

## 33. 后台/用户体系分离大改造（用户六点需求）

需求：①后台与用户系统分离，/admin 独立鉴权直进；②后台管理站点信息/Logo/关于页/邮件模板/SMTP/用户/文章（风格独立）；③用户权限后台可配；④用户名颜色后台可改；⑤用户空间 /space/:id（昵称/简介/已发布文章）；⑥登录页去毛玻璃改透明。

**后端**（11 文件改 + 新增 space.js）：
- db.js：users 加 `name_color VARCHAR(20)`、`bio VARCHAR(500)`、`permissions JSON`（ensureColumn 幂等 ALTER）；settings 种子改 `admin_password_hash`（不再种管理员用户）。
- middleware/auth.js：adminRequired 改独立 admin JWT（secret=`jwtSecret+':admin'`，payload `{admin:true}`，12h，与用户 JWT 互不相通）。
- admin.js 全重写：POST /login（10 次/15min 限流）、GET /session、PUT /password、GET/PATCH /users（name_color 正则校验、status、permissions 白名单 `['post']`/null=默认）、GET/PUT /settings（smtp_pass 走 __KEEP__/__CLEAR__ 协议）、POST/DELETE /logo、POST /mail/test、GET /admin/articles（分页+关键词）、PATCH/DELETE /admin/articles/:id（置顶/删除用后台令牌直接操作）。
- settings.js：DEFAULTS + smtpConfig()（DB 优先 env 回退）/mailTemplate()，publicSiteInfo 加 logoUrl/aboutHtml；mailer.js 用 DB 模板与 SMTP。
- articles.js：去掉 role=admin 概念（canEdit 仅作者本人、发文需 userCanPost）；auth.js PUT /profile 支持 bio；space.js 新增 GET /api/space/:id。
- 旧种子管理员用户已降级 role='user'。

**前端**（15 文件改 + 新增 4 文件）：
- 新增 AdminView.vue（独立「石墨深底+琥珀」风格：登录门 + 站点/邮件/用户/文章四区；用户行内改名色/权限/禁用；文章置顶/删除；改管理密码；登录后补拉用户与文章列表）、SpaceView.vue（资料卡+文章列表+本人编辑昵称/简介）、api/adminHttp.ts、stores/admin.ts。
- ConsoleView 删用户管理/站点配置区（回归纯用户面板+bio 编辑）；AboutView 改渲染后台 about_html（DOMParser 白名单净化）；TopBar 支持 logoUrl 与彩色用户名+后台入口；ArticleView 作者名彩色并链接 /space/:id；LoginView 去 .glass 改半透明深面板；App.vue 在 /admin 隐藏 StarField/TopBar。

**实测**：admin login/session/未授权 401 ✓；/admin 四区渲染+用户控件+文章 8 行+置顶往返 ✓；/space/1 资料卡+8 文章+编辑昵称/简介保存回显 ✓（测试数据已还原）；文章页作者名 accent 色并链到 /space/1 ✓；/login panel rgba(10,18,28,.55) 无 backdrop ✓；`npm run build` 0 错误。

## 34. 去除管理员邮箱记录与用户角色概念（用户：不再记录关联邮箱；不再使用管理员用户，"管理员"用户与普通用户无异）

- `server/src/config.js`：config.admin 删除 email/name，仅保留 password（后台登录只用密码）。
- `server/.env` / `.env.example`：删除 `ADMIN_EMAIL`/`ADMIN_NAME`，注释改为「管理后台密码（首次启动建库时写入哈希）」。
- **彻底移除用户角色概念**：db.js users 表 schema 删 `role ENUM('user','admin')`；线上库 `ALTER TABLE users DROP COLUMN role`（临时 .mjs 幂等执行，跑完即删）；auth.js 三处注册 INSERT（密码注册/验证码首登自动注册/GitHub 首登）去 role；utils.js signToken JWT payload 去 role、publicUser 返回去 role；前端 stores/auth.ts User 接口删 role。
- 实测：全库 grep 无残留 role/ADMIN_EMAIL/ADMIN_NAME 引用；后端重启后 admin login 200；验证码登录 E2E（临时账号 role-drop-test）token 下发、user 对象无 role 字段 ✓，测试账号已删；`/api/space/1` 用户对象无 role ✓；`npm run build` 0 错误。README 已同步。

## 35. 后台可管理用户默认头像（用户 m01253）

- 需求：后台可指定用户默认头像；默认使用用户提供的 `default` 图片（给了 default.png 200×200 与 default.svg 两种格式，自选）。**选用 SVG**（任意尺寸清晰、仅 1KB，前端原本就以 `<img>` 引用 SVG，兼容性无差异），已覆盖至 `web/src/assets/default-avatar.svg` 作为内置默认。
- 后端：settings.js DEFAULTS 补齐 `site_logo_url`/`default_avatar_url`/`about_html`/`mail_*`/`smtp_*`（**修复隐患：setSettings 白名单是 `k in DEFAULTS`，此前 logo/about/smtp 键均不在 DEFAULTS 里，保存会被静默丢弃**）；publicSiteInfo 加 `defaultAvatarUrl`；admin.js 新增 `POST/DELETE /api/admin/default-avatar`（imageUpload，同 Logo 流程）。
- 前端：site store 加 `defaultAvatarUrl`；ArticleCard/ArticleView/TopBar/SpaceView/ConsoleView 五处回退头像改为 `site.info.defaultAvatarUrl || 内置 svg`；AdminView「站点」页 Logo 区块下新增「用户默认头像」（上传/预览/恢复内置）。
- E2E：admin 登录 → 上传 default.png → `POST /admin/default-avatar` 200（`/uploads/images/…`）→ `/api/site` 返回该 URL → 图片 200 image/png → DELETE 重置回 `""`；顺带验证 Logo 上传持久化已修复（upload → `site.logoUrl` 一致）。浏览器实测首页卡片头像 src = 内置 SVG data URI（含用户图特征 `t='1792773105904'`）；`npm run build` 1.66s 0 错误。上传的测试头像文件未删（同 Logo 流程，不影响）。

## 36. 后台白蓝配色 + 邮件模板全自定义（用户：后台改白蓝简约大气；所有邮件模板支持自定义）

- 需求：①后台界面改白蓝配色、简约美观大气；②邮件模板不止验证码，全部支持自定义（注册欢迎邮件为新增，后台测试邮件不再复用验证码模板）。
- 后端：settings.js DEFAULTS 增 `mail_welcome_subject/body`、`mail_test_subject/body`；新增 `MAIL_TEMPLATES` 注册表（`code`/`welcome`/`test` 三类，含 label/desc/placeholders/subjectKey/bodyKey/内置默认；占位符 `{site}` 站点名、`{code}` 验证码、`{name}` 昵称）与 `mailTemplate(kind, vars)`（读库、空值回退内置、replaceAll 渲染，`{site}` 自动取 site_title）；mailer.js 重写为三入口 `sendCodeEmail`/`sendWelcomeEmail`（try 包裹永不抛错、无 email/SMTP 静默跳过）/`sendTestEmail`（落款带发送时间）；auth.js 注册、验证码首登自动注册、GitHub 首次授权三处建用户路径均触发欢迎邮件（`.catch(()=>{})` 不阻塞）；admin.js GET /admin/settings 响应新增 `mailTemplates` 元数据（PUT 无需改，模板键已入 DEFAULTS 白名单）。
- 前端：AdminView.vue 整体重写为白蓝主题（`--bg:#f4f7fc`/`--surface:#fff`/`--blue:#2563eb`/`--blue-soft:#eef4ff`，白卡+蓝竖条标题、侧栏激活蓝软底、登录门浅蓝渐变+渐变字，状态 pill 蓝/绿/红）；「邮件」页改三段卡片：模板编辑器（v-for 三模板，主题/正文/占位符 chip 点击插入/恢复默认=置空回退内置）+ SMTP 配置 + 测试邮件。
- 验证：`e2e-mail-tpl.mjs` 17 passed/0 failed（模板元数据、4 键 PUT 持久化回读、渲染含自定义值、SMTP 未配置 mail/test 400 友好提示、注册不阻塞、恢复默认置空）；`tpl-check.mjs` 三模板渲染含 `{site}` 自动填「微光博客」；`welcome-check.mjs`（已删）验证无 SMTP/无 email 返回 false 且打日志。回归：`smoke-auth` 13/0、`smoke-admin` 32/0（+1 项邮件模板元数据）、`smoke-articles` 22/0；`npm run build` 0 错误。**旧冒烟脚本未跟上第 33/34 轮改动（非本轮回归），已同步修复**：smoke-auth:42 去 `user.role` 断言；smoke-admin 改 `POST /admin/login`（独立后台 JWT）、去 role 设/取消断言、新增「已废弃 role 字段 400」与 permissions/name_color 用例、「普通用户访问 /admin/users」403→401（adminRequired 对非后台 token 统一 401）；smoke-articles 管理员登录改 `/admin/login`，置顶/编辑他人改走 `PATCH /admin/articles/:id`（用户文章接口不再认管理员 token，断言 401）。
- 备注：本会话无浏览器，后台视觉以构建+代码审查为准；改动未提交（用户未要求）。

## 37. 邮件发送失败排查（用户：前端提示成功但未收到；SMTP 为 BillionMail mail.email.xiaoziyi.com:465 TLS）

- 排查：`diag-smtp.mjs` 读库发现 `smtp_from` 只填了名称 `ShimmerBlog`（无邮箱地址）→ nodemailer 拿不到地址，发出去的信 **Return-Path 为 `<>`（空信封）、连 From 头都没有**（IMAP 实测首封信头为证）。服务器 DATA 阶段照收 → 前端提示成功；但外域 MTA 对空信封/无 From 的信件直接拒收或进垃圾桶，退信也因 Return-Path 为空发不回来——正是「提示成功但未收到」。
- DNS 顺带核查：mail.email.xiaoziyi.com → 198.20.0.60（新机器，非 77）；`email.xiaoziyi.com` SPF `v=spf1 +a +mx +ip4:192.140.166.198 -all`，`+mx` 经 mail.email.xiaoziyi.com 覆盖 198.20.0.60，SPF 无冲突；IMAP 明文 143 会被 reset，993（SSL）正常。
- 修复：①settings.js `smtpConfig()` 发件人兜底——`from` 不含 `@` 时自动包装为 `"名称" <SMTP账号>`；②库里 `smtp_from` 修正为 `ShimmerBlog <noreply@email.xiaoziyi.com>`；③AdminView SMTP 表单下发件人栏加格式说明。
- 验证：修复后重发测试邮件，IMAP 实测新信 `Return-Path: <noreply@email.xiaoziyi.com>`、`From: ShimmerBlog <noreply@email.xiaoziyi.com>` ✓；`npm run build` 0 错误。新增诊断脚本 `server/scripts/diag-smtp.mjs`（查看生效 SMTP 配置，密码打码）与 `diag-smtp-send.mjs`（实发测试邮件，打印完整 SMTP 错误）。
- 备注：如外域邮箱仍收不到，属新服务器出站信誉/DKIM 问题（需在 BillionMail 侧查队列与 DKIM 签名），与 ShimmerBlog 代码无关。

## 38. 后台用户管理扩展：改名/改绑邮箱/重置密码/删除用户（用户：允许后台进行更多操作）

- 需求：后台用户管理支持更多操作——改名、删除用户、更改绑定邮箱等。
- 后端（server/src/routes/admin.js）：PATCH /admin/users/:id 扩展 `name`（trim 非空、截 50）、`email`（格式校验 + `WHERE email=? AND id!=?` 查重 409「该邮箱已被其他用户使用」、改邮箱同时置 `email_verified=0` 需重新验证）、`password`（≥6 位，bcrypt）；新增 DELETE /admin/users/:id（404「用户不存在」；文章经 `fk_articles_author ON DELETE CASCADE` 在 DB 层级联删除）。
- 前端（web/src/views/AdminView.vue）：用户行操作列改「空间 / 编辑 / 删除」；新增「编辑用户」弹层（昵称/绑定邮箱/新密码三字段，仅提交变更字段；改邮箱提示需重新验证）；删除走 confirm 二次确认（文案注明文章一并删除），成功后本地列表移除。
- 事故与修复：e2e 清 SMTP 时误用 `__CLEAR__` 哨兵——admin.js PUT 只对 `github_client_secret`/`smtp_pass` 处理该哨兵，**非密 SMTP 字段把 `__CLEAR__` 字符串原样入库**（smtp_host='__CLEAR__' 连不上报 Unexpected socket close），且 `smtp_pass` 被真清空。两处修复：①admin.js PUT 对 `smtp_host/port/user/from` 同样把 `__CLEAR__` 视为清空；②e2e-mail-tpl.mjs 改为只清非密字段（空串）且**绝不动 smtp_pass**。误清的 SMTP 密码从 **MySQL binlog ROW 镜像**找回（`mysqlbinlog --no-defaults -vv --base64-output=DECODE-ROWS` 解 000096 号日志 20:24:09 的 UPDATE before-image），已完整恢复六项 SMTP 设置并实发验证 ✓。
- 测试修复（环境自适应）：smoke-auth.mjs 原依赖 send-code 的 devCode（仅 SMTP 未配置时返回，第 37 轮库内已配 SMTP 后失效）→ 新增 `latestCode()` 直查 email_codes 表取码，via 断言放宽 console/smtp。
- 验证：smoke-admin 45/0（新增 13 项：空昵称 400、非法邮箱 400、短密码 400、改名 200、改邮箱 200 且 email_verified=0、改到已占用邮箱 409、旧邮箱登录 401、新邮箱旧密码 200、重置密码 200、新密码 200、删不存在 404、删用户 200、已删登录 401）；smoke-auth 13/0、smoke-articles 22/0、e2e-mail-tpl 17/0（跑完 SMTP 设置原样保留）；`npm run build` 0 错误（AdminView 21.11kB）。
- 补充（用户问「删除后个人空间为何还存在」）：后端实为 404（实测注册→发文章→删用户→空间 404「用户不存在」、文章 404）；**根因是 SpaceView.vue 从未渲染 `missing` 状态**——API 404 时页面照常渲染资料卡骨架（头像回退/名字「…」/「还没有写简介」/「还没有公开的文章」），看起来像空间还在。已修：missing 时显示「该用户不存在或已注销 + 返回首页」，正常内容套 `<template v-else>`；build 0 错误。另注意已打开的空间页面不会自动感知删除，刷新后即见提示。
- 备注：改动未提交（用户未要求）。

## 39. 删除改「注销」（墓碑软删除）：已注销用户显示墓碑资料（用户：注销用户名显示「已注销用户」、头像恢复默认、空间显示已注销）

- 需求：用户删除改为「注销」——用户名显示为「已注销用户」，头像改为默认头像，个人空间显示该用户已注销。
- 设计：后台「删除」按钮改为「注销」，语义为**墓碑软删除**——保留其全部文章，资料匿名化；新增 `?purge=1` 参数保留彻底删除（清理脚本/确需物理删除时用）。
- 后端：
  - server/src/db.js：users.status ENUM 扩为 `('active','disabled','deleted')`（SCHEMA_SQL 同步 + 启动迁移 `ALTER TABLE ... MODIFY COLUMN`，已迁移则忽略）。
  - server/src/routes/admin.js DELETE /users/:id 重写：`?purge=1` → 硬删（文章级联删除，返回 `{ok,purged:true}`）；否则注销——404「用户不存在」；对已 deleted 用户幂等返回墓碑资料；UPDATE 置 `status='deleted', name='已注销用户', name_color=NULL, avatar_url=NULL, bio='该用户已注销', email='deleted-<id>@tombstone.local'`（释放原邮箱可重新注册）`, email_verified=0, password_hash='', github_id=NULL, permissions=JSON_ARRAY()`；返回 `{ok:true, deleted:true, user}`。
  - server/src/routes/space.js：`status='deleted'` → 200 且响应带 `deleted:true`（前端据此刻画墓碑提示）；无用户/disabled 仍 404。
- 前端：
  - web/src/views/SpaceView.vue：`tombstoned`（data.deleted）时资料卡上方显示胶囊提示「该用户已注销，资料仅作展示」；「编辑」按钮对墓碑隐藏；头像因 avatar_url 已清空自动回退默认头像，名字即「已注销用户」。
  - web/src/views/AdminView.vue：用户列表对 deleted 用户——邮箱列显「（已注销）」、名字灰色、权限/颜色列显「—」、状态列灰色「已注销」pill、操作列只留「空间」；「删除」按钮改「注销」，confirm 文案说明文章保留、邮箱释放；成功后就地 `Object.assign(u, data.user)` 更新行（AdminUser.status 类型加 'deleted'）。
- 测试：server/scripts/smoke-admin.mjs 删除段改注销语义（注销 200 且 status/name 正确、空间 200 且 deleted:true、注销后登录 401、原邮箱可重新注册 201、重复注销幂等、purge=1 返回 purged:true 且空间 404；清理段全部 purge）；e2e 清理脚本 cleanup-e2e-user.mjs 用原生 SQL DELETE 不受影响。
- 验证：smoke-admin **50/0**、smoke-auth 13/0、smoke-articles 22/0、e2e-mail-tpl 17/0；`npm run build` 0 错误（AdminView 21.56kB）。
- 备注：①注销用户 GitHub 身份（github_id）一并解绑，原 GitHub 授权再登录会新建账号；②已打开的空间页（SPA）不会自动感知注销，刷新后见提示；③「结果：0 passed」假象为 FilesInNAS（SMB 同步目录）文件缓存陈旧所致，用标记行验证后确认实际 50/0，与代码无关。改动未提交（用户未要求）。

## 40. 回退注销墓碑：删除用户改为彻底删除（用户：回退至完全删除，清除所有信息）

- 需求：回退第 39 轮「注销（墓碑软删除）」——后台删除用户恢复为**彻底删除**，清除该用户所有信息（文章级联删除）。
- 后端回退：
  - server/src/routes/admin.js：DELETE /admin/users/:id 改回硬删除——`DELETE FROM users WHERE id = ?`，404「用户不存在」，成功返回 `{ok:true}`；移除 `?purge=1` 参数与全部墓碑逻辑（不再有「已注销用户」状态）。
  - server/src/routes/space.js：移除 `deleted:true` 响应字段与 deleted 分支；无用户/disabled 仍 404。
  - server/src/db.js：users.status 回退为 `ENUM('active','disabled')`（SCHEMA_SQL + 启动迁移：先 `DELETE FROM users WHERE status='deleted'` 清历史墓碑行，再 MODIFY 枚举，已迁移则忽略）。
- 前端回退：
  - web/src/views/AdminView.vue：「注销」按钮改回「删除」，confirm 文案「删除后该用户的所有信息将被清除，其文章将一并删除，且不可恢复」，成功后列表移除该行；移除 deleted 行的灰色/「（已注销）」/「—」/灰色 pill 等全部墓碑 UI 与 `.pill.deleted`/`.u-name.tomb` CSS；AdminUser.status 类型回退为 `'active' | 'disabled'`。
  - web/src/views/SpaceView.vue：移除墓碑提示条与 `tombstoned` ref；missing 文案改回「该用户不存在」；编辑按钮恢复 `v-if="isSelf"`。
- 测试：server/scripts/smoke-admin.mjs 删除段改回硬删除语义（删除 200、重复删除 404、删除后空间 404、已删登录 401、原邮箱可重新注册 201；清理段去掉 `?purge=1`）。
- 验证：smoke-admin **48/0**、smoke-auth 13/0、smoke-articles 22/0、e2e-mail-tpl 17/0；`npm run build` 0 错误（AdminView 21.13kB）。线上库实测：`status` 枚举已回退为 `enum('active','disabled')`、墓碑存量行 0。
- 备注：改动未提交（用户未要求）。

## 41. Bug 修复：批量删除验证 + 邮件模板丢失（用户报告：删除有时不成功 / 自定义模板丢失）

- 用户报告两个问题：①「删除用户时有时有些用户未删除成功（刷新后再次出现）」；②「非验证码邮件的自定义模板似乎会在某些情况下丢失」。
- 问题 ① 结论：**当前删除逻辑无缺陷，批量删除实测全部成功**——一次性脚本创建 12 个用户 → 逐个 DELETE 全部 200 → 12/12 从管理列表消失、空间 404、登录 401；库中 `users` 仅剩 `active` 状态。「刷新后再次出现」最可能发生在第 39 轮「注销（软删除）」期间：注销后用户仍留在列表中（灰色「已注销」状态），观感即「没删掉、刷新又出现」；第 40 轮已回退硬删除，该现象随之消除。
- 问题 ② 根因确定：**server/scripts/e2e-mail-tpl.mjs 每次运行都会把用户自定义模板覆盖并置空，且不还原**——第 8 步「恢复默认（置空）」只验证回退语义，未恢复测试前的原值。第 36~40 轮每轮回归都跑一次该脚本，用户当时设置的自定义模板被反复清空。修复：
  - 脚本开头备份 6 个模板键（`mail_code_subject/body`、`mail_welcome_subject/body`、`mail_test_subject/body`，GET 返回真实值非掩码）；第 8 步先置空验证「回退内置默认」语义，随后 **PUT 还原测试前原值并 GET 断言一致**——跑测试不再破坏用户配置。
  - 顺带修复：登录密码改 `process.env.SB_ADMIN_PASSWORD || '123456'`（原硬编码 `shimmer-admin` 在改密后已失效）。
  - server/scripts/smoke-articles.mjs 同步修复登录密码（同因失效，导致 admin 置顶 6 用例失败）。
- 前端加固（web/src/views/AdminView.vue）：新增 `settingsReady` 标志，bootstrap 拉取配置成功后才置 true；`saveSettings` 在未加载完成时阻止提交并提示「配置尚未加载完成，请刷新页面后再保存」——防止后端不可达时以空表单覆盖线上配置。
- 验证：e2e-mail-tpl **19/0**（新增「还原原值」「模板键已还原为测试前原值」2 项）、smoke-admin 48/0、smoke-auth 13/0、smoke-articles 22/0；`npm run build` 0 错误（AdminView 21.23kB）；测试用户已清理（cleanup-e2e-user.mjs）。
- 备注：改动未提交（用户未要求）。

## 42. 页脚小字可自定义（用户 m00976）

- 需求：关于页面底部的小字（原硬编码 `© {年份} {站点标题} · ShimmerBlog`）允许后台修改。
- 后端（server/src/services/settings.js）：
  - DEFAULTS 新增 `footer_text`（空 = 内置默认，顺带进入 setSettings 白名单）。
  - 新增 `renderFooter(raw, siteTitle)`：占位符 `{year}`→当前年份、`{site}`→站点标题；`publicSiteInfo()` 响应新增 `footerText`（后端渲染完成，前端直接显示）。
- 前端：
  - web/src/stores/site.ts：`SiteInfo` 接口加 `footerText: string`，state 兜底默认（后端不可用时显示内置文案）。
  - web/src/views/AboutView.vue：footer 改渲染 `site.info.footerText`；删除不再使用的 `year` 常量。
  - web/src/views/AdminView.vue：「站点」页新增「页脚小字」输入框（placeholder 提示默认值与占位符写法），随站点设置一并保存（saveSettings keys + bootstrap 回填）。
- 测试：server/scripts/smoke-admin.mjs /site 键存在性加 `footerText`；站点配置段新增 3 项——自定义文案+`{year}` 渲染正确、置空回退内置默认（`{site}` 取当前站点标题）、测后还原测试前原值（恢复现场纪律）。
- 验证：smoke-admin **51/0**、smoke-auth 13/0、smoke-articles 22/0、e2e-mail-tpl 19/0；`npm run build` 0 错误（AdminView 21.54kB）。后端已重启（health ok）。
- 备注：改动未提交（用户未要求）。

## 43. 回退页脚小字改关于页副标题 + 修复「已删用户又出现」（测试残留自清理）

- 背景：用户指出第 42 轮理解错位置——要改的不是关于页底部页脚，而是标题「关于」下方的小字「一个会发光的角落」；同时报告「刚删除的部分用户刷新后又出现」。
- 回退 footer_text 全链路（第 42 轮）：server/src/services/settings.js 删 `footer_text` 默认项与 `renderFooter()`，`publicSiteInfo` 改回不含 footerText；web/src/stores/site.ts `SiteInfo` 删 `footerText`；web/src/views/AboutView.vue footer 恢复硬编码 `© {{ year }} {{ site.info.title }} · ShimmerBlog`（加回 `year` 常量）；web/src/views/AdminView.vue 删「页脚小字」输入框（siteForm/saveSettings keys/bootstrap 回填四处）。库内 `settings` 表 `footer_text` 残留行已清理。
- 新增关于页副标题：settings.js `DEFAULTS` 加 `about_subtitle: '一个会发光的角落'`（`setSettings` 白名单自动生效），`publicSiteInfo` 返回 `aboutSubtitle`（空值回退内置文案）；AboutView 标题下小字改渲染 `site.info.aboutSubtitle`；site.ts `SiteInfo.aboutSubtitle`（兜底同默认）；AdminView「站点」页新增「关于页副标题」输入框（留空用默认），随站点设置一并保存。
- 「已删用户又出现」根因：**不是删除缺陷，是测试脚本每轮回归重建同名用户且不自清理**——smoke-auth.mjs 留 `tester-*`（改名「改名后的用户」）与 `magic-*`、smoke-articles.mjs 留 `writerA_*/writerB_*`、e2e-mail-tpl.mjs 留 `e2e-welcome-*`；用户删掉后下一次回归又出现同名新账号。第 41 轮批量删除实测 12/12 消失的结论仍成立（后端硬删除无缺陷）。当场清理库内 5 个残留（id 199–203），现库仅剩 admin。
- 修复（测试脚本自清理纪律）：smoke-auth.mjs 结尾 SQL 删除 `MAIL`/`magicMail` 用户；smoke-articles.mjs 结尾经 `/auth/me` 取 id 后用 admin API 删除 writerA/B（+2 项）；e2e-mail-tpl.mjs 还原模板后用 admin API 删除注册的 e2e 用户（+1 项）；smoke-admin.mjs 清理列表原已完备。新增 server/scripts/cleanup-test-users.mjs 兜底清理脚本（按邮箱后缀 `@test.local`/`@shimmer.dev`/`e2e-welcome-` 前缀批量删除，文章随外键级联）。
- 验证：smoke-admin **51/0**（页脚 3 项改关于页副标题 3 项：自定义生效/置空回退默认/还原原值）、smoke-auth 13/0、smoke-articles **24/0**、e2e-mail-tpl **20/0**（含「清理 e2e 测试用户」）；全量回归跑完后 `cleanup-test-users.mjs` 报「无测试残留用户」（自清理生效，不再污染生产库）；`npm run build` 0 错误（AdminView 21.56kB）。后端已重启（health ok）。
- 备注：改动未提交（用户未要求）。
- 补充（同轮）：应用户要求移除顶栏「后台」入口按钮（web/src/components/TopBar.vue 删 router-link 及 .admin-link 样式）；/admin 路由保留，直接访问 URL 仍可进入后台。build 0 错误（1.23s）。
- 补充（第 43 轮）：修复「从文章页返回首页后标签页标题仍停留为文章标题」——原实现只在 ArticleView 里 `document.title = 文章标题 · 微光博客`，离开时无人复位。新增 web/src/utils/title.ts 统一管理标题状态（`siteName` + `currentArticle`，无依赖避免循环引用）：site.ts 拉到 `/site` 后 `setSiteName(data.title)` 替代直接写 document.title；ArticleView 加载完成改调 `setArticleTitle(title)`；router/index.ts `afterEach` 调 `setArticleTitle(null)` 复位为站点默认标题。文章页仍显示「文章标题 · 站点标题」，其他页面显示后台配置的站点标题。build 0 错误（1.22s）。
- 补充（第 43 轮）：应用户要求**全站只去背景模糊、保留半透明底色**——先在 ArticleView `.sheet` 局部覆盖，随后改为全局：`web/src/styles/tokens.css` 的 `--glass-blur` 由 `blur(18px) saturate(140%)` 改为 `none`，所有 `.glass` 卡片（关于页/控制台/编辑器/App 浮层）与 `.topbar`（用 `--glass-blur`）一次性生效，半透明底色 `--glass-bg`/`--glass-bg-strong` 与边框圆角全部保留；ArticleView 的局部 `backdrop-filter: none` 已移除（不再需要）。构建产物 CSS 内除 AdminView 弹层遮罩 `blur(3px)`（模态背景虚化，非卡片）外已无任何 blur。build 0 错误（1.47s）。
- 补充（第 43 轮）：控制台三处 UI 修正（web/src/views/ConsoleView.vue）——①文章列表状态圆点左侧被裁：`.row-main` 的 `overflow: hidden` 在圆点（7px，`box-shadow: 0 0 8px` 光晕）左边缘处裁掉光晕，加 `padding-left: 10px; margin-left: -10px`（padding 反向 offset，裁剪盒左移 10px 而内容位置不变）留出光晕余量；②页签「我的文章/个人资料」补 hover 态 `.tabs button:hover:not(.on) { color: var(--text); background: rgba(140,198,226,.12) }`，与顶栏「首页/关于」`.nav-link:hover` 完全一致；③「＋ 新建文章」不随悬停上移：全局 `.btn:hover:not(:disabled)` 有 `transform: translateY(-1px)`，控制台局部 `.toolbar .btn:hover { transform: none }` 覆盖（scoped 特异性 0,4,0 > 0,3,0）。build 0 错误（1.27s）。
- 补充（第 43 轮）：首页文章列表改为**滚动到底部自动加载**，删除「加载更多」按钮（web/src/views/HomeView.vue）——①列表尾部放滚动哨兵 `.sentinel`，`IntersectionObserver`（`rootMargin: '400px 0px'` 提前预加载）进入视口即 `loadMore()`；②`onMounted` 先 `await fetchPage(1)` 再 `await nextTick()` 后才 observe 哨兵（`v-if="articles.length"` 的首屏渲染时序，不 nextTick 会拿到 null）；③`onBeforeUnmount` disconnect 避免路由切换后泄漏；④页码语义改「已成功加载的页码」（`page` 初值 0，成功后 `page.value = p`），失败不推进页码、不整页报错——首屏失败仍整页占位，后续页失败只在尾部显示「加载失败，点击重试」并保留已加载列表；⑤全部加载完显示「— 已经到底啦 —」；⑥`hasMore + loading` 双重防重入。补充：尾部状态提示常显——加载中显示渐变文字 + 旋转 `.spinner`（`@keyframes spin`，13px 圈，`border-top-color: var(--accent)`）「正在加载…」；可继续加载但空闲时显示淡字「继续上滑加载更多」；失败改为小字「加载失败，点击此处重试」——整句 `.sentinel-text.failed`（13.5px 淡红 `rgba(255,155,155,.7)`）只作说明，仅「此处」为可点击的 `<button class="inline-link">`（`padding:0/border:none/background:none/font:inherit` + `color:#ff9b9b` 下划线，hover `#ffd0d0`）；到底显示「— 已经到底啦 —」。build 0 错误（1.84s，确认 keyframes 被 scoped 重写为 `spin-*` 且与 animation 引用一致）。
- 补充（第 43 轮）：前台页脚 + 首页列表收尾——①新增 `web/src/components/SiteFooter.vue`：居中页脚，「蜀ICP备2025165930号」链接到 https://beian.miit.gov.cn/（`target="_blank" rel="noopener noreferrer"`）+「Copyright © 2025 ~ {今年} ZiYi.」（起始 2025，结束年份跟随当前年份，参考 www 站点写法）；字号 12.5px、淡蓝灰 `rgba(205,226,238,.35)`、hover 变 `--accent`、Arial 字体（与备案号常见做法一致）。③页脚背景与 www 项目 `.beian-box` 保持一致——整条深灰半透明底带：`.site-footer { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; width:100%; padding:10px 22px; background-color: rgba(46,46,46,.5) }`（原胶囊底方案已弃用）；文字 13px Arial、`color:#ababab`、无下划线，项间距 `margin-left:20px`（首项 `margin-left:0` 保证视觉居中）。⑤（后续调整）页脚改为整条与 www `.beian-box` 同款深灰底带（`.site-footer { height: 52px; padding: 0 22px; background-color: rgba(46,46,46,.5) }`，去掉胶囊底与 `--glass-border`）；hover 色 `#c3c3c3`。⑥后台同样显示页脚：`SiteFooter` 增 `tone` prop（`dark` 前台 / `light` 后台 `#eef2f9` 底 + `border-top: 1px solid #e4eaf4`、文字 `#8290a8`、hover `#5b6b86`），`App.vue` 去掉 `v-if` 改为 `:tone="route.name === 'admin' ? 'light' : 'dark'"`；后台页脚改为「内容列内贴底」而非全站底带（用户反馈左侧菜单下方不该空出页脚区域 + 登录页刷新会闪过后台内容）：①`App.vue` 恢复 `v-if="route.name !== 'admin'"`，后台页脚由 AdminView 自己渲染；②AdminView 结构改为 `.shell`（`min-height: 100vh`）内 `<aside class="side">`（`height: 100vh`，直达视口底部）+ `<div class="main-col">`（`flex:1; min-width:0; display:flex; flex-direction:column`）包住 `<main class="main">`（`flex:1`）与 `<SiteFooter tone="light" />`，页脚只占内容列宽度、贴内容列底部；③登录门改为 `.gate-col`（`min-height:100vh; flex-direction:column`）+ `.gate { flex: 1 0 auto }` + 页脚，卡片垂直居中、页脚贴视口底；④修登录页闪内容：新增 `booting = ref(!!admin.token && !admin.checked)`，模板 `v-if="booting"` 显示「正在验证登录状态…」（`.boot` 全屏居中），登录门改 `v-else-if="!admin.authed"`；`onMounted` 改为先 `await admin.check()` → `booting.value = false` → 未登录直接 return，已登录才 `bootstrap()`/`loadUsers()`/`loadArticles()`（原先直接 bootstrap，过期令牌会先渲染整个后台再弹回登录门）。④备案链接 hover 只「稍稍变亮」：`a.footer-text.link:hover { color: rgba(205,226,238,.58) }`（原为 `var(--accent)` 跳色过强）。②`App.vue` 结构改为 `.app-root`（`display: flex; flex-direction: column; min-height: 100vh`）包住 `.app-shell`（`flex: 1 0 auto`）与页脚，短页面时页脚贴底、长页面时自然跟随；`/admin` 路由不渲染页脚（与 TopBar/StarField 一致）；页脚 `position: relative; z-index: 1` 保证在星空之上。③首页删除「— 已经到底啦 —」提示（模板 + `.end-hint` 样式一并移除），加载状态仍由尾部哨兵提示。build 0 错误（1.41s）。
- 补充（第 44 轮）：①**刷新深链闪首页修复**——`web/src/main.ts` 原来在路由尚未解析时 `app.mount('#app')`，刷新 `/admin` 会先按 `'/''` 渲染 `HomeView` 再跳转，表现为「登录页短暂出现主页内容」。改为 `Promise.allSettled([router.isReady(), useSiteStore(pinia).fetch()]).finally(() => app.mount('#app'))`，用户信息交给 `router.beforeEach` 里的 `auth.fetchMe()`（移除 main.ts 中重复的 `useAuthStore` 导入与调用）。②**悬停过渡补齐**（原来只有 hover 变色、没有 transition，视觉上「直接变化」）：`App.vue` `.btn` 的 `transition` 补 `background 0.2s`（`.btn:hover` 改的是 background，此前只过渡 filter/transform）、`.btn-danger` 新增 `transition: background .2s, border-color .2s, color .2s`；`ConsoleView.vue` 的 `.back`（← 回到首页）、`.row-title a`、`.link-btn`、`.space-link` 各加 `transition: color 0.2s`；`AdminView.vue` `.tbl a` 加 `transition: color 0.15s`；`ArticleView.vue` 正文链接 `.prose :deep(a)` 加 `transition: color .2s, border-color .2s`（ArticleView 的 `.back` 原本已有 transition；`a.author:hover` 只改 text-decoration，不涉及过渡）。build 0 错误。
- 补充（第 44 轮续）：**后台登录页黑闪修复**——根因是首屏底色写死在全局 CSS（`body { background: #000 }`），且 `main.ts` 等 `router.isReady()` + 站点配置请求完成后才挂载，这段「未挂载」窗口在 `/admin` 下就是一片纯黑。①`web/index.html` 加内联首屏样式与判断脚本（早于样式包加载）：`html, body { background:#000 }`，`/admin` 时给 `<html>` 加 `admin-route` 类 → `html.admin-route, html.admin-route body { background:#f4f7fc }`；②`router/index.ts` 的 `afterEach` 同步 `document.documentElement.classList.toggle('admin-route', to.name === 'admin')`，保证 SPA 切页时底色随之切换（前台仍是黑底）。build 0 错误，产物 `dist/index.html` 已含内联样式与判断脚本。

## 44. 注册需邮箱验证 + 顶栏/登录页/页脚风格统一（用户：注册需要验证邮箱）

- 背景：用户要求「注册需要验证邮箱」。此前 `POST /api/auth/register` 直接建号并返回 token，账号 `email_verified=0`，验证码仅用于登录/找回密码，注册环节完全没有校验邮箱归属。
- 后端（server/src/routes/auth.js）：①`POST /api/auth/send-code` 支持 `purpose=register`（`const purpose = rawPurpose === 'reset' ? 'reset' : rawPurpose === 'register' ? 'register' : 'login'`），该分支先查 `users` 是否已占用邮箱，占用直接 409「该邮箱已注册」，避免白发一封邮件；②`POST /api/auth/register` 新增必需字段 `code`，校验顺序为「注册开关 → 邮箱格式 → 密码长度 → 邮箱是否已注册(409) → 验证码格式(400「请先获取并填写邮箱验证码」) → 验证码查库(email_codes purpose='register'、未使用、未过期；失败 401「验证码错误或已过期」)」，校验通过后 `UPDATE email_codes SET used = 1` 并 `INSERT INTO users (..., email_verified) VALUES (..., 1)`——建号即为已验证状态。
- 邮箱归一化：register 内部改 `const mail = String(email).toLowerCase()` 并用 `mail` 做存在性检查与入库，与 send-code 的 lowercase 取码保持一致（此前直接用原始大小写）。
- 后端未加「未验证禁止密码登录」闸门：库内 `zy@xiaoziyi.com`(id 217) 是历史遗留 `email_verified=0` 账号，加闸会把他锁在门外；新注册账号一律已验证，`email_verified=0` 只会出现在后台改邮箱后（用户用验证码登录即自动置 1）。
- 前端（web/src/views/LoginView.vue）：注册 tab 在「昵称」后新增「邮箱验证码」字段（`form.code`，6 位数字、`autocomplete="one-time-code"`）+ 复用 `.code-row` 的「发送验证码」按钮与倒计时；`sendCode()` 按当前模式决定 purpose（`mode === 'register' ? 'register' : 'reset'`），提示文案改为「请先填写邮箱」；`switchMode` 切到 register 时清空 `form.code`；提交体加 `code: form.code`，提交按钮文案「注册并登录」→「验证并注册」；新增 `.hint-tip` 小字「注册需先验证邮箱：点击发送验证码，10 分钟内有效」。
- 测试脚本：新增 `server/scripts/_test-lib.mjs`，导出 `latestCode(email, purpose)`（mysql2 独立连接，用完即 `end()`，不残留句柄）与 `registerUser(apiBase, { email, password, name })`（发注册码 → 优先用 `devCode` → 否则查库取码 → 带码注册，返回 `{ status, data }`）。改写调用点：smoke-auth.mjs 改为「发码 → 无码 400 → 错码 401 → 带码 201 → 断言 `email_verified=true`」四段（`dup register 409` 无须验证码，因存在性检查在验证码检查之前）；smoke-admin.mjs 三处建号、smoke-articles.mjs 的 `register()`、e2e-mail-tpl.mjs 的欢迎邮件注册全部改走 `registerUser`；smoke-admin 的「关闭注册后注册 403」保留原始 `req`（403 在验证码检查之前返回，不需要发码）。
- 验证：smoke-auth **17/0**（13 → +4）、smoke-admin **51/0**、smoke-articles **24/0**、e2e-mail-tpl **20/0**；`cleanup-test-users.mjs` 报「无测试残留用户（剩余 2 个：admin 与站长账号）」；`npm run build` 0 错误。后端已重启（health ok）。
- 同轮 UI 收尾（此前若干用户指令，一并记录）：①顶栏「登录」按钮由「浅蓝实心+深色字」改为与用户胶囊同一套玻璃蓝（`rgba(140,198,226,.26)` 底 / 同值描边 / hover `.38`+`.45`，无阴影无位移），成为顶栏唯一较亮的主行动入口；②删除顶栏「退出」按钮（连 `.btn-logout` 样式与窄屏让位规则一并移除），退出登录只在控制台「个人资料」页；③`.form-actions .logout` 补 `transition: color/background/border-color .25s`（此前只过渡 background，红字与边框瞬间跳变）；④「更换头像」`.upload-chip` 加 hover（文字 `--text`、底 `rgba(140,198,226,.14)`、虚线边框提亮）与 0.25s 过渡；⑤登录页 `.panel` 统一到站内卡片：`var(--glass-bg)` 底 + `var(--glass-border)` 描边 + `var(--radius-lg)`，GitHub 按钮改 `var(--fill)` / hover `var(--fill-hover)`（此前是自定义 `rgb(10 18 28 / 92%)` 深色面板，因第 43 轮全局去模糊而显得没有背景）；⑥全站 `.btn:hover` 去掉 `translateY(-1px)` 上浮，只保留底色变化；⑦前台页脚改为与 www 站点 `.beian-box` 同款整条深灰底带（`height:52px; padding:0 22px; background-color: rgba(46,46,46,.5)`），备案链接 hover 仅微亮到 `#c3c3c3`；后台页脚 `tone="light"` 贴内容列底部。

## 45. GitHub Actions 自动部署到 192（宝塔）+ 后端托管前端 SPA

- 背景：用户要求「新增 GitHub Action 部署流程，自动部署项目至 ssh 192 的 `/www/wwwroot/ShimmerBlog`」；该机为宝塔面板服务器，操作需先通知。目标机实测：`192.140.166.198`（Ubuntu 24.04）、node v24.19.0 / npm 11.17.0、rsync 3.2.7、MySQL 8.0.46 运行中、`/www/wwwroot/ShimmerBlog` 原本为空、3010 端口空闲；宝塔现有 Node 项目 `homework_time`/`PairDrop` 的重启机制是 `/www/server/nodejs/vhost/scripts/<项目名>.sh`（`nohup npm run start`）+ `pids/<项目名>.pid`。
- 新增 `.github/workflows/deploy.yml`（`push: branches [main]` + `workflow_dispatch`，`concurrency: deploy-production`）：构建 `web` → `rsync --delete` 后端源码（排除 `.env`、`node_modules/`、`uploads/*`、`*.log`）与 `web/dist` 到服务器 → 远端 `npm ci --omit=dev` + `chown -R www:www` → 先 kill pid 文件进程再用 `fuser -k 3010/tcp` 兜底 → 执行宝塔启动脚本（不存在则 `nohup npm run start` 兜底）→ `curl /api/health` 重试 30 次（失败打印最近 40 行日志并非零退出）。顶层 `env` 集中参数：`DEPLOY_PATH=/www/wwwroot/ShimmerBlog`、`NODE_PROJECT=ShimmerBlog`、`APP_PORT=3010`。
- Secrets 用 `gh secret set`（`gh` 已登录 `zuishuai-ziyi`，含 `workflow` scope；仓库 Actions 权限 `enabled: true`）写入 4 项：`SSH_HOST`/`SSH_PORT`/`SSH_USER`/`SSH_PRIVATE_KEY`（`~/.ssh/192.140.166.198_id_ed25519`）。仓库内不含任何私钥、密码，`.env` 已在 `.gitignore`。
- **架构调整（用户反馈触发）**：宝塔不支持「部分 URL 反代」也「不支持反代到静态文件」，只支持整站反代到已有 Web 服务 → 改为**后端托管前端**：`server/src/app.js` 新增 `distDir`（`process.env.WEB_DIST` 优先，否则 `path.resolve(server/src, '../../web/dist')`）、`express.static(distDir, { index: false })` + SPA history 回退中间件（仅 GET/HEAD，且跳过 `/api`、`/uploads` 前缀）、缓存策略（`/assets/**` → `public, max-age=31536000, immutable`；`index.html` → `no-cache`；其余 1h）、启动日志「前端静态托管已开启: <dir>」或「未找到前端构建产物（<dir>），仅提供 API」。`server/.env.example` 增 `WEB_DIST=` 注释项。这样宝塔「Node 项目」自动生成的整站反代站点即可同时服务 API 与页面，单端口 3010。
- 服务器侧一次性准备（已执行并验证）：`mkdir -p server/uploads/{avatars,images} web/dist` → rsync 源码与 dist → 生成 `/www/wwwroot/ShimmerBlog/server/.env`（`PORT=3010`、`openssl rand -hex 32` 现生成 `JWT_SECRET`、`DB_*=shimmerblog`、`ADMIN_PASSWORD=123456`，`chmod 600`，不入库）→ `npm ci --omit=dev`（12M）→ 权限收敛（目录 755、文件 644、`.env` 600）→ 试启动验证后停止（`fuser -k 3010/tcp`）。
- 验证：本地 `npm run build` 0 错误（1.49s，AdminView 21.78kB）；本地后端重启后 `GET /` → 200 且 `Cache-Control: no-cache`、`/about` → 200（SPA 回退）、`/article/123` → 200、`/api/nope` → 404 `{"error":"接口不存在"}`、`POST /some-post` → 404（非 GET 不回退）、`/uploads/none.png` → 404、`assets/index-*.js` → `Cache-Control: public, max-age=31536000, immutable`。服务器侧实测：`/api/health` → `{"ok":true,"db":true}`、建表成功 `articles,email_codes,settings,users`、`settings` 1 行（管理密码哈希）、`/` → 200（1105B index.html）、`/article/1` → 200、`/api/nope` → JSON 404。
- 备注：workflow 与 README「部署（GitHub Actions 自动部署）」节已写好但**暂未提交/推送**（用户先将建宝塔 Node 项目，避免首次部署与建项目抢 3010）；域名 `blog.xiaoziyi.com` 用户自行绑定。
- #lesson：远端 heredoc 里 `nohup node ... &` + `kill $!` 不一定杀得掉（本次留下旧实例占着 3010，导致新代码的静态托管看起来「没生效」）——停服一律用 `fuser -k 3010/tcp`，并用进程启动日志确认执行的是哪份代码。

## 46. 线上站点配置同步本地（用户/文章不同步）

- 前置对比：线上 `/www/wwwroot/ShimmerBlog` 库里 `settings` 只有 1 行（`admin_password_hash`，由 `ADMIN_PASSWORD` 种子写入），其余全是内置默认；本地 `settings` 24 行（站点文案、`about_subtitle`、邮件模板 `mail_code_*`、SMTP 六项、`register_open`、`web_origin` 等）。因此「同步」按用户确认的方向取 **本地 → 线上**，用户表与文章表一动未动。
- 做法（全程不把密钥打进对话/日志）：本地用 `mysql2` + `dotenv` 导出 `settings`（排除 `admin_password_hash`）为 JSON（`mode 0o600`）→ `scp` 到服务器 `/tmp` → 服务器上跑导入脚本逐项 `INSERT ... ON DUPLICATE KEY UPDATE value = VALUES(value)` → 单独把 `web_origin` 纠正为 `https://blog.xiaoziyi.com`（本地是 `http://localhost:5180`）→ 删除服务器与本地的临时文件。
- 校验：两边各导出 23 个键的 `md5` 指纹做 `diff`，**仅 `web_origin` 不同**（预期），`smtp_pass`/`github_client_secret` 指纹一致（说明未截断、未变形）；导入后 `settings` 24 行、`users` 0、`articles` 0。线上试启动 `GET /api/site` 返回与本地一致的站点信息（`微光博客` / `追光的人，终会光芒万丈` / `一个会发光的角落`），`/api/health` → `{"ok":true,"db":true}`，验证后 `fuser -k 3010/tcp` 停服。
- 备注：线上 `admin_password_hash` 保留服务器自己种子写入的值（两边都是 `123456`，不覆盖）；改动均为服务器侧数据，不涉及仓库文件。

## 47. 首次 GitHub Actions 自动部署跑通

- 用户在宝塔建好 Node 项目（名称 `ShimmerBlog`、启动文件 `index.js`、端口 3010）后，推送 `ccd37d2`（feat: GitHub Actions 自动部署 + Node 单端口托管前端）触发首次部署：run `40149174339`，**50 秒内全部步骤成功**（检出 → 构建前端 → SSH → rsync 后端 → rsync 前端产物 → `npm ci --omit=dev` + 停旧进程 + 宝塔启动脚本 → 健康检查）。
- 线上验证（`192.140.166.198:3010`）：
  - `GET /api/health` → `{"ok":true,"db":true}`
  - `GET /` → 200 `text/html`，`<title>微光博客</title>`，1105 B
  - `GET /about`（深链）→ 200 且返回 `#app` 容器（SPA 回退生效）
  - `GET /assets/index-*.js` → 200，`cache-control: public, max-age=31536000, immutable`
  - `GET /api/nope` → 404（不会把 API 404 变成 index.html）
  - `server/.env` 仍是 `-rw------- www www`（rsync 排除项生效，未被覆盖）；`server/uploads/{avatars,images}` 保留
- 配置对账（部署后）：线上与本地 settings 仍 23 键一致，差异只有 `web_origin`（线上 `https://blog.xiaoziyi.com`）与 `mail_welcome_subject/body`（用户随后在线上后台自行填写，16:33Z）；`users`/`articles` 未同步。
- 备注：Actions 提示 `actions/checkout@v4`、`actions/setup-node@v4` 的 Node 20 已弃用（被强制跑在 Node 24 上），不影响功能，后续可升到 v5。域名 `blog.xiaoziyi.com` 待用户在宝塔绑定（站点反代到 `127.0.0.1:3010`）。
### 部署拓扑（实测确认）

- 宝塔「Node 项目」生成的 nginx 站点：`/www/server/panel/vhost/nginx/node_ShimmerBlog.conf` → `listen 81` + `server_name blog.xiaoziyi.com` + `location / { proxy_pass http://127.0.0.1:3010; }`。
- Node 进程监听 `*:3010`（`node src/index.js`，宝塔用 `v26.7.0` 的 npm 启动，脚本 `/www/server/nodejs/vhost/scripts/ShimmerBlog.sh`、pid `/www/server/nodejs/vhost/pids/ShimmerBlog.pid`、日志 `/www/wwwlogs/nodejs/ShimmerBlog.log`）。
- 因此线上访问链路：**域名 → nginx :81 → 反代 127.0.0.1:3010（Express 同时给 API 与 `web/dist`）**。
- 验证方式：`curl -H "Host: blog.xiaoziyi.com" http://192.140.166.198:81/` → 200 且返回 1105 B 的 SPA index（`<title>微光博客</title>`）、`/api/health` → `{"ok":true,"db":true}`、深链 `/about` → 200。不带 Host 头访问 IP:81 会落到 nginx 默认 server 而 404，属预期（`server_name` 只匹配域名）。
- 待用户在宝塔/域名侧完成（不涉及仓库）：①DNS A 记录 `blog.xiaoziyi.com → 192.140.166.198`；②站点绑定域名 + 申请 SSL；③80/443 目前被 `SamWafLinux64` 占用，需在 SamWaf 里加站点反代到 `127.0.0.1:81`（或调整端口占用）；④防火墙放行 80/443（3010 不必对外，已被 nginx 反代）。


## 48. 后台「第三方登录」管理 + Google OAuth 登录（登录页/注册页第三方按钮）

- 背景：用户要求「后台新增第三方登录管理功能，允许管理员使用 Web UI 直接管理第三方登录，如 Github 和 Google 登录」。此前 GitHub OAuth 只有后端实现，后台 UI 无任何配置入口（库里 `github_client_id/secret` 一直为空 → 登录页按钮从不显示）。
- 后端：
  - `users` 表新增 `google_id VARCHAR(255) NULL UNIQUE`（`SCHEMA_SQL` + `ensureColumn` 老库补列，启动时自动执行）。
  - `server/src/config.js` 新增 `google` 段（`GOOGLE_CLIENT_ID/SECRET` 环境变量）；`settings.js` `DEFAULTS` 新增 `google_client_id/secret` 两键（即写白名单），新增 `googleConfig()`（后台配置优先、环境变量兜底），`publicSiteInfo()` 增加 `googleEnabled`。
  - `server/src/routes/auth.js`：GitHub/Google 共用 state 池 `oauthStates` 与回调地址函数 `oauthCallbackUri(req, provider)`；抽出共用 `findOrCreateOAuthUser(providerCol, providerId, {email,name,avatar})`（按第三方 id 找老用户 → 按已验证邮箱并档 → 新建并 `email_verified=1`），GitHub 回调改走该函数（行为不变，邮箱额外 lowercase 归一）；新增 `GET /api/auth/google`（302 → `accounts.google.com/o/oauth2/v2/auth`，scope `openid email profile`）与 `GET /api/auth/google/callback`（token 端点 `oauth2.googleapis.com/token`，userinfo `openidconnect.googleapis.com/v1/userinfo`，只信 `email_verified=true` 的邮箱），成功后同样带 token 跳回 `web_origin/auth/callback`；未配置 501。
  - `server/src/routes/admin.js`：`GET/PUT /admin/settings` 支持掩码 `google_client_secret`（`__KEEP__`/空串不覆盖、`__CLEAR__` 清空），响应新增 `googleEnabled`。
- 前端：
  - `AdminView.vue` 新增「第三方登录」tab：GitHub / Google 两张卡片，各含生效状态（●/○）、回调地址提示（`window.location.origin` 自动区分本地/线上，附 GitHub/Google 控制台链接）、Client ID、Client Secret（密码框，已配置显示「留空保持不变」）；一次保存 4 键并同步 enabled 状态。用户列表第三方标记支持 `· Google`。
  - `LoginView.vue`：第三方区在任一 provider 启用时显示；按钮抽出公共样式 `.btn-third`（玻璃底胶囊，同 hover），新增 Google 四色 G logo 按钮，文案同样随登录/注册 tab 变化（「使用 Google 登录/注册」）。
  - `stores/site.ts` 增加 `googleEnabled`。
- 回归（本地后端 3010，Windows node）：smoke-admin **58/0**（新增 7 项：配置返回 enabled 字段、公开 /site 含 googleEnabled、google secret 掩码、id+secret 齐后 googleEnabled=true、/site 同步、/auth/google 302 → accounts.google.com、清理后回 false）；smoke-auth **19/0**（新增 google 501 与 callback bad state 400）；smoke-articles 24/0；e2e-mail-tpl 20/0；cleanup-test-users 无残留；`npm run build` 通过。
- 事故记录：本地 3010 被上一轮会话遗留的旧 node 进程（PID 32096，今晨 0:19 启动）占用，Windows 下新进程 bind 成功但流量仍进旧进程（`/api/site` 一直缺 `googleEnabled`）——与第 46 轮远端「残留进程占 3010」教训同款；杀掉旧进程重启后恢复。本地验证一律先 `Get-Process node` 查旧进程。
- 待办（需用户在控制台创建凭据，仓库侧已就绪）：GitHub OAuth App（callback `https://blog.xiaoziyi.com/api/auth/github/callback`）与 Google OAuth 客户端（redirect URI `.../api/auth/google/callback`），凭据直接填进后台「第三方登录」页即可上线。

## 49. 修复线上第三方登录「redirect_uri is not associated with this application」

- 现象：用户在 GitHub OAuth App 登记好回调地址并填入后台凭据后，GitHub 授权页报 `The redirect_uri is not associated with this application.`
- 根因：`server/src/routes/auth.js` 的 `oauthCallbackUri(req, provider)` 用 `req.protocol` + `req.get('host')` 拼 `redirect_uri`。线上链路为 nginx(:81) → `proxy_pass http://127.0.0.1:3010`，Express 未开 `trust proxy`、nginx 未传 `X-Forwarded-Proto`，因此发向 GitHub 的是 `http://blog.xiaoziyi.com/...`，与控制台登记的 `https://...` 协议不一致（GitHub/Google 均要求逐字匹配）。
- 修复：`redirect_uri` 改为从站点配置 `web_origin` 生成（`async oauthCallbackUri(provider)`，settings `web_origin` → env `WEB_ORIGIN` → 默认 `http://localhost:5180`），不再依赖请求头——线上恒为 `https://blog.xiaoziyi.com/api/auth/<provider>/callback`，本地恒为 `http://localhost:5180/...`（与 vite dev 同源，dev proxy 转发 `/api`）。4 处调用点（github 授权/换 token、google 授权/换 token）全部 `await`。
- 后台「第三方登录」页的回调地址提示同步改为展示 `web_origin` 拼接结果（装载配置前回退 `window.location.origin`），保证「提示的地址 = 后端实际发送的地址 = 控制台该填的地址」。
- 验证：本地临时配置 google 凭据 → `GET /api/auth/google` 302 Location 中 `redirect_uri=http://localhost:5180/api/auth/google/callback`（此前会拼成 `http://localhost:3010/...`，vite `changeOrigin` 改写 Host 所致）→ 清空还原 `googleEnabled=false`；smoke-auth **19/0**、smoke-admin **58/0**、smoke-articles 24/0、e2e-mail-tpl 20/0、cleanup 无残留、`npm run build` 通过。线上部署后复核 `/api/auth/github` 302 Location 的 `redirect_uri=https://blog.xiaoziyi.com/api/auth/github/callback`。
- 用户侧需保证：GitHub OAuth App 的 Authorization callback URL 与 Google「已获授权的重定向 URI」分别精确填写上述两个 `https://blog.xiaoziyi.com` 地址（协议、域名、路径、无尾斜杠）。

## 50. OAuth 出站代理（国内服务器可用 GitHub / Google 登录）

- 背景：用户要求「添加代理访问功能，使得国内服务器可以使用 Github 和 Google Auth」。国内服务器直连 `github.com` / `oauth2.googleapis.com` / `openidconnect.googleapis.com` 会被阻断，令牌换取与用户信息请求必然超时失败。
- 实现：
  - `server/package.json` 新增依赖 `undici`；`server/src/services/settings.js` `DEFAULTS` 新增 `oauth_proxy_url`（后台可配），新增 `oauthProxy()`（后台 → env `OAUTH_PROXY_URL` → 空 = 直连）。
  - `server/src/routes/auth.js` 新增 `oauthFetch(url, opts)`：配置了代理时给 fetch 附加 `dispatcher: ProxyAgent(proxy)`（按 URL 模块级缓存，后台改配置自动重建）；GitHub 换 token / `/user` / `/user/emails` 与 Google 换 token / userinfo 共 5 处出站请求全部改走 `oauthFetch`。授权 302 跳转由访客浏览器完成，不经代理。
  - `web/src/views/AdminView.vue`「第三方登录」页新增「出站代理（可选）」卡片：HTTP(S) 代理地址输入框 + 说明（仅作用于服务器侧请求；访客浏览器仍需能自行打开授权页）。
- 验证：本地配置 `oauth_proxy_url=http://127.0.0.1:7890` → GET /admin/settings 回读一致 → 清空回空；配代理状态下 `/auth/google` 授权跳转不受影响（302 由本地拼 URL，无出站请求）。回归 smoke-admin **61/0**（+3）、smoke-auth 19/0、smoke-articles 24/0、e2e-mail-tpl 20/0、cleanup 无残留、build 通过。
- 说明：代理只解决**服务器侧** API 访问。中国大陆访客浏览器访问 `accounts.google.com` 授权页仍需访客自备代理；GitHub 授权页国内一般可达。

## 51. 线上接入 VLESS 出站代理（sing-box 客户端）+ 服务器迁 IP 处置

- 背景：用户提供 sing-box VLESS 出站节点（vless + xtls-rprx-vision + reality，出口 77.93.157.132:35858），要求「使其支持下列代理」。应用侧 `oauth_proxy_url` 只认 HTTP(S) 代理（undici ProxyAgent），VLESS 需在服务器跑客户端转本地 HTTP 端口，应用无需改代码。
- 排障中发现：线上已迁机换 IP——`blog.xiaoziyi.com` A 记录由 192.140.166.198 改为 **198.20.0.9**（同一台雨云机 RainYun-HUmBvpUG，宝塔路径不变）。换 IP 重启后 node 3010 未自启，站点 502 → 已用 `bash /www/server/nodejs/vhost/scripts/ShimmerBlog.sh` 拉起并恢复。
- 服务器连通性实测：api.github.com 直连 200；oauth2.googleapis.com / accounts.google.com 直连 000（被墙）→ Google 登录必须走代理。
- 部署（root@198.20.0.9）：sing-box v1.14.4 linux-amd64（GitHub release 直连下载持续超时，改 Windows 本地下载后 scp）→ `/usr/local/bin/sing-box`；配置 `/etc/sing-box/client.json`（600，VLESS Reality 出站 + `mixed` inbound 127.0.0.1:2080，同端口 HTTP+SOCKS）；systemd `sing-box-client.service`（`sing-box check` 通过，`enable --now`，开机自启）。
- 代理链路验证：`curl -x http://127.0.0.1:2080` → api.github.com/zen 200、oauth2.googleapis.com/token 400（穿透）、accounts.google.com 302、api.github.com/user 401 JSON。
- 应用级 A/B 验证（admin 密码已非默认值，改走 MySQL 直写 settings + 重启 node）：
  - `oauth_proxy_url=http://127.0.0.1:2099`（错误端口）→ 假 code 打 `/api/auth/github/callback`（真 state）→ `{"error":"GitHub OAuth 处理失败","detail":"TypeError: fetch failed"}` → 证明应用确实走 `oauth_proxy_url`；
  - 改回 `http://127.0.0.1:2080` 重启 → 同样请求 → GitHub 真实响应 `bad_verification_code` → token 交换请求穿透 `node → ProxyAgent → sing-box:2080 → VLESS/Reality → 77 出口 → GitHub`。
- 线上配置落库：settings `oauth_proxy_url = http://127.0.0.1:2080`（GitHub/Google 出站统一走代理；授权 302 仍由访客浏览器完成）。
- 文档：README「第三方登录」节补 VLESS/Reality 用法（sing-box mixed 转本地端口）。代码零改动，无回归需求。

## 52. 登录页第三方区文案统一为「继续」

- 用户要求：登录 UI 文本改为「使用 xxx 继续」，提示文本改为「或使用以下方式继续」。
- `web/src/views/LoginView.vue`：分隔条 `或使用以下方式{{ mode === 'register' ? '注册' : '登录' }}` → 固定「或使用以下方式继续」；GitHub 按钮 `使用 GitHub {{...}}` → 固定「使用 GitHub 继续」；Google 按钮同理「使用 Google 继续」（不再随 tab 变化）。
- `npm run build` 通过。纯文案改动，无逻辑变化。

## 53. 删除关于页底部版权小字

- 用户要求：删除关于页面下方的小字「© 2026 微光博客 · ShimmerBlog」。
- `web/src/views/AboutView.vue`：删掉模板中 `<footer class="foot muted">© {{ year }} {{ site.info.title }} · ShimmerBlog</footer>`，连带清理不再使用的 `const year` 与 `.foot` 样式块（页脚版权仍由全局 `SiteFooter.vue` 提供，不受影响）。
- `npm run build` 通过。纯展示改动。

## 54. 主页文章卡作者名未应用自定义颜色

- 用户报告：主页的用户名自定义颜色似乎未生效。
- 根因：作者名自定义颜色在文章页（`ArticleView.vue`）、顶栏（`TopBar.vue`）、空间页（`SpaceView.vue`）、后台均已应用，但主页时间线用的 `ArticleCard.vue` 模板只渲染 `{{ article.author_name }}`，没绑定 `author_name_color`——列表接口（`server/src/routes/articles.js` 列表 SELECT）其实一直返回该字段，纯属前端漏绑。
- 修复：`web/src/components/ArticleCard.vue` 作者名 span 加 `:style="article.author_name_color ? { color: article.author_name_color } : undefined"`（与文章页同款写法）。`ArticleBrief` 类型本就含该字段，无类型/后端改动。
- 影响：主页时间线与归档页（`TimelineList.vue` 复用 ArticleCard）同步生效。`npm run build` 通过；本地 `/api/articles` 实测列表项含 `author_name_color` 字段。

## 55. 默认用户名颜色可配置（= 前端实际显示色）

- 用户要求：默认用户名颜色不设置为白色，而是前端实际显示的颜色；并允许后台设置用户默认颜色。
- 现状核实：卡片与文章页作者名实际显示 `var(--accent)` = `rgb(140 198 226)` = `#8cc6e2`（淡蓝），顶栏/空间页显示白色——「默认=白」与主要展示位不符。
- 实现（后端填充策略，前端渲染点零改动）：
  - `server/src/services/settings.js`：`DEFAULTS` + `default_name_color: '#8cc6e2'`，新增 `defaultNameColor()`（空值回退 `#8cc6e2`）。
  - `server/src/utils.js`：`publicUser` 改 async（`name_color: u.name_color || (await defaultNameColor())`）；新增 `applyDefaultNameColor(rows, key)` 批量填充列表空值。
  - `server/src/routes/auth.js`：7 处 `publicUser(...)` 补 `await`（`/me` 同步处理器改 async）。
  - `server/src/routes/articles.js`：`loadArticle` + 公开列表 + 我的文章 3 处填充 `author_name_color`；`server/src/routes/space.js` 空间资料填充 `name_color`；`server/src/routes/admin.js` 后台文章列表填充（后台用户列表保持原始值以区分「默认」）。
  - `server/src/routes/admin.js` PUT `/admin/settings`：`default_name_color` 格式校验（复用 `NAME_COLOR_RE`，无 `#` 自动补，空串=恢复内置默认）。
  - `web/src/views/AdminView.vue`：「用户管理」页新增「默认用户名颜色」设置行（取色器 + 保存，走 `saveSettings(['default_name_color'])`）；用户列表取色器对未自定义用户显示默认色、标签显示 `默认 #8cc6e2`；`setColor` 改为「与默认色相同 → 存 null（跟随默认）」（原为硬编码 `#ffffff`）。
- 回归：smoke-admin **73/0**（+12：保存回读/非法值 400/无#补#/注册响应回填/详情回填/空间资料回填/自定义色优先/删文删用户清理/还原）、smoke-auth 19/0、smoke-articles 24/0、e2e-mail-tpl 20/0、`npm run build` 通过。
- 排障记录：首轮 edit 调用中 `articles.js` 的 import+`loadArticle` 修改随同批另一条失败条目整批被拒，导致运行时 `applyDefaultNameColor is not defined`（`GET /articles` 500、测试详情回填 null）——补齐后全绿。#lesson：同文件多条 edit 原子生效，失败必须核对实际落盘内容。

## 56. 接入 GoCaptcha 行为验证码

- 用户要求：接入 [GoCaptcha](https://github.com/wenlng/go-captcha)（独立 go-captcha-service 项目，跑在应用同机、宝塔管理、域名 `go-captcha.xiaoziyi.com`）；保护登录、注册、发送重置密码邮件、发布文章、后台登录、上传图片、修改昵称及简介等高频操作。
- 架构：服务端独立部署（HTTP API，不进本仓库）；应用内配置三个键指向它——前端取题走 `captcha_api`（公网域名），后端二次校验走 `captcha_verify_api`（可选，同机可填内网地址）；`GET /api/site` 暴露 `captchaEnabled/captchaApi/captchaId`，前端未开启时零打扰。
- 后端：
  - 新增 `server/src/services/captcha.js`：`captchaConfig()`（enabled = 开关 + api 齐全）、`verifyCaptcha(payload)`（缺参 400「请完成行为验证」→ 进程内已消费集合拦截重放 400「验证已失效」→ `POST {base}/api/v1/public/check-data`（5s 超时）非 ok 400「验证未通过」→ 网络错误 **502 fail-closed**「验证码服务暂不可用」；成功即消费 key）、`captchaGuard` 中间件；payload 兼容对象（JSON 请求体）与 JSON 字符串（multipart 表单字段）。
  - `server/src/services/settings.js`：`DEFAULTS` + `captcha_enabled('0')/captcha_api('')/captcha_verify_api('')/captcha_id('click-default-ch')`；`publicSiteInfo` + `captchaEnabled/captchaApi/captchaId`。
  - 挂 `captchaGuard`：`auth.js` register / login（loginLimiter 后）/ login/code / send-code（codeLimiter 后）/ profile 共 5 处；`admin.js` POST /admin/login（adminLoginLimiter 后）；`articles.js` POST /（发文章）；`articles.js` POST /upload-image 为 multipart，在 multer 回调内先 `verifyCaptcha(req.body.captcha)` 再处理文件（字段为 JSON 串）。
  - `admin.js` PUT /admin/settings：`captcha_enabled` 布尔归一、`captcha_api/captcha_verify_api` http(s) 前缀校验（去尾斜杠）、`captcha_id` 非空校验；响应 + `captchaEnabled`。
  - 安全设计：go-captcha-service 的 check-data 成功后 key 保留至缓存 TTL（30 分钟）不删除，重放恒 ok——后端进程内消费集合（TTL 31 分钟定期清扫）保证一 key 一用。
- 前端：
  - 新依赖 `go-captcha-vue@^2.0.7`；新增 `web/src/components/CaptchaDialog.vue`：官方 Click 点选组件 + 站点同款 glass 风格弹窗，`v-model:open` + `action({key,value})`；confirm 时把点选坐标拼 `"x,y,..."` 提交，action 抛错则在弹窗内展示并自动换题（key 已消费）。
  - 接线 5 个视图：`LoginView.vue`（登录/注册提交 + 发送邮箱验证码，重置密码提交本身不保护）、`AdminView.vue`（后台登录门）、`ArticleEditor.vue`（仅新建文章 + 上传图片，编辑已有文章不打扰）、`ConsoleView.vue` / `SpaceView.vue`(修改昵称/简介)。全部「未启用 → 直接执行；启用 → 先弹窗验证再执行」。
  - `web/src/stores/site.ts` SiteInfo + 3 字段；AdminView「站点」页新增「行为验证码（GoCaptcha）」卡片（开关/服务地址/实例 ID/内部校验地址 + 独立保存按钮与生效状态提示）。
- 测试：新增 `server/scripts/smoke-captcha.mjs`（内置 mock go-captcha-service 127.0.0.1:9797，可切 ok/failure/down 三态）：**22/0**——/site 暴露字段、send-code/register 带 valid 码走通、login 缺码 400 / 错码 400 / 对码穿到密码层 401 / 一 key 重放 400、admin login 拦截与穿透、profile、发文章、上传图片（multipart 字符串入参）、服务不可用 502、配置还原。
- 回归：smoke-captcha **22/0**、smoke-auth 19/0、smoke-admin 73/0、smoke-articles 24/0、e2e-mail-tpl 20/0、cleanup 无残留、`npm run build` 通过。
- 服务器部署（198.20.0.9，宝塔 PM2 管理）：go-captcha-service v1.0.6 linux-amd64 → `/www/wwwroot/go-captcha-service/`（`config.json` 改 127.0.0.1:9700 仅本机监听、memory cache、CORS 开、600 属主 www——PM2 以 www 用户运行，root 属主会 permission denied 回落默认配置撞 8080 崩溃循环）；`ecosystem.config.js` 修正为 `script './go-captcha-service' + args '-config config.json -gocaptcha-config gocaptcha.json'`（官方模板指向 ./build/ 且用 redis，不匹配）；nginx 增补 vhost `node_go-captcha-service.conf`（listen 81，server_name go-captcha.xiaoziyi.com → proxy_pass 127.0.0.1:9700，SamWaf 443 统一入口转发）。
- 公网验证：`https://go-captcha.xiaoziyi.com/status/health` → 200 `{"code":200}`；`GET /api/v1/public/get-data?id=click-default-ch` → 200 出图（key + master/thumb base64）；`POST /api/v1/public/check-data` 可达。
- #lesson：multipart 场景 `req.body.captcha` 是字符串而非对象（express.json 不解析表单字段），verifyCaptcha 必须兼容两种入参——首轮 2 例 FAIL 即栽在这里。

## 57. 验证码体验修复：资料修改弹窗不显示 + 注册免二次验证

- 用户反馈：①修改个人资料无任何反应（验证码未弹出、无提示、保存未发出）；②注册流程要过两次验证码，体验差。
- 根因（①）：`ConsoleView.vue` / `SpaceView.vue` 的 `<CaptchaDialog>` 误放在条件分支内（ConsoleView 在「我的文章」tab 文章列表行内、SpaceView 在文章列表 `v-if` 分支内），切到资料编辑页时组件未挂载，`profileCaptchaOpen=true` 无效——弹窗不出现、报错无处显示、保存静默失败。修复：两组件的 CaptchaDialog 移到资料表单同级（始终挂载）。
- 体验改造（②，安全性不降）：
  - **信用制**：注册与魔法链接登录改为「发邮箱验证码时验一次码 → 提交凭信用免二次验证」。后端 `services/captcha.js` 新增 `grantCaptchaCredit/consumeCaptchaCredit`（key=`ip|email|purpose`，TTL 10 分钟，一次一用）与 `captchaOptionalGuard(purpose, getEmail)`：未启用放行；携带验证码必须验证通过（失败不影响信用）；无码吃信用，无信用 400 `{error:'请完成行为验证', code:'CAPTCHA_REQUIRED'}`。
  - **前端自动补验**：`web/src/api/http.ts` 新增 `isCaptchaRequired(e)`；`LoginView` 注册提交直接走免验路径，收到 `CAPTCHA_REQUIRED` 时自动弹验证码窗、验证后自动重提交；`ConsoleView`/`SpaceView` 资料保存同款 attempt-first（先直发，被风控拦时提示「检测到频繁修改，请完成安全验证」并弹窗）。
  - **资料修改风控**：`profile` 端点改为 authRequired + 内联风控——10 分钟窗口内前 2 次修改免验证（`profileEdits` Map 记录时间戳），超出频率要求验证码；带码请求直接验证（通过即放行且计入窗口）。正常用户改资料零打扰。
- 回归：smoke-captcha **30/0**（新增注册信用制 4 断言、login/code 免二次验证、profile 风控 6 断言；mock key 加时间戳防跨轮与服务端 consumed Map（31min TTL）碰撞）；smoke-auth 19/0、smoke-admin 73/0、smoke-articles 24/0、e2e-mail-tpl 20/0、cleanup 无残留、`npm run build` 通过。
- #lesson：①`<CaptchaDialog>` 这类弹窗组件必须挂在常驻容器里，放进 `v-if`/`v-else` 分支会随分支卸载，弹窗静默失效；②smoke 脚本 mock 的 key 若按轮内自增，多轮连跑会与服务端防重放缓存（TTL > 测试间隔）碰撞而级联失败——key 拼时间戳；③adminLoginLimiter（10 次/15 分钟/IP）会被反复跑测试耗尽，跑前重启本地 node 清内存限流。

## 58. 验证码弹窗体验优化（原生 dialog / 弹窗内结果 / 风控静默弹窗）

- 用户要求：①风控触发时不要显示「检测到频繁修改，请完成安全验证」，直接弹验证码窗；②弹窗提示文本改「请完成验证以继续」、标题统一「安全验证」；③弹窗打开时背景元素不可被 Tab 选中、页面不可滚动（建议用浏览器原生弹窗标识）；④点击空白区域不退出；⑤验证结果显示在弹窗内（下方小字），未通过直接刷新换题而非重试整个操作。
- 实现：
  - `web/src/components/CaptchaDialog.vue` 重构为原生 `<dialog>` + `showModal()`：焦点自动困在弹窗内（Tab 不会落到背景元素，浏览器 top layer）、页面滚动锁定（html overflow hidden，关闭恢复）、点击遮罩空白不关闭（无 backdrop 点击处理器；Esc/× 可关，`@close` 同步 `update:open`）；标题固定「安全验证」、副文案「请完成验证以继续」，移除 `title` prop。
  - 后端 `services/captcha.js` 错误响应统一带 `code`：缺参 `CAPTCHA_REQUIRED`、错码/失效 `CAPTCHA_FAILED`、服务不可用 `CAPTCHA_UNAVAILABLE`（captchaGuard 与 captchaOptionalGuard 携带验证码分支同步透出；code 仅为前端分流用的 UI 元数据，无安全语义变化）。
  - `web/src/api/http.ts` +`isCaptchaFailure(e)`（CAPTCHA_FAILED / CAPTCHA_UNAVAILABLE）；`CaptchaDialog.onConfirm` 捕获 action 抛错分流——验证码类错误：弹窗内下方小字提示 + reset + 自动换题（用户只重新点选）；其他业务错误（如密码错误）：关闭弹窗由表单层展示，避免误导。
  - 五视图接线同步：移除各自 `title`；`ConsoleView`/`SpaceView` 风控分支删除提示文案（静默直接弹窗）；`LoginView`/`AdminView`/`ArticleEditor` 业务 catch 增加 `isCaptchaFailure → return`（弹窗已处理，表单层不再重复显示错误）。
- 安全性：验证判定全部仍在服务端（verifyCaptcha → check-data + 一 key 一用）；code 字段仅用于前端分流，不参与任何放行判定；换题重验仍走完整服务端校验。
- 测试：smoke-captcha **30/0**（错验证码断言追加 `code==='CAPTCHA_FAILED'`）；回归 smoke-auth 19/0、smoke-admin 73/0、smoke-articles 24/0、cleanup 无残留、`npm run build` 通过（CaptchaDialog-Cqf_ov1b.js + 独立 CSS chunk）。

## 59. OAuth 头像本地化 + 手动同步第三方头像 + 弹窗误关闭修复

- 用户要求：①第三方登录用户头像不要直接引用外链，注册时由服务端下载转存为本站链接（流程与用户上传头像相同、不省验证步骤；不合规则回落默认头像）；绑定第三方的用户可手动触发头像更新；②验证码验证失败时弹窗直接关闭而未刷新（bug）。
- 实现：
  - **共享出站请求**：`oauthFetch` 从 `routes/auth.js` 抽至 `services/oauth-fetch.js`（OAuth API 与头像下载共用，保留 oauth_proxy_url 代理支持）。
  - **下载转存服务** `services/avatar.js`：`saveAvatarFromUrl(url)` 与用户上传头像同规格落盘（`uploads/avatars/{ts}-{hex}.{ext}` 同名规则、png/jpg/gif/webp、≤2MB），并在上传校验之上加严：强制 https、域名白名单（`githubusercontent.com`/`googleusercontent.com`/`ggpht.com` 及子域）、手动跟随重定向（≤3 跳，每跳复检协议与域名防绕过）、Content-Length 预检 + 实际字节复核、魔数嗅探且必须与远端 Content-Type 一致（伪装内容直接拒绝）。
  - **注册本地化**：`findOrCreateOAuthUser` 新建用户分支先下载转存第三方头像，成功存本站链接、失败回落默认头像（不阻断注册）；`users` 表新增 `remote_avatar_url VARCHAR(500)`（ensureColumn，启动自动补列）存原始第三方头像地址，邮箱并档分支同样记录。
  - **手动同步端点** `POST /api/auth/avatar/refresh-oauth`（authRequired）：须绑定 GitHub/Google（否则 400）；GitHub 由 `github_id` 直接构造公开地址 `avatars.githubusercontent.com/u/{id}?size=460`（无需重新授权），Google 用存储的 `remote_avatar_url`（缺失提示重新登录该第三方账号）；下载校验流程与注册完全一致，失败 502 且不动现有头像；每用户 60 秒限频（429）。返回 `{ user, url }`；`publicUser` 补充 `google_id`。
  - **前端**：`ConsoleView` 个人资料与 `SpaceView` 编辑区在绑定过第三方时显示「更新第三方头像」按钮（`stores/auth.ts` User 接口 +`github_id`/`google_id`，SpaceView `SpaceUser` 同步）。
  - **弹窗误关闭修复**：根因是五视图 catch 里 `if (isCaptchaFailure(e)) return;` 把验证码错误吞掉后 action 以成功收场，`CaptchaDialog.onConfirm` 走成功分支 `close()`。修复：全部改为 `throw e` 重新抛给弹窗（LoginView doSubmit/doSendCode、ConsoleView、SpaceView、AdminView doLogin、ArticleEditor doSave/doUpload 共 6 处），由弹窗既有分流处理——验证码类错误留在弹窗内提示并自动换题，业务错误仍关闭弹窗由表单展示。直接提交路径（无弹窗）不会产生验证码类错误，重抛不会造成未处理拒绝。
- 测试：smoke-auth **28/0**（+9：refresh 未登录 401 / 未绑定 400 / 绑 GitHub 后真实下载 avatars.githubusercontent.com 转存 200 + remote_avatar_url 落库 + 文件本站可访问 / 限频 429 / Google 无来源 400 / 白名单外域名 502）；回归 smoke-captcha 30/0、smoke-admin 73/0、smoke-articles 24/0、e2e-mail-tpl 20/0、cleanup 无残留、`npm run build` 通过。
