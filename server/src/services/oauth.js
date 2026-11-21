/**
 * 第三方登录（OAuth2 provider）适配层：
 * - providerAdapter(provider)：按 provider.type 给出差异化的「拼授权地址 / 换 token / 拉用户信息」逻辑；
 * - RESERVED_PROVIDER_SLUGS：系统保留字（既有 auth 路由前缀 + 通用词），禁止被占用为 provider slug；
 * - normalizeProviderInput()：后台 provider CRUD 的入参校验与归一（POST 全量 / PUT 部分更新共用）。
 *
 * 端点地址统一走 settings.js 的 resolveProviderEndpoints(row)：行内自定义值为空时回落到 type 预设。
 */
import { oauthFetch } from './oauth-fetch.js';
import { resolveProviderEndpoints } from './settings.js';

/** provider 类型枚举（与建表 ENUM 一致） */
export const PROVIDER_TYPES = ['github', 'google', 'generic'];

/**
 * 系统保留 slug：
 * 既是 auth 路由的既有前缀（动态路由 /:slug 不能遮蔽它们），也是后台新建 provider 时的禁用词。
 * github / google 不在列 —— 它们本身就是合法 provider。
 */
export const RESERVED_PROVIDER_SLUGS = new Set([
  'login', 'register', 'logout', 'send-code', 'code', 'reset-password', 'bind', 'me',
  'notify-prefs', 'profile', 'password', 'oauth', 'avatar', 'callback', 'api', 'admin',
  'site', 'articles', 'article', 'space', 'review', 'captcha', 'health', 'uploads',
  'settings', 'users', 'user', 'providers', 'public', 'search', 'home', 'index',
  'favicon.ico', 'static', 'assets',
]);

/** GitHub 用户邮箱列表（预设固定地址，不随 provider 行变化） */
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

/**
 * provider 适配器：按 type 返回差异化逻辑。
 * 统一入参：provider 行（oauth_providers 表的一行）；端点来自 resolveProviderEndpoints。
 */
export function providerAdapter(provider) {
  const row = provider || {};
  const type = str(row.type).trim().toLowerCase() || 'generic';
  const ep = resolveProviderEndpoints(row);
  const name = str(row.name).trim() || type;

  /* ---- GitHub：token 交换用 JSON 请求体，用户信息取 /user，邮箱另拉 /user/emails ---- */
  if (type === 'github') {
    return {
      type,
      name,
      endpoints: ep,
      authorizeUrl({ clientId, redirectUri, state, scope }) {
        const url = new URL(ep.authorize_url);
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('response_type', 'code');
        if (scope) url.searchParams.set('scope', scope);
        url.searchParams.set('state', state);
        return url.toString();
      },
      async exchangeCode({ code, clientId, clientSecret, redirectUri }) {
        const res = await oauthFetch(ep.token_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data || !data.access_token) throw new Error('授权失败');
        return data;
      },
      async fetchUserInfo(accessToken, { needEmail = true } = {}) {
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'shimmerblog',
        };
        const res = await oauthFetch(ep.userinfo_url, { headers });
        if (!res.ok) throw new Error(`获取用户信息失败（HTTP ${res.status}）`);
        const ghUser = await res.json();
        const providerUserId = str(ghUser?.id);
        let email = '';
        if (needEmail) {
          try {
            const emailsRes = await oauthFetch(GITHUB_EMAILS_URL, { headers });
            const list = emailsRes.ok ? await emailsRes.json() : [];
            const hit = (Array.isArray(list) ? list : []).find((e) => e && e.primary && e.verified);
            email = str(hit?.email);
          } catch {
            // 邮箱列表拉取失败不阻断登录（沿用旧逻辑：退回 /user 的公开邮箱）
          }
          if (!email) email = str(ghUser?.email);
        }
        return {
          providerUserId,
          email,
          name: str(ghUser?.name || ghUser?.login || 'github 用户'),
          avatar: str(ghUser?.avatar_url),
        };
      },
    };
  }

  /* ---- Google（OIDC）：标准 JSON 表单换 token，用户信息取 sub / email / picture ---- */
  if (type === 'google') {
    return {
      type,
      name,
      endpoints: ep,
      authorizeUrl({ clientId, redirectUri, state, scope }) {
        const url = new URL(ep.authorize_url);
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('response_type', 'code');
        if (scope) url.searchParams.set('scope', scope);
        url.searchParams.set('state', state);
        return url.toString();
      },
      async exchangeCode({ code, clientId, clientSecret, redirectUri }) {
        const res = await oauthFetch(ep.token_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!data || !data.access_token) throw new Error('授权失败');
        return data;
      },
      async fetchUserInfo(accessToken) {
        const res = await oauthFetch(ep.userinfo_url, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`获取用户信息失败（HTTP ${res.status}）`);
        const ui = await res.json();
        // 只信任 Google 明确标注已验证的邮箱
        const email = ui?.email && ui?.email_verified ? String(ui.email).toLowerCase() : '';
        return {
          providerUserId: str(ui?.sub),
          email,
          name: str(ui?.name || 'google 用户'),
          avatar: str(ui?.picture),
        };
      },
    };
  }

  /* ---- generic：标准 OAuth2 code 交换（form-urlencoded）+ JSON 用户信息 ---- */
  return {
    type: 'generic',
    name,
    endpoints: ep,
    authorizeUrl({ clientId, redirectUri, state, scope }) {
      const url = new URL(ep.authorize_url);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      if (scope) url.searchParams.set('scope', scope);
      url.searchParams.set('state', state);
      return url.toString();
    },
    async exchangeCode({ code, clientId, clientSecret, redirectUri }) {
      const res = await oauthFetch(ep.token_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data || !data.access_token) throw new Error('授权失败');
      return data;
    },
    async fetchUserInfo(accessToken) {
      const res = await oauthFetch(ep.userinfo_url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`获取用户信息失败（HTTP ${res.status}）`);
      const ui = await res.json();
      // provider_user_id 依次尝试 sub → id → login → username（取第一个非空，转字符串）
      const providerUserId =
        str(ui?.sub) || str(ui?.id) || str(ui?.login) || str(ui?.username);
      return {
        providerUserId,
        email: ui?.email ? String(ui.email).toLowerCase() : '',
        name: str(ui?.name || ui?.nickname || ui?.login || ui?.username || '第三方用户'),
        avatar: str(ui?.avatar_url) || str(ui?.picture),
      };
    },
  };
}

