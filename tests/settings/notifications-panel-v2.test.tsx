import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

/**
 * Notifications panel behaviours (email-mode generation, 2026-08-25):
 *  - Two live bucket switches + Pause all — no `offers` row (nothing sends
 *    to it), no `push_everything` (dropped in 0114).
 *  - Email delivery is the three-way mode radio; picking one saves
 *    `emailMode`, never the legacy `pushEmail` boolean (the service derives
 *    that itself for rollback safety).
 *  - Each bucket carries a one-line "Includes:" explainer that matches what
 *    actually fires.
 *  - "Pause all" surfaces a warn-tone note that it silences the bell + its
 *    emails but NOT transactional patient email — only when it's on.
 */

const { saveNotificationPrefs, setMyEmailReportsOptOutAction } = vi.hoisted(() => ({
  saveNotificationPrefs: vi.fn(),
  setMyEmailReportsOptOutAction: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
}))
vi.mock('@/app/(default)/settings/actions', () => ({ saveNotificationPrefs, setMyEmailReportsOptOutAction }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import NotificationsPanel from '@/app/(default)/settings/notifications/notifications-panel'
import { ToastProvider } from '@/components/ui/toast'

const initial = {
  comments: true,
  candidates: true,
  emailMode: 'urgent' as const,
  pushNothing: false,
}

beforeEach(() => {
  saveNotificationPrefs.mockReset()
  setMyEmailReportsOptOutAction.mockClear()
})

describe('NotificationsPanel', () => {
  it('renders exactly the 3 honest switches and the 3-way email mode', () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" /></ToastProvider>)
    expect(screen.getAllByRole('switch')).toHaveLength(3)
    expect(screen.queryByRole('switch', { name: /everything/i })).toBeNull()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('shows a per-bucket "Includes:" explainer that matches what actually fires', () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" /></ToastProvider>)
    expect(screen.getAllByText(/^Includes:/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/patient messages, website leads, bookings/i)).toBeTruthy()
    expect(screen.getByText(/sent confirmations, and sends that finished with errors/i)).toBeTruthy()
  })

  it('hides the Pause-all warning until Pause all is on', () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" /></ToastProvider>)
    expect(screen.queryByRole('note')).toBeNull()

    fireEvent.click(screen.getByRole('switch', { name: 'Pause all' }))
    const note = screen.getByRole('note')
    // warn-tone (amber left edge) + honest transactional-email caveat
    expect(note.className).toMatch(/amber/)
    expect(within(note).getByText(/silences the notification bell and its emails/i)).toBeTruthy()
    expect(within(note).getByText(/appointment reminders, booking confirmations/i)).toBeTruthy()
  })

  it('picking a mode saves emailMode — and never sends offers or pushEmail', async () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" /></ToastProvider>)
    fireEvent.click(screen.getByRole('radio', { name: /bell only/i }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // allow the transition's async callback to run
    await Promise.resolve()
    await Promise.resolve()

    expect(saveNotificationPrefs).toHaveBeenCalledTimes(1)
    const payload = saveNotificationPrefs.mock.calls[0][0]
    expect(payload).not.toHaveProperty('pushEverything')
    expect(payload).not.toHaveProperty('pushEmail')
    expect(payload).not.toHaveProperty('offers')
    expect(Object.keys(payload).sort()).toEqual(
      ['candidates', 'comments', 'emailMode', 'pushNothing'].sort(),
    )
    expect(payload.emailMode).toBe('none')
  })

  it('clinic staff get the "My report emails" mute — the report emails\' footer points at this page, so it must be able to silence them (Phase-2 self-sweep)', async () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" emailReportsOptedOut={false} /></ToastProvider>)
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
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="platform" /></ToastProvider>)
    expect(screen.queryByRole('switch', { name: 'My report emails' })).toBeNull()
    expect(screen.getAllByRole('switch')).toHaveLength(3)
  })
})
