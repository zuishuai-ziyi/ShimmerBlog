/**
 * 星光过渡引擎：路由切换时，旧页面内容化作蓝色星光光点消散，
 * 新页面元素位置再由光点聚合而成（存活的光点会被重新指派目标，形成
 * 「同一片星光散去又聚成新页」的连续感）。
 *
 * 纯 Canvas 实现，无第三方依赖：
 * - 采样：只取「实际渲染出来的可见部分」——文字用 Range 逐行取行盒，
 *   可见底色/边框/图片取盒区域，不可见的结构占位不出点；
 * - 消散：光点从内容位置出发向上漂散、闪烁、熄灭；
 * - 聚合：光点从散布位置缓动直线飞向新页元素内的目标点，一次到位、
 *   中途不改向不绕弧，到达后闪一下熄灭。
 * 光点样式与站内背景星空（StarField）统一：纯色小圆点，白为主、少量浅蓝。
 */

/* ---------------- 逐星小蒙版（SVG mask + SMIL） ----------------
   不再用少数大窗，而是按内容密度规划一大片小收缩窗：每个窗中心一颗星光，
   蒙版收缩到哪颗星的位置，哪颗星就在自身窗坍缩时亮起（每颗星对应一个蒙版）。
   蒙版本体是内联 SVG（黑底 + 白色渐变圆），每个圆用 SMIL animate 驱动半径，
   避免为上百层 mask 生成巨量 CSS keyframes。 */

/** 消散总时长 ms（须与 App.vue 的 star-dissolve-svg 动画同步） */
export const LEAVE_MS = 560;
/**
 * 入场生长的两段节奏：
 * 阶段 1（ENTER_GROW_MS）：r 从 0 长到「刚好盖住本窗内容区」—— planWindows 的覆盖判据是
 *   d ≤ r0*1.15，所以长到这里内容已全部露出，这段决定「内容渐显」的观感；
 * 阶段 2（ENTER_TAIL_MS）：快速撑到元素最远角，只补内容期外的边距（此时已看不见），
 *   避免移除蒙版时边角「哝」地一下补出来。
 */
export const ENTER_GROW_MS = 620;
export const ENTER_TAIL_MS = 200;
export const ENTER_STAGGER_MS = 40;

export interface DissolveWindow {
  cx: number; // 视口坐标
  cy: number;
  r0: number; // 窗初始半径 px（圆）
}

export const MAX_MASKS = 84; // 逐星小窗预算（面积反推 + 抽稀硬上限）

/** planWindows 的参数（入场用更稀疏的大窗，出场的逐星小窗用默认值） */
export interface WindowPlanOpts {
  areaPerWin?: number; // 每多少 px² 一个窗
  minWins?: number;
  maxWins?: number;
  rMin?: number; // 窗半径下限
  rMax?: number; // 窗半径上限
}

/**
 * 入场窗计划：不看内容、只看视口 —— 在视口上铺一层抖动格网（4×3 大窗）。
 * 为什么不按内容规划：入场蒙版在「落定」那一刻就把几何固化了，而文章页这类异步页面
 * 数据可能晚于落定到达（fetch 常 200~400ms，长于静默判定阈值），内容一换，
 * 按占位内容规划的窗就盖不满正文 —— 正文会在蒙版移除时成片「啦」地出现
 * （用户反馈的「闪了一下后直接加载出来」）。铺满视口后，无论内容何时换、换到哪里，
 * 都处在正在生长的蒙版前沿之内，新内容自己揭幕，无需重建。
 * 窗心抖动 + 整格随机偏移，避免揭开时像拉窗帘一样整齐推进。
 */
export function planViewportWindows(vw: number, vh: number): DissolveWindow[] {
  const cols = vw >= vh * 1.1 ? 4 : 3;
  const rows = Math.max(2, Math.round(12 / cols));
  const cw = vw / cols;
  const ch = vh / rows;
  const cell = Math.max(cw, ch);
  const r0 = Math.max(140, Math.min(300, cell * 0.82));
  const wins: DissolveWindow[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      wins.push({
        cx: cw * (c + 0.5) + rand(-cw * 0.18, cw * 0.18),
        cy: ch * (r + 0.5) + rand(-ch * 0.18, ch * 0.18),
        r0,
      });
    }
  }
  return wins;
}

/**
 * 按内容矩形规划逐星小窗：每格只在格内随机取一点（整格随机，不是格心微抖），
 * 于是窗心（=星位）散布参差、不排成整齐行列。
 * 窗数随内容面积预算（每 ~9000px² 一个，28~MAX_MASKS），半径由总面积反推并 ±18% 随机。
 * 随机撒点可能漏盖内容（漏盖区会在首帧直接变黑），所以最后再做几轮覆盖补齐：
 * 内容区细栅格扫一遍，把没被任何窗盖住的点按「离最近窗心最远」优先、
 * 带随机抖动地补窗（farthest-point，天然也是不规则的）。无内容时退回单个全屏窗。
 */
