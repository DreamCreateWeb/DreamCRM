import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { mockGetOverview } = vi.hoisted(() => ({
  mockGetOverview: vi.fn(),
}))

vi.mock('@/lib/services/clinic-overview', () => ({
  getClinicOverview: mockGetOverview,
}))

// Tutorial system: pretend this staff member has seen the welcome + hidden
// the checklist so these tests keep asserting the core overview UI.
vi.mock('@/lib/services/staff-onboarding', () => ({
  getStaffOnboarding: vi.fn(async () => ({
    welcomeSeen: true,
    checklistDismissed: true,
    dismissedHints: [],
  })),
  getActivationChecklist: vi.fn(async () => ({
    tasks: [],
    doneCount: 0,
    totalCount: 0,
    allDone: true,
  })),
}))

// Phase 2 (the voice): the Overview now also loads the Approval Inbox +
// weekly standup — mocked empty/quiet by default; the dedicated suite below
// exercises the populated states.
const {
  mockListOpenProposals,
  mockCountOpenProposals,
  mockUneditedRun,
  mockListTrustGrants,
  mockListAutonomousWork,
  mockInsideSendWindow,
  mockBuildStandup,
} = vi.hoisted(() => ({
  mockListOpenProposals: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
  mockCountOpenProposals: vi.fn(async (..._a: unknown[]) => 0),
  mockUneditedRun: vi.fn(async (..._a: unknown[]) => 0),
  mockListTrustGrants: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
  mockListAutonomousWork: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
  mockInsideSendWindow: vi.fn((..._a: unknown[]) => true),
  mockBuildStandup: vi.fn(async (..._a: unknown[]) => ({
    weekStart: new Date('2026-05-10T05:00:00Z'),
    weekEnd: new Date('2026-05-17T05:00:00Z'),
    weekLabel: 'May 10 – May 16',
    totalActions: 0,
    lines: [] as Array<{ capability: string; noun: string; count: number }>,
    stories: [] as string[],
    newPatientsSeated: 0,
    reviewsReceived: 0,
    humanTasks: { openProposals: 0, followupsDue: 0 },
    quiet: true,
    quietNote: null as string | null,
    predatesAccount: false,
  })),
}))
vi.mock('@/lib/services/proposals', () => ({
  listOpenProposals: mockListOpenProposals,
  countOpenProposals: mockCountOpenProposals,
  countConsecutiveUneditedApprovals: mockUneditedRun,
  // THE law, real — the page's job is to ASK it once per card, not to
  // re-implement it, so the test exercises the actual predicate.
  machineHandlesCardRow: (
    granted: Array<{ capability: string; grantedAt: Date | null }>,
    card: { capability: string; createdAt: Date; handedBack?: boolean },
  ) => {
    if (card.handedBack) return false
    const g = granted.find((x) => x.capability === card.capability)
    if (!g) return false
    return g.grantedAt == null || card.createdAt >= g.grantedAt
  },
}))
vi.mock('@/lib/services/proposal-generators', () => ({
  insidePatientSendWindow: (...a: unknown[]) => mockInsideSendWindow(...a),
  PATIENT_INBOX_CAPABILITIES: ['outreach_campaign', 'inquiry_response'],
}))
vi.mock('@/lib/services/autonomy', () => ({
  listTrustGrants: mockListTrustGrants,
  listAutonomousWork: mockListAutonomousWork,
}))
// The inbox cards' server actions — mocked so interaction tests never touch
// requireTenant/db, and so we can assert an action was NOT called.
const { mockApproveAction, mockDeclineAction } = vi.hoisted(() => ({
  mockApproveAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, message: 'Done — it went out.' })),
  mockDeclineAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, message: 'Okay — I won’t ask about this one again.' })),
}))
const { mockSetAutonomyAction } = vi.hoisted(() => ({
  mockSetAutonomyAction: vi.fn(async (..._a: unknown[]) => ({
    ok: true as const,
    message: 'From now on I’ll handle “Reply to Google reviews” on my own — you’ll see each one in the diary.',
  })),
}))
vi.mock('@/app/(default)/dashboard/actions', () => ({
  approveProposalAction: mockApproveAction,
  declineProposalAction: mockDeclineAction,
  setAutonomyAction: mockSetAutonomyAction,
}))
vi.mock('@/lib/services/standup', () => ({ buildWeeklyStandup: mockBuildStandup }))
// The inbox's client cards call useRouter().refresh() after a decision.
vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  useRouter: () => ({ refresh: vi.fn() }),
}))

import ClinicOverview from '@/app/(default)/dashboard/clinic-overview'
import type { TenantContext } from '@/lib/auth/context'
import type { ClinicOverviewData } from '@/lib/services/clinic-overview'

function makeCtx(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'u_1',
    userEmail: 'a@b.com',
    userName: 'Test',
    platformAdmin: false,
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    organizationSlug: 'acme',
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'pro',
    patientId: null,
    isDemo: false,
    ...overrides,
  }
}

function makeData(overrides: Partial<ClinicOverviewData> = {}): ClinicOverviewData {
  return {
    date: new Date('2026-05-20T08:00:00Z'),
    timeZone: 'America/New_York',
    todaysAppointments: [],
    unconfirmed: { count: 0, preview: [] },
    unmarkedPastVisits: { count: 0, preview: [] },
    intakeSubmissions: { count: 0, preview: [] },
    outstandingBalances: { count: 0, totalCents: 0 },
    newLeads: { count: 0, preview: [] },
    paidOrdersUnfulfilled: 0,
    unreadMessages: 0,
    siteTraffic: null,
    siteHealth: null,
    reviewsReceived: { completed30d: 0, sent30d: 0 },
    trends: {
      bookingsToday: 0,
      newPatientsMTD: 0,
      newPatientsLastMTD: 0,
      upcomingNext7d: 0,
      activeIntakeForms: 0,
          bookingsPerDay14: [],
    },
    recentActivity: [],
    integrationsHealth: null,
    followups: { openTotal: 0, overdue: 0, dueToday: 0, preview: [] },
    ...overrides,
  }
}

