import type { ModuleRegistry } from './types'

/**
 * Dream Create's own admin dashboard — manages clinics as customers,
 * tracks platform-level metrics, handles support.
 */
export const platformModules: ModuleRegistry = {
  tenantType: 'platform',
  modules: [
    // Overview / Clinics / Client Messaging are ALSO pinned into the cockpit
    // zone (⌘1/⌘2/⌘3) — the platform's every-day surfaces. Inbox folds into
    // Client Messaging at nav level (the /inbox route stays alive).
    { id: 'overview',         path: '/dashboard',           label: 'Overview',         section: 'Pages', icon: 'home',     status: 'live', pinned: true, shortcut: '⌘1' },
    { id: 'clinics',          path: '/ecommerce/customers',           label: 'Clinics',          section: 'Pages', icon: 'building', status: 'live', pinned: true, shortcut: '⌘2' },
    { id: 'client_messaging', path: '/messages',            label: 'Client Messaging', section: 'Pages', icon: 'chat',     status: 'live', pinned: true, shortcut: '⌘3' },
    { id: 'analytics',        path: '/dashboard/analytics', label: 'Platform Metrics', section: 'Pages', icon: 'chart',    status: 'live' },
    { id: 'mrr',              path: '/dashboard/fintech',   label: 'Revenue',          section: 'Pages', icon: 'wallet',   status: 'live' },
    { id: 'subscriptions',    path: '/ecommerce/invoices',            label: 'Subscriptions',    section: 'Pages', icon: 'receipt',  status: 'live' },
    { id: 'partners',         path: '/partners',            label: 'Partners',         section: 'Pages', icon: 'users',    status: 'live' },
    { id: 'sales_pipeline',   path: '/ecommerce/orders',              label: 'Sales Pipeline',   section: 'Pages', icon: 'flag',     status: 'live' },
    { id: 'calendar',         path: '/calendar',            label: 'Calendar',         section: 'Pages', icon: 'cal',      status: 'live' },
    { id: 'tasks',            path: '/tasks/kanban',        label: 'Tasks',            section: 'Pages', icon: 'check',    status: 'live' },
    { id: 'campaigns',        path: '/marketing',           label: 'Marketing',        section: 'Pages', icon: 'megaphone',status: 'live' },
    { id: 'marketing_blog',   path: '/posts',               label: 'Platform Blog',    section: 'Pages', icon: 'pen',      status: 'live' },
    { id: 'search_console',   path: '/seo',                 label: 'Search Console',   section: 'Settings', icon: 'search', status: 'live' },
    { id: 'service_library',  path: '/platform/service-library', label: 'Service Library', section: 'Settings', icon: 'gear', status: 'live' },
    { id: 'settings',         path: '/settings/account',    label: 'Settings',         section: 'Settings', icon: 'gear', status: 'live' },
    // 'Developer' is a placeholder slot for a future API-keys + webhooks
    // management page. Marked `soon` so the sidebar shows it dimmed
    // instead of routing to a 404 (no `/developer` page exists yet).
    { id: 'developer',        path: '/developer',           label: 'Developer',         section: 'Settings', icon: 'code', status: 'soon' },
  ],
}