export function planWindows(rects: SampledRect[], opts: WindowPlanOpts = {}): DissolveWindow[] {
  const areaPerWin = opts.areaPerWin ?? 9000;
  const minWins = opts.minWins ?? 28;
  const maxWins = Math.min(MAX_MASKS, opts.maxWins ?? MAX_MASKS);
  const rMin = opts.rMin ?? 24;
  const rMax = opts.rMax ?? 60;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const areas = rects.filter((r) => r.w > 2 && r.h > 2);
  if (!areas.length) {
    return [{ cx: vw / 2, cy: vh / 2, r0: Math.hypot(vw, vh) / 2 }];
  }
  const area = areas.reduce((s, r) => s + r.w * r.h, 0);
  const target = Math.min(maxWins, Math.max(minWins, Math.round(area / areaPerWin)));
  const r0 = Math.min(rMax, Math.max(rMin, Math.sqrt((area * 1.35) / (Math.PI * target))));
  const cell = r0 * 1.35;
  const minGap = cell * 0.55; // 窗心最小间距（蓝噪声感）：避免重叠矩形各自撒点后成串扎堆

  const wins: DissolveWindow[] = [];
  // 空间哈希：内容区是几千个扫描点 × 几十个窗，逐点遍历会卡住切换首帧
  const bucket = r0 * 1.6;
  const buckets = new Map<string, DissolveWindow[]>();
  const bkey = (x: number, y: number) => `${Math.floor(x / bucket)},${Math.floor(y / bucket)}`;
  const push = (w: DissolveWindow) => {
    wins.push(w);
    const k = bkey(w.cx, w.cy);
    const arr = buckets.get(k);
    if (arr) arr.push(w);
    else buckets.set(k, [w]);
  };
  /** 最近窗心距离与其半径 */
  const near = (x: number, y: number): [number, number] => {
    const bx = Math.floor(x / bucket);
    const by = Math.floor(y / bucket);
    let best = Infinity;
    let rbest = 0;
    for (let gx = bx - 1; gx <= bx + 1; gx++) {
      for (let gy = by - 1; gy <= by + 1; gy++) {
        const arr = buckets.get(`${gx},${gy}`);
        if (!arr) continue;
        for (const w of arr) {
          const d = Math.hypot(x - w.cx, y - w.cy);
          if (d < best) {
            best = d;
            rbest = w.r0;
          }
        }
      }
    }
    return [best, rbest];
  };
  // 软边 + 液态融合后实际可见半径略大于 r0
  const covered = (x: number, y: number) => {
    const [d, rr] = near(x, y);
    return d <= rr * 1.15;
  };

  for (const rect of areas) {
    const cols = Math.max(1, Math.round(rect.w / cell));
    const rows = Math.max(1, Math.round(rect.h / cell));
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x = rect.x + ((gx + rand(0.06, 0.94)) * rect.w) / cols;
        const y = rect.y + ((gy + rand(0.06, 0.94)) * rect.h) / rows;
        const cx = Math.min(rect.x + rect.w - 1, Math.max(rect.x + 1, x));
        const cy = Math.min(rect.y + rect.h - 1, Math.max(rect.y + 1, y));
        if (near(cx, cy)[0] < minGap) continue; // 相邻矩形重叠处的重复点直接丢
        push({ cx, cy, r0: r0 * rand(0.82, 1.18) });
      }
    }
  }
  if (wins.length > maxWins) {
    const keep = maxWins / wins.length;
    const thinned = wins.filter(() => Math.random() < keep);
    wins.length = 0;
    buckets.clear();
    for (const w of thinned) push(w);
  }

  // 覆盖补齐（多次扫描）：扫描栅格必须远小于圆半径，否则小洞会从采样缝里漏过；
  // 补点带随机抖动，否则所有补出来的窗都落在扫描栅格线上，又变得「整齐」
  const step = Math.max(8, r0 * 0.22);
  for (let pass = 0; pass < 3 && wins.length < maxWins; pass++) {
    const holes: { x: number; y: number; d: number; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const rect of areas) {
      for (let y = rect.y + rand(0, step); y < rect.y + rect.h; y += step) {
        for (let x = rect.x + rand(0, step); x < rect.x + rect.w; x += step) {
          if (covered(x, y)) continue;
          holes.push({ x, y, d: near(x, y)[0], x1: rect.x, y1: rect.y, x2: rect.x + rect.w, y2: rect.y + rect.h });
        }
      }
    }
    if (!holes.length) break;
    holes.sort((a, b) => b.d - a.d);
    const fillGap = cell * 0.25;
    let added = 0;
    for (const h of holes) {
      if (wins.length >= maxWins) break;
      // 抖动后夹回矩形内：窗心（=星位）只在内容区域内，不会落到空白处
      const jx = Math.min(h.x2 - 1, Math.max(h.x1 + 1, h.x + rand(-step, step)));
      const jy = Math.min(h.y2 - 1, Math.max(h.y1 + 1, h.y + rand(-step, step)));
      if (near(jx, jy)[0] < fillGap) continue;
      push({ cx: jx, cy: jy, r0: r0 * rand(0.88, 1.15) });
      added++;
    }
    if (!added) break;
  }
  return wins;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let maskSeq = 0; // 自增 id：多次导航/多元素并存时不冲突

