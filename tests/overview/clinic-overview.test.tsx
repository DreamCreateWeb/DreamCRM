import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockGetOverview } = vi.hoisted(() => ({
  mockGetOverview: vi.fn(),
}))

vi.mock('@/lib/services/clinic-overview', () => ({
  getClinicOverview: mockGetOverview,
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
    todaysAppointments: [],
    unconfirmed: { count: 0, preview: [] },
    intakeSubmissions: { count: 0, preview: [] },
    outstandingBalances: { count: 0, totalCents: 0 },
    trends: {
      bookingsToday: 0,
      newPatientsMTD: 0,
      newPatientsLastMTD: 0,
      upcomingNext7d: 0,
      activeIntakeForms: 0,
    },
    recentActivity: [],
    ...overrides,
  }
}

beforeEach(() => {
  mockGetOverview.mockReset()
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

describe('Needs your attention cards', () => {
  it('shows the empty state copy when there is nothing to action', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Every booking in the next 48h is confirmed/)).toBeInTheDocument()
    expect(screen.getByText(/No intake submissions this week/)).toBeInTheDocument()
    expect(screen.getByText(/No outstanding shop balances/)).toBeInTheDocument()
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
          },
        ],
      }),
    )
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByLabelText(/No intake form on file/)).toBeInTheDocument()
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

describe('Coming soon strip', () => {
  it('renders the three honest "coming soon" placeholders', async () => {
    mockGetOverview.mockResolvedValueOnce(makeData())
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Reviews & reputation')).toBeInTheDocument()
    expect(screen.getByText('SMS replies')).toBeInTheDocument()
    expect(screen.getByText('Website leads')).toBeInTheDocument()
  })
})
