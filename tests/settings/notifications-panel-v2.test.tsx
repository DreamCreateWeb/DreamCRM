import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

/**
 * v2 notifications panel behaviours:
 *  - `push_everything` is gone from the panel: never rendered, and never sent to
 *    the save action (the shared input treats it as optional / preserves it).
 *  - Each bucket carries a one-line "Includes:" explainer.
 *  - "Pause all" surfaces a warn-tone note that it silences the bell + digest
 *    but NOT transactional patient email — only when it's on.
 *  - The real save action still fires with the honest 5-field payload.
 */

const { saveNotificationPrefs, setMyEmailReportsOptOutAction } = vi.hoisted(() => ({
  saveNotificationPrefs: vi.fn(),
  setMyEmailReportsOptOutAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
}))
vi.mock('@/app/(default)/settings/actions', () => ({ saveNotificationPrefs, setMyEmailReportsOptOutAction }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import NotificationsPanel from '@/app/(default)/settings/notifications/notifications-panel'

const initial = {
  comments: true,
  candidates: true,
  offers: false,
  pushEmail: true,
  pushNothing: false,
}

beforeEach(() => {
  saveNotificationPrefs.mockReset()
  setMyEmailReportsOptOutAction.mockClear()
})

describe('NotificationsPanel v2', () => {
  it('renders exactly the 5 honest switches (no push_everything row)', () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    expect(screen.getAllByRole('switch')).toHaveLength(5)
    expect(screen.queryByRole('switch', { name: /everything/i })).toBeNull()
  })

  it('shows a per-bucket "Includes:" explainer for each bucket', () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    // one for each of the 3 buckets
    expect(screen.getAllByText(/^Includes:/).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/website leads, new bookings/i)).toBeTruthy()
    expect(screen.getByText(/recall campaigns sent/i)).toBeTruthy()
  })

  it('hides the Pause-all warning until Pause all is on', () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    expect(screen.queryByRole('note')).toBeNull()

    fireEvent.click(screen.getByRole('switch', { name: 'Pause all' }))
    const note = screen.getByRole('note')
    // warn-tone (amber left edge) + honest transactional-email caveat
    expect(note.className).toMatch(/amber/)
    expect(within(note).getByText(/silences the notification bell and the email digest/i)).toBeTruthy()
    expect(within(note).getByText(/appointment reminders, booking confirmations/i)).toBeTruthy()
  })

  it('saves the 5-field payload with no push_everything key', async () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    // make it dirty so Save enables
    fireEvent.click(screen.getByRole('switch', { name: 'Email digest' }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // allow the transition's async callback to run
    await Promise.resolve()
    await Promise.resolve()

    expect(saveNotificationPrefs).toHaveBeenCalledTimes(1)
    const payload = saveNotificationPrefs.mock.calls[0][0]
    expect(payload).not.toHaveProperty('pushEverything')
    expect(Object.keys(payload).sort()).toEqual(
      ['candidates', 'comments', 'offers', 'pushEmail', 'pushNothing'].sort(),
    )
    expect(payload.pushEmail).toBe(false)
  })

  it('clinic staff get the "My report emails" mute — the report emails\' footer points at this page, so it must be able to silence them (Phase-2 self-sweep)', async () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" emailReportsOptedOut={false} />)
    const toggle = screen.getByRole('switch', { name: 'My report emails' })
    expect(toggle).toBeInTheDocument()
    // Saves immediately — no Save button involved.
    fireEvent.click(toggle)
    await Promise.resolve()
    await Promise.resolve()
    expect(setMyEmailReportsOptOutAction).toHaveBeenCalledWith(true)
    expect(saveNotificationPrefs).not.toHaveBeenCalled()
  })

  it('the report-emails mute never renders for tenants who don\'t get those emails (null prop)', () => {
    render(<NotificationsPanel initial={initial} tenantType="platform" />)
    expect(screen.queryByRole('switch', { name: 'My report emails' })).toBeNull()
    expect(screen.getAllByRole('switch')).toHaveLength(5)
  })
})