export interface StarMaskHandle {
  id: string; // mask 元素 id，供 CSS mask-image: url(#id) 引用
  fire(): void; // 触发半径过渡（双 rAF 确保初始值已提交）
  dispose(): void; // 移除内联 SVG（离场元素随 DOM 销毁自动清理，入场需手动调）
}

/**
 * 逐星小蒙版（每个窗中心一颗星）：在 target 内部挂一个内联 <svg><mask>，
 * 每窗一个白色软边圆（radialGradient 填充，0.9 内实心）。
 * 液态交融：所有圆放进同一个 <g filter="goo">，滤镜 = 高斯模糊 + alpha 对比度拉伸
 * （metaball 原理）——相邻圆靠近时边缘互相融合合并，收缩分离时又能分叉退开，
 * 得到液体表面张力般的交融边缘。mask-type 设为 alpha（背景不画黑底，透明即隐藏）。
 * 不用 SMIL / mask-image data-URL —— Chromium 对 CSS 引用的 SVG 图像
 * 禁用动画时间线，SMIL 不会动；内联 SVG + CSS r transition（r 是
 * 可动画几何属性，Chromium/Firefox 均支持）则必定运行。
 * 收缩模式（离场）：r 从 r0 → 0；生长模式（入场）：r 从 0 → R（撑到元素最远角）。
 */