beforeEach(() => {
  mockGetOverview.mockReset()
  // Signature moments (KPI count-up + the morning-reveal cascade) run ONCE
  // per session entry, gated on these sessionStorage flags. Mark them done so
  // the bulk of these tests assert the steady (returning-visit) state — final
  // KPI values, statically-rendered cards — not a mid-animation frame. The
  // dedicated "morning reveal" suite below clears them to exercise the cascade.
  try {
    sessionStorage.setItem('v2-countup-done', '1')
    sessionStorage.setItem('v2-reveal-done', '1')
  } catch {
    /* ignore (privacy-mode sessionStorage) */
  }
})

// ── The seated catch-net card (round-3 audit: it rendered untested — an
//    always-zero regression would be invisible because the card hides at 0) ──
describe("the 'Did these visits happen?' catch-net card", () => {
  it('renders count, preview names, and the CTA into the matching 30d unmarked list when visits need outcomes', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        unmarkedPastVisits: {
          count: 2,
          preview: [
            { id: 'a1', patientName: 'Mia Hayes', startTime: new Date('2026-05-18T14:00:00Z') },
            { id: 'a2', patientName: 'Aiden Brooks', startTime: new Date('2026-05-15T15:00:00Z') },
          ],
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    const { container } = render(ui)
    expect(screen.getByText('Did these visits happen?')).toBeTruthy()
    expect(screen.getByText('Mia Hayes')).toBeTruthy()
    expect(screen.getByText('Aiden Brooks')).toBeTruthy()
    // Preview times carry MONTH + DAY (clinic tz): the card spans 30 days, so
    // a bare weekday was ambiguous across four Tuesdays (round-5 close-out).
    // 2026-05-18T14:00Z = Mon, May 18, 10:00 AM Eastern.
    expect(screen.getByText(/May 18, 10:00 AM/)).toBeTruthy()
    // The CTA must open EXACTLY the list the number counts (past_30d + unmarked).
    const cta = Array.from(container.querySelectorAll('a')).find((a) =>
      a.getAttribute('href')?.includes('attention=unmarked'),
    )
    expect(cta?.getAttribute('href')).toBe('/appointments?window=past_30d&attention=unmarked')
  })

  it('stays hidden at zero — a quiet morning is not a card', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText('Did these visits happen?')).toBeNull()
  })
})

describe('the catch-net windows agree across surfaces (source-pinned)', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8')

  it('the Overview query: 30d lookback, clinic-local today bound, pre-visit statuses only', () => {
    const src = read('lib/services/clinic-overview.ts')
    const q = src.slice(src.indexOf('Unmarked past visits'))
    expect(q).toMatch(/inArray\(schema\.appointment\.status, \['scheduled', 'confirmed'\]\)/)
    // Calendar-day arithmetic, NOT fixed ms — a fixed lookback drifted 1h
    // across DST vs the CTA's past_30d window (round-4 audit).
    expect(q).toMatch(/gte\(schema\.appointment\.startTime, clinicDayStart\(now, timeZone, -30\)\)/)
    expect(q).toMatch(/lt\(schema\.appointment\.startTime, todayStart\)/)
  })

  it("the agenda 'unmarked' chip bounds at the clinic-local day start AND keeps its pre-visit status guard", () => {
    const src = read('lib/services/appointments.ts')
    const filter = src.slice(src.indexOf("att.includes('unmarked')"))
    expect(filter.slice(0, 500)).toContain('row.startTime < clinicDayStart(now, timeZone)')
    // Without the status guard, completed/cancelled/no-show rows flood the
    // chip and the card count stops matching the list (round-4 pin).
    expect(filter.slice(0, 500)).toMatch(/row\.status === 'scheduled' \|\| row\.status === 'confirmed'/)
  })

  it("the URL seam is alive: the page parser reads THE shared attention registry (round-4: a local copy silently dropped 'unmarked')", () => {
    const page = read('app/(default)/appointments/page.tsx')
    const parser = page.slice(page.indexOf('function parseAttention'))
    expect(parser.slice(0, 700)).toContain('APPT_ATTENTION_KEYS')
    // No resurrected local allowlist:
    expect(parser.slice(0, 700)).not.toMatch(/valid = \['unconfirmed'/)
  })
})

describe('ClinicOverview hero', () => {
  it('renders the morning huddle date + clinic name + primary CTA', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Morning huddle/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Dental' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\+ New booking/i })).toBeInTheDocument()
  })
})

