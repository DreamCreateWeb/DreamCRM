import type { ModuleRegistry } from './types'

/**
 * Patient portal — what a patient sees when they log into their clinic's portal.
 * Highly constrained: their own data only, no admin features.
 */
export const patientModules: ModuleRegistry = {
  tenantType: 'patient',
  modules: [
    { id: 'home',           path: '/',              label: 'Home',           section: 'Pages', icon: 'home',    status: 'live' },
    { id: 'appointments',   path: '/appointments',  label: 'My Appointments',section: 'Pages', icon: 'cal',     status: 'live' },
    { id: 'book',           path: '/book',          label: 'Book Visit',     section: 'Pages', icon: 'plus',    status: 'soon' },
    { id: 'records',        path: '/records',       label: 'My Records',     section: 'Pages', icon: 'folder',  status: 'soon' },
    { id: 'messages',       path: '/messages',      label: 'Messages',       section: 'Pages', icon: 'chat',    status: 'live' },
    { id: 'invoices',       path: '/invoices',      label: 'Bills',          section: 'Pages', icon: 'receipt', status: 'live' },
    { id: 'profile',        path: '/profile',       label: 'My Profile',     section: 'Settings', icon: 'user', status: 'live' },
  ],
}