export function createStarMask(
  target: HTMLElement,
  wins: DissolveWindow[],
  elemW: number,
  elemH: number,
  mode: 'shrink' | 'grow',
  durMs: number,
  delayMs: number,
): StarMaskHandle {
  const id = `star-svg-mask-${++maskSeq}`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  svg.setAttribute('aria-hidden', 'true');
  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', id);
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '0');
  mask.setAttribute('y', '0');
  mask.setAttribute('width', String(Math.ceil(elemW)));
  mask.setAttribute('height', String(Math.ceil(elemH)));
  // 液态交融的模糊尺度：跟圆半径走，大窗更黏稠（半径越大多融合）
  const avgR = wins.length ? wins.reduce((s, w) => s + w.r0, 0) / wins.length : 40;
  const blur = Math.min(24, Math.max(7, avgR * 0.3));
  const gradId = `${id}-grad`;
  const gooId = `${id}-goo`;
  const W = Math.ceil(elemW);
  const H = Math.ceil(elemH);
  // mask-type: alpha —— 看不见的地方由 alpha=0 决定，无需黑底遮罩
  mask.setAttribute('mask-type', 'alpha');
  mask.setAttribute('width', String(W));
  mask.setAttribute('height', String(H));
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML =
    `<radialGradient id="${gradId}"><stop offset="0" stop-color="#fff"/>` +
    '<stop offset="0.9" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
    '</radialGradient>' +
    // metaball：先模糊把相邻圆的 alpha 融成一片，再用 feColorMatrix 拉陡 alpha 曲线
    // （截断在 ~0.3，过渡带收窄到 ~7px），相邻窗口因此拉出液体般的高颈融合。
    // 实测（r=60、圆心距 130、blur=18）：缝中点 alpha 由 0 升到 1，而边缘过渡带仍只 7px。
    // 前三行把 RGB 绑到 alpha 上，保证退化到 luminance 掩膜时仍然正确。
    // 过滤区域用 objectBoundingBox 跟随「圆本身的包围盒」而不是整块元素：
    // 文章页元素高 3000~5000px，按 userSpace 全盒过滤等于每帧重算几百万像素的
    // 高斯模糊，主线程被拖住上百毫秒（入场蒙版迟迟不长、看起来「没有动画」）。
    `<filter id="${gooId}" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse"` +
    ' x="-0.2" y="-0.2" width="1.4" height="1.4"' +
    ' color-interpolation-filters="sRGB">' +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur.toFixed(1)}" result="b"/>` +
    '<feColorMatrix in="b" type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 4 -1.2"/>' +
    '</filter>';
  mask.appendChild(defs);
  const goo = document.createElementNS(SVG_NS, 'g');
  goo.setAttribute('filter', `url(#${gooId})`);
  mask.appendChild(goo);
  const circles: SVGCircleElement[] = [];
  const rStart: number[] = [];
  const rEnd: number[] = [];
  const rMid: number[] = [];
  const delays: number[] = [];
  for (const wn of wins) {
    const far = Math.hypot(Math.max(wn.cx, elemW - wn.cx), Math.max(wn.cy, elemH - wn.cy));
    // 生长模式半径撑到元素最远角（软边 0.88 处仍盖住最远角），否则页尾永藏
    const R = mode === 'grow' ? Math.max(wn.r0, far / 0.88) : wn.r0;
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', wn.cx.toFixed(1));
    c.setAttribute('cy', wn.cy.toFixed(1));
    c.setAttribute('fill', `url(#${gradId})`);
    const r0 = mode === 'grow' ? 0 : R;
    const r1 = mode === 'grow' ? R : 0;
    // 生长阶段 1 的落点：刚好盖住本窗内容区（d ≤ r0*1.15）再留 6% 余量。
    // 关键参数关系：内容覆盖半径 1.15*r0 要尽量接近阶段 1 的终点，
    // 且缓动要近似线性 —— 这样「内容被吞到哪」与「时间过了多少」近似成正比，
    // 揭示才会铺满整段 640ms；落点过大（如 1.6*r0）或前快后缓都会让
    // 内容在头 200ms 里全部出来、剩下的时间只是长空白边距。
    const mid = mode === 'grow' ? Math.max(wn.r0 * 1.22, 10) : R;
    c.style.setProperty('r', `${r0.toFixed(1)}px`);
    // 每圆错峰几十毫秒：液面不再齐刷刷退缩，收缩/生长先后不一，更像真实液体
    const d = Math.round(delayMs + rand(0, mode === 'shrink' ? 55 : ENTER_STAGGER_MS));
    c.style.setProperty('transition', `r ${Math.round(durMs)}ms cubic-bezier(0.4, 0, 0.7, 0.4) ${d}ms`);
    goo.appendChild(c);
    circles.push(c);
    rStart.push(r0);
    rEnd.push(r1);
    rMid.push(mid);
    delays.push(d);
  }
  svg.appendChild(mask);
  target.appendChild(svg);
  let fired = false;
  return {
    id,
    fire() {
      if (fired) return;
      fired = true;
      // 初始 r 在建模时就已写入并提交过帧，这里只需 rAF 一次就能起过场
      // （两层 rAF 会给自己多抷 16ms，星光烬灭后会有可感知的空黑一拍）
      requestAnimationFrame(() => {
          if (mode === 'grow') {
            // 阶段 1：缓入缓出长到内容覆盖半径 —— 内容在这一段里逐块涌现
            for (let i = 0; i < circles.length; i++) {
              circles[i].style.setProperty(
                'transition',
                `r ${ENTER_GROW_MS}ms cubic-bezier(0.16, 0.5, 0.5, 0.92) ${delays[i]}ms`,
              );
              circles[i].style.setProperty('r', `${rMid[i].toFixed(1)}px`);
            }
            // 阶段 2：内容已全显，快速撑满边距，为移除蒙版收尾
            setTimeout(() => {
              for (let i = 0; i < circles.length; i++) {
                circles[i].style.setProperty('transition', `r ${ENTER_TAIL_MS}ms linear`);
                circles[i].style.setProperty('r', `${rEnd[i].toFixed(1)}px`);
              }
            }, ENTER_GROW_MS + ENTER_STAGGER_MS + 24);
            return;
          }
          for (let i = 0; i < circles.length; i++) {
            circles[i].style.setProperty('r', `${rEnd[i].toFixed(1)}px`);
          }
      });
    },
    dispose() {
      svg.remove();
    },
  };
}

export interface SampledRect {
  x: number; // viewport 坐标（canvas 为 fixed inset 0，同一坐标系）
  y: number;
  w: number;
  h: number;
  div: number; // 布点密度：每 div px² 一个点
  max: number; // 单矩形点数上限
}

/* ---------------- DOM 内容采样 ---------------- */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BR', 'SOURCE']);
// 本身就会渲染内容的可替换元素 / 原生控件
const SURFACE_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'INPUT', 'TEXTAREA', 'SELECT', 'svg']);

/** 从 getComputedStyle 的颜色串里取 alpha（rgb→1，rgba/新语法→第 4 个数） */
function alphaOf(color: string): number {
  const m = color.match(/[\d.]+/g);
  if (!m) return 1;
  return m.length >= 4 ? parseFloat(m[3]) : 1;
}

/** 元素是否渲染出可见的「面」（背景、边框、图片等） */
function hasVisibleSurface(el: Element, cs: CSSStyleDeclaration): boolean {
  if (SURFACE_TAGS.has(el.tagName)) return true;
  if (alphaOf(cs.backgroundColor) > 0.02) return true;
  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    if (parseFloat(cs[`border${side}Width`]) > 0 && alphaOf(cs[`border${side}Color`]) > 0.02) return true;
  }
  return false;
}

