import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Thread triage controls in the detail header: the star (priority flag) toggle
 * and Mark-unread. Verifies they render, reflect the starred state, and call
 * the right server actions. The booking drawer is stubbed (server graph).
 */

const toggleStarAction = vi.fn(async () => {})
const markUnreadAction = vi.fn(async () => {})
const push = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => ({
  archiveThreadAction: vi.fn(),
  reopenThreadAction: vi.fn(),
  sendMessageAction: vi.fn(),
  snoozeThreadAction: vi.fn(),
  assignThreadAction: vi.fn(),
  draftReplyAction: vi.fn(),
  scheduleMessageAction: vi.fn(),
  cancelScheduledMessageAction: vi.fn(),
  markUnreadAction: (...a: unknown[]) => markUnreadAction(...(a as [])),
  toggleStarAction: (...a: unknown[]) => toggleStarAction(...(a as [])),
}))
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({ default: () => null }))

import ThreadDetailPanel from '@/app/(double-sidebar)/messages/clinic-thread-detail-panel'

function baseThread(over: Record<string, unknown> = {}) {
  return {
    id: 'thr_1',
    patientId: 'pat_1',
    patientFirstName: 'Mia',
    patientLastName: 'Nguyen',
    patientEmail: 'mia@example.com',
    patientPhone: '(512) 555-0101',
    status: 'open' as const,
    assignedUserId: null,
    assignedUserName: null,
    snoozedUntil: null,
    lastMessageChannel: 'email' as const,
    starred: false,
    ...over,
  }
}

function renderPanel(threadOver: Record<string, unknown> = {}) {
  return render(
    <ThreadDetailPanel thread={baseThread(threadOver)} messages={[]} currentUserName="Dr. Reyes" templates={[]} hasEmail />,
  )
}

describe('Thread triage controls', () => {
  it('shows an unfilled star with a "Star this conversation" title by default', () => {
    renderPanel()
    expect(screen.getByTitle('Star this conversation')).toBeInTheDocument()
  })

  it('reflects a starred thread and toggles it off on click', () => {
    renderPanel({ starred: true })
    const btn = screen.getByTitle('Starred — click to unstar')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(toggleStarAction).toHaveBeenCalledWith('thr_1', false)
  })

  it('stars an unstarred thread on click', () => {
    renderPanel({ starred: false })
    fireEvent.click(screen.getByTitle('Star this conversation'))
    expect(toggleStarAction).toHaveBeenCalledWith('thr_1', true)
  })

  it('marks a thread unread and returns to the list', () => {
    renderPanel()
    fireEvent.click(screen.getByTitle(/Mark unread/))
    expect(markUnreadAction).toHaveBeenCalledWith('thr_1')
  })
})
