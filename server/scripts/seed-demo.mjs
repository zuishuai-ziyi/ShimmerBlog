/* 造一批演示文章（管理员账号），便于首页时间轴走查。可重复执行（每次新增）。 */
const BASE = 'http://localhost:3010/api';

const r = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@shimmerblog.local', password: 'shimmer-admin' }),
});
const { token } = await r.json();
if (!token) throw new Error('管理员登录失败');

const posts = [
  {
    title: '在深空里写字',
    summary: '为什么想做一个纯黑背景、毛玻璃前景的博客：因为读字这件事，本该安静一点。',
    content: `# 在深空里写字

屏幕大部分时候太亮了。白底黑字把人的注意力拉得很紧，读久了会累。

于是想做一个这样的地方：

- 背景是纯黑的，像没有尽头的夜
- 有很多细小的白点，慢慢往上飘，大小、速度、透明度都不一样
- 前景是浅蓝色的玻璃，半透明，能看见后面的星星

## 一点取舍

毛玻璃很好看，但不能滥用——大面积 blur 会让文字边缘发灰。所以只用在工具栏和卡片上，正文保持干净的对比度。

> 星星的透明度和速度如果完全一致，看起来就像雪花屏。随机才是自然。

第一篇就写到这里。`,
  },
  {
    title: '时间轴为什么不是一条直线',
    summary: '文章卡片的横坐标故意不固定，用淡蓝色曲线连起来——比整齐的列表更接近记忆的样子。',
    content: `## 直线太规整了

传统博客列表是自上而下的等高矩形，信息密度高，但读起来像在看表格。

所以这里换了个做法：每张卡片横向随机偏移一点，卡片之间用淡蓝色的三次贝塞尔曲线连接，末端带一个发光的小圆点。

## 实现要点

曲线是用 SVG 画的，路径在组件挂载后按卡片的真实位置测量：

\`\`\`ts
const d = \`M \${x1} \${y1} C \${x1} \${y1 + dy}, \${x2} \${y2 - dy}, \${x2} \${y2}\`
\`\`\`

因为卡片高度会随文字长度变化，所以要监听 \`ResizeObserver\`，在字体加载完成、窗口缩放时重新测量。

偏移量用固定序列循环，而不是真随机——真随机会让每次刷新布局都跳一下。`,
  },
  {
    title: '邮箱验证码登录的几个坑',
    summary: '一次性、限频、过期，三件事缺一不可；少了任何一个，验证码系统就等于没有。',
    content: `假设你只做了「发码 + 校验」，会发生什么：

1. **不设过期** —— 半年前泄露的验证码仍然可用
2. **不设一次性** —— 同一串数字可以被反复使用
3. **不设限频** —— 有人可以在几秒内把六位数字全试一遍

## 具体参数

| 项目 | 取值 |
| --- | --- |
| 有效期 | 10 分钟 |
| 长度 | 6 位数字 |
| 单邮箱发送频率 | 每小时 5 次 |
| 使用后 | 标记 \`used = 1\`，不可复用 |

## 顺便说一句

本地开发时 SMTP 没配，验证码会直接打在服务端日志里——这比"假装发送成功"要好，至少你拿得到码。`,
  },
  {
    title: 'JWT 不是银弹',
    summary: '无状态鉴权的代价是撤销困难：用户被禁用之后，手里的 token 依然是有效签名。',
    content: `JWT 的好处众所周知：服务端不存 session，水平扩展无压力。

代价也一样明确：

- token 签发后在有效期内无法真正撤销
- 用户被禁用、改密码，旧 token 仍然通过签名校验

## 这里的折中

每次请求都回查一次用户表：

\`\`\`js
const [rows] = await pool.query('SELECT * FROM users WHERE id = ? AND status = ?', [uid, 'active'])
\`\`\`

多了一次索引查询，换来的是「禁用立即生效」。对个人博客这个量级，这笔交易很划算。

如果哪天 QPS 上去了，正确的做法是加一层短 TTL 的缓存，而不是把校验去掉。`,
  },
  {
    title: '毛玻璃与性能',
    summary: 'backdrop-filter 是 GPU 密集操作。用在固定工具栏上几乎无感，用在一百个列表项上就是灾难。',
    content: `\`backdrop-filter: blur(18px)\` 会让浏览器把元素背后的内容采样、模糊、再合成。

## 什么时候安全

- 元素数量少（< 10）
- 元素尺寸固定、不随滚动重排
- 不在滚动容器里大面积重复

## 什么时候要小心

- 长列表的每一项都带毛玻璃
- 元素在动画中不断改变尺寸（每帧都要重新采样）

这个站点只在工具栏和卡片上用，卡片数量受分页限制（每页 8 篇），所以还算安全。

一个额外技巧：给 \`will-change: transform\` 只加在 hover 的那张卡上，别加在全部卡片。`,
  },
  {
    title: '写一个自己的后台',
    summary: '不引入现成的 admin 框架，手工做一套够用的控制台：文章列表、编辑器、置顶、用户管理。',
    content: `现成的后台模板功能很全，但对个人博客往往是负担：一堆用不上的菜单、厚厚的依赖、风格还和前台割裂。

## 最小可用集合

- 我的文章：列表、状态筛选、编辑、删除
- 编辑器：标题、简介、正文（Markdown）、发布开关
- 管理员：置顶任意文章、禁用用户、站点配置

## 站点配置存哪

一张极简的 \`settings\` 表，\`key\` 主键 + \`value\` 文本。够用，也方便临时加字段。

配置读取加一层内存缓存，写入时失效——比每次请求都查库简单得多。`,
  },
  {
    title: '关于配色的一点笔记',
    summary: '从 #03045e 到 #caf0f8，九个蓝色。深色界面里，越浅的颜色越应该留给文字。',
    content: `这套色板是九个从深到浅的蓝。

深色界面的规律：**背景用最深的那几个，前景用最浅的那几个**。中间过渡色留给边框、分割线、次要文字。

## 实际映射

- 背景 \`#000000\`（纯黑，比色板最深色更彻底）
- 卡片玻璃 \`rgba(173,232,244,0.09)\`
- 边框 \`rgba(144,224,239,0.28)\`
- 正文 \`#e9f7fb\`
- 次要文字 \`rgba(202,240,248,0.65)\`
- 强调/按钮渐变 \`#90e0ef → #48cae4\`

## 对比度

正文对纯黑的对比度约 17:1，远超 WCAG AAA 的 7:1。次要文字压到 0.65 透明度后约 8:1，仍然合格。

再低就会开始难受了——尤其是在看不清屏幕的环境里。`,
  },
  {
    title: '第一篇文章',
    summary: '站点上线了。这里记录一点开张时的想法，以及后面打算写什么。',
    content: `站点刚刚跑起来，写了这一篇当作路标。

## 打算写什么

- 前端实现细节：动画、布局、性能
- 后端踩坑：数据库、鉴权、邮件
- 一些和代码无关的、关于做事方式的记录

## 关于更新频率

不承诺频率。有值得写的就写，没想清楚就先放着。
比起按时交差，更想每篇都能站得住。`,
  },
];

const created = [];
for (const p of posts) {
  const res = await fetch(`${BASE}/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...p, status: 'published' }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.log('FAIL', p.title, JSON.stringify(body));
    continue;
  }
  created.push(body.article.id);
  await new Promise((s) => setTimeout(s, 120));
}

// 置顶第一篇
if (created.length) {
  await fetch(`${BASE}/articles/${created[0]}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pinned: true }),
  });
}

console.log(`seeded ${created.length} articles, ids=${created.join(',')}, pinned=${created[0]}`);
