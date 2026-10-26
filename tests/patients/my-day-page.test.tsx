import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import type { MyDayData } from '@/lib/services/my-day'
import type { PmsLink } from '@/lib/pms-link'

/**
 * The My Day page's honesty (docs/ACTIVATION.md law 3):
 *  - the second KPI names the STATE ("Still unconfirmed"), not a channel the
 *    practice may not have ("Need a text" — texting waits on the carriers);
 *  - the Balances tile says "all paid up" only once a PMS feeds the column,
 *    and otherwise names the source and opens the connect door;
 *  - an empty schedule with no PMS is not "a quiet one".
 */
const h = vi.hoisted(() => ({
  data: null as MyDayData | null,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/my-day',
}))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({
    userId: 'u_1',
    userName: 'Mary Front',
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    tenantType: 'clinic',
    role: 'member',
    isDemo: false,
  })),
}))
vi.mock('@/lib/services/my-day', () => ({
  getMyDay: vi.fn(async () => h.data),
  getMyClosedFollowupsPerWeek8: vi.fn(async () => []),
}))
vi.mock('@/lib/services/daily-digest', () => ({ getDigestEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/services/staff-notification-pref', () => ({ getDigestOptOut: vi.fn(async () => false) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/app/(default)/patients/actions', () => ({
  completeFollowupAction: vi.fn(),
  reopenFollowupAction: vi.fn(),
  updateFollowupAction: vi.fn(),
}))
vi.mock('@/app/(default)/my-day/actions', () => ({ setMyDigestOptOutAction: vi.fn() }))

import MyDayPage from '@/app/(default)/my-day/page'

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>{children}</ToastProvider>
    </ConfirmProvider>
  )
}
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers })

function data(over: Partial<MyDayData> = {}, pmsLink: PmsLink = { kind: 'connected' }): MyDayData {
  return {
    followups: { overdue: 0, today: 0, items: [] },
    conversations: [],
    todaysAppointments: [],
    unconfirmedTodayCount: 2,
    newLeadsCount: 0,
    balances: { count: 0, totalCents: 0 },
    pmsLink,
    openProposalsCount: 0,
    tomorrow: { dayKey: '2026-10-27', visitCount: 0, items: [] },
    ...over,
  }
}

beforeEach(() => {
  h.data = null
})

describe('My Day — the KPI strip tells the truth', () => {
  it('the unconfirmed tile names the state, never a text the practice cannot send yet', async () => {
    h.data = data()
    render(await MyDayPage())
    expect(screen.getByText('Still unconfirmed')).toBeInTheDocument()
    expect(screen.getByText('today — send a confirmation')).toBeInTheDocument()
    expect(screen.queryByText(/Need a text/)).not.toBeInTheDocument()
    expect(screen.getByText('Still unconfirmed').closest('a')).toHaveAttribute('href', '/appointments?window=today&attention=unconfirmed')
  })

  it('with a PMS and nothing owed, Balances reads "all paid up" and opens Collections', async () => {
    h.data = data({}, { kind: 'connected' })
    render(await MyDayPage())
    expect(screen.getByText('all paid up')).toBeInTheDocument()
    expect(screen.getByText('Balances').closest('a')).toHaveAttribute('href', '/payments/collections')
  })

  it('with no PMS, Balances never says "paid up" — it names the source and opens the connect door', async () => {
    h.data = data({}, { kind: 'none' })
    render(await MyDayPage())
    expect(screen.queryByText(/paid up/i)).not.toBeInTheDocument()
    expect(screen.getByText('needs your practice software')).toBeInTheDocument()
    expect(screen.getByText('Balances').closest('a')).toHaveAttribute('href', '/integrations/pms')
    // Today's visits says what it can actually see.
    expect(screen.getByText('booked online')).toBeInTheDocument()
  })

  it('an empty schedule with no PMS is not "a quiet one" — it names its source and carries both doors', async () => {
    h.data = data({}, { kind: 'none' })
    render(await MyDayPage())
    expect(screen.getByText('Only visits booked through your website show here.')).toBeInTheDocument()
    expect(screen.queryByText(/A quiet one/)).not.toBeInTheDocument()
    // Both doors (other panes on the page offer "Book a visit" too, so every one is checked).
    const book = screen.getAllByRole('link', { name: /Book a visit/ })
    expect(book.length).toBeGreaterThanOrEqual(1)
    for (const b of book) expect(b).toHaveAttribute('href', '/appointments?new=1')
    const doors = screen.getAllByRole('link', { name: /Connect it/ })
    expect(doors.length).toBeGreaterThanOrEqual(1)
    for (const d of doors) expect(d).toHaveAttribute('href', '/integrations/pms')
  })

  it('an empty schedule with a PMS is a real quiet one', async () => {
    h.data = data({}, { kind: 'connected' })
    render(await MyDayPage())
    expect(screen.getByText('No visits today')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Connect it/ })).not.toBeInTheDocument()
  })
})