describe('Design System v2 migration', () => {
  it('has exactly ONE primary action, and it carries the ambient breath', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    const { container } = render(ui)
    // The primary ActionButton fills teal (bg-teal-500) or, with breath, rides
    // the teal gradient (.breath). Exactly one solid teal primary per page.
    const breathing = container.querySelectorAll('.breath')
    expect(breathing).toHaveLength(1)
    // It's the "+ New booking" CTA (the page's single primary).
    expect(breathing[0]).toHaveTextContent('+ New booking')
    // "Open agenda" is a secondary — it must NOT be a teal primary.
    const openAgenda = screen.getByRole('link', { name: /Open agenda/i })
    expect(openAgenda.className).not.toContain('bg-teal-500')
    expect(openAgenda.className).not.toContain('breath')
  })

  it('renders KPI numerals in the financial-instrument mono face', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        trends: {
          bookingsToday: 7,
          newPatientsMTD: 9,
          newPatientsLastMTD: 4,
          upcomingNext7d: 11,
          activeIntakeForms: 2,
          bookingsPerDay14: [],
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    const { container } = render(ui)
    // KpiStat (adopted for every trend tile) renders its hero number in
    // Geist Mono via the `font-mono-num` utility.
    const mono = container.querySelectorAll('.font-mono-num')
    expect(mono.length).toBeGreaterThan(0)
    // The trend KPIs themselves are mono.
    const bookings = screen.getByText('7')
    expect(bookings.className).toContain('font-mono-num')
    expect(bookings.className).toContain('tabular-nums')
  })

  it('uses etched v2 surfaces (no resting drop-shadow) for the cards', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    const { container } = render(ui)
    // The Mosaic flat-white card recipe is gone; v2 etched surfaces are in.
    expect(container.querySelector('.shadow-sm')).toBeNull()
    expect(container.querySelectorAll('.v2-card').length).toBeGreaterThan(0)
  })
})

describe('Integrations sync-health banner', () => {
  it('renders nothing when health is null (no PMS connection)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData({ integrationsHealth: null }))
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText(/A sync needs your attention/)).not.toBeInTheDocument()
  })

  it("renders nothing when health is 'ok'/'info' severity", async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        integrationsHealth: {
          organizationId: 'org_1',
          provider: 'open_dental',
          status: 'ok',
          severity: 'info',
          message: 'Sync is healthy.',
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastError: null,
          consecutiveFailures: 0,
          staleAfterHours: 36,
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText(/A sync needs your attention/)).not.toBeInTheDocument()
  })

  it("renders the alert banner with the helper's message + an Open Integrations link when warn/error", async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        integrationsHealth: {
          organizationId: 'org_1',
          provider: 'open_dental',
          status: 'stale',
          severity: 'warn',
          message: 'No successful sync in the last 48 hours.',
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastError: null,
          consecutiveFailures: 0,
          staleAfterHours: 36,
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/A sync needs your attention/)).toBeInTheDocument()
    expect(screen.getByText(/No successful sync in the last 48 hours/)).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Open Integrations/i })
    expect(cta).toHaveAttribute('href', '/integrations')
  })
})

describe('Needs your attention cards', () => {
  it('shows the empty state copy when there is nothing to action', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Every booking in the next 48h is confirmed/)).toBeInTheDocument()
    expect(screen.getByText(/No intake submissions this week/)).toBeInTheDocument()
    expect(screen.getByText(/No balances on file from your PMS/)).toBeInTheDocument()
  })

  it('shows counts + preview when items exist', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        unconfirmed: {
          count: 3,
          preview: [
            { id: 'a1', patientName: 'Mia Hayes', startTime: new Date('2026-05-21T09:00:00Z') },
            { id: 'a2', patientName: 'Liam Brooks', startTime: new Date('2026-05-21T10:00:00Z') },
          ],
        },
        intakeSubmissions: {
          count: 2,
          preview: [
            { id: 's1', formTitle: 'New Patient Intake', submitterName: 'Sarah K.', submittedAt: new Date() },
          ],
        },
        outstandingBalances: { count: 5, totalCents: 45000 },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Mia Hayes')).toBeInTheDocument()
    expect(screen.getByText('Liam Brooks')).toBeInTheDocument()
    expect(screen.getByText('Sarah K.')).toBeInTheDocument()
    // Outstanding balance card surfaces total $
    expect(screen.getByText(/\$450/)).toBeInTheDocument()
  })

  it('CTAs only render when there is something to action', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({ unconfirmed: { count: 1, preview: [] } }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Send confirmations/)).toBeInTheDocument()
    // Other cards have count=0 → no CTA
    expect(screen.queryByText(/Review submissions/)).not.toBeInTheDocument()
  })
})

