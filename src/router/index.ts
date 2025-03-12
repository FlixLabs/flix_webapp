import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import LibraryView from '../views/LibraryView.vue'
import OutingsView from '../views/OutingsView.vue'
import SystemView from '../views/SystemView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
      component: DashboardView
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: DashboardView
    },
    {
      path: '/library',
      name: 'Library',
      component: LibraryView
    },
    {
      path: '/outings',
      name: 'Outings',
      component: OutingsView
    },
    {
      path: '/system',
      name: 'System',
      component: SystemView
    }
  ]
})

export default router
