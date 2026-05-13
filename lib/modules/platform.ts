import type { ModuleRegistry } from './types'

/**
 * Dream Create's own admin dashboard — manages clinics as customers,
 * tracks platform-level metrics, handles support.
 */
export const platformModules: ModuleRegistry = {
  tenantType: 'platform',
  modules: [
    { id: 'overview',         path: '/',                    label: 'Overview',         section: 'Pages', icon: 'home',     status: 'live' },
    { id: 'analytics',        path: '/dashboard/analytics', label: 'Platform Metrics', section: 'Pages', icon: 'chart',    status: 'live' },
    { id: 'mrr',              path: '/dashboard/fintech',   label: 'Revenue',          section: 'Pages', icon: 'wallet',   status: 'live' },
    { id: 'clinics',          path: '/customers',           label: 'Clinics',          section: 'Pages', icon: 'building', status: 'live' },
    { id: 'subscriptions',    path: '/invoices',            label: 'Subscriptions',    section: 'Pages', icon: 'receipt',  status: 'live' },
    { id: 'sales_pipeline',   path: '/orders',              label: 'Sales Pipeline',   section: 'Pages', icon: 'flag',     status: 'live' },
    { id: 'client_messaging', path: '/messages',            label: 'Client Messaging', section: 'Pages', icon: 'chat',     status: 'live' },
    { id: 'inbox',            path: '/inbox',               label: 'Inbox',            section: 'Pages', icon: 'inbox',    status: 'live' },
    { id: 'calendar',         path: '/calendar',            label: 'Calendar',         section: 'Pages', icon: 'cal',      status: 'live' },
    { id: 'tasks',            path: '/tasks/kanban',        label: 'Tasks',            section: 'Pages', icon: 'check',    status: 'live' },
    { id: 'campaigns',        path: '/campaigns',           label: 'Marketing',        section: 'Pages', icon: 'megaphone',status: 'live' },
    { id: 'settings',         path: '/settings/account',    label: 'Settings',         section: 'Settings', icon: 'gear', status: 'live' },
  ],
}