describe("Today's chair", () => {
  it('shows the empty-coffee state when nothing is booked', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Nothing booked today/)).toBeInTheDocument()
    expect(screen.getByText(/quiet morning/i)).toBeInTheDocument()
  })

  it('renders a row per appointment with name, type, status pill, and time', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        todaysAppointments: [
          {
            id: 'a1',
            patientId: 'p1',
            patientName: 'Mia Hayes',
            startTime: new Date('2026-05-20T09:00:00Z'),
            endTime: new Date('2026-05-20T09:30:00Z'),
            type: 'cleaning',
            status: 'confirmed',
            flags: {
              newPatient: false,
              birthdayThisWeek: false,
              hasOutstandingBalance: false,
              hasIntakeOnFile: true,
            },
            tags: [],
          },
          {
            id: 'a2',
            patientId: 'p2',
            patientName: 'Liam Brooks',
            startTime: new Date('2026-05-20T10:00:00Z'),
            endTime: new Date('2026-05-20T10:30:00Z'),
            type: 'root_canal',
            status: 'scheduled',
            flags: {
              newPatient: true,
              birthdayThisWeek: false,
              hasOutstandingBalance: false,
              hasIntakeOnFile: false,
            },
            tags: [],
          },
        ],
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Mia Hayes')).toBeInTheDocument()
    expect(screen.getByText('Liam Brooks')).toBeInTheDocument()
    expect(screen.getByText('cleaning')).toBeInTheDocument()
    // "root_canal" gets the underscore replaced
    expect(screen.getByText('root canal')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    // "Unconfirmed" appears in both the attention-card title + the row status
    // pill — use getAllByText and assert ≥ 2 occurrences.
    expect(screen.getAllByText('Unconfirmed').length).toBeGreaterThanOrEqual(2)
  })

  it('renders the new-patient ★ glyph for first-visit patients', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        todaysAppointments: [
          {
            id: 'a1',
            patientId: 'p1',
            patientName: 'Liam Brooks',
            startTime: new Date(),
            endTime: null,
            type: 'checkup',
            status: 'scheduled',
            flags: {
              newPatient: true,
              birthdayThisWeek: false,
              hasOutstandingBalance: false,
              hasIntakeOnFile: false,
            },
            tags: [],
          },
        ],
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByLabelText('New patient')).toBeInTheDocument()
  })

  it('renders the balance $ glyph when patient has outstanding balance', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        todaysAppointments: [
          {
            id: 'a1',
            patientId: 'p1',
            patientName: 'Mia Hayes',
            startTime: new Date(),
            endTime: null,
            type: 'cleaning',
            status: 'confirmed',
            flags: {
              newPatient: false,
              birthdayThisWeek: false,
              hasOutstandingBalance: true,
              hasIntakeOnFile: true,
            },
            tags: [],
          },
        ],
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByLabelText(/Outstanding balance/)).toBeInTheDocument()
  })

  it('renders the missing-intake glyph for new patients without intake on file', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        todaysAppointments: [
          {
            id: 'a1',
            patientId: 'p1',
            patientName: 'Marcus T.',
            startTime: new Date(),
            endTime: null,
            type: 'cleaning',
            status: 'confirmed',
            flags: {
              newPatient: true,
              birthdayThisWeek: false,
              hasOutstandingBalance: false,
              hasIntakeOnFile: false,
            },
            tags: [],
          },
        ],
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    // Glyph now comes from the shared registry; its aria-label is the
    // canonical "missing intake before next visit" wording.
    expect(screen.getByLabelText(/Missing intake form before next visit/)).toBeInTheDocument()
  })
})

describe('Trend tiles', () => {
  it('shows MTD delta vs last month', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        trends: {
          bookingsToday: 4,
          newPatientsMTD: 12,
          newPatientsLastMTD: 8,
          upcomingNext7d: 23,
          activeIntakeForms: 1,
          bookingsPerDay14: [],
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('4')).toBeInTheDocument() // bookings today
    expect(screen.getByText('12')).toBeInTheDocument() // MTD
    expect(screen.getByText(/\+4 vs last month/)).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument() // upcoming
  })

  it('shows "first month tracking" when last-month had 0 patients', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        trends: {
          bookingsToday: 0,
          newPatientsMTD: 3,
          newPatientsLastMTD: 0,
          upcomingNext7d: 0,
          activeIntakeForms: 0,
          bookingsPerDay14: [],
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/first month tracking/i)).toBeInTheDocument()
  })

  // Regression: the "Upcoming" KPI deep-links into the appointments agenda.
  // It used to pass ?window=week, which the appointments page does NOT accept
  // (its allowlist has `this_week`) so the link silently fell back to the
  // default window — a dead deep-link. Assert it uses a real window value.
  it('links the Upcoming KPI to a window the appointments page accepts', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        trends: {
          bookingsToday: 0,
          newPatientsMTD: 0,
          newPatientsLastMTD: 0,
          upcomingNext7d: 5,
          activeIntakeForms: 0,
          bookingsPerDay14: [],
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    const upcoming = screen.getByRole('link', { name: /Upcoming/i })
    expect(upcoming).toHaveAttribute('href', '/appointments?window=this_week')
  })
})

describe('Recent activity feed', () => {
  it('shows empty-state copy when no activity', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Bookings, intake submissions, and paid invoices will appear here/)).toBeInTheDocument()
  })

  it('renders activity rows with title, subtitle, and deep link', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        recentActivity: [
          {
            id: 'a1',
            kind: 'appointment_booked',
            occurredAt: new Date(),
            title: 'Sarah K. booked cleaning',
            subtitle: 'for May 21, 10:00 AM',
            href: '/appointments',
          },
          {
            id: 'a2',
            kind: 'intake_submitted',
            occurredAt: new Date(),
            title: 'Marcus T. submitted New Patient Intake',
            subtitle: 'Intake form',
            href: '/intake-forms',
          },
        ],
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Sarah K. booked cleaning')).toBeInTheDocument()
    expect(screen.getByText('Marcus T. submitted New Patient Intake')).toBeInTheDocument()
    expect(screen.getByText('for May 21, 10:00 AM')).toBeInTheDocument()
  })
})

describe('Bottom strip — Reviews (live) + the honest coming-soon', () => {
  it('replaces the old Reviews placeholder with a real 30-day reviews card', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData({ reviewsReceived: { completed30d: 4, sent30d: 7 } }))
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    // Reviews is LIVE now — real count + link, NOT a "coming soon" placeholder.
    expect(screen.getByText('Reviews received (30d)')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/from 7 requests sent/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Read reviews & feature them/i })).toBeInTheDocument()
    expect(screen.queryByText('Reviews & reputation')).not.toBeInTheDocument()
    // SMS stays an honest coming-soon (not wired yet).
    expect(screen.getByText('SMS replies')).toBeInTheDocument()
  })
})

