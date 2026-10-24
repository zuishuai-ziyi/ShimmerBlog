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
