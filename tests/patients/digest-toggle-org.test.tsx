import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const setDigestEnabledAction = vi.fn()
vi.mock('@/app/(default)/followups/actions', () => ({
  setDigestEnabledAction: (...a: unknown[]) => setDigestEnabledAction(...a),
}))
vi.mock('@/app/(default)/my-day/actions', () => ({ setMyDigestOptOutAction: vi.fn() }))

import DigestToggle from '@/app/(default)/my-day/digest-toggle'

beforeEach(() => {
  setDigestEnabledAction.mockReset().mockResolvedValue({ ok: true })
})

describe('DigestToggle clinic door', () => {
  it('owner/admin sees the door and turning it on hides it', async () => {
    render(<DigestToggle initialOptedOut={false} digestEnabled={false} canManageOrgDigest />)
    fireEvent.click(screen.getByRole('button', { name: 'Turn it on' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Turn it on' })).toBeNull())
    expect(setDigestEnabledAction).toHaveBeenCalledWith(true)
  })

  it('a member gets a link to notification settings, no button', () => {
    render(<DigestToggle initialOptedOut={false} digestEnabled={false} />)
    expect(screen.queryByRole('button', { name: 'Turn it on' })).toBeNull()
    expect(screen.getByRole('link', { name: /Notification settings/ }).getAttribute('href')).toBe('/settings/notifications')
  })

  it('is hidden when the digest is already on', () => {
    render(<DigestToggle initialOptedOut={false} digestEnabled canManageOrgDigest />)
    expect(screen.queryByText(/morning digest is off/)).toBeNull()
  })
})
