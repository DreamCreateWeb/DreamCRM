import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * The composer's scheduled-sends strip shows a FAILED send in rose with the
 * reason, a Retry and a Dismiss — instead of the row simply vanishing, which
 * is exactly what a successful send looks like. Retry re-queues through a
 * human click (the action), Dismiss cancels it.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
const retry = vi.fn(async (_id: string) => ({ ok: true as const }))
const cancel = vi.fn(async (_id: string) => ({ ok: true as const }))
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => ({
  archiveThreadAction: vi.fn(),
  assignThreadAction: vi.fn(),
  reopenThreadAction: vi.fn(),
  sendMessageAction: vi.fn(),
  snoozeThreadAction: vi.fn(),
  scheduleMessageAction: vi.fn(),
  draftReplyAction: vi.fn(),
  translateMessageAction: vi.fn(),
  markUnreadAction: vi.fn(),
  toggleStarAction: vi.fn(),
  cancelScheduledMessageAction: (id: string) => cancel(id),
  retryScheduledMessageAction: (id: string) => retry(id),
}))

import ThreadDetailPanel from '@/app/(double-sidebar)/messages/clinic-thread-detail-panel'

const thread = {
  id: 'thr_1',
  patientId: 'pat_1',
  patientFirstName: 'Mia',
  patientLastName: 'Nguyen',
  patientEmail: null,
  patientPhone: '(512) 555-0101',
  status: 'open' as const,
  assignedUserId: null,
  assignedUserName: null,
  snoozedUntil: null,
  lastMessageChannel: 'in_app' as const,
}

function renderStrip(scheduledMessages: Array<Record<string, unknown>>) {
  return render(
    <ThreadDetailPanel
      thread={thread}
      currentUserName="Dr. Reyes"
      templates={[]}
      hasEmail={false}
      messages={[]}
      scheduledMessages={scheduledMessages as never}
    />,
  )
}

const pendingRow = {
  id: 'smsg_p',
  channel: 'in_app',
  body: 'See you Tuesday',
  attachments: [],
  scheduledFor: '2026-11-03T15:00:00.000Z',
  status: 'pending',
  lastError: null,
}
const failedRow = {
  id: 'smsg_f',
  channel: 'email',
  body: 'See you tomorrow at 10',
  attachments: [],
  scheduledFor: '2026-10-26T13:00:00.000Z',
  status: 'failed',
  lastError: 'Patient has no email on file',
}

beforeEach(() => {
  retry.mockClear()
  cancel.mockClear()
})

describe('Scheduled strip — a failed send stays visible', () => {
  it('renders the failed row in rose with its reason, beside the pending one', () => {
    renderStrip([pendingRow, failedRow])
    expect(screen.getByText(/^Scheduled ·/)).toBeInTheDocument()
    const failed = screen.getByTestId('scheduled-failed')
    expect(failed.className).toMatch(/rose/)
    expect(within(failed).getByText('Didn’t send')).toBeInTheDocument()
    expect(failed.textContent).toContain('Patient has no email on file')
    expect(failed.textContent).toContain('See you tomorrow at 10')
    expect(within(failed).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(within(failed).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('Retry is a human click through the action — nothing is sent from the browser', async () => {
    renderStrip([failedRow])
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(retry).toHaveBeenCalledWith('smsg_f'))
    expect(await screen.findByText(/Queued again/)).toBeInTheDocument()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('Dismiss cancels the failed row', async () => {
    renderStrip([failedRow])
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('smsg_f'))
    expect(await screen.findByText(/Dismissed/)).toBeInTheDocument()
  })

  it('a refused retry shows the action’s own words and the button comes back', async () => {
    retry.mockResolvedValueOnce({ ok: false, error: 'That message isn’t waiting on a retry anymore — refresh to see where it stands.' } as never)
    renderStrip([failedRow])
    const button = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(button)
    expect(await screen.findByText(/isn’t waiting on a retry anymore/)).toBeInTheDocument()
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  })
})
