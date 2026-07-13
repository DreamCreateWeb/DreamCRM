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
    { id: 'overview',         path: '/dashboard',           label: 'Overview',         section: 'Daily',     icon: 'home',     status: 'live', pinned: true, shortcut: '⌘1' },
    { id: 'clinics',          path: '/ecommerce/customers',           label: 'Clinics',          section: 'Customers', icon: 'building', status: 'live', pinned: true, shortcut: '⌘2' },
    { id: 'client_messaging', path: '/messages',            label: 'Client Messaging', section: 'Customers', icon: 'chat',     status: 'live', pinned: true, shortcut: '⌘3' },
    { id: 'subscriptions',    path: '/ecommerce/invoices',            label: 'Subscriptions',    section: 'Customers', icon: 'receipt',  status: 'live' },
    { id: 'partners',         path: '/partners',            label: 'Partners',         section: 'Customers', icon: 'users',    status: 'live' },
    // "Sales Pipeline" (prospecting) is THE clinic-acquisition engine; the old
    // /marketing prospect-funnel row was dropped from the nav (2026-07-13 —
    // two rows for one concept; the route stays live for muscle memory).
    // "Projects" is post-sale delivery, deliberately grouped with Sales.
    { id: 'prospecting',      path: '/platform/prospecting', label: 'Sales Pipeline',   section: 'Sales',     icon: 'search',   status: 'live' },
    { id: 'sales_pipeline',   path: '/ecommerce/orders',              label: 'Projects',         section: 'Sales',     icon: 'flag',     status: 'live' },
    { id: 'analytics',        path: '/dashboard/analytics', label: 'Platform Metrics', section: 'Insights',  icon: 'chart',    status: 'live' },
    { id: 'mrr',              path: '/dashboard/fintech',   label: 'Revenue',          section: 'Insights',  icon: 'wallet',   status: 'live' },
    { id: 'marketing_blog',   path: '/website/blog',               label: 'Platform Blog',    section: 'Content',   icon: 'pen',      status: 'live' },
    { id: 'search_console',   path: '/website/seo',                 label: 'Search Console',   section: 'Content',   icon: 'search', status: 'live' },
    { id: 'service_library',  path: '/platform/service-library', label: 'Service Library', section: 'Content',   icon: 'gear', status: 'live' },
    { id: 'settings',         path: '/settings',            label: 'Settings',         section: 'Settings', icon: 'gear', status: 'live' },
    // Removed 2026-07-07 (platform declutter): the generic Mosaic Calendar
    // (/calendar) and Tasks kanban (/tasks/kanban) — neither is dental or
    // platform-specific (no shipping dental product runs a generic todo
    // board), plus the dead 'Developer' slot. All three were template leftovers;
    // /calendar, /tasks/* and /developer all redirect to /dashboard so an old
    // bookmark never dead-ends.
  ],
}