describe('New attention cards (money + messages)', () => {
  it('shows the outstanding-balances card sourced from the PMS', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData({ outstandingBalances: { count: 3, totalCents: 12000 } }))
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Outstanding balances')).toBeInTheDocument()
    expect(screen.getByText(/From your PMS/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See who owes/i })).toBeInTheDocument()
  })

  it('renders the Unanswered-messages + Orders cards for every clinic (no plan tiers)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData({ unreadMessages: 2, paidOrdersUnfulfilled: 5 }))
    const premUi = await ClinicOverview({ ctx: makeCtx({}) })
    render(premUi)
    expect(screen.getByText('Unanswered messages')).toBeInTheDocument()
    expect(screen.getByText('Orders to fulfill')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fulfill orders/i })).toBeInTheDocument()
  })
})

describe('website-visits trend tile', () => {
  it('renders visits + delta when siteTraffic is present', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        siteTraffic: {
          windowDays: 7,
          total: 240,
          totalPrev: 200,
          daily: [],
          topPages: [{ path: '/', views: 120 }],
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Website visits')).toBeInTheDocument()
    expect(screen.getByText('+20% vs prior week')).toBeInTheDocument()
  })

  it('hides the tile entirely when siteTraffic is null (fetch failed)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData({ siteTraffic: null }))
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText('Website visits')).not.toBeInTheDocument()
  })
})

describe('website-health banner', () => {
  it('renders the notice with its CTA when a signal fires', async () => {
    mockGetOverview.mockResolvedValueOnce(
      makeData({
        siteHealth: {
          kind: 'traffic_drop',
          title: 'Website traffic dropped this week',
          body: '40 visits in the last 7 days — down 67% from 120 the week before.',
          href: '/analytics',
          linkLabel: 'Open Analytics',
        },
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Website traffic dropped this week')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: 'Open Analytics' })
    expect(cta).toHaveAttribute('href', '/analytics')
  })

  it('renders nothing when the site is healthy', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData({ siteHealth: null }))
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText(/traffic dropped/i)).not.toBeInTheDocument()
  })
})

// ── Phase 2: the Approval Inbox + the weekly standup card ────────────────────
describe('the Approval Inbox on the Overview', () => {
  it('renders finished work with the big Approve button and the editable draft', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      {
        id: 'prop_1',
        capability: 'review_reply',
        capabilityLabel: 'Reply to Google reviews',
        patientId: null,
        title: 'Reply to Rob’s 2-star Google review',
        body: 'Rob, thank you for telling us — the wait was on us.',
        payload: {
          externalReviewId: 'r1',
          context: { kind: 'review', author: 'Rob Castellano', starRating: 2, text: 'I waited 45 minutes past my appointment time.' },
        },
        status: 'open',
        createdAt: new Date('2026-05-19T12:00:00Z'),
        expiresAt: null,
      },
      {
        id: 'prop_2',
        capability: 'outreach_campaign',
        capabilityLabel: 'Launch outreach campaigns',
        patientId: null,
        title: '41 patients are due for a cleaning — I wrote the campaign. Send it?',
        body: 'Hi {{firstName}}, come see us.',
        payload: { audienceId: 5, subject: 'We miss you', recipientCount: 41 },
        status: 'open',
        createdAt: new Date('2026-05-19T10:00:00Z'),
        expiresAt: null,
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Waiting on your yes')).toBeInTheDocument()
    expect(screen.getByText('Reply to Rob’s 2-star Google review')).toBeInTheDocument()
    // The work product itself is on the card — a proposal is finished work.
    expect(screen.getByText(/the wait was on us/)).toBeInTheDocument()
    // …and so is the thing being ANSWERED — staff never approve a public
    // reply blind (round-1 in-phase gap).
    expect(screen.getByText(/waited 45 minutes/)).toBeInTheDocument()
    expect(screen.getByText(/Rob Castellano, 2★/)).toBeInTheDocument()
    // The recipient-count honesty line rides the campaign card.
    expect(screen.getByText(/goes to ~41 patients/i)).toBeInTheDocument()
    // Merge tokens render as a SAMPLE, never raw syntax at a non-technical
    // reader (round-1 in-phase gap) — the raw text lives in edit mode only.
    expect(screen.getByText(/Hi Maria, come see us\./)).toBeInTheDocument()
    expect(screen.getByText(/Shown with a sample name/)).toBeInTheDocument()
    // The email SUBJECT is part of the artifact — shown on the card, never
    // hidden from the approver (round-2 in-phase gap).
    expect(screen.getByText('Subject')).toBeInTheDocument()
    expect(screen.getByText('We miss you')).toBeInTheDocument()
    // The send appends a booking button to this draft (no {{bookingUrl}} in
    // the body) — the card says so, because what the card shows must be
    // literally what sends (verification round).
    expect(screen.getByText('Your booking button goes at the bottom.')).toBeInTheDocument()
    // One big Approve per card.
    expect(screen.getAllByRole('button', { name: /approve — send it/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /no thanks/i })).toHaveLength(2)
  })

  it('a BLANKED subject blocks Approve with an inline message — never a silent fallback to the original (round-3)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      {
        id: 'prop_subj',
        capability: 'outreach_campaign',
        capabilityLabel: 'Launch outreach campaigns',
        patientId: null,
        title: 'Recall campaign',
        body: 'Hi {{firstName}}, come see us.',
        payload: { audienceId: 5, subject: 'We miss you', recipientCount: 41 },
        status: 'open',
        createdAt: new Date('2026-05-19T10:00:00Z'),
        expiresAt: null,
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    fireEvent.click(screen.getByRole('button', { name: /edit first/i }))
    fireEvent.change(screen.getByLabelText('Edit the email subject'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /approve — send it/i }))
    expect(screen.getByText(/The subject can’t be empty/)).toBeInTheDocument()
    expect(mockApproveAction).not.toHaveBeenCalled()
  })

  it('a DATE-ONLY inquiry still quotes its one statement — the date they asked about (round-3)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      {
        id: 'prop_date',
        capability: 'inquiry_response',
        capabilityLabel: 'Answer new inquiries',
        patientId: null,
        title: 'Answer Sam’s website inquiry',
        body: 'Hi Sam, we’d love to see you.',
        payload: {
          leadId: 'l1',
          subject: 'Your question for Dream Dental',
          context: { kind: 'inquiry', author: 'Sam Ortiz', text: null, preferredDate: 'next Tuesday morning' },
        },
        status: 'open',
        createdAt: new Date('2026-05-19T10:00:00Z'),
        expiresAt: null,
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Asked about/)).toBeInTheDocument()
    expect(screen.getByText('next Tuesday morning')).toBeInTheDocument()
    expect(screen.getByText(/Sam Ortiz/)).toBeInTheDocument()
  })

  it('a social card NAMES its destinations — never a bare count hiding the Google Business listing (verification round)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      {
        id: 'prop_social',
        capability: 'social_post',
        capabilityLabel: 'Publish social posts',
        patientId: null,
        title: 'I drafted a post for your channels — want it out there?',
        body: 'A friendly reminder from our chairs to yours.',
        payload: {
          accountIds: ['a1', 'a2'],
          channels: [
            { accountId: 'a1', label: 'Google Business' },
            { accountId: 'a2', label: 'Instagram' },
          ],
        },
        status: 'open',
        createdAt: new Date('2026-05-19T10:00:00Z'),
        expiresAt: null,
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/posts to Google Business, Instagram/)).toBeInTheDocument()
  })

  it('a truncated inbox says so — "Showing X of N" keeps the sidebar badge honest (round-2 gap)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      {
        id: 'prop_only',
        capability: 'inquiry_response',
        capabilityLabel: 'Answer new inquiries',
        patientId: null,
        title: 'Sofia asked about veneers — I drafted the answer',
        body: 'Hi Sofia, we’d love to help.',
        payload: {},
        status: 'open',
        createdAt: new Date('2026-05-19T12:00:00Z'),
        expiresAt: null,
      },
    ])
    mockCountOpenProposals.mockResolvedValueOnce(15)
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Showing 1 of 15/)).toBeInTheDocument()
  })

  it('renders nothing when the inbox is empty — no empty-state chrome to operate', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText('Waiting on your yes')).not.toBeInTheDocument()
  })
})

