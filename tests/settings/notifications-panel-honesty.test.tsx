import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Notification-settings honesty. The "Everything — mobile + desktop pushes"
 * toggle was write-only: the app ships no push notifications (no service worker
 * / FCM / APNs), and `notify()` never reads `pushEverything`. A toggle that
 * promises a capability that doesn't exist is exactly the founder's complaint
 * class, so it's gone. The two delivery controls that DO something — Email
 * digest (`pushEmail`) and Pause all (`pushNothing`) — must still render.
 */

vi.mock('@/app/(default)/settings/actions', () => ({ saveNotificationPrefs: vi.fn() }))

import NotificationsPanel from '@/app/(default)/settings/notifications/notifications-panel'

const initial = {
  comments: true,
  candidates: true,
  offers: false,
  pushEverything: false,
  pushEmail: true,
  pushNothing: false,
}

describe('NotificationsPanel — delivery toggles are honest', () => {
  it('does NOT render a mobile/desktop push ("Everything") toggle', () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    expect(screen.queryByText(/Mobile \+ desktop pushes/i)).toBeNull()
    expect(document.getElementById('np-push-all')).toBeNull()
  })

  it('still renders the two delivery controls that actually work', () => {
    render(<NotificationsPanel initial={initial} tenantType="clinic" />)
    expect(document.getElementById('np-push-email')).not.toBeNull()
    expect(document.getElementById('np-push-nothing')).not.toBeNull()
    expect(screen.getAllByText(/Email digest/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Pause all/i).length).toBeGreaterThan(0)
  })
})