/** 元素是否渲染出可见的「面」（背景、边框、图片等） */
function pushRect(out: SampledRect[], x: number, y: number, w: number, h: number, div: number, max: number, vw: number, vh: number) {
  // 裁剪到视口交集：只保留实际可见的部分
  const x1 = Math.max(x, 0);
  const y1 = Math.max(y, 0);
  const x2 = Math.min(x + w, vw);
  const y2 = Math.min(y + h, vh);
  if (x2 - x1 < 6 || y2 - y1 < 4) return;
  out.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, div, max });
}

/**
 * 采样「实际可见内容」的矩形集合：
 * - 文字：对每个元素自己的直接文本节点建 Range，getClientRects() 逐行取行盒
 *   （行盒止于文字实际结束处，不含空白占位），高密度布点；
 * - 通体有画面的面（图片/视频/画布/控件/背景图）：整个盒区域，低密度布点；
 * - 半透明面板（卡片/玻璃块等）：整个盒区域，低密度布点（面板本身是可见的面）；
 * - 渐变文字（background-clip:text）：文字色透明但字形可见，行盒按中密度布点。
 * 空白结构占位（无面无字的容器）不产生任何点。
 */
export function sampleContent(root: HTMLElement): SampledRect[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: SampledRect[] = [];
  const range = document.createRange();

  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (SKIP_TAGS.has(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.08) continue;

    // 1) 可见的面
    // 面积超过视口 ≈42% 的盒子（全屏装饰曲线/背景层等）不当内容面采样：
    // 它们大多在视觉上是空白/背景，若整盒采样会让蒙版窗与星光落进空旷区。
    // 其内真实内容（文字行、图标）由下方文字/渐变文字通道单独采样。
    const area = r.width * r.height;
    if (hasVisibleSurface(el, cs) && area / (vw * vh) <= 0.42) {
      pushRect(out, r.left, r.top, r.width, r.height, 2000, 22, vw, vh);
    }

    // 2) 实际渲染的文字 → 逐行行盒（高密度）
    const clipText = cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text';
    if (clipText) {
      // 渐变文字：文字色透明但字形可见
      range.selectNodeContents(el);
      for (const tr of Array.from(range.getClientRects())) {
        pushRect(out, tr.left, tr.top, tr.width, tr.height, 1400, 14, vw, vh);
      }
    } else if (alphaOf(cs.color) >= 0.15) {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== 3 || !(node.textContent || '').trim()) continue; // TEXT_NODE
        range.selectNodeContents(node);
        for (const tr of Array.from(range.getClientRects())) {
          pushRect(out, tr.left, tr.top, tr.width, tr.height, 700, 18, vw, vh);
        }
      }
    }
  }
  return out;
}

/* ---------------- 粒子引擎 ---------------- */

interface Particle {
  // 自由漂移阶段
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number; // 绘制半径
  color: string; // 光点颜色（与背景星空统一的小圆点）
  born: number;
  life: number; // 寿命 ms
  tw: number; // 闪烁频率
  ph: number; // 闪烁相位
  bright: boolean; // 少量「亮星」（更大 + 更强晕）
  halo: boolean; // 白芯柔光晕（过渡光点多数带，保证在卡片底色上可读）
  dead: boolean;
  // 聚合阶段（mode = 'gather' 时生效）
  mode: 'free' | 'gather';
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  gStart: number; // 聚合开始时刻
  gDur: number; // 聚合时长
  dieAt: number; // 保留字段（历史：移动途中等时消散），现已不用
}

const MAX_PARTICLES = 680;
// 与背景星空统一的小圆点色板：主体纯白，掺少量浅蓝呼应「蓝色星光」
// 光点以站点 accent 蓝（rgb(140 198 226)）系为主、掺少量白：小圆点造型与背景
// 星空统一，但颜色从背景的白点里跳出来；过渡期间背景星空还会被压暗（st-active）
const DOT_COLORS = ['#ade8f4', '#90e0ef', '#cfe9f6', '#b8dcf0', '#ffffff'];

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

class StarTransitionEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private particles: Particle[] = [];
  private raf = 0;
  private running = false;
  private last = 0;
  private halo: HTMLCanvasElement | null = null;
  private lastLeaveRects: SampledRect[] = []; // 离场页内容区域：星光采样与补足起飞的依据
  private lastWins: DissolveWindow[] = []; // 离场逐星小窗：入场反向蒙版（每星一窗）的来源
  private leaveScrollY = 0; // 消散时刻滚动位置：把窗换算到文档坐标供入场反向蒙版用

  /** 由 Canvas 组件挂载时调用 */
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    this.lastScrollY = window.scrollY;
    window.addEventListener('resize', this.onResize);
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  detach() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onScroll);
    document.documentElement.classList.remove('st-active');
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.particles = [];
    this.canvas = null;
    this.ctx = null;
  }

  private onResize = () => {
    if (!this.canvas) return;
    this.resize();
  };

  private lastScrollY = 0;

  /**
   * 动画期间用户滚动页面：canvas 是 fixed 不随内容动，
   * 把全体粒子（含飞行起终点）按滚动量同步平移，保证光点始终贴住内容。
   */
  private onScroll = () => {
    const dy = window.scrollY - this.lastScrollY;
    this.lastScrollY = window.scrollY;
    if (!dy) return;
    for (const p of this.particles) {
      if (p.dead) continue;
      p.y -= dy;
      p.sy -= dy;
      p.ty -= dy;
    }
  };

  /**
   * 重设滚动基准：切换页面时 App.vue 会把延后的滚动复位（top:0 / 浏览历史位置）
   * 应用在入场处，那一下的滚动位移不应把已经在飞的星光平移走（旧页已卸载，
   * 星光在屏幕坐标里继续存在），所以只同步基准、不动粒子。
   */
  resetScrollBaseline() {
    this.lastScrollY = window.scrollY;
  }

  private resize() {
    const canvas = this.canvas!;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    canvas.width = Math.round(this.w * this.dpr);
    canvas.height = Math.round(this.h * this.dpr);
    canvas.style.width = `${this.w}px`;
    canvas.style.height = `${this.h}px`;
    this.ctx!.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * 消散阶段：每个蒙版窗中心布一颗星光（每颗星对应一个蒙版）。
   * 星光在**整页完全蚀空之后**才亮起（元素先彻底消融，再出现光点），
   * 亮起后向内容质心方向缓慢流动，等新页布局落定后由 gather() 统一收拢飞向新页。
   * 返回建议的 DOM 淡出时长（ms），供过渡 CSS 对齐节奏。
   */
  dissolve(rects: SampledRect[], wins?: DissolveWindow[]): number {
    if (!this.ctx) return 0;
    this.clearGathers(); // 若上一次聚合未结束，直接终结，避免脏粒子
    this.lastLeaveRects = rects; // 记录离场内容区域，供聚合阶段补足起飞
    this.leaveScrollY = window.scrollY;
    const windows = wins && wins.length ? wins : planWindows(rects);
    this.lastWins = windows;
    const now = performance.now();
    // 内容质心：星光流动方向（保持均匀分布的同时保证全程可见的移动）
    const cx0 = rects.length ? rects.reduce((s, r) => s + r.x + r.w / 2, 0) / rects.length : this.w / 2;
    const cy0 = rects.length ? rects.reduce((s, r) => s + r.y + r.h / 2, 0) / rects.length : this.h / 2;
    // 诞生时刻 = 整页蚀空（LEAVE_MS + 蒙版 60ms 延迟 + 每圆最多 55ms 错峰）之后再错开
    // 0~140ms 先后亮起 —— 先「元素完全消融」，再「光点出现」，两段不重叠
    const bornAt = now + LEAVE_MS + 115;
    for (const wn of windows) {
      const p = this.spawnOne(wn.cx, wn.cy, 'free');
      p.born = bornAt + rand(0, 140);
      p.life = rand(1500, 1900); // born 晚，仍要活到聚合起飞，不被中途饿死
      // 亮起后全体星光保持运动：向内容质心方向缓慢流动（分布仍均匀，
      // 聚合起飞前肉眼可见地在移动），微加横向抖动避免轨迹呆板
      const fdx = cx0 - p.x;
      const fdy = cy0 - p.y;
      const fd = Math.hypot(fdx, fdy) || 1;
      const fs = rand(0.16, 0.34);
      p.vx = (fdx / fd) * fs + rand(-0.05, 0.05);
      p.vy = (fdy / fd) * fs + rand(-0.05, 0.05);
    }
    this.start();
    return LEAVE_MS;
  }

  /**
   * 反向入场蒙版窗（消散收缩的镜像）：把离场窗换算到文档坐标返回，
   * 供新页内容从各窗心（每星一窗）生长显现；无离场记录时返回空数组。
   */
  enterWindows(): DissolveWindow[] {
    return this.lastWins.map((w) => ({ cx: w.cx, cy: w.cy + this.leaveScrollY, r0: w.r0 }));
  }

  /**
   * 聚合阶段：把仍存活的光点（含旧页余留星光）从当前位置直线飞向新页元素内的目标点；
   * 目标点不足时从「上一页内容所在区域」补充起飞（星光是旧卡片变来的），
   * 带抖动避免重叠；无离场采样时才退回视口随机散布。每个光点只飞一段。
   * 返回「光点全部落定熄灭」所需的毫秒数：调用方据此把新内容的展开
   * 推到星光消失之后（先光点消失，再新元素展开）。
   */
  /**
   * 聚合阶段：全部光点都必须移动 ——
   * 前 N 颗（N = 目标点数）飞往新页目标点，到达后直接烬灭；
   * 多余的光点飞向重复使用的内容目标点，同样在就位瞬间烬灭（不落在内容之外）；
   * 缺少的光点在航线中段渐显出现（born 延迟 + 中段起点），边移动边汇入。
   */
  gather(rects: SampledRect[], spawnScale = 1): number {
    if (!this.ctx) return 0;
    const targets = this.pointsForRects(rects);
    if (!targets.length) return 0;
    const now = performance.now();
    let end = now; // 最后一颗光点落定熄灭的时刻
    const alive = this.particles.filter((p) => !p.dead);

    // 全部存活光点起飞：前 targets.length 颗认领目标点；有多余时同样落在内容内的
    // 目标点上（重复使用，不加偏移）并在途中消散 —— 星光永远不落在内容之外
    let ti = 0;
    for (const p of alive) {
      const t = targets[ti % targets.length];
      this.toGather(p, now, p.x, p.y, t.x, t.y);
      ti++;
    }
    for (const p of alive) end = Math.max(end, p.gStart + p.gDur + 16);
    // 补足缺少的光点：起点取「上一页内容区域」（页面上真实有内容的位置，紧贴取样点），
    // 于是星光只在内容处诞生、在内容处落点，空中只存在于飞行途中；
    // 无离场采样才退回视口随机散布。预算 = 上限 - 存活数
    const budget = Math.max(0, MAX_PARTICLES - alive.length);
    const rest = this.capPoints(targets.slice(Math.min(ti, targets.length))).slice(
      0,
      Math.round(budget * Math.min(1, spawnScale)),
    );
    const origins = this.pointsForRects(this.lastLeaveRects);
    let oi = 0;
    for (const t of rest) {
      let sx: number, sy: number;
      if (origins.length) {
        const o = origins[oi++ % origins.length];
        sx = o.x + rand(-6, 6); // 紧贴旧内容上的取样点
        sy = o.y + rand(-6, 6);
      } else {
        sx = rand(-30, this.w + 30);
        sy = rand(-30, this.h + 30);
      }
      const p = this.spawnOne(sx, sy, 'gather');
      this.toGather(p, now, sx, sy, t.x, t.y);
      p.born = now + rand(0, 90); // 途中渐显（age<0 不绘制，出现时已在移动）
      end = Math.max(end, p.gStart + p.gDur + 16);
    }
    this.start();
    return Math.max(0, Math.round(end - now));
  }

  private toGather(p: Particle, now: number, sx: number, sy: number, tx: number, ty: number, dur?: number) {
    p.mode = 'gather';
    p.dead = false;
    p.sx = sx;
    p.sy = sy;
    p.tx = tx;
    p.ty = ty;
    // 出现即起飞（仅留微小错峰）；尚未诞生的星光等它亮起后再起飞，避免飞行途中隐身
    p.gStart = Math.max(now, p.born) + rand(0, 30);
    p.gDur = dur ?? rand(380, 540); // 消散归航时按窗剩余寿命精确给时长；聚合阶段默认 380~540ms
  }

  /* -------- 布点 -------- */

  private pointsForRects(rects: SampledRect[]): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const r of rects) {
      const n = this.countForRect(r);
      for (let i = 0; i < n; i++) {
        // 点落在元素显示矩形内，并夹回视口（半屏外元素不浪费点位）
        pts.push({
          x: Math.min(vw - 8, Math.max(8, r.x + Math.random() * r.w)),
          y: Math.min(vh - 8, Math.max(8, r.y + Math.random() * r.h)),
        });
      }
    }
    return pts;
  }

  /** 总量超上限时按比例随机抽稀，保持各元素区域密度均匀 */
  private capPoints<T>(pts: T[]): T[] {
    if (pts.length <= MAX_PARTICLES) return pts;
    const keep = Math.round((pts.length * MAX_PARTICLES) / pts.length);
    return pts.filter(() => Math.random() < keep / pts.length);
  }

  private countForRect(r: SampledRect): number {
    return Math.round(Math.min(r.max, Math.max(3, (r.w * r.h) / r.div)));
  }

  private spawnOne(x: number, y: number, mode: 'free' | 'gather'): Particle {
    const p: Particle = {
      x,
      y,
      vx: 0,
      vy: 0,
      r: 1.4 + 1.6 * Math.pow(Math.random(), 0.6), // 1.4~3.0，均值 ≈2.4：更亮更易读
      color: DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)],
      born: performance.now(),
      life: rand(700, 1300),
      tw: rand(0.8, 2.4),
      ph: Math.random() * Math.PI * 2,
      bright: Math.random() < 0.12,
      halo: Math.random() < 0.6, // 过渡光点大半带白芯光晕：蓝卡片上也清晰可读
      dead: false,
      mode,
      sx: x,
      sy: y,
      tx: x,
      ty: y,
      gStart: 0,
      gDur: 0,
      dieAt: 0,
    };
    this.particles.push(p);
    return p;
  }

  private clearGathers() {
    const now = performance.now();
    for (const p of this.particles) {
      if (p.mode === 'gather' && !p.dead) {
        p.mode = 'free';
        p.born = now;
        p.life = Math.min(p.life, 260); // 立刻淡出
      }
    }
  }

  /* -------- 渲染循环 -------- */

  private start() {
    document.documentElement.classList.add('st-active'); // 过渡期间压暗背景星空（规则在 App.vue）
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) {
      this.running = false;
      return;
    }
    const dt = Math.min(50, now - this.last);
    this.last = now;
    const k = dt / 16.7;

    ctx.clearRect(0, 0, this.w, this.h);

    let alive = 0;
    for (const p of this.particles) {
      if (p.dead) continue;

      if (p.mode === 'gather') {
        const t0 = p.gStart;
        if (now < t0) {
          // 等待起飞：原地微闪
          alive++;
        } else {
          const t = Math.min(1, (now - t0) / p.gDur);
          const e = easeInOutCubic(t);
          // 直线插值：不绕弧、不改向，一次到位（先起势后收势，起飞瞬间有动感）
          p.x = p.sx + (p.tx - p.sx) * e;
          p.y = p.sy + (p.ty - p.sy) * e;
          if (t >= 1) {
            // 就位即烬灭：到达目标点的下一刻直接消失，不做渐隐余辉 ——
            // 光点“闪一下就化为元素”，紧接着内容开始展开
            p.dead = true;
            continue;
          }
          alive++;
        }
      } else {
        p.x += p.vx * k;
        p.y += p.vy * k;
        if (now - p.born > p.life || p.y < -30 || p.x < -30 || p.x > this.w + 30) {
          p.dead = true;
          continue;
        }
        alive++;
      }
      this.draw(ctx, p, now);
    }

    if (this.particles.length > 800) {
      this.particles = this.particles.filter((p) => !p.dead);
    }
    if (alive > 0) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.particles = [];
      this.running = false;
      document.documentElement.classList.remove('st-active');
    }
  };

  private draw(ctx: CanvasRenderingContext2D, p: Particle, now: number) {
    const age = now - p.born;
    if (age < 0) return; // 尚未诞生（消散星光错峰延迟）：不绘制不闪烁
    // 闪烁（基线抬高：0.82~1，弱化暗谷，保证蚀空区域里的星光清晰可读）
    let a = 0.82 + 0.18 * Math.sin((now / 1000) * p.tw * Math.PI * 2 + p.ph);
    if (p.mode === 'free') {
      // 迸现 ≈100ms 快速点亮：born 错峰 40~200ms，随蒙版蚀空的进程
      // 沿文字位置逐颗蹦出（波浪式），形成「内容碎化成光点」的连续变形；
      // 寿命后 35% 线性淡出
      const fadeIn = Math.min(1, age / 100);
      const t = age / p.life;
      const fadeOut = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      a *= fadeIn * Math.max(0, fadeOut);
    } else {
      // 聚合：途中渐亮，就位瞬间烬灭（无渐隐）
      const t0 = p.gStart;
      const prog = now < t0 ? 0 : Math.min(1, (now - t0) / p.gDur);
      a *= 0.5 + 0.5 * prog;
    }
    if (a <= 0.01) return;
    // 与站内背景星空一致的纯色小圆点；多数光点带一圈白芯柔晕（蓝卡片上也可读），
    // 少量亮星再放大加强
    const rr = p.bright ? p.r * 1.8 : p.r;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.min(1, a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fill();
    if (p.halo) {
      // 柔光晕：径向渐变白 → 透明，半径收敛（≈1.9×r）
      const d = rr * 2 * 1.9;
      ctx.globalAlpha = Math.min(p.bright ? 0.38 : 0.26, a * (p.bright ? 0.38 : 0.26));
      ctx.drawImage(this.getHalo(), p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }

  /** 预渲染柔光晕：白 → 透明径向渐变，过渡自然无硬边 */
  private getHalo(): HTMLCanvasElement {
    if (!this.halo) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.28)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.halo = c;
    }
    return this.halo;
  }
}

export const starTransition = new StarTransitionEngine();

// 开发期调试钩子：便于无头探针读取粒子状态（生产构建不注入；首个实例优先，
// 避免探针重复 import 模块时新建实例覆盖真实引擎）
if (import.meta.env.DEV) {
  const g = window as unknown as { __star?: StarTransitionEngine };
  if (!g.__star) g.__star = starTransition;
}
