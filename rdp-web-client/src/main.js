import { createApp } from 'vue'
import App from './App.vue'
import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import RemoteViewer from './views/RemoteViewer.vue'
import Login from './views/Login.vue'
import { getToken, clearToken } from './auth'

const routes = [
  { path: '/login', component: Login },
  { path: '/', component: Dashboard, meta: { requiresAuth: true } },
  { path: '/remote/:agentId', component: RemoteViewer, props: true, meta: { requiresAuth: true } }
]

const router = createRouter({
  history: createWebHistory('/client/'),
  routes,
})

const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};

router.beforeEach((to, from, next) => {
  const token = getToken();
  if (token && isTokenExpired(token)) {
    clearToken();
  }

  if (to.meta.requiresAuth && (!token || isTokenExpired(token))) {
    next('/login');
  } else {
    next();
  }
});

const app = createApp(App)
app.use(router)
app.mount('#app')
