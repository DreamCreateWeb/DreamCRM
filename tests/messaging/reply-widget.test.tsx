import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * The reply widget (composer-widget pass, 2026-07-21): the old controls row
 * that floated above the reply box (channel select, Templates, ✨ Draft,
 * 🌐 Español, 📎 Photo, prefers chip, ⌘Enter hint) collapsed INTO one card —
 * textarea on top, toolbar on the bottom (emoji drawer · photo · templates ·
 * AI · channel dropdown · schedule clock · Send). These tests pin the widget
 * anatomy and that no capability was lost in the collapse.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => ({
  archiveThreadAction: vi.fn(),
  assignThreadAction: vi.fn(),
  reopenThreadAction: vi.fn(),
  sendMessageAction: vi.fn(async () => ({ ok: true })),
  snoozeThreadAction: vi.fn(),
  draftReplyAction: vi.fn(),
  translateMessageAction: vi.fn(),
  markUnreadAction: vi.fn(),
  scheduleMessageAction: vi.fn(),
  cancelScheduledMessageAction: vi.fn(),
  toggleStarAction: vi.fn(),
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
  lastMessageChannel: 'in_app' as const,
}

function renderPanel(extra: Record<string, unknown> = {}) {
  return render(
    <ThreadDetailPanel
      thread={thread}
      currentUserName="Dr. Reyes"
      templates={[{ key: 'thanks', label: 'Thanks note', rendered: 'Thank you, Mia!' }]}
      hasEmail
      messages={[]}
      {...extra}
    />,
  )
}

describe('Reply widget anatomy', () => {
  it('renders the toolbar inside the card: emoji, photo, templates, channel, schedule, Send', () => {
    renderPanel()
    expect(screen.getByLabelText('Your reply')).toBeInTheDocument()
    expect(screen.getByLabelText('Add an emoji')).toBeInTheDocument()
    expect(screen.getByLabelText('Attach a photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Templates/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Reply channel')).toBeInTheDocument()
    expect(screen.getByTitle('Schedule this message to send later')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send message/ })).toBeInTheDocument()
  })

  it('inserts a picked emoji into the reply body', async () => {
    renderPanel()
    const box = screen.getByLabelText('Your reply') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'See you soon' } })
    fireEvent.click(screen.getByLabelText('Add an emoji'))
    fireEvent.click(screen.getByRole('button', { name: '😊' }))
    await waitFor(() => expect(box.value).toContain('😊'))
  })

  it('drops a template into the box from the toolbar popover', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /Templates/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Thanks note' }))
    expect((screen.getByLabelText('Your reply') as HTMLTextAreaElement).value).toBe('Thank you, Mia!')
  })

  it('keeps the schedule popover behind the clock toggle', () => {
    renderPanel()
    expect(screen.queryByLabelText('Send date and time')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Schedule this message to send later'))
    expect(screen.getByLabelText('Send date and time')).toBeInTheDocument()
  })

  it('keeps Send disabled with an empty body and enables it with text', () => {
    renderPanel()
    const send = screen.getByRole('button', { name: /Send message/ })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'hi' } })
    expect(send).toBeEnabled()
  })
})
