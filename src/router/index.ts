import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue'
import LibraryView from '../views/LibraryView.vue'
import OutingsView from '../views/OutingsView.vue'
import SettingsView from '../views/SettingsView.vue'
import SystemView from '../views/SystemView.vue'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView,
    meta: {
      requiresAuth: true
    }
  },
  {
    path: '/library',
    name: 'Library',
    component: LibraryView,
    meta: {
      requiresAuth: true
    }
  },
  {
    path: '/outings',
    name: 'Outings',
    component: OutingsView,
    meta: {
      requiresAuth: true
    }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView,
    meta: {
      requiresAuth: true
    }
  },
  {
    path: '/system',
    name: 'System',
    component: SystemView,
    meta: {
      requiresAuth: true
    }
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: routes
})

router.beforeEach((to, from, next) => {
  const is_authenticated = sessionStorage.getItem('flix_webapp_is_authenticated') == 'true';

  if (to.meta.requiresAuth && !is_authenticated) {
    next('/login');
  } else {
    next();
  }
});

export default router
