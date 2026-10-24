/**
 * 标签页标题统一管理。
 * - 站点默认标题由 site store 在拉到 /api/site 后写入（setSiteName）。
 * - 文章页数据加载完成后覆盖为「文章标题 · 站点标题」（setArticleTitle）。
 * - 每次路由切换由 router.afterEach 复位为站点默认标题，避免停留在上一篇文章标题。
 */
let currentArticle: string | null = null;
let siteName = '微光博客';

function apply() {
  document.title = currentArticle ? `${currentArticle} · ${siteName}` : siteName;
}

/** site store 拉到站点配置后调用 */
export function setSiteName(name: string | undefined) {
  siteName = name || '微光博客';
  apply();
}

/** 文章页数据就绪后调用；传 null 表示回到站点默认标题 */
export function setArticleTitle(title: string | null) {
  currentArticle = title;
  apply();
}
