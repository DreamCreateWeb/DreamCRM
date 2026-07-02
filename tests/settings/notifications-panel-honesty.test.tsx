import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Notification-settings honesty. The "Everything — mobile + desktop pushes"
 * toggle was write-only: the app ships no push notifications (no service worker
 * / FCM / APNs) — the dead `push_everything` column was dropped in 0114. A toggle that
 * promises a capability that doesn't exist is exactly the founder's complaint
 * class, so it's gone. The two delivery controls that DO something — Email
 * digest (`pushEmail`) and Pause all (`pushNothing`) — must still render.
 */

vi.mock('@/app/(default)/settings/actions', () => ({ saveNotificationPrefs: vi.fn() }))
// SettingsTabs reads ?tab=&sub= via useSearchParams.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import NotificationsPanel from '@/app/(default)/settings/notifications/notifications-panel'

const initial = {
  comments: true,
  candidates: true,
  offers: false,
  pushEmail: true,
  pushNothing: false,
}

describe('NotificationsPanel — delivery toggles are honest', () => {
  it('does NOT render a mobile/desktop push ("Everything") toggle', () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    expect(screen.queryByText(/Mobile \+ desktop pushes/i)).toBeNull()
    expect(screen.queryByRole('switch', { name: /everything|push/i })).toBeNull()
    // 5 honest switches (3 alert buckets + Email digest + Pause all), never 6.
    expect(screen.getAllByRole('switch')).toHaveLength(5)
  })

  it('still renders the two delivery controls that actually work', () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    expect(screen.getByRole('switch', { name: 'Email digest' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Pause all' })).toBeTruthy()
    expect(screen.getByText('Email digest')).toBeTruthy()
    expect(screen.getByText('Pause all')).toBeTruthy()
  })
})
