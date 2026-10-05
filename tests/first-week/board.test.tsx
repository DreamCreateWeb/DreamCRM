import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    doors: { insurance: false, digest: false, siteLive: true },
    smsState: null,
    progress: { done: [], next: 'a1' },
    stuck: ['No data by day 4 — call about the PMS, or send the patient CSV.'],
    ...overrides,
  }
}

function board(rows: FirstWeekRow[]): Board {
  return { rows, generatedAt: NOW, counts: { inFirstMonth: rows.length, stuck: rows.filter((r) => r.stuck.length).length, noData: rows.filter((r) => !r.activation.a1).length } }
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
    expect(within(card).getByText(/Last staff sign-in: never/)).toBeInTheDocument()
    expect(within(card).getByText(/Doors open: website/)).toBeInTheDocument()
    expect(screen.getByText('Show the demo clinic')).toBeInTheDocument()
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
