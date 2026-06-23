import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Quick-book from a thread: the conversation header carries a "Book" action
 * that opens the same in-place booking drawer staff use on the patient page —
 * so they can schedule a visit without leaving the relationship context. The
 * drawer itself is stubbed (its slot-picker pulls the server graph); this
 * verifies the button + that it opens the drawer for the right patient.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => ({
  archiveThreadAction: vi.fn(),
  reopenThreadAction: vi.fn(),
  sendMessageAction: vi.fn(),
  snoozeThreadAction: vi.fn(),
  assignThreadAction: vi.fn(),
  draftReplyAction: vi.fn(),
}))
vi.mock('@/app/(default)/appointments/book-from-patient-drawer', () => ({
  default: ({ patientName, onClose }: { patientName: string; onClose: () => void }) => (
    <div data-testid="book-drawer">
      Booking for {patientName}
      <button onClick={onClose}>close</button>
    </div>
  ),
}))

import ThreadDetailPanel from '@/app/(double-sidebar)/messages/clinic-thread-detail-panel'

const thread = {
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
}

function renderPanel() {
  return render(
    <ThreadDetailPanel thread={thread} messages={[]} currentUserName="Dr. Reyes" templates={[]} hasEmail />,
  )
}

describe('Quick-book from a thread', () => {
  it('shows a Book action in the conversation header', () => {
    renderPanel()
    expect(screen.getByTitle('Book a visit for Mia')).toBeInTheDocument()
    // Drawer is closed until the action is clicked.
    expect(screen.queryByTestId('book-drawer')).not.toBeInTheDocument()
  })

  it('opens the booking drawer for the thread patient and closes again', () => {
    renderPanel()
    fireEvent.click(screen.getByTitle('Book a visit for Mia'))
    const drawer = screen.getByTestId('book-drawer')
    expect(drawer).toHaveTextContent('Booking for Mia Nguyen')
    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByTestId('book-drawer')).not.toBeInTheDocument()
  })
})