describe('THE LADDER LIVE (Phase 3): "always do this for me"', () => {
  const reviewCard = {
    id: 'prop_r',
    capability: 'review_reply',
    capabilityLabel: 'Reply to Google reviews',
    patientId: null,
    title: 'Reply to Rob’s 2-star Google review',
    body: 'Rob, thank you for telling us.',
    payload: { externalReviewId: 'r1' },
    status: 'open',
    createdAt: new Date('2026-05-19T12:00:00Z'),
    expiresAt: null,
  }

  it('offers the hand-over on a grantable card — NEVER pre-ticked, and granting only rides a SUCCESSFUL approve', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    const box = screen.getByRole('checkbox', { name: /handle these for me on your own/i })
    expect(box).not.toBeChecked() // nothing grants itself autonomy
    // Approving WITHOUT ticking never grants.
    fireEvent.click(screen.getByRole('button', { name: /approve — send it/i }))
    await Promise.resolve()
    await Promise.resolve()
    expect(mockSetAutonomyAction).not.toHaveBeenCalled()
  })

  it('ticking the box + approving hands the job over — after the work went out', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    fireEvent.click(screen.getByRole('checkbox', { name: /handle these for me on your own/i }))
    fireEvent.click(screen.getByRole('button', { name: /approve — send it/i }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(mockApproveAction).toHaveBeenCalled()
    expect(mockSetAutonomyAction).toHaveBeenCalledWith({ capability: 'review_reply', level: 'auto' })
  })

  it('a FAILED approve never hands over the keys', async () => {
    mockApproveAction.mockResolvedValueOnce({ ok: false, error: 'Google said no' } as never)
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    fireEvent.click(screen.getByRole('checkbox', { name: /handle these for me on your own/i }))
    fireEvent.click(screen.getByRole('button', { name: /approve — send it/i }))
    await Promise.resolve()
    await Promise.resolve()
    expect(mockSetAutonomyAction).not.toHaveBeenCalled()
  })

  it('suggests the hand-over only after a real run of unedited yeses', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    mockUneditedRun.mockResolvedValueOnce(4)
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/said yes to the last 4 of these without changing a word/i)).toBeInTheDocument()
  })

  it('stays quiet below the threshold — a suggestion is earned, not nagged', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    mockUneditedRun.mockResolvedValueOnce(2)
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText(/without changing a word/i)).not.toBeInTheDocument()
  })

  it('a card whose capability is ALREADY automatic tells the truth: it goes out on its own, and offers no second hand-over', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto' },
      { capability: 'social_post', label: 'Publish social & Google posts', level: 'ask' },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/goes out on its own within the hour/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /handle these for me on your own/i })).toBeNull()
  })

  it('the take-it-back strip lists what was handed over and gives one tap back — and SURVIVES an empty inbox (autonomy empties it)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([]) // granted work leaves no cards
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto' },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/I handle these on my own now/i)).toBeInTheDocument()
    expect(screen.getByText('Reply to Google reviews')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /go back to asking before Reply to Google reviews/i }))
    await Promise.resolve()
    await Promise.resolve()
    expect(mockSetAutonomyAction).toHaveBeenCalledWith({ capability: 'review_reply', level: 'ask' })
  })

  it('the strip TELLS what the machine did alone — counts per capability and the newest line, verbatim (round-1 Phase-3 audit: the do had no tell)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto' },
    ])
    mockListAutonomousWork.mockResolvedValueOnce([
      {
        capability: 'review_reply',
        label: 'Reply to Google reviews',
        count: 3,
        latestSummary: 'Replied to Maria’s 5-star Google review — handled on my own, as you asked',
        summaries: [
          'Replied to Maria’s 5-star Google review — handled on my own, as you asked',
          'Replied to Daniel’s 4-star Google review — handled on my own, as you asked',
          'Replied to Priya’s 5-star Google review — handled on my own, as you asked',
        ],
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/3 this week/)).toBeInTheDocument()
    // EACH one — the consent line promises a list, not a count plus an
    // example (verification round 1).
    expect(screen.getByText(/Replied to Maria’s 5-star Google review/)).toBeInTheDocument()
    expect(screen.getByText(/Replied to Daniel’s 4-star Google review/)).toBeInTheDocument()
    expect(screen.getByText(/Replied to Priya’s 5-star Google review/)).toBeInTheDocument()
  })

  it('clamps a very busy week and SAYS it is clamping — silence about the rest would be the same lie', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto', grantedAt: null },
    ])
    mockListAutonomousWork.mockResolvedValueOnce([
      {
        capability: 'review_reply',
        label: 'Reply to Google reviews',
        count: 11,
        latestSummary: 'Reply 1 — handled on my own, as you asked',
        summaries: Array.from({ length: 11 }, (_, i) => `Reply ${i + 1} — handled on my own, as you asked`),
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/…and 3 more this week/)).toBeInTheDocument()
  })

  it('a FRESH hand-over that has done nothing yet says so — silence after a hand-over reads as broken', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([])
    mockListTrustGrants.mockResolvedValueOnce([
      {
        capability: 'review_reply',
        label: 'Reply to Google reviews',
        level: 'auto',
        grantedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Nothing on my own yet/i)).toBeInTheDocument()
  })

  it('an OLD hand-over with a quiet week says QUIET, not "nothing yet" — the read covers 7 days, not all of history (round-3 audit)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([])
    mockListTrustGrants.mockResolvedValueOnce([
      {
        capability: 'review_reply',
        label: 'Reply to Google reviews',
        level: 'auto',
        grantedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Nothing this past week/i)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing on my own yet/i)).toBeNull()
  })

  it('the review-reply consent says plainly that ANGRY reviews are included — a grant the granter doesn’t understand is not a grant', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(
      screen.getByRole('checkbox', { name: /including 1- and 2-star reviews/i }),
    ).toBeInTheDocument()
  })

  it('a HANDED-BACK card says the machine gave up, and never claims it goes out on its own', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      { ...reviewCard, payload: { ...(reviewCard.payload ?? {}), handBack: true } },
    ])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto' },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/tried this one on my own twice and couldn’t send it/i)).toBeInTheDocument()
    expect(screen.queryByText(/goes out on its own within the hour/i)).toBeNull()
  })

  it('in the DEMO a grant never actually fires — the strip says so instead of promising sends', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto' },
    ])
    const ui = await ClinicOverview({ ctx: { ...makeCtx(), isDemo: true } })
    render(ui)
    expect(screen.getByText(/nothing actually goes out/i)).toBeInTheDocument()
  })

  it('an evening card for patient mail says it goes out in the MORNING — the send window holds it overnight', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      { ...reviewCard, id: 'prop_mail', capability: 'outreach_campaign', capabilityLabel: 'Launch outreach campaigns' },
    ])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'outreach_campaign', label: 'Launch outreach campaigns', level: 'auto', grantedAt: null },
    ])
    mockInsideSendWindow.mockReturnValueOnce(false)
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/goes out in the morning/i)).toBeInTheDocument()
    expect(screen.queryByText(/within the hour/i)).toBeNull()
  })

  it('a card filed BEFORE the grant stays a human’s to decide — no "goes out on its own", and it still offers nothing to re-grant', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      { ...reviewCard, createdAt: new Date('2026-05-01T00:00:00Z') },
    ])
    mockListTrustGrants.mockResolvedValueOnce([
      {
        capability: 'review_reply',
        label: 'Reply to Google reviews',
        level: 'auto',
        grantedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText(/goes out on its own within the hour/i)).toBeNull()
    // …and it must not re-ask for a trust the clinic already gave.
    expect(screen.queryByRole('checkbox', { name: /handle these for me on your own/i })).toBeNull()
  })

  it('a HANDED-BACK card never re-offers the hand-over for a capability already on automatic', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      { ...reviewCard, payload: { ...(reviewCard.payload ?? {}), handBack: true } },
    ])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto', grantedAt: null },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/tried this one on my own twice/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /handle these for me on your own/i })).toBeNull()
  })

  it('the week’s autonomous work OUTLIVES the grant — taking the job back must not erase the record', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([])
    mockListTrustGrants.mockResolvedValueOnce([]) // already taken back
    mockListAutonomousWork.mockResolvedValueOnce([
      {
        capability: 'outreach_campaign',
        label: 'Launch outreach campaigns',
        count: 1,
        latestSummary: 'Sent “We miss you” to 412 patients — handled on my own, as you asked',
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Here’s what I handled on my own this week/i)).toBeInTheDocument()
    expect(screen.getByText(/412 patients/)).toBeInTheDocument()
  })

  it('a PRE-GRANT card says why it is still theirs — round 2 created this card class and left it silent', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([
      { ...reviewCard, createdAt: new Date('2026-05-01T00:00:00Z') },
    ])
    mockListTrustGrants.mockResolvedValueOnce([
      {
        capability: 'review_reply',
        label: 'Reply to Google reviews',
        level: 'auto',
        grantedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/came in before you handed these over/i)).toBeInTheDocument()
  })

  it('a granted card names the THIRD exit — skipping one draft must not cost the whole hand-over', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    mockListTrustGrants.mockResolvedValueOnce([
      { capability: 'review_reply', label: 'Reply to Google reviews', level: 'auto', grantedAt: null },
    ])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/tell me to skip this one/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Skip this one$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /No thanks/ })).toBeNull()
  })

  it('an ask-first card keeps the permanent-decline wording — the machine really will stop asking', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockListOpenProposals.mockResolvedValueOnce([reviewCard])
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByRole('button', { name: /No thanks/ })).toBeInTheDocument()
  })

  it('no grants, no strip — the Overview stays quiet for a clinic that hasn’t handed anything over', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText(/I handle these on my own now/i)).not.toBeInTheDocument()
  })
})

