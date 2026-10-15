import { apiSessionToken } from '@/composables/apiSession';
import { createRouter, createWebHistory } from 'vue-router'
import { useResettable } from '@/composables/useResettable'

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue')
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: {
      requiresAuth: true,
      requiresInstance: true
    }
  },
  {
    path: '/library',
    name: 'Library',
    component: () => import('../views/LibraryView.vue'),
    meta: {
      requiresAuth: true,
      requiresInstance: true
    }
  },
  {
    path: '/calendar',
    name: 'Calendar',
    component: () => import('../views/CalendarView.vue'),
    meta: {
      requiresAuth: true,
      requiresInstance: true
    }
  },
  {
    path: '/outings',
    name: 'Outings',
    component: () => import('../views/OutingsView.vue'),
    meta: {
      requiresAuth: true,
      requiresInstance: true
    }
  },
  {
    path: '/downloads',
    name: 'Downloads',
    component: () => import('../views/DownloadsView.vue'),
    meta: {
      requiresAuth: true,
      requiresInstance: true
    }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: {
      requiresAuth: true
    }
  },
  {
    path: '/system',
    name: 'System',
    component: () => import('../views/SystemView.vue'),
    meta: {
      requiresAuth: true,
      requiresInstance: true
    }
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: routes
})

router.beforeEach((to) => {
  if (useAPI.value) {
    const is_authenticated = sessionStorage.getItem('flix_webapp_is_authenticated') === 'true' || !!apiSessionToken();

    if (to.meta.requiresAuth && !is_authenticated) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }
});

export default router
