import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/(default)/platform/first-week/admin-actions', () => ({ answerPmsRequestAction: async () => ({ ok: true }) }))

import FirstWeekBoard from '@/app/(default)/platform/first-week/first-week-board'
import type { FirstWeekBoard as Board, FirstWeekRow } from '@/lib/services/first-week'

/**
 * The board renders a REPORT: stuck rows carry their reasons in the warn
 * tone, the activation list names the next milestone, the connected facts
 * ride the readiness grades, and an empty platform gets an honest empty
 * state rather than a blank page.
 */

const NOW = new Date('2026-10-12T15:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function row(overrides: Partial<FirstWeekRow> = {}): FirstWeekRow {
  return {
    orgId: 'org_a',
    name: 'All about Smiles',
    slug: 'all-about-smiles',
    isDemo: false,
    createdAt: daysAgo(4),
    day: 4,
    stage: 'first-week',
    subscriptionStatus: 'trialing',
    billingMode: null,
    goal: null,
    facts: [{ id: 'pms', label: 'Practice software', grade: 'waiting', summary: 'We are binding it', href: '/x' }],
    patientCount: 0,
    workLast7: 0,
    openCards: 0,
    oldestOpenCardAt: null,
    lastStaffSignInAt: null,
    activation: { a1: null, a2: null, a3: null, a4: null, a5: null },
    pendingOnUs: [],
    digestOn: false,
    doors: { insurance: false, digest: false, siteLive: true, switches: [] },
    doorsUnreadable: false,
    trial: { onTrial: true, expired: false, daysLeft: 3 },
    timeZone: 'America/New_York',
    smsState: null,
    pmsRequest: null,
    progress: { done: [], next: 'a1' },
    stuck: ['No data by day 4 — call about the PMS, or send the patient CSV.'],
    ...overrides,
  }
}

function board(rows: FirstWeekRow[]): Board {
  return { rows, generatedAt: NOW, counts: { inFirstMonth: rows.length, stuck: rows.filter((r) => r.stuck.length).length, noData: rows.filter((r) => !r.activation.a1).length, medianHoursToA1: null } }
}

describe('FirstWeekBoard', () => {
  it('a stuck clinic shows its reasons, its missing goal, its pending facts and the next milestone', () => {
    render(<FirstWeekBoard board={board([row()])} includeDemo={false} />)
    const card = screen.getByTestId('first-week-row')
    expect(card.getAttribute('data-stuck')).toBe('1')
    expect(within(card).getByText('Stuck · 1')).toBeInTheDocument()
    expect(within(card).getByTestId('stuck-reasons')).toHaveTextContent('No data by day 4')
    expect(within(card).getByText(/No goal set yet/)).toBeInTheDocument()
    expect(within(card).getByText('Practice software: pending')).toBeInTheDocument()
    expect(within(card).getByTestId('activation')).toHaveTextContent('A1 Data connected — next')
    expect(within(card).getByText(/Last active staff session: none/)).toBeInTheDocument()
    expect(within(card).getByTestId('doors-open')).toHaveTextContent('Doors open: website')
    expect(screen.getByText('Show the demo clinic')).toBeInTheDocument()
  })

  it('the trial rides the row: days left while on it, "behind the wall" when it ended, the subscription word otherwise', () => {
    const { unmount } = render(<FirstWeekBoard board={board([row({ trial: { onTrial: true, expired: false, daysLeft: 2 } })])} includeDemo={false} />)
    expect(screen.getByText('Trial · 2 days left')).toBeInTheDocument()
    unmount()
    const r2 = render(<FirstWeekBoard board={board([row({ trial: { onTrial: false, expired: true, daysLeft: 0 } })])} includeDemo={false} />)
    expect(screen.getByText('Trial ended · behind the wall')).toBeInTheDocument()
    r2.unmount()
    render(<FirstWeekBoard board={board([row({ trial: { onTrial: false, expired: false, daysLeft: null }, subscriptionStatus: 'active' })])} includeDemo={false} />)
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.queryByText(/Trial/)).toBeNull()
  })

  it('an unreadable profile says the doors could not be read, not "none yet"', () => {
    render(<FirstWeekBoard board={board([row({ doorsUnreadable: true })])} includeDemo={false} />)
    expect(screen.getByTestId('doors-open')).toHaveTextContent('couldn’t read them just now')
  })

  it('the doors list names every S3 switch that is on, in the switch registry’s words', () => {
    render(<FirstWeekBoard board={board([row({ doors: { insurance: true, digest: false, siteLive: false, switches: ['my_day', 'growth'] } })])} includeDemo={false} />)
    expect(screen.getByTestId('doors-open')).toHaveTextContent('Doors open: my day · growth · insurance')
  })

  it('a healthy clinic is “On track” with its goal and its dates', () => {
    render(
      <FirstWeekBoard
        board={board([row({ goal: 'more implant patients', stuck: [], workLast7: 7, openCards: 1, activation: { a1: daysAgo(3), a2: daysAgo(2), a3: null, a4: null, a5: null }, progress: { done: ['a1', 'a2'], next: 'a3' }, lastStaffSignInAt: daysAgo(0) })])}
        includeDemo
      />,
    )
    const card = screen.getByTestId('first-week-row')
    expect(card.getAttribute('data-stuck')).toBe('0')
    expect(within(card).getByText('On track')).toBeInTheDocument()
    expect(within(card).getByText('“more implant patients”')).toBeInTheDocument()
    expect(within(card).getByTestId('activation')).toHaveTextContent('A3 First booking — next')
    expect(screen.getByText('Hide the demo clinic')).toBeInTheDocument()
  })

  it('no clinics → an honest empty state', () => {
    render(<FirstWeekBoard board={board([])} includeDemo={false} />)
    expect(screen.getByText('No clinics yet')).toBeInTheDocument()
  })
})

describe('FirstWeekBoard — the PMS connect request (S4)', () => {
  it('names the system the clinic asked us to connect, and that it is waiting on us', () => {
    const board: Board = {
      rows: [row({ pmsRequest: { vendor: 'Open Dental', status: 'requested', at: daysAgo(1) }, stuck: [] })],
      generatedAt: NOW,
      counts: { inFirstMonth: 1, stuck: 0, noData: 1, medianHoursToA1: null },
    }
    render(<FirstWeekBoard board={board} includeDemo={false} />)
    expect(screen.getByTestId('pms-request')).toHaveTextContent('Asked us to connect Open Dental')
    expect(screen.getByTestId('pms-request')).toHaveTextContent('waiting on us')
    // The platform answers from the row (audit round 1): the two writes the cockpit can make.
    expect(screen.getByRole('button', { name: 'Mark install scheduled' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close request' })).toBeInTheDocument()
  })

  it('a scheduled install says so and no longer offers to schedule it', () => {
    const board: Board = {
      rows: [row({ pmsRequest: { vendor: 'Dentrix', status: 'scheduled', at: daysAgo(1) }, stuck: [] })],
      generatedAt: NOW,
      counts: { inFirstMonth: 1, stuck: 0, noData: 1, medianHoursToA1: null },
    }
    render(<FirstWeekBoard board={board} includeDemo={false} />)
    expect(screen.getByTestId('pms-request')).toHaveTextContent('install scheduled')
    expect(screen.queryByRole('button', { name: 'Mark install scheduled' })).toBeNull()
  })
})
