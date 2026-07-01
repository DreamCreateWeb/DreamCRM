/**
 * Deep search index for the settings rail. Each entry points at a specific
 * SETTING — usually a tab/subtab inside a page — so searching "hours" jumps
 * straight to Clinic profile → Profile & contact → Hours, not just the page.
 *
 * `tab` / `sub` map to the SettingsTabs ids on the target page; the sidebar
 * builds a `?tab=…&sub=…` deep link and SettingsTabs opens to it on load.
 * `keywords` are extra search terms (synonyms) — the words a clinic would
 * actually type, which may not appear in the visible label.
 *
 * This is a curated index (client-safe, no server imports). When you add a
 * tab/subtab to a panel, add the matching entry here so it stays findable;
 * `tests/settings/search-index.test.ts` guards the shape + that every href is
 * a real settings page.
 */

export type SettingsSurface = 'user' | 'clinic' | 'platform'

export interface SettingsSearchEntry {
  /** Which rail surface this belongs to (matches the sidebar's surface split). */
  surface: SettingsSurface
  /** Settings page path. */
  href: string
  /** Human page name, shown as the first breadcrumb crumb. */
  page: string
  /** Top SettingsTabs tab id to open (optional — omit for a whole-page entry). */
  tab?: string
  /** Subtab id to open under `tab` (optional). */
  sub?: string
  /** The specific setting, shown as the result title. */
  label: string
  /** Synonyms / words a user might search that aren't in the label. */
  keywords?: string[]
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  // ─── Clinic profile ──────────────────────────────────────────────────
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'profile', sub: 'basics', label: 'Clinic name & tagline',
    keywords: ['name', 'tagline', 'about', 'display name', 'timezone', 'time zone', 'description'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'profile', sub: 'contact', label: 'Contact details',
    keywords: ['email', 'phone', 'address', 'location', 'contact', 'sender'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'profile', sub: 'hours', label: 'Opening hours',
    keywords: ['hours', 'open', 'close', 'closing', 'schedule', 'times', 'hours of operation', 'business hours', 'days'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'branding', label: 'Branding',
    keywords: ['brand', 'color', 'colour', 'logo', 'hero image', 'theme', 'accent'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'website', sub: 'services', label: 'Services',
    keywords: ['services', 'treatments', 'procedures', 'offerings'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'website', sub: 'staff', label: 'Staff & team',
    keywords: ['staff', 'team', 'dentists', 'hygienists', 'bios', 'headshots', 'people'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'website', sub: 'stats', label: 'Stats',
    keywords: ['stats', 'numbers', 'figures', 'trust'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'website', sub: 'testimonials', label: 'Testimonials',
    keywords: ['testimonials', 'reviews', 'quotes', 'patient stories'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'website', sub: 'photos', label: 'Office photos',
    keywords: ['photos', 'gallery', 'images', 'office tour', 'pictures'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'payments', sub: 'insurance', label: 'Insurance carriers',
    keywords: ['insurance', 'carriers', 'accepted plans', 'in-network', 'ppo'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'payments', sub: 'methods', label: 'Payment methods',
    keywords: ['payment', 'methods', 'cash', 'card', 'how patients pay'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'payments', sub: 'financing', label: 'Financing',
    keywords: ['financing', 'carecredit', 'sunbit', 'payment plans', 'loans'],
  },
  {
    surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile',
    tab: 'payments', sub: 'cancellation', label: 'Cancellation policy',
    keywords: ['cancellation', 'policy', 'no-show', 'no show', 'late', 'fee'],
  },

  // ─── Practice setup ──────────────────────────────────────────────────
  {
    surface: 'clinic', href: '/settings/practice', page: 'Practice setup',
    tab: 'booking', label: 'Online booking',
    keywords: ['online booking', 'self booking', 'self-scheduling', 'let patients book', 'request a visit', 'allow booking'],
  },
  {
    surface: 'clinic', href: '/settings/practice', page: 'Practice setup',
    tab: 'providers', label: 'Providers',
    keywords: ['providers', 'doctors', 'dentists', 'who patients book with'],
  },
  {
    surface: 'clinic', href: '/settings/practice', page: 'Practice setup',
    tab: 'visit-types', label: 'Visit types',
    keywords: ['visit types', 'appointment types', 'reasons', 'duration'],
  },
  {
    surface: 'clinic', href: '/settings/practice', page: 'Practice setup',
    tab: 'recall', label: 'Chairs & recall',
    keywords: ['chairs', 'operatories', 'recall', 'cadence', 'recall interval', 'capacity', 'lapsed', 'inactive', 'gone quiet', 'reactivation', 'active patient'],
  },

  // ─── Patient portal ──────────────────────────────────────────────────
  {
    surface: 'clinic', href: '/settings/portal', page: 'Patient portal',
    tab: 'features', label: 'Portal features',
    keywords: ['portal', 'features', 'what patients can do', 'toggles', 'forms', 'billing', 'records'],
  },
  {
    surface: 'clinic', href: '/settings/portal', page: 'Patient portal',
    tab: 'booking', label: 'Portal booking & rescheduling',
    keywords: ['portal booking', 'reschedule', 'cancel', 'notice window', 'bookable types'],
  },
  {
    surface: 'clinic', href: '/settings/portal', page: 'Patient portal',
    tab: 'voice', label: 'Portal voice & display',
    keywords: ['welcome', 'announcement', 'aftercare', 'voice', 'team photos', 'greeting'],
  },

  // ─── Other clinic pages ──────────────────────────────────────────────
  {
    surface: 'clinic', href: '/settings/automations/emails', page: 'Automated emails',
    label: 'Automated patient emails',
    keywords: ['emails', 'automated', 'automations', 'confirmation email', 'cancellation email', 'intake email', 'portal invite email', 'review request email', 'auto-reply', 'email wording', 'edit email', 'email template', 'appointment confirmation'],
  },
  {
    surface: 'clinic', href: '/settings/reminders', page: 'Reminders',
    label: 'Appointment reminders',
    keywords: ['reminders', 'automatic', 'text reminder', 'email reminder', 'remind patients', 'automations', 'hours before'],
  },
  {
    surface: 'clinic', href: '/settings/message-templates', page: 'Message templates',
    label: 'Saved replies / canned responses',
    keywords: ['message templates', 'canned responses', 'saved replies', 'quick replies', 'snippets', 'messages composer', 'reply templates'],
  },
  {
    surface: 'clinic', href: '/settings/locations', page: 'Locations',
    label: 'Practice locations',
    keywords: ['locations', 'address', 'multi-location', 'branches', 'offices'],
  },
  {
    surface: 'clinic', href: '/settings/apps', page: 'Connected accounts',
    label: 'Connected accounts',
    keywords: ['integrations', 'gmail', 'stripe', 'connected', 'apps', 'oauth'],
  },
  {
    surface: 'clinic', href: '/settings/team', page: 'Team',
    tab: 'invite', label: 'Invite a teammate',
    keywords: ['invite', 'add user', 'add staff', 'new teammate'],
  },
  {
    surface: 'clinic', href: '/settings/team', page: 'Team',
    tab: 'members', label: 'Team members & roles',
    keywords: ['members', 'roles', 'admin', 'remove', 'access', 'permissions'],
  },
  // Plan & Billing were merged into one /settings/billing surface, so every
  // plan/billing search lands there (no SettingsTabs → no tab/sub deep link).
  {
    surface: 'clinic', href: '/settings/billing', page: 'Plan & billing',
    label: 'Plan & usage',
    keywords: ['plan', 'subscription', 'tier', 'upgrade', 'downgrade', 'usage'],
  },
  {
    surface: 'clinic', href: '/settings/billing', page: 'Plan & billing',
    label: 'Subscription & payment method',
    keywords: ['billing', 'payment method', 'card', 'subscription', 'renew'],
  },
  {
    surface: 'clinic', href: '/settings/billing', page: 'Plan & billing',
    label: 'Invoices',
    keywords: ['invoices', 'receipts', 'past charges', 'history'],
  },
  {
    surface: 'clinic', href: '/settings/seo', page: 'Search appearance',
    tab: 'seo', sub: 'meta', label: 'Search appearance (SEO)',
    keywords: ['seo', 'meta', 'title', 'description', 'google', 'search results', 'snippet'],
  },
  {
    surface: 'clinic', href: '/settings/feedback', page: 'Send feedback',
    label: 'Send feedback',
    keywords: ['feedback', 'support', 'help', 'contact us', 'report'],
  },

  // ─── User (personal account) ─────────────────────────────────────────
  {
    surface: 'user', href: '/settings/account', page: 'Profile',
    tab: 'profile', label: 'Name, photo & bio',
    keywords: ['name', 'photo', 'avatar', 'profile picture', 'bio', 'about me'],
  },
  {
    surface: 'user', href: '/settings/account', page: 'Profile',
    tab: 'email', label: 'Change email',
    keywords: ['email', 'email address', 'change email', 'sign-in email'],
  },
  {
    surface: 'user', href: '/settings/account', page: 'Profile',
    tab: 'password', label: 'Change password',
    keywords: ['password', 'change password', 'reset password'],
  },
  {
    surface: 'user', href: '/settings/notifications', page: 'Notifications',
    tab: 'alerts', label: 'In-app alerts',
    keywords: ['notifications', 'alerts', 'in-app', 'comments', 'mentions'],
  },
  {
    surface: 'user', href: '/settings/notifications', page: 'Notifications',
    tab: 'delivery', label: 'Email & push delivery',
    keywords: ['email', 'push', 'delivery', 'notification preferences'],
  },
  {
    surface: 'user', href: '/settings/security', page: 'Security',
    tab: 'sessions', label: 'Active sessions',
    keywords: ['sessions', 'devices', 'sign out', 'log out', 'logout', 'where i’m signed in'],
  },
  {
    surface: 'user', href: '/settings/security', page: 'Security',
    tab: 'password', label: 'Password & sign-in',
    keywords: ['password', 'security', 'sign-in', 'change password'],
  },

  // ─── Platform ────────────────────────────────────────────────────────
  {
    surface: 'platform', href: '/settings/team', page: 'Team',
    tab: 'members', label: 'Platform team & roles',
    keywords: ['team', 'members', 'invite', 'roles', 'admin'],
  },
  {
    surface: 'platform', href: '/settings/apps', page: 'Connected accounts',
    label: 'Connected accounts',
    keywords: ['integrations', 'connected', 'services', 'api keys', 'gmail', 'stripe', 'anthropic', 'resend'],
  },
  {
    surface: 'platform', href: '/settings/feedback', page: 'Send feedback',
    label: 'Feedback inbox',
    keywords: ['feedback', 'support', 'submissions'],
  },
]

/** Build the deep-link href for an entry (page + ?tab=&sub=). */
export function settingsEntryHref(e: SettingsSearchEntry): string {
  const params = new URLSearchParams()
  if (e.tab) params.set('tab', e.tab)
  if (e.sub) params.set('sub', e.sub)
  const qs = params.toString()
  return qs ? `${e.href}?${qs}` : e.href
}

/**
 * Score-free substring match over the entry's full haystack (label + page +
 * keywords). All whitespace-separated query terms must appear somewhere, so
 * "office hours" still finds the Hours entry via its "hours" + page words.
 */
export function searchSettings(query: string, surface: SettingsSurface): SettingsSearchEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []
  return SETTINGS_SEARCH_INDEX.filter((e) => {
    if (e.surface !== surface) return false
    const hay = `${e.label} ${e.page} ${(e.keywords ?? []).join(' ')}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}
