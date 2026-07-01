import type { ReactNode } from 'react'

/**
 * The single source of truth for the settings navigation taxonomy — consumed by
 * BOTH the Settings home (card grid) and the focused-page rail, so the two can
 * never drift.
 *
 * The old two-surface split (personal "You" vs "Clinic"/"Platform", with a
 * buried footer switcher) is GONE: personal-account pages are just a "Your
 * account" group inside one unified list, the way GitHub / Linear / Notion do
 * it. One nav, no surface toggle.
 */

export type SettingsTenant = 'clinic' | 'platform'

export interface SettingsNavItem {
  href: string
  label: string
  /** One-line description shown on the home tile. */
  desc: string
  icon: ReactNode
}

export interface SettingsNavGroup {
  title: string
  items: SettingsNavItem[]
}

// ── Icon glyphs (inline 16×16 paths; no icon-library import) ────────────────
const userIcon = (
  <path d="M8 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-5.143 7.91a1 1 0 1 1-1.714-1.033A7.996 7.996 0 0 1 8 10a7.996 7.996 0 0 1 6.857 3.877 1 1 0 1 1-1.714 1.032A5.996 5.996 0 0 0 8 12a5.996 5.996 0 0 0-5.143 2.91Z" />
)
const bellIcon = (
  <path d="m9 12.614 4.806 1.374a.15.15 0 0 0 .174-.21L8.133 2.082a.15.15 0 0 0-.268 0L2.02 13.777a.149.149 0 0 0 .174.21L7 12.614V9a1 1 0 1 1 2 0v3.614Zm-1 1.794-5.257 1.503c-1.798.514-3.35-1.355-2.513-3.028L6.076 1.188c.791-1.584 3.052-1.584 3.845 0l5.848 11.695c.836 1.672-.714 3.54-2.512 3.028L8 14.408Z" />
)
const shieldIcon = (
  <path d="M8 0a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V4a4 4 0 0 0-4-4Zm2 7H6V4a2 2 0 0 1 4 0v3ZM4 9h8v5H4V9Z" />
)
const buildingIcon = (
  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 14A6 6 0 1 1 8 2a6 6 0 0 1 0 12Zm0-10a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
)
const pinIcon = (
  <path d="M8 0a5 5 0 0 0-5 5c0 4 5 11 5 11s5-7 5-11a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
)
const teamIcon = (
  <path d="M5 4a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm3 5a5 5 0 0 0-5 5 1 1 0 1 1-2 0 7 7 0 0 1 14 0 1 1 0 1 1-2 0 5 5 0 0 0-5-5Z" />
)
const plugIcon = (
  <path d="M8 3.414V6a1 1 0 1 1-2 0V1a1 1 0 0 1 1-1h5a1 1 0 0 1 0 2H9.414l6.293 6.293a1 1 0 1 1-1.414 1.414L8 3.414Zm0 9.172V10a1 1 0 1 1 2 0v5a1 1 0 0 1-1 1H4a1 1 0 0 1 0-2h2.586L.293 7.707a1 1 0 0 1 1.414-1.414L8 12.586Z" />
)
const cardIcon = (
  <path d="M0 4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4Zm2 0v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Zm9 1a1 1 0 0 1 0 2H5a1 1 0 1 1 0-2h6Zm0 4a1 1 0 0 1 0 2H5a1 1 0 1 1 0-2h6Z" />
)
const heartIcon = (
  <path d="M14.3.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-8 8c-.2.2-.4.3-.7.3-.3 0-.5-.1-.7-.3-.4-.4-.4-1 0-1.4l8-8zM15 7c.6 0 1 .4 1 1 0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8c.6 0 1 .4 1 1s-.4 1-1 1C4.7 2 2 4.7 2 8s2.7 6 6 6 6-2.7 6-6c0-.6.4-1 1-1z" />
)
const searchIcon = (
  <path d="M7 14a7 7 0 1 1 4.94-2.06l3.56 3.56a1 1 0 0 1-1.42 1.42l-3.56-3.56A6.97 6.97 0 0 1 7 14Zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
)
const calendarIcon = (
  <path d="M4 0a1 1 0 0 1 1 1v1h6V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1a1 1 0 0 1 1-1Zm10 6H2v8h12V6Z" />
)
const chatIcon = (
  <path d="M2 2a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2v2.5a.5.5 0 0 0 .8.4L8.7 13H14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2Zm2 4h8a1 1 0 1 1 0 2H4a1 1 0 0 1 0-2Zm0 3h5a1 1 0 1 1 0 2H4a1 1 0 1 1 0-2Z" />
)
const mailIcon = (
  <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2.5-.2 5.5 3.6 5.5-3.6H2.5ZM14 5.4l-5.5 3.6a1 1 0 0 1-1 0L2 5.4V12h12V5.4Z" />
)
const helpIcon = (
  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 12.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1.3-4.4c-.5.3-.55.5-.55.9a.75.75 0 0 1-1.5 0c0-1.1.63-1.65 1.15-1.98.45-.28.6-.45.6-.82a1 1 0 0 0-2 0 .75.75 0 0 1-1.5 0 2.5 2.5 0 0 1 5 0c0 1.15-.7 1.6-1.2 1.9Z" />
)

