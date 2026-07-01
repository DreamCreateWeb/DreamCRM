import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * SecurityPanel — presentation upgrades over an UNCHANGED auth contract:
 * changePassword must still be called with { currentPassword, newPassword,
 * revokeOtherSessions: true }, and every session revoke must go through the
 * confirm dialog. The strength meter is a real client-side heuristic computed
 * from the typed value, not a fabricated score.
 */

type ChangePasswordResult = { data: unknown; error: { message: string } | null }
const changePassword =
  vi.fn<(input: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean }) => Promise<ChangePasswordResult>>(
    async () => ({ data: {}, error: null }),
  )
vi.mock('@/lib/auth-client', () => ({
  changePassword: (...a: unknown[]) =>
    changePassword(...(a as [{ currentPassword: string; newPassword: string; revokeOtherSessions: boolean }])),
}))

const revokeSession = vi.fn(async (_id: string) => ({ ok: true }))
const revokeOtherSessions = vi.fn(async () => ({ ok: true, count: 1 }))
vi.mock('@/app/(default)/settings/security/security-actions', () => ({
  revokeSession: (...a: unknown[]) => revokeSession(...(a as [string])),
  revokeOtherSessions: (...a: unknown[]) => revokeOtherSessions(...(a as [])),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Confirm dialog: auto-approve so we can assert the revoke actions run behind it.
const confirmFn = vi.fn(async () => true)
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => confirmFn,
}))

import SecurityPanel, { type SessionRow } from '@/app/(default)/settings/security/security-panel'

const now = Date.now()
const sessions: SessionRow[] = [
  {
    id: 's_current',
    isCurrent: true,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    ipAddress: '203.0.113.9',
    createdAt: new Date(now - 3 * 86_400_000).toISOString(),
    updatedAt: new Date(now - 5 * 60_000).toISOString(),
    expiresAt: new Date(now + 7 * 86_400_000).toISOString(),
  },
  {
    id: 's_other',
    isCurrent: false,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ipAddress: '198.51.100.7',
    createdAt: new Date(now - 40 * 86_400_000).toISOString(),
    updatedAt: new Date(now - 2 * 3_600_000).toISOString(),
    expiresAt: new Date(now + 7 * 86_400_000).toISOString(),
  },
]

beforeEach(() => {
  changePassword.mockClear()
  changePassword.mockResolvedValue({ data: {}, error: null })
  revokeSession.mockClear()
  revokeOtherSessions.mockClear()
  confirmFn.mockClear()
  confirmFn.mockResolvedValue(true)
})

describe('SecurityPanel — sessions', () => {
  it('parses user-agents into readable device labels and marks the current device', () => {
    render(<SecurityPanel sessions={sessions} />)
    expect(screen.getByText('Chrome on macOS')).toBeTruthy()
    expect(screen.getByText('Safari on iOS')).toBeTruthy()
    expect(screen.getByText('This device')).toBeTruthy()
  })

  it('shows distinct "Signed in" and "Last active" timings from real columns', () => {
    render(<SecurityPanel sessions={sessions} />)
    expect(screen.getAllByText(/Last active/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Signed in/).length).toBeGreaterThan(0)
  })

  it('only offers "Sign out" on non-current sessions', () => {
    render(<SecurityPanel sessions={sessions} />)
    // One per-row Sign out (the other device) + the header "Sign out all other devices".
    const signOutButtons = screen.getAllByRole('button', { name: /^Sign out$/ })
    expect(signOutButtons.length).toBe(1)
  })

  it('revokes a single session ONLY after confirm approves', async () => {
    render(<SecurityPanel sessions={sessions} />)
    fireEvent.click(screen.getByRole('button', { name: /^Sign out$/ }))
    await waitFor(() => expect(confirmFn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith('s_other'))
  })

  it('does not revoke when confirm is declined', async () => {
    confirmFn.mockResolvedValue(false)
    render(<SecurityPanel sessions={sessions} />)
    fireEvent.click(screen.getByRole('button', { name: /^Sign out$/ }))
    await waitFor(() => expect(confirmFn).toHaveBeenCalled())
    expect(revokeSession).not.toHaveBeenCalled()
  })

  it('"Sign out all other devices" is surfaced and runs behind confirm', async () => {
    render(<SecurityPanel sessions={sessions} />)
    fireEvent.click(screen.getByRole('button', { name: /Sign out all other devices/i }))
    await waitFor(() => expect(confirmFn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(revokeOtherSessions).toHaveBeenCalledTimes(1))
  })
})

describe('SecurityPanel — password', () => {
  function openPasswordForm() {
    render(<SecurityPanel sessions={sessions} />)
    // Activate the Password tab (inactive tab content is display:none, so its
    // button is unreachable until we switch). The tab role disambiguates it
    // from the "Change password" button that shares the word "Password".
    fireEvent.click(screen.getByRole('tab', { name: 'Password' }))
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))
  }

  it('shows the required-min rule and a strength label that reacts to the typed value', () => {
    openPasswordForm()
    // Rule copy is present.
    expect(screen.getByText(/At least 8 characters \(required\)/i)).toBeTruthy()

    const newPw = document.getElementById('new-pw') as HTMLInputElement
    fireEvent.change(newPw, { target: { value: 'abc' } })
    expect(screen.getByText('Too short')).toBeTruthy()

    fireEvent.change(newPw, { target: { value: 'Xy9$kLmnPqRs2468' } })
    expect(screen.getByText('Strong')).toBeTruthy()
  })

  it('blocks submit below the minimum without calling changePassword', async () => {
    openPasswordForm()
    fireEvent.change(document.getElementById('cur-pw')!, { target: { value: 'oldpassword' } })
    fireEvent.change(document.getElementById('new-pw')!, { target: { value: 'short' } })
    // Button disabled below min; force the submit path to prove the guard holds.
    fireEvent.submit(document.getElementById('new-pw')!.closest('form')!)
    // The inline alert (role=alert) is distinct from the always-on rule copy.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/at least 8 characters/i))
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('calls changePassword with the exact unchanged contract (revokeOtherSessions: true)', async () => {
    openPasswordForm()
    fireEvent.change(document.getElementById('cur-pw')!, { target: { value: 'oldpassword' } })
    fireEvent.change(document.getElementById('new-pw')!, { target: { value: 'newsecret12' } })
    fireEvent.submit(document.getElementById('new-pw')!.closest('form')!)

    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(1))
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'oldpassword',
      newPassword: 'newsecret12',
      revokeOtherSessions: true,
    })
  })

  it('surfaces the auth error and stays on the form', async () => {
    changePassword.mockResolvedValue({ data: null, error: { message: 'Current password is wrong' } })
    openPasswordForm()
    fireEvent.change(document.getElementById('cur-pw')!, { target: { value: 'oldpassword' } })
    fireEvent.change(document.getElementById('new-pw')!, { target: { value: 'newsecret12' } })
    fireEvent.submit(document.getElementById('new-pw')!.closest('form')!)

    await waitFor(() => expect(screen.getByText(/Current password is wrong/i)).toBeTruthy())
    // Still on the form (fields present).
    expect(document.getElementById('new-pw')).toBeTruthy()
  })
})
