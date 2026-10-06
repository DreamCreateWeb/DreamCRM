import { describe, it, expect, vi } from 'vitest'

// buildDigestContent is pure but lives in a server module that imports the email
// layer + db at load; stub those so the import is side-effect-free.
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/my-day', () => ({ getMyDay: vi.fn() }))
vi.mock('@/lib/services/site-analytics', () => ({ getWeeklySiteDigest: vi.fn() }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn() }))
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), ne: vi.fn() }))
// The morning-after reads (S7) — stubbed; buildMorningAfter itself is pure and tested in tests/activation.
vi.mock('@/lib/services/action-ledger', () => ({ countActionsSince: vi.fn(), countFailuresSince: vi.fn() }))
vi.mock('@/lib/services/proposals', () => ({ listOpenProposalsOnYou: vi.fn() }))
vi.mock('@/lib/services/readiness', () => ({ getReadinessReport: vi.fn() }))
vi.mock('@/lib/services/first-week', () => ({ listPendingOnUs: vi.fn(), readMergedActivation: vi.fn() }))

import { buildDigestContent, buildWebsiteWeekSection } from '@/lib/services/daily-digest'
import { buildMorningAfter } from '@/lib/morning-after'
import type { MyDayData } from '@/lib/services/my-day'
import type { SiteTraffic } from '@/lib/services/site-analytics'

function data(over: Partial<MyDayData> = {}): MyDayData {
  return {
    followups: { overdue: 0, today: 0, items: [] },
    conversations: [],
    todaysAppointments: [],
    unconfirmedTodayCount: 0,
    newLeadsCount: 0,
    balances: { count: 0, totalCents: 0 },
    openProposalsCount: 0,
    tomorrow: { dayKey: '2026-06-16', visitCount: 0, items: [] },
    ...over,
  }
}
function fu(title: string, dueDate: string | null) {
  return { id: 'f', patientId: 'p', patientName: 'Mia Hayes', title, dueDate, assignedUserId: null, assigneeName: null, status: 'open', createdByName: null, completedAt: null, createdAt: new Date() } as never
}

describe('buildDigestContent', () => {
  it('is quiet (no content) when there is nothing to do', () => {
    const c = buildDigestContent(data(), 'Dream Dental')
    expect(c.hasContent).toBe(false)
    expect(c.subject).toBe('Your day at Dream Dental')
    expect(c.body).toContain('all caught up')
  })

  it('summarizes follow-ups (with overdue), confirmations + leads in the subject', () => {
    const c = buildDigestContent(
      data({
        followups: { overdue: 2, today: 1, items: [fu('Call Mia', '2026-06-15')] },
        unconfirmedTodayCount: 1,
        newLeadsCount: 1,
      }),
      'Dream Dental',
    )
    expect(c.hasContent).toBe(true)
    expect(c.subject).toBe('Your day: 3 follow-ups, 1 to confirm, 1 new lead')
    expect(c.body).toContain('3 follow-ups due (2 overdue)')
    expect(c.body).toContain('Call Mia')
    expect(c.body).toContain('1 visit') // unconfirmed = the one still scheduled
    expect(c.body).toContain('1 new website lead')
  })

  it('includes a balances line and folds it into hasContent', () => {
    const c = buildDigestContent(data({ balances: { count: 3, totalCents: 45000 } }), 'Dream Dental')
    expect(c.hasContent).toBe(true)
    expect(c.body).toContain('3 patients owe a balance ($450 total)')
  })

  it('does not add a greeting (the email shell adds it)', () => {
    const c = buildDigestContent(data({ newLeadsCount: 2 }), 'Dream Dental')
    expect(c.body.startsWith('Hi ')).toBe(false)
  })

  it('appends the weekly website section and counts it as content on its own', () => {
    const c = buildDigestContent(data(), 'Dream Dental', '🌐 Your website last week: 240 visits')
    expect(c.hasContent).toBe(true)
    expect(c.body).toContain('🌐 Your website last week: 240 visits')
    expect(c.body).not.toContain('all caught up')
  })

  it('stays quiet when the website section is null and there is nothing else', () => {
    const c = buildDigestContent(data(), 'Dream Dental', null)
    expect(c.hasContent).toBe(false)
    expect(c.linkPath).toBe('/my-day')
  })
})

