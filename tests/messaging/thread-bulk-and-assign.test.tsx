/**
 * Two new thread-management affordances on the clinic inbox:
 *
 *  • ClinicThreadList — checkbox multi-select + a bulk bar that archives,
 *    snoozes, or marks-read several conversations at once.
 *  • ThreadDetailPanel — an Assign dropdown that (re)assigns the conversation
 *    to a teammate, "assign to me", and unassign.
 *
 * The server actions are mocked; these pin the UI → action wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const actions = vi.hoisted(() => ({
  bulkArchiveThreadsAction: vi.fn(async () => undefined),
  bulkSnoozeThreadsAction: vi.fn(async () => undefined),
  bulkMarkReadThreadsAction: vi.fn(async () => undefined),
  assignThreadAction: vi.fn(async () => undefined),
  archiveThreadAction: vi.fn(),
  reopenThreadAction: vi.fn(),
  sendMessageAction: vi.fn(),
  snoozeThreadAction: vi.fn(),
}))
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => actions)

import ClinicThreadList, {
  type ThreadListRow,
} from '@/app/(double-sidebar)/messages/clinic-thread-list'
import ThreadDetailPanel from '@/app/(double-sidebar)/messages/clinic-thread-detail-panel'

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockClear()
})

function listRow(over: Partial<ThreadListRow> = {}): ThreadListRow {
  return {
    id: 't1',
    href: '/messages?thread=t1',
    patientId: 'p1',
    patientFirstName: 'Mia',
    patientLastName: 'Nguyen',
    unreadCount: 0,
    lastMessagePreview: 'hi there',
    lastMessageDirection: 'inbound',
    lastMessageChannel: 'email',
    lastMessageAt: new Date().toISOString(),
    status: 'open',
    assignedUserName: null,
    ...over,
  }
}

const ROWS: ThreadListRow[] = [
  listRow(),
  listRow({ id: 't2', href: '/messages?thread=t2', patientId: 'p2', patientFirstName: 'Liam', patientLastName: 'Park', lastMessageChannel: 'sms' }),
]

describe('ClinicThreadList — bulk selection', () => {
  it('shows no bulk bar until a row is selected', () => {
    render(<ClinicThreadList rows={ROWS} activeThreadId={null} />)
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull()
  })

  it('selecting a row reveals the bulk bar and archive sends that thread id', async () => {
    render(<ClinicThreadList rows={ROWS} activeThreadId={null} />)
    fireEvent.click(screen.getByLabelText('Select conversation with Mia Nguyen'))
    const bar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(bar.textContent).toContain('1 conversation')
    fireEvent.click(within(bar).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(actions.bulkArchiveThreadsAction).toHaveBeenCalledWith(['t1']))
  })

  it('select-all selects every row and bulk mark-read sends them all', async () => {
    render(<ClinicThreadList rows={ROWS} activeThreadId={null} />)
    fireEvent.click(screen.getByLabelText('Select all conversations'))
    const bar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(bar.textContent).toContain('2 conversations')
    fireEvent.click(within(bar).getByRole('button', { name: 'Mark read' }))
    await waitFor(() =>
      expect(actions.bulkMarkReadThreadsAction).toHaveBeenCalledWith(expect.arrayContaining(['t1', 't2'])),
    )
  })
})

const detailThread = {
  id: 'thr_1',
  patientId: 'pat_1',
  patientFirstName: 'Mia',
  patientLastName: 'Nguyen',
  patientEmail: 'mia@example.com',
  patientPhone: null,
  status: 'open' as const,
  assignedUserId: null as string | null,
  assignedUserName: null as string | null,
  snoozedUntil: null,
  lastMessageChannel: 'email' as const,
}
const MEMBERS = [
  { userId: 'u2', name: 'Dr. Reyes' },
  { userId: 'u3', name: 'Maria Vega' },
]
const MSG = {
  id: 'm1',
  source: 'patient_message' as const,
  channel: 'email' as const,
  direction: 'inbound' as const,
  body: 'hello',
  sentAt: '2026-06-14T09:00:00.000Z',
  sentByUserName: null,
}

describe('ThreadDetailPanel — assign / reassign', () => {
  it('assigns to a chosen teammate', async () => {
    render(
      <ThreadDetailPanel
        thread={detailThread}
        messages={[MSG]}
        currentUserName="Me"
        templates={[]}
        hasEmail
        members={MEMBERS}
        currentUserId="u1"
      />,
    )
    fireEvent.click(screen.getByTitle('Assign this conversation to a teammate'))
    fireEvent.click(screen.getByRole('button', { name: 'Maria Vega' }))
    await waitFor(() => expect(actions.assignThreadAction).toHaveBeenCalledWith('thr_1', 'u3'))
  })

  it('offers "Assign to me" using the current user id', async () => {
    render(
      <ThreadDetailPanel
        thread={detailThread}
        messages={[MSG]}
        currentUserName="Me"
        templates={[]}
        hasEmail
        members={MEMBERS}
        currentUserId="u1"
      />,
    )
    fireEvent.click(screen.getByTitle('Assign this conversation to a teammate'))
    fireEvent.click(screen.getByRole('button', { name: 'Assign to me' }))
    await waitFor(() => expect(actions.assignThreadAction).toHaveBeenCalledWith('thr_1', 'u1'))
  })

  it('shows the current assignee on the trigger and can unassign', async () => {
    render(
      <ThreadDetailPanel
        thread={{ ...detailThread, assignedUserId: 'u3', assignedUserName: 'Maria Vega' }}
        messages={[MSG]}
        currentUserName="Me"
        templates={[]}
        hasEmail
        members={MEMBERS}
        currentUserId="u1"
      />,
    )
    const trigger = screen.getByTitle('Assign this conversation to a teammate')
    expect(trigger.textContent).toContain('Maria')
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Unassign' }))
    await waitFor(() => expect(actions.assignThreadAction).toHaveBeenCalledWith('thr_1', null))
  })
})
