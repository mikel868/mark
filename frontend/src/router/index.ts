import { createRouter, createWebHistory } from 'vue-router'

import { isPlatformId } from '../domain/platform'
import AppShell from '../layouts/AppShell.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/ins/accounts',
    },
    {
      path: '/:platform',
      component: AppShell,
      children: [
        {
          path: '',
          redirect: (to) => `/${String(to.params.platform)}/accounts`,
        },
        {
          path: 'accounts',
          name: 'accounts',
          component: () => import('../features/accounts/AccountsView.vue'),
        },
        {
          path: 'appeal-flow',
          name: 'appeal-flow',
          component: () => import('../features/appeal-flow/AppealFlowView.vue'),
        },
        {
          path: 'appeal-records',
          name: 'appeal-records',
          component: () => import('../features/appeal-records/AppealRecordsView.vue'),
        },
        {
          path: 'backup',
          name: 'backup',
          component: () => import('../features/backup/BackupView.vue'),
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/ins/accounts',
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  if ('platform' in to.params && !isPlatformId(to.params.platform)) {
    return '/ins/accounts'
  }
})

export default router