/** A settings href → its glyph, so the search rail shows the right icon per
 *  result (not a single hardcoded building). Falls back to a neutral dot. */
const HREF_ICON: Record<string, ReactNode> = {
  '/settings/clinic': buildingIcon,
  '/settings/practice': calendarIcon,
  '/settings/locations': pinIcon,
  '/settings/portal': heartIcon,
  '/settings/automations/emails': mailIcon,
  '/settings/message-templates': chatIcon,
  '/settings/team': teamIcon,
  '/settings/apps': plugIcon,
  '/settings/seo': searchIcon,
  '/settings/billing': cardIcon,
  '/settings/feedback': helpIcon,
  '/settings/account': userIcon,
  '/settings/notifications': bellIcon,
  '/settings/security': shieldIcon,
  // legacy redirects still indexed for old links
  '/settings/reminders': mailIcon,
  '/settings/plans': cardIcon,
}

export function iconForHref(href: string): ReactNode {
  return HREF_ICON[href] ?? buildingIcon
}

// ── Groups ──────────────────────────────────────────────────────────────────

const CLINIC_GROUPS: SettingsNavGroup[] = [
  {
    title: 'Clinic',
    items: [
      { href: '/settings/clinic', label: 'Clinic profile', desc: 'Name, contact, hours, branding, and website content.', icon: buildingIcon },
      { href: '/settings/practice', label: 'Practice setup', desc: 'Providers, visit types, chairs, and recall.', icon: calendarIcon },
      { href: '/settings/locations', label: 'Locations', desc: 'Your physical practice locations.', icon: pinIcon },
    ],
  },
  {
    title: 'Patients',
    items: [
      { href: '/settings/portal', label: 'Patient portal', desc: 'What patients can do in their online portal.', icon: heartIcon },
      { href: '/settings/automations/emails', label: 'Automated emails', desc: 'Confirmations, reminders, and more — in your words.', icon: mailIcon },
      { href: '/settings/message-templates', label: 'Message templates', desc: 'Saved replies for patient conversations.', icon: chatIcon },
    ],
  },
  {
    title: 'Team & access',
    items: [
      { href: '/settings/team', label: 'Team', desc: 'Invite teammates and manage access.', icon: teamIcon },
      { href: '/settings/apps', label: 'Connected accounts', desc: 'Gmail, Stripe, and other connections.', icon: plugIcon },
    ],
  },
  {
    title: 'Website',
    items: [
      { href: '/settings/seo', label: 'Search appearance', desc: 'How your site shows up in Google.', icon: searchIcon },
    ],
  },
  {
    title: 'Billing',
    items: [
      { href: '/settings/billing', label: 'Plan & billing', desc: 'Your plan, payment method, and invoices.', icon: cardIcon },
    ],
  },
]

const PLATFORM_GROUPS: SettingsNavGroup[] = [
  {
    title: 'Platform',
    items: [
      { href: '/settings/team', label: 'Team', desc: 'Platform team and roles.', icon: teamIcon },
      { href: '/settings/apps', label: 'Connected accounts', desc: 'Platform-wide service connections.', icon: plugIcon },
    ],
  },
]

const ACCOUNT_GROUP: SettingsNavGroup = {
  title: 'Your account',
  items: [
    { href: '/settings/account', label: 'Profile', desc: 'Your name, photo, and sign-in email.', icon: userIcon },
    { href: '/settings/notifications', label: 'Notifications', desc: 'Email and push preferences.', icon: bellIcon },
    { href: '/settings/security', label: 'Security', desc: 'Active sessions and your password.', icon: shieldIcon },
  ],
}

const HELP_GROUP: SettingsNavGroup = {
  title: 'Help',
  items: [
    { href: '/settings/feedback', label: 'Send feedback', desc: "Tell us what's working and what's not.", icon: helpIcon },
  ],
}

/** The full, unified group list for a tenant: org groups → Your account → Help. */
export function settingsNavGroups(tenant: SettingsTenant): SettingsNavGroup[] {
  const org = tenant === 'platform' ? PLATFORM_GROUPS : CLINIC_GROUPS
  return [...org, ACCOUNT_GROUP, HELP_GROUP]
}
