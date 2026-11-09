/**
 * 外站跳转白名单：条目归一化与主机匹配。
 *
 * 规则（与后端 server/src/services/settings.js 的 normalizeExternalLinkWhitelist 保持一致）：
 * - 大小写不敏感；
 * - 条目 `example.com` 命中自身与任意子域（`www.example.com`）；
 * - 条目 `.example.com` / `*.example.com` 只命中子域，不含 apex（`example.com` 本身不命中）；
 * - 支持直接粘贴完整 URL（归一化时只取 hostname，剥掉 scheme/路径/查询串/端口）；
 * - 归一化后去空、去非法条目、去重（保留首次出现顺序）。
 *
 * 规范条目形态：普通条目 `example.com`；仅子域条目 `.example.com`。
 */

/** 合法主机名（label = 字母数字/连字符，且不能以连字符开头或结尾） */
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * 归一化单个白名单条目：
 * @returns 规范条目字符串（`example.com` / `.example.com`），非法或空 → 空串
 */
export function normalizeWhitelistEntry(input: unknown): string {
  let s = String(input ?? '').trim();
  if (!s) return '';
  // 「仅子域」标记：*.example.com / .example.com → 统一为 .example.com
  let subOnly = false;
  if (s.startsWith('*.')) {
    subOnly = true;
    s = s.slice(2);
  } else if (s.startsWith('.')) {
    subOnly = true;
    s = s.slice(1);
  }
  // 剥掉 scheme（http://、https://）与协议相对前缀（//）
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '');
  // 剥掉 userinfo（user:pass@host）
  const at = s.lastIndexOf('@');
  if (at >= 0) s = s.slice(at + 1);
  // 剥掉路径 / 查询串 / 锚点
  s = s.split(/[/?#]/)[0];
  // 剥掉端口
  s = s.replace(/:\d+$/, '');
  s = s.trim().toLowerCase();
  // 去掉结尾的点（FQDN 写法 example.com.）
  s = s.replace(/\.+$/, '');
  if (!s || !HOST_RE.test(s)) return '';
  return subOnly ? `.${s}` : s;
}

/**
 * 归一化整份白名单：支持多行字符串或字符串数组（条目之间可用换行或逗号分隔）
 * @returns 规范条目数组（已去空、去非法、去重）
 */
export function normalizeWhitelistEntries(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join('\n') : String(value ?? '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/[\r\n]+/)) {
    for (const part of line.split(',')) {
      const entry = normalizeWhitelistEntry(part);
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
    }
  }
  return out;
}

/**
 * 主机名是否命中白名单
 * @param host 目标主机名（大小写不敏感）
 * @param entries 白名单条目（规范条目或原始条目均可，内部会再归一化一次）
 */
export function isHostWhitelisted(host: string, entries: string[] | null | undefined): boolean {
  const h = String(host ?? '').trim().toLowerCase().replace(/\.+$/, '');
  if (!h) return false;
  for (const entry of normalizeWhitelistEntries(entries)) {
    const subOnly = entry.startsWith('.');
    const base = subOnly ? entry.slice(1) : entry;
    if (!base) continue;
    // 结尾匹配必须带点边界，避免 `notexample.com` 命中 `example.com`
    const isSub = h.endsWith(`.${base}`);
    if (subOnly) {
      if (isSub) return true; // 仅子域：apex 本身不命中
    } else if (h === base || isSub) {
      return true; // 自身 + 任意子域
    }
  }
  return false;
}

/**
 * URL 是否命中白名单（取 hostname 判定；相对地址按 localhost 解析）
 */
export function isUrlWhitelisted(url: URL | string, entries: string[] | null | undefined): boolean {
  let host = '';
  if (typeof url === 'string') {
    try {
      host = new URL(url, 'http://localhost').hostname;
    } catch {
      return false;
    }
  } else {
    host = url.hostname;
  }
  return isHostWhitelisted(host, entries);
}
