import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { setArticleTitle } from '../utils/title';
import { scrollGate } from '../utils/scrollGate';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/about', name: 'about', component: () => import('../views/AboutView.vue') },
    { path: '/article/:id', name: 'article', component: () => import('../views/ArticleView.vue') },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/auth/callback', name: 'auth-callback', component: () => import('../views/AuthCallbackView.vue') },
    {
      path: '/console',
      name: 'console',
      component: () => import('../views/ConsoleView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue') },
    { path: '/space/:id', name: 'space', component: () => import('../views/SpaceView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') },
  ],
  scrollBehavior(to, from, saved) {
    // 星光过渡：滚动复位必须等旧页解散完 —— 否则视口在离场一开始就弹回顶部，
    // 按旧滚动位置规划的消散小窗全部落在画面外（整屏瞬黑）。
    // 此处只挂起目标位置，App.vue 在 onEnter 里应用。
    if (scrollGate.active) {
      scrollGate.set(saved ?? { top: 0, left: 0 });
      return false;
    }
    if (saved) return saved;
    // behavior: 'instant' 绕过 html { scroll-behavior: smooth }，
    // 避免切页时平滑滚动进行中导致星光过渡采样到漂移中的坐标
    return { top: 0, behavior: 'instant' as ScrollBehavior };
  },
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.fetchMe();
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

// 每次切换路由先恢复站点默认标题；文章页会在数据加载完成后自行覆盖为文章标题
router.afterEach((to) => {
  setArticleTitle(null);
  // 与 index.html 的首屏底色保持一致：后台浅底、前台黑底（避免切页时边缘露出错误底色）
  document.documentElement.classList.toggle('admin-route', to.name === 'admin');
});

export default router;
