import { apiSessionToken, verifySessionRole } from '@/composables/apiSession';
import { createRouter, createWebHistory } from 'vue-router'
import { useResettable } from '@/composables/useResettable'

const { state: useAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const routes = [
  { path: '/join', name: 'Join', component: () => import('../components/AcceptInvitation.vue') },
  { path: '/account', name: 'Account', component: () => import('../components/GuestAccount.vue'), meta: { requiresAuth: true, guest: true } },
  { path: '/users', name: 'Users', component: () => import('../components/UserAdministration.vue'), meta: { requiresAuth: true } },
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

router.beforeEach(async (to) => {
  if (!useAPI.value && ['/join', '/account', '/users'].includes(to.path)) return '/dashboard';
  if (useAPI.value) {
    const is_authenticated = sessionStorage.getItem('flix_webapp_is_authenticated') === 'true' || !!apiSessionToken();

    if (to.meta.requiresAuth && !is_authenticated) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }
    if (to.meta.requiresAuth && apiSessionToken()) {
      try {
        const role = await verifySessionRole();
        if (role === 'user' && !to.meta.guest) return '/account';
        if (role === 'admin' && to.meta.guest) return '/dashboard';
      } catch { return { path: '/login', query: { redirect: to.fullPath } }; }
    }
  }
});

export default router
