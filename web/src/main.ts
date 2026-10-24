import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles/tokens.css';
import { useSiteStore } from './stores/site';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia).use(router);

// 等首个路由解析完成（router.isReady）再挂载：否则刷新 /admin 等深链会先渲染首页再跳转。
// 用户信息由 router.beforeEach 里的 auth.fetchMe() 负责，这里只需站点配置。
Promise.allSettled([router.isReady(), useSiteStore(pinia).fetch()]).finally(() => app.mount('#app'));
