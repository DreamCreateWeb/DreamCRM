import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Notification-settings honesty. Two generations of dishonest controls died
 * here: the "Everything — mobile + desktop pushes" toggle (write-only — the
 * app ships no push; column dropped in 0114), and the "Email digest" toggle
 * (2026-08-25 overhaul) — which was never a digest: it emailed EVERY bell
 * event individually the moment it happened. Delivery is now a three-way
 * MODE (every alert / urgent only / bell only) whose copy says exactly what
 * each choice does, and the third bucket toggle ("Platform updates") is gone
 * because no dispatch site has ever sent to the `offers` bucket.
 */

vi.mock('@/app/(default)/settings/actions', () => ({
  saveNotificationPrefs: vi.fn(),
  setMyEmailReportsOptOutAction: vi.fn(),
}))
// SettingsTabs reads ?tab=&sub= via useSearchParams.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import NotificationsPanel from '@/app/(default)/settings/notifications/notifications-panel'
import { ToastProvider } from '@/components/ui/toast'

const initial = {
  comments: true,
  candidates: true,
  emailMode: 'urgent' as const,
  pushNothing: false,
}

describe('NotificationsPanel — delivery controls are honest', () => {
  it('does NOT render a mobile/desktop push ("Everything") toggle', () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" /></ToastProvider>)
    expect(screen.queryByText(/Mobile \+ desktop pushes/i)).toBeNull()
    // 3 honest switches (2 live alert buckets + Pause all), never more.
    expect(screen.getAllByRole('switch')).toHaveLength(3)
  })

  it('email delivery is a three-way mode, not a fake "digest" toggle', () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" /></ToastProvider>)
    // The old label promised a digest the code never sent.
    expect(screen.queryByText('Email digest')).toBeNull()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /just the important ones/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /every alert/i })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /bell only/i })).not.toBeChecked()
    // The loud option owns its cost out loud.
    expect(screen.getByText(/busy days mean a busy inbox/i)).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Pause all' })).toBeTruthy()
  })

  it('the offers bucket row is gone — nothing has ever sent to it', () => {
    render(<ToastProvider><NotificationsPanel initial={initial} tenantType="clinic" /></ToastProvider>)
    expect(screen.queryByText('Platform updates')).toBeNull()
    expect(screen.queryByText('Product news')).toBeNull()
    // The two live buckets remain, labeled for the clinic tenant.
    expect(screen.getByText('Patient activity')).toBeTruthy()
    expect(screen.getByText('Campaign reports')).toBeTruthy()
  })
})
