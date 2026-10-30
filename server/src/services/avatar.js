import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { oauthFetch } from './oauth-fetch.js';
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

/**
 * 下载第三方头像并转存为本站文件，返回站内 URL（/uploads/avatars/xxx）。
 * 校验失败（非 https / 域名不在白名单 / 超大小 / 类型不符 / 魔数不匹配）抛错，由调用方决定回落默认头像。
 */
export async function saveAvatarFromUrl(rawUrl) {
  let target = String(rawUrl || '');
  let res = null;
  // 手动跟随重定向（≤3 跳），每一跳都重新校验协议与域名，防止重定向绕过白名单
  for (let hops = 0; hops < 4; hops++) {
    const u = new URL(target);
    if (u.protocol !== 'https:') throw new Error('头像地址必须为 https');
    if (!isAllowedAvatarHost(u.hostname)) throw new Error('第三方头像域名不受支持');
    res = await oauthFetch(u.href, { redirect: 'manual', headers: { 'User-Agent': 'shimmerblog' } });
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
