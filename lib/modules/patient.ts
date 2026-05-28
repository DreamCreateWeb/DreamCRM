import type { ModuleRegistry } from './types'

/**
 * Patient portal — what a patient sees when they log into their clinic's portal.
 * Highly constrained: their own data only, no admin features.
 */
export const patientModules: ModuleRegistry = {
  tenantType: 'patient',
  modules: [
    { id: 'home',           path: '/patient/dashboard',     label: 'Home',            section: 'Pages',    icon: 'home',    status: 'live' },
    { id: 'appointments',   path: '/patient/appointments',  label: 'My Appointments', section: 'Pages',    icon: 'cal',     status: 'live' },
    { id: 'book',           path: '/patient/book',          label: 'Book Visit',      section: 'Pages',    icon: 'plus',    status: 'live' },
    { id: 'records',        path: '/patient/records',       label: 'My Records',      section: 'Pages',    icon: 'folder',  status: 'soon' },
    { id: 'messages',       path: '/patient/messages',      label: 'Messages',        section: 'Pages',    icon: 'chat',    status: 'live' },
    { id: 'invoices',       path: '/patient/invoices',      label: 'Bills',           section: 'Pages',    icon: 'receipt', status: 'live' },
    { id: 'profile',        path: '/patient/profile',       label: 'My Profile',      section: 'Settings', icon: 'user',    status: 'live' },
  ],
}
