import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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
    intakeSubmissions: { count: 0, preview: [] },
    outstandingBalances: { count: 0, totalCents: 0 },
    newLeads: { count: 0, preview: [] },
    paidOrdersUnfulfilled: 0,
    unreadMessages: 0,
    reviewsReceived: { completed30d: 0, sent30d: 0 },
    trends: {
      bookingsToday: 0,
      newPatientsMTD: 0,
      newPatientsLastMTD: 0,
      upcomingNext7d: 0,
      activeIntakeForms: 0,
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

  it('renders the Unanswered-messages card on pro+ and the Orders card only on premium', async () => {
    // pro tenant: messages card present, orders card absent.
    mockGetOverview.mockResolvedValueOnce(makeData({ unreadMessages: 2, paidOrdersUnfulfilled: 5 }))
    const proUi = await ClinicOverview({ ctx: makeCtx({ planTier: 'pro' }) })
    const { unmount } = render(proUi)
    expect(screen.getByText('Unanswered messages')).toBeInTheDocument()
    expect(screen.queryByText('Orders to fulfill')).not.toBeInTheDocument()
    unmount()

    // premium tenant: both cards present.
    mockGetOverview.mockResolvedValueOnce(makeData({ unreadMessages: 2, paidOrdersUnfulfilled: 5 }))
    const premUi = await ClinicOverview({ ctx: makeCtx({ planTier: 'premium' }) })
    render(premUi)
    expect(screen.getByText('Unanswered messages')).toBeInTheDocument()
    expect(screen.getByText('Orders to fulfill')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fulfill orders/i })).toBeInTheDocument()
  })
})
