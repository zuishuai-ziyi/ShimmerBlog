import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { lookup as dnsLookup } from 'node:dns/promises';
import { oauthFetch } from './oauth-fetch.js';
import { avatarRedirectHops, avatarTimeoutSeconds } from './settings.js';
import { avatarsDir } from '../uploads.js';

// 第三方头像下载转存：与用户上传头像同规格（类型 png/jpg/gif/webp、大小 ≤2MB、落盘 avatars 目录）。
// 在上传校验基础上额外做：https 强制 + 域名白名单 + 重定向逐跳复检 + Content-Length 预检 + 魔数嗅探。
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

// 允许拉取头像的第三方域名（及子域）
const AVATAR_HOST_SUFFIXES = ['githubusercontent.com', 'googleusercontent.com', 'ggpht.com'];

export function isAllowedAvatarHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return AVATAR_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
}

/**
 * 内网/本地直连判定：OAuth 头像豁免时用来挡掉「打到内网」的地址（防 SSRF 与云元数据服务）。
 * 只做粗判：私网段、环回、链路本地、CGNAT、localhost 与 *.local / *.internal、IPv6 字面量。
 */
function isInternalHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (h.includes(':')) return true; // IPv6 字面量（含 [::1]）：一律不放行
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // 链路本地（云元数据 169.254.169.254）
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false; // 公网 IPv4：允许
  }
  return false;
}

/**
 * 私网/环回/链路本地/CGNAT 等不可抓取的 IPv4 段（认不出来的一律视为危险）。
 */
function isPrivateIPv4(ip) {
  const parts = String(ip || '').split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 环回
  if (a === 169 && b === 254) return true; // 169.254/16 链路本地（云元数据 169.254.169.254）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a >= 224) return true; // 224/4 组播 + 240/4 保留
  return false;
}

/** 展开 IPv6 地址为 8 个 16 位分组（失败返回 null） */
function ipv6Groups(raw) {
  let ip = String(raw || '').trim().toLowerCase();
  const pct = ip.indexOf('%');
  if (pct >= 0) ip = ip.slice(0, pct); // 去 zone id（fe80::1%eth0）
  const v4 = ip.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const n = v4.slice(1).map(Number);
    if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
    const hi = ((n[0] << 8) | n[1]) >>> 0;
    const lo = ((n[2] << 8) | n[3]) >>> 0;
    ip = ip.slice(0, ip.length - v4[0].length) + hi.toString(16) + ':' + lo.toString(16);
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  const isHex = (g) => /^[0-9a-f]{1,4}$/.test(g);
  if (!head.every(isHex) || !tail.every(isHex)) return null;
  if (halves.length === 1) return head.length === 8 ? head.map((g) => parseInt(g, 16)) : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head.map((g) => parseInt(g, 16)), ...Array(fill).fill(0), ...tail.map((g) => parseInt(g, 16))];
}

