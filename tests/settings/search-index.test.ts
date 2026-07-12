import { describe, it, expect } from 'vitest'
import {
  SETTINGS_SEARCH_INDEX,
  searchSettings,
  settingsEntryHref,
  type SettingsSurface,
} from '@/app/(default)/settings/search-index'

// Every href the index is allowed to point at — keeps entries from drifting to
// a page that doesn't exist (the rail would 404 on click).
const KNOWN_PAGES = new Set([
  '/settings/clinic',
  '/settings/practice',
  '/settings/portal',
  '/settings/reminders',
  '/settings/automations/emails',
  '/settings/message-templates',
  '/settings/locations',
  '/settings/apps',
  '/settings/team',
  '/settings/plans',
  '/settings/billing',
  // Search appearance folded into the Website workspace's SEO page — the
  // index deep-links straight to the meta section there.
  '/website/seo',
  '/settings/feedback',
  '/settings/account',
  '/settings/notifications',
  '/settings/security',
])

const SURFACES: SettingsSurface[] = ['user', 'clinic', 'platform']

describe('settings search-index — shape / drift guard', () => {
  it('every entry has a valid surface, a known page href, and a label', () => {
    for (const e of SETTINGS_SEARCH_INDEX) {
      expect(SURFACES).toContain(e.surface)
      // Entries may deep-link with a query (?tab=/?email=) — validate the page.
      expect(KNOWN_PAGES.has(e.href.split('?')[0].split('#')[0]), `unknown href: ${e.href}`).toBe(true)
      expect(e.label.length).toBeGreaterThan(0)
      expect(e.page.length).toBeGreaterThan(0)
      if (e.sub) expect(e.tab, `entry "${e.label}" has a sub but no tab`).toBeTruthy()
    }
  })

  it('covers every clinic + user nav destination so search never dead-ends', () => {
    // The pages the sidebar nav surfaces must each be reachable via search.
    const clinicPages = new Set(
      SETTINGS_SEARCH_INDEX.filter((e) => e.surface === 'clinic').map((e) => e.href.split('?')[0].split('#')[0]),
    )
    for (const p of [
      '/settings/clinic',
      '/settings/practice',
      '/settings/portal',
      // /settings/reminders merged into /settings/automations/emails
      // (redirect stub) — search deep-links straight to the reminder email.
      '/settings/automations/emails',
      '/settings/message-templates',
      '/settings/locations',
      '/settings/apps',
      '/settings/team',
      // /settings/plans merged into /settings/billing (redirect) — no longer
      // a distinct search destination.
      '/settings/billing',
      // /settings/seo folded into /website/seo#meta (redirect stub) — the
      // search entry now points at the workspace page directly.
      '/settings/feedback',
    ]) {
      expect(clinicPages.has(p), `clinic search missing ${p}`).toBe(true)
    }
  })
})

describe('settingsEntryHref', () => {
  it('builds a ?tab=&sub= deep link', () => {
    expect(
      settingsEntryHref({ surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile', tab: 'profile', sub: 'hours', label: 'Opening hours' }),
    ).toBe('/settings/clinic?tab=profile&sub=hours')
  })

  it('omits the query string when there is no tab', () => {
    expect(
      settingsEntryHref({ surface: 'clinic', href: '/settings/reminders', page: 'Reminders', label: 'Reminders' }),
    ).toBe('/settings/reminders')
  })

  it('emits tab without sub', () => {
    expect(
      settingsEntryHref({ surface: 'clinic', href: '/settings/clinic', page: 'Clinic profile', tab: 'branding', label: 'Branding' }),
    ).toBe('/settings/clinic?tab=branding')
  })
})

describe('searchSettings', () => {
  it('finds the Hours setting by its keyword and points at the right subtab', () => {
    const hits = searchSettings('hours', 'clinic')
    const hours = hits.find((h) => h.label === 'Opening hours')
    expect(hours).toBeTruthy()
    expect(settingsEntryHref(hours!)).toBe('/settings/clinic?tab=profile&sub=hours')
  })

  it('matches synonyms not present in the label (logo → Branding)', () => {
    const hits = searchSettings('logo', 'clinic')
    expect(hits.some((h) => h.label === 'Branding')).toBe(true)
  })

  it('requires all whitespace-separated terms to match', () => {
    expect(searchSettings('payment methods', 'clinic').some((h) => h.label === 'Payment methods')).toBe(true)
    // A term that matches nothing rules the entry out.
    expect(searchSettings('payment zzz', 'clinic')).toHaveLength(0)
  })

  it('scopes to the requested surface', () => {
    // "hours" is a clinic setting — it must not leak onto the user surface.
    expect(searchSettings('hours', 'user')).toHaveLength(0)
    // "password" is a user setting — not on the clinic surface.
    expect(searchSettings('password', 'clinic')).toHaveLength(0)
    expect(searchSettings('password', 'user').length).toBeGreaterThan(0)
  })

  it('returns nothing for an empty query', () => {
    expect(searchSettings('', 'clinic')).toHaveLength(0)
    expect(searchSettings('   ', 'clinic')).toHaveLength(0)
  })
})
