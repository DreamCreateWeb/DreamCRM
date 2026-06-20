import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

/**
 * Render guards for the redesigned clinic thread-detail panel (v2: avatars,
 * grouped bubbles + day separators, polished composer). These assert the NEW
 * structure while preserving the original intents — channel pills, the
 * read/delivered body, outbound-vs-inbound alignment, and that consecutive
 * same-sender messages collapse into ONE labelled group (iMessage/Front).
 *
 * The thread-list rows live in clinic-thread-list.test.tsx (they need the
 * detail panel STUBBED, which conflicts with this file's need for the real one).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => ({
  archiveThreadAction: vi.fn(),
  assignThreadAction: vi.fn(),
  reopenThreadAction: vi.fn(),
  sendMessageAction: vi.fn(),
  snoozeThreadAction: vi.fn(),
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

function serMsg(over: Record<string, unknown>) {
  return {
    id: 'm',
    source: 'patient_message' as const,
    channel: 'in_app' as const,
    direction: 'inbound' as const,
    body: '',
    sentAt: '2026-06-14T09:00:00.000Z',
    sentByUserName: null,
    ...over,
  }
}

function renderPanel(messages: ReturnType<typeof serMsg>[], extra: Record<string, unknown> = {}) {
  return render(
    <ThreadDetailPanel
      thread={thread}
      currentUserName="Dr. Reyes"
      templates={[]}
      hasEmail
      messages={messages}
      {...extra}
    />,
  )
}

/** The message-stream region — the list items, scoped away from the header
 *  (which also shows the patient name) and the composer (which has an Email
 *  option). We reach it from any bubble's enclosing <ul>. */
function streamFrom(bubbleText: string | RegExp): HTMLElement {
  const ul = screen.getByText(bubbleText).closest('ul')!
  return ul as HTMLElement
}

describe('Thread detail — grouped bubbles', () => {
  it('renders ONE sender label per consecutive same-sender group, not per message', () => {
    renderPanel([
      serMsg({ id: 'a', direction: 'inbound', body: 'Hi there' }),
      serMsg({ id: 'b', direction: 'inbound', body: 'one more thing' }),
      serMsg({ id: 'c', direction: 'inbound', body: 'and again' }),
    ])
    const stream = streamFrom('Hi there')
    expect(within(stream).getByText('Hi there')).toBeInTheDocument()
    expect(within(stream).getByText('and again')).toBeInTheDocument()
    // Three inbound bubbles, but only ONE "Mia Nguyen" sender label in-stream.
    expect(within(stream).getAllByText('Mia Nguyen')).toHaveLength(1)
  })

  it('starts a new group with its own label when direction flips', () => {
    renderPanel([
      serMsg({ id: 'a', direction: 'inbound', body: 'Can I move my visit?' }),
      serMsg({ id: 'b', direction: 'outbound', sentByUserName: 'Dr. Reyes', body: 'Of course!' }),
    ])
    const stream = streamFrom('Can I move my visit?')
    // Patient group label + staff group label both present in-stream.
    expect(within(stream).getByText('Mia Nguyen')).toBeInTheDocument()
    expect(within(stream).getByText('Dr. Reyes')).toBeInTheDocument()
  })

  it('renders a day separator with a human label', () => {
    renderPanel([serMsg({ id: 'a', body: 'hello' })])
    const sep = screen.getByRole('separator')
    expect(sep).toBeInTheDocument()
    expect(sep.getAttribute('aria-label')).toBeTruthy()
  })

  it('shows the channel pill on the group (email here)', () => {
    renderPanel([serMsg({ id: 'a', channel: 'email', body: 'Sent by email' })])
    // Scope to the stream — the composer's channel <select> also has "Email".
    const stream = streamFrom('Sent by email')
    expect(within(stream).getByText('Email')).toBeInTheDocument()
  })

  it('preserves whitespace + the body, and aligns outbound vs inbound', () => {
    const { container } = renderPanel([
      serMsg({ id: 'a', direction: 'inbound', body: 'line1\nline2' }),
      serMsg({ id: 'b', direction: 'outbound', sentByUserName: 'Dr. Reyes', body: 'reply' }),
    ])
    const bubble = screen.getByText(/line1/)
    expect(bubble.className).toContain('whitespace-pre-wrap')
    const items = container.querySelectorAll('li')
    const outbound = Array.from(items).find((li) => within(li as HTMLElement).queryByText('reply'))
    expect(outbound?.className).toContain('flex-row-reverse')
  })

  it('renders the warm empty state when there are no messages', () => {
    renderPanel([])
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('renders a polished composer with the framed box + ⌘+Enter hint + templates menu', () => {
    renderPanel([], {
      templates: [{ key: 't1', label: 'Confirm visit', rendered: 'See you soon' }],
    })
    expect(screen.getByText(/Enter to send/)).toBeInTheDocument()
    // Templates surface as a menu trigger (pop-in), not an always-open select.
    expect(screen.getByRole('button', { name: /Templates/ })).toBeInTheDocument()
    // The single teal primary.
    expect(screen.getByRole('button', { name: /Send message/ })).toBeInTheDocument()
  })
})
