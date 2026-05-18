import type { ModuleRegistry } from './types'

/**
 * Clinic dashboard — what a dental clinic sees after signing up.
 * Their "customers" are patients; their "orders" are treatment plans.
 * Higher plan tiers unlock more modules.
 */
export const clinicModules: ModuleRegistry = {
  tenantType: 'clinic',
  modules: [
    { id: 'overview',           path: '/',                  label: 'Overview',          section: 'Pages', icon: 'home',    status: 'live' },
    { id: 'analytics',          path: '/dashboard/analytics', label: 'Analytics',       section: 'Pages', icon: 'chart',   status: 'live', minPlan: 'pro' },
    { id: 'revenue',            path: '/dashboard/fintech', label: 'Revenue',           section: 'Pages', icon: 'wallet',  status: 'live', minPlan: 'pro' },
    { id: 'patients',           path: '/ecommerce/customers', label: 'Patients',        section: 'Pages', icon: 'users',   status: 'live', minPlan: 'pro' },
    { id: 'appointments',       path: '/calendar',          label: 'Appointments',      section: 'Pages', icon: 'cal',     status: 'live', minPlan: 'pro' },
    { id: 'treatment_plans',    path: '/orders',            label: 'Treatment Plans',   section: 'Pages', icon: 'flag',    status: 'live', minPlan: 'pro' },
    { id: 'invoices',           path: '/invoices',          label: 'Invoices',          section: 'Pages', icon: 'receipt', status: 'live', minPlan: 'pro' },
    { id: 'patient_messaging',  path: '/messages',          label: 'Patient Messaging', section: 'Pages', icon: 'chat',    status: 'live', minPlan: 'pro' },
    { id: 'inbox',              path: '/inbox',             label: 'Inbox',             section: 'Pages', icon: 'inbox',   status: 'live', minPlan: 'pro' },
    { id: 'tasks',              path: '/tasks/kanban',      label: 'Tasks',             section: 'Pages', icon: 'check',   status: 'live', minPlan: 'pro' },
    { id: 'patient_recall',     path: '/campaigns',         label: 'Patient Recall',    section: 'Pages', icon: 'megaphone', status: 'live', minPlan: 'premium' },
    { id: 'blog',               path: '/blog',              label: 'Blog Posts',        section: 'Website', icon: 'pen',   status: 'soon', minPlan: 'premium' },
    { id: 'seo',                path: '/seo',               label: 'SEO',               section: 'Website', icon: 'search', status: 'soon', minPlan: 'premium' },
    { id: 'careers',            path: '/careers',           label: 'Careers Page',      section: 'Website', icon: 'briefcase', status: 'soon', minPlan: 'premium' },
    { id: 'website',            path: '/website',           label: 'Website Editor',    section: 'Website', icon: 'globe', status: 'soon' },
    { id: 'settings',           path: '/settings/account',  label: 'Settings',          section: 'Settings', icon: 'gear', status: 'live' },
  ],
}
