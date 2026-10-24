import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { setArticleTitle } from '../utils/title';

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
    if (saved) return saved;
    return { top: 0 };
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