describe('the weekly standup card on the Overview', () => {
  it('tells last week as counts + stories + the only-you line', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockBuildStandup.mockResolvedValueOnce({
      weekStart: new Date('2026-05-10T05:00:00Z'),
      weekEnd: new Date('2026-05-17T05:00:00Z'),
      weekLabel: 'May 10 – May 16',
      totalActions: 47,
      lines: [
        { capability: 'appointment_reminder', noun: 'appointment reminders', count: 41 },
        { capability: 'review_request', noun: 'review invitations', count: 6 },
      ],
      stories: ['Invited Noah back for a new time after a missed visit'],
      newPatientsSeated: 2,
      reviewsReceived: 3,
      humanTasks: { openProposals: 0, followupsDue: 3 },
      quiet: false,
      quietNote: null,
      predatesAccount: false,
    })
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('What I got done last week')).toBeInTheDocument()
    expect(screen.getByText('41 appointment reminders')).toBeInTheDocument()
    expect(screen.getByText(/Invited Noah back/)).toBeInTheDocument()
    expect(screen.getByText(/2 new patients seated · 3 new reviews/)).toBeInTheDocument()
    expect(screen.getByText(/3 follow-ups are due/)).toBeInTheDocument()
  })

  it('a busy week past 8 capabilities shows the overflow line — the card and the email must agree on the total (round-3)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const lines = [
      { capability: 'appointment_reminder', noun: 'appointment reminders', count: 41 },
      { capability: 'review_request', noun: 'review invitations', count: 12 },
      { capability: 'campaign_send', noun: 'campaign sends', count: 9 },
      { capability: 'retention_automation', noun: 'recall & win-back notes', count: 8 },
      { capability: 'followup_rule', noun: 'follow-ups opened', count: 7 },
      { capability: 'balance_nudge', noun: 'balance reminders', count: 6 },
      { capability: 'auto_reply', noun: 'after-hours replies', count: 5 },
      { capability: 'forms_reminder', noun: 'form nudges', count: 4 },
      { capability: 'nps_survey', noun: 'visit check-ins', count: 3 },
      { capability: 'noshow_rebook', noun: 'rebook invitations', count: 2 },
    ]
    mockBuildStandup.mockResolvedValueOnce({
      weekStart: new Date('2026-05-10T05:00:00Z'),
      weekEnd: new Date('2026-05-17T05:00:00Z'),
      weekLabel: 'May 10 – May 16',
      totalActions: lines.reduce((s, l) => s + l.count, 0),
      lines,
      stories: [],
      newPatientsSeated: 0,
      reviewsReceived: 0,
      humanTasks: { openProposals: 0, followupsDue: 0 },
      quiet: false,
      quietNote: null,
      predatesAccount: false,
    })
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    // 3 + 2 — the two lines beyond the first eight, same math as the email.
    expect(screen.getByText('…and 5 more small things')).toBeInTheDocument()
    expect(screen.queryByText(/rebook invitations/)).not.toBeInTheDocument()
  })

  it('a window that PREDATES the account renders NOTHING — no report about a week the clinic wasn’t here (round-3)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockBuildStandup.mockResolvedValueOnce({
      weekStart: new Date('2026-05-10T05:00:00Z'),
      weekEnd: new Date('2026-05-17T05:00:00Z'),
      weekLabel: 'May 10 – May 16',
      totalActions: 0,
      lines: [],
      stories: [],
      newPatientsSeated: 0,
      reviewsReceived: 0,
      humanTasks: { openProposals: 0, followupsDue: 3 },
      quiet: false,
      quietNote: null,
      predatesAccount: true,
    })
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText('Last week')).not.toBeInTheDocument()
    expect(screen.queryByText('What I got done last week')).not.toBeInTheDocument()
  })

  it('a QUIET week renders the config-cross-checked narration, not a blank (round-1: dead engine vs healthy idle)', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    mockBuildStandup.mockResolvedValueOnce({
      weekStart: new Date('2026-05-10T05:00:00Z'),
      weekEnd: new Date('2026-05-17T05:00:00Z'),
      weekLabel: 'May 10 – May 16',
      totalActions: 0,
      lines: [],
      stories: [],
      newPatientsSeated: 0,
      reviewsReceived: 0,
      humanTasks: { openProposals: 0, followupsDue: 0 },
      quiet: true,
      quietNote: 'A quiet week — one heads up: appointment reminders are switched off, so I can’t send any. Turn them on in Settings when you’re ready.',
      predatesAccount: false,
    })
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.queryByText('What I got done last week')).not.toBeInTheDocument()
    expect(screen.getByText(/appointment reminders are switched off/)).toBeInTheDocument()
  })
})
