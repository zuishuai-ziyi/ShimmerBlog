import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles/tokens.css';
import { useAuthStore } from './stores/auth';
import { useSiteStore } from './stores/site';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia).use(router);

// 启动即用本地 token 拉一次用户信息、拉站点配置（标题/副标题/GitHub 开关）
Promise.allSettled([useAuthStore(pinia).fetchMe(), useSiteStore(pinia).fetch()]).finally(() => app.mount('#app'));