describe('the morning after (docs/ACTIVATION.md law 6)', () => {
  const NONE = { a1: null, a2: null, a3: null, a4: null, a5: null }
  const ALL = { a1: new Date(), a2: new Date(), a3: new Date(), a4: new Date(), a5: new Date() }
  const morning = (over: Partial<Parameters<typeof buildMorningAfter>[0]> = {}) =>
    buildMorningAfter({ day: 1, activation: NONE, work: {}, failures: 0, openCards: [], pendingOnUs: [], attention: [], ...over })

  it('a thin day-two clinic gets the email: what happened, one thing, and the button on that thing’s door', () => {
    const c = buildDigestContent(data(), 'Dream Dental', null, morning({ work: { appointment_reminder: 4 } }))
    expect(c.hasContent).toBe(true)
    expect(c.body.startsWith("Good morning from Dream Dental's Dream Team.")).toBe(true)
    expect(c.body).toContain('⚙️ Since yesterday I handled: 4 appointment reminders.')
    expect(c.body).toContain('⭐ One thing today: Connect your patients')
    expect(c.body).not.toContain('all caught up')
    expect(c.subject).toBe('Your day at Dream Dental: what I did overnight')
    expect(c.linkPath).toBe('/integrations')
  })

  it('what happened comes before the asks; the routine list keeps the My Day button', () => {
    const c = buildDigestContent(data({ newLeadsCount: 2 }), 'Dream Dental', null, morning({ work: { review_request: 1 } }))
    expect(c.body.indexOf('⚙️')).toBeLessThan(c.body.indexOf('🌱'))
    expect(c.body.startsWith("Here's what's waiting on you")).toBe(true)
    expect(c.linkPath).toBe('/my-day')
    expect(c.subject).toBe('Your day: 2 new leads')
  })

  it('when the one thing names a card, the generic "N pieces waiting" line is not said twice', () => {
    const named = buildDigestContent(data({ openProposalsCount: 3 }), 'Dream Dental', null, morning({ openCards: [{ title: 'Reply to Maria’s review' }, { title: 'b' }, { title: 'c' }] }))
    expect(named.body).toContain('⭐ One thing today: Say yes to “Reply to Maria’s review”')
    expect(named.body).not.toContain('pieces of finished work')
    const generic = buildDigestContent(data({ openProposalsCount: 3 }), 'Dream Dental', null, morning({ day: 40, activation: ALL }))
    expect(generic.body).toContain('3 pieces of finished work are waiting on your yes')
    expect(generic.subject).toBe('Your day at Dream Dental')
  })

  it('says what is still on the platform, after the asks', () => {
    const c = buildDigestContent(data({ newLeadsCount: 1 }), 'Dream Dental', null, morning({ pendingOnUs: [{ label: 'Connecting Open Dental' }] }))
    expect(c.body).toContain('⏳ Still on us: Connecting Open Dental')
    expect(c.body.indexOf('🌱')).toBeLessThan(c.body.indexOf('⏳'))
  })

  it('a quiet first-week night is narrated, never the "all caught up" closer; after the first week a quiet night stays quiet', () => {
    const quiet = buildDigestContent(data(), 'Dream Dental', null, morning({ day: 2, activation: ALL }))
    expect(quiet.hasContent).toBe(true)
    expect(quiet.body).toContain('🌙 A quiet night on my side')
    expect(quiet.body).not.toContain('all caught up')
    const settled = buildDigestContent(data(), 'Dream Dental', null, morning({ day: 12, activation: ALL }))
    expect(settled.hasContent).toBe(false)
    expect(settled.body).toContain('all caught up')
  })

  it('a null morning (the read failed) leaves the old digest exactly as it was', () => {
    const c = buildDigestContent(data({ newLeadsCount: 1 }), 'Dream Dental', null, null)
    expect(c.body).not.toContain('⚙️')
    expect(c.body).not.toContain('⭐')
    expect(c.linkPath).toBe('/my-day')
  })
})

function traffic(over: Partial<SiteTraffic> = {}): SiteTraffic {
  return {
    windowDays: 7,
    total: 240,
    totalPrev: 200,
    daily: [],
    topPages: [
      { path: '/', views: 120 },
      { path: '/services', views: 48 },
      { path: '/book', views: 30 },
    ],
    ...over,
  }
}

describe('buildWebsiteWeekSection', () => {
  it('renders visits + up-delta + leads + top-2 pages (Home label for /)', () => {
    const s = buildWebsiteWeekSection(traffic(), 12)
    expect(s).toContain('240 visits (up 20% vs the week before)')
    expect(s).toContain('12 leads came in through the site')
    expect(s).toContain('Most visited: Home (120) · /services (48)')
    // Top-2 cap — the third page must not render.
    expect(s).not.toContain('/book')
  })

  it('renders a down-delta', () => {
    const s = buildWebsiteWeekSection(traffic({ total: 150, totalPrev: 200 }), 0)
    expect(s).toContain('down 25% vs the week before')
  })

  it('omits the delta when there is no prior-week traffic', () => {
    const s = buildWebsiteWeekSection(traffic({ totalPrev: 0 }), 0)
    expect(s).toContain('240 visits')
    expect(s).not.toContain('vs the week before')
  })

  it('omits the leads line at zero leads', () => {
    const s = buildWebsiteWeekSection(traffic(), 0)
    expect(s).not.toContain('came in through the site')
  })

  it('returns null when the site has no traffic in either window (day-0 quiet)', () => {
    expect(buildWebsiteWeekSection(traffic({ total: 0, totalPrev: 0, topPages: [] }), 3)).toBeNull()
  })
})
