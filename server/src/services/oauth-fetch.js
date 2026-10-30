import { ProxyAgent } from 'undici';
import { oauthProxy } from './settings.js';

// OAuth 及第三方头像下载的出站请求统一走这里：配置了 oauth_proxy_url（或 OAUTH_PROXY_URL）
// 时经 HTTP(S) 代理，供国内服务器访问 GitHub/Google。ProxyAgent 按 URL 缓存，后台改配置后自动重建。
let _proxyAgent = null;
let _proxyAgentUrl = '';
export async function oauthFetch(url, opts = {}) {
  const proxy = await oauthProxy();
  if (proxy) {
    if (proxy !== _proxyAgentUrl) {
      _proxyAgent = new ProxyAgent(proxy);
      _proxyAgentUrl = proxy;
    }
    opts.dispatcher = _proxyAgent;
  }
  return fetch(url, opts);
}