/** 私网/环回/链路本地/组播等不可抓取的 IPv6（含 IPv4 映射、兼容与 NAT64 内嵌地址） */
function isPrivateIPv6(raw) {
  const g = ipv6Groups(raw);
  if (!g) return true; // 认不出来 → 视为危险
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 环回
  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 唯一本地地址
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 链路本地
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 组播
  // ::ffff:a.b.c.d（0:0:0:0:0:ffff:…）/ ::a.b.c.d（0:0:0:0:0:0:…）/ 64:ff9b::a.b.c.d：按内嵌 IPv4 判定
  const mapped = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff;
  const compat = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0;
  const nat64 = g[0] === 0x0064 && g[1] === 0xff9b;
  if (mapped || compat || nat64) {
    return isPrivateIPv4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  return false;
}

/**
 * 畸形主机名判定（不依赖 DNS 解析）：纯十进制 IP（2852039166）、十六进制写法（0x7f.0.0.1）、
 * 前导零八进制写法（0177.0.0.1）以及非标准点分写法（127.1）一律拒绝。
 * 浏览器/URL 解析器会把这些形态规范化成点分十进制，因此必须对「原始写法」判定。
 */
function isMalformedHost(rawHost) {
  const h = String(rawHost || '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!h) return true;
  if (/^\d+$/.test(h)) return true; // 纯十进制：2852039166
  if (/^0x[0-9a-f]+$/.test(h)) return true; // 纯十六进制：0x7f000001
  if (h.split('.').some((label) => /^0x[0-9a-f]+$/.test(label))) return true; // 0x7f.0.0.1
  if (/^[\d.]+$/.test(h)) {
    const parts = h.split('.');
    if (parts.length !== 4) return true; // 127.1 / 1.2.3 简写
    if (parts.some((p) => p.length > 1 && p.startsWith('0'))) return true; // 0177.0.0.1 八进制写法
    return false; // 标准四段十进制：交给 IP 段判定
  }
  return false;
}

/** 从原始 URL 字符串里取「未经规范化」的主机名（用于畸形写法判定） */
function extractRawHost(rawUrl) {
  const s = String(rawUrl || '').trim();
  const m = s.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#]*@)?(\[[^\]]*\]|[^/?#:]*)/i);
  return m ? String(m[1] || '') : '';
}

/**
 * OAuth 头像地址的「实际落地 IP」校验：每一跳抓取前解析主机名，
 * 全部解析结果都必须落在公网地址段，否则拒绝（挡掉 nip.io 之类指向内网的域名）。
 * 仅使用 Node 内置 dns，不引入新依赖。
 */
async function assertPublicHost(rawUrl, u) {
  if (isMalformedHost(extractRawHost(rawUrl)) || isMalformedHost(u.hostname)) {
    throw new Error('头像地址非法：主机名格式异常');
  }
  let addrs;
  try {
    addrs = await dnsLookup(u.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('头像域名解析失败');
  }
  if (!Array.isArray(addrs) || addrs.length === 0) throw new Error('头像域名解析失败');
  for (const item of addrs) {
    const ip = String(item?.address || '');
    const priv = Number(item?.family) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
    if (priv) throw new Error('头像地址指向内网，已拒绝');
  }
}

/**
 * OAuth 头像地址放行判定 —— 只用于「来自 provider userinfo / 已知 provider 域名」的地址，
 * 用户自己提交的 URL 仍走 isAllowedAvatarHost 的严格白名单（不受此函数影响）。
 * 规则：必须 https；禁止内网/本地直连；命中内置白名单或 extraHosts（provider 已知域名）即放行；
 * allowPublicHost=true 时额外放行任意公网域名（provider 的头像 CDN 常与 API 域名不同）。
 */
export function isAllowedOAuthAvatarUrl(rawUrl, { extraHosts = [], allowPublicHost = false } = {}) {
  try {
    const u = new URL(String(rawUrl || ''));
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (isInternalHost(host)) return false;
    if (isAllowedAvatarHost(host)) return true;
    const hosts = (Array.isArray(extraHosts) ? extraHosts : [extraHosts])
      .map((s) => String(s || '').toLowerCase())
      .filter(Boolean);
    if (hosts.some((s) => host === s || host.endsWith('.' + s))) return true;
    return !!allowPublicHost;
  } catch {
    return false;
  }
}

/** 魔数嗅探图片真实类型（不信任远端 Content-Type） */
function sniffImage(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'image/webp';
  return null;
}

/** 带总超时的单次抓取：超时用 AbortController 中断，超过整体截止时间直接判超时 */
async function fetchWithDeadline(url, deadline) {
  const remain = deadline - Date.now();
  if (remain <= 0) throw new Error('头像下载超时');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('头像下载超时')), remain);
  try {
    return await oauthFetch(url, { redirect: 'manual', headers: { 'User-Agent': 'shimmerblog' }, signal: ac.signal });
  } catch (e) {
    if (ac.signal.aborted) throw new Error('头像下载超时');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 下载第三方头像并转存为本站文件，返回站内 URL（/uploads/avatars/xxx）。
 * 校验失败（非 https / 域名不在白名单 / 超大小 / 类型不符 / 魔数不匹配）抛错，由调用方决定回落默认头像。
 */
export async function saveAvatarFromUrl(rawUrl, opts = {}) {
  let target = String(rawUrl || '');
  let res = null;
  // 域名校验口径：默认严格白名单（用户自提交路径）；source='oauth' 时走 OAuth 豁免
  // （https + 禁内网直连 + provider 已知域名/公网域名），不放宽用户自提交路径
  const oauthMode = opts.source === 'oauth';
  const extraHosts = Array.isArray(opts.extraHosts) ? opts.extraHosts : [];
  const hostAllowed = (u) =>
    oauthMode
      ? isAllowedOAuthAvatarUrl(u.href, { extraHosts, allowPublicHost: true })
      : isAllowedAvatarHost(u.hostname);
  // 重定向跳数上限（0–12）与总超时（1–300 秒）走后台 settings（默认 12 跳 / 60 秒），测试可用 opts 覆盖
  const maxRedirects = opts.maxRedirects ?? (await avatarRedirectHops());
  const deadline = Date.now() + (opts.timeoutMs ?? (await avatarTimeoutSeconds()) * 1000);
  // 手动跟随重定向（≤3 跳），每一跳都重新校验协议与域名，防止重定向绕过白名单
  for (let hops = 0; hops <= maxRedirects; hops++) {
    const u = new URL(target);
    if (u.protocol !== 'https:') throw new Error('头像地址必须为 https');
    if (!hostAllowed(u)) throw new Error('第三方头像域名不受支持');
    // OAuth 豁免路径：每一跳都校验「实际解析到的 IP」是否落在公网（防 nip.io 之类域名绕到内网）
    if (oauthMode) await assertPublicHost(target, u);
    res = await fetchWithDeadline(u.href, deadline);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('头像下载失败：重定向缺少目标');
      target = new URL(loc, u).href;
      res = null;
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error(`头像下载失败（HTTP ${res ? res.status : '?'}）`);

  const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!AVATAR_TYPES[mime]) throw new Error('仅支持 png/jpg/gif/webp 头像');
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > AVATAR_MAX_BYTES) throw new Error('头像文件过大（上限 2MB）');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > AVATAR_MAX_BYTES) throw new Error('头像文件过大（上限 2MB）');

  // 内容嗅探必须与声明类型一致（伪装成图片的可执行内容直接拒绝）
  const sniffed = sniffImage(buf);
  if (!sniffed || sniffed !== mime) throw new Error('头像文件内容校验未通过');

  // 与 multer 上传头像是同一套命名与落盘方式
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${AVATAR_TYPES[mime]}`;
  await fs.promises.writeFile(path.join(avatarsDir, name), buf);
  return `/uploads/avatars/${name}`;
}
