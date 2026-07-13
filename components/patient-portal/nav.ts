import type { PortalSettings } from '@/lib/types/portal'

/**
 * Portal navigation model, derived from the clinic's portal settings —
 * a feature toggled off disappears from nav AND its page (the page checks
 * the same flag), never a dead link.
 *
 * `primary` feeds the mobile bottom tab bar (max 4 + More) and the desktop
 * header nav; `more` lands in the More sheet / desktop overflow.
 */
export interface PortalNavItem {
  href: string
  /** Unread/attention count rendered as a badge (omitted or 0 = no badge). */
  badge?: number
  label: string
  icon: PortalIconName
}

export type PortalIconName =
  | 'home'
  | 'calendar'
  | 'chat'
  | 'card'
  | 'folder'
  | 'doc'
  | 'users'
  | 'bag'
  | 'user'
  | 'dots'

export function buildPortalNav(opts: {
  settings: PortalSettings
  /** Clinic storefront is enabled (Shop module) — gates the Shop link. */
  hasShop: boolean
  /** Signed-in patient has linked dependents — gates the Family entry. */
  hasDependents: boolean
  /** Unread clinic replies — renders a badge on the Messages entry. */
  unreadMessages?: number
}): { primary: PortalNavItem[]; more: PortalNavItem[] } {
  const f = opts.settings.features

  const all: Array<PortalNavItem & { enabled: boolean }> = [
    { href: '/patient/dashboard', label: 'Home', icon: 'home', enabled: true },
    { href: '/patient/appointments', label: 'Visits', icon: 'calendar', enabled: true },
    { href: '/patient/messages', label: 'Messages', icon: 'chat', enabled: f.messages, badge: opts.unreadMessages && opts.unreadMessages > 0 ? opts.unreadMessages : undefined },
    { href: '/patient/invoices', label: 'Billing', icon: 'card', enabled: f.billing },
    { href: '/patient/records', label: 'Records', icon: 'folder', enabled: f.records },
    { href: '/patient/intake', label: 'Forms', icon: 'doc', enabled: f.forms },
    // Feature-gated only (not && hasDependents): the page's day-0 value is
    // requesting your first family link — hiding it until a dependent exists
    // left no nav path to ever get one.
    { href: '/patient/family', label: 'Family', icon: 'users', enabled: f.family },
    { href: '/patient/shop', label: 'Shop', icon: 'bag', enabled: f.shopLink && opts.hasShop },
    { href: '/patient/profile', label: 'My info', icon: 'user', enabled: true },
  ]

  const enabled = all.filter((i) => i.enabled).map(({ enabled: _e, ...item }) => item)
  return { primary: enabled.slice(0, 4), more: enabled.slice(4) }
}