/* ---------- 后台 provider CRUD 的入参校验与归一 ---------- */

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const URL_FIELDS = ['authorize_url', 'token_url', 'userinfo_url'];

/**
 * 校验并归一 provider 入参。
 * @param {object} input 请求体
 * @param {object} opts partial=true 时按部分更新处理（缺省字段沿用 current）；current 为现有行
 * @returns {{ok: true, value: object} | {ok: false, message: string}}
 */
export function normalizeProviderInput(input, { partial = false, current = null } = {}) {
  const cur = current || {};
  const raw = input && typeof input === 'object' ? input : {};
  const fail = (message) => ({ ok: false, message });
  const out = {};

  // slug：格式 + 保留字
  if (!partial || raw.slug !== undefined) {
    const slug = str(raw.slug).trim().toLowerCase();
    if (!slug) return fail('provider slug 不能为空');
    if (!SLUG_RE.test(slug)) {
      return fail('provider slug 只能使用小写字母、数字、下划线或短横线，长度 1–50');
    }
    if (RESERVED_PROVIDER_SLUGS.has(slug)) return fail(`slug「${slug}」是系统保留字，请换一个`);
    out.slug = slug;
  }

  // name：必填、最长 100
  if (!partial || raw.name !== undefined) {
    const name = str(raw.name).trim();
    if (!name) return fail('provider 名称不能为空');
    if (name.length > 100) return fail('provider 名称最长 100 字');
    out.name = name;
  }

  // type：仅三种
  const type = str(raw.type !== undefined ? raw.type : (partial ? cur.type : '')).trim().toLowerCase();
  if (!PROVIDER_TYPES.includes(type)) return fail('provider 类型仅支持 github / google / generic');
  out.type = type;

  // client_id：必填
  if (!partial || raw.client_id !== undefined) {
    const cid = str(raw.client_id).trim();
    if (!cid) return fail('client_id 不能为空');
    if (cid.length > 255) return fail('client_id 最长 255 字');
    out.client_id = cid;
  }

  // client_secret：允许为空（哨兵语义由路由层先解析成实际值）
  if (!partial || raw.client_secret !== undefined) {
    const cs = str(raw.client_secret);
    if (cs.length > 512) return fail('client_secret 最长 512 字');
    out.client_secret = cs;
  }

  // 端点 URL：必须 https；generic 三个端点必填
  const effective = { ...cur, ...out };
  for (const f of URL_FIELDS) {
    const v = str(raw[f] !== undefined ? raw[f] : (partial ? cur[f] : '')).trim();
    if (v && !/^https:\/\//i.test(v)) return fail(`${f} 必须以 https:// 开头`);
    if (v.length > 500) return fail(`${f} 最长 500 字`);
    effective[f] = v;
  }
  if (effective.type === 'generic') {
    for (const f of URL_FIELDS) {
      if (!effective[f]) return fail(`generic 类型必须填写 ${f}`);
    }
  }
  for (const f of URL_FIELDS) {
    if (raw[f] !== undefined || !partial) out[f] = effective[f];
  }

  // scope
  if (raw.scope !== undefined || !partial) {
    const sc = str(raw.scope !== undefined ? raw.scope : (partial ? cur.scope : '')).trim();
    if (sc.length > 200) return fail('scope 最长 200 字');
    out.scope = sc;
  }

  // enabled / sort_order
  if (raw.enabled !== undefined) out.enabled = raw.enabled ? 1 : 0;
  if (raw.sort_order !== undefined) {
    const n = Number.parseInt(raw.sort_order, 10);
    out.sort_order = Number.isFinite(n) ? n : 0;
  }

  return { ok: true, value: out };
}
