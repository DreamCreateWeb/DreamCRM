import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * AccountPanel — the email field uses better-auth's verified changeEmail flow,
 * NOT the profile Save. Profile fields keep `saveAccount`; email never rides it.
 * After a successful change request the panel shows a pending-confirm state.
 */

type ChangeEmailResult = { data: { status: boolean } | null; error: { message: string } | null }
const saveAccount = vi.fn<(input: Record<string, unknown>) => Promise<{ id: string }>>(async () => ({ id: 'u_1' }))
vi.mock('@/app/(default)/settings/actions', () => ({ saveAccount: (...a: unknown[]) => saveAccount(...(a as [Record<string, unknown>])) }))

const changeEmail = vi.fn<(input: { newEmail: string; callbackURL?: string }) => Promise<ChangeEmailResult>>(
  async () => ({ data: { status: true }, error: null }),
)
vi.mock('@/lib/auth/client', () => ({ changeEmail: (...a: unknown[]) => changeEmail(...(a as [{ newEmail: string; callbackURL?: string }])) }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import AccountPanel from '@/app/(default)/settings/account/account-panel'

const initialUser = {
  id: 'u_1',
  name: 'Jane Doe',
  email: 'jane@old.com',
  image: null,
  companyName: 'Acme Dental',
  city: 'Austin',
  postalCode: null,
  streetAddress: null,
  country: null,
}

beforeEach(() => {
  saveAccount.mockClear()
  changeEmail.mockReset()
  changeEmail.mockResolvedValue({ data: { status: true }, error: null })
})

describe('AccountPanel — email change flow', () => {
  it('calls changeEmail (not saveAccount) and shows a pending-confirm notice on success', async () => {
    render(<AccountPanel initialUser={initialUser} />)

    const emailInput = screen.getByLabelText(/Business email/i) as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'jane@new.com' } })
    fireEvent.submit(document.getElementById('email-form')!)

    await waitFor(() => expect(changeEmail).toHaveBeenCalledTimes(1))
    expect(changeEmail).toHaveBeenCalledWith({ newEmail: 'jane@new.com', callbackURL: '/settings/account' })
    // The profile Save action is NOT used for an email change.
    expect(saveAccount).not.toHaveBeenCalled()

    // Pending-confirm state visible, naming the new address.
    expect(await screen.findByText(/Confirm your new email/i)).toBeTruthy()
    expect(screen.getByText(/jane@new\.com/)).toBeTruthy()
    // The current sign-in email is still shown as unchanged.
    expect(screen.getAllByText(/jane@old\.com/).length).toBeGreaterThan(0)
  })

  it('surfaces the error and stays out of pending state when changeEmail fails', async () => {
    changeEmail.mockResolvedValue({ data: null, error: { message: 'Email is the same' } })
    render(<AccountPanel initialUser={initialUser} />)
    const emailInput = screen.getByLabelText(/Business email/i) as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'jane@new.com' } })
    fireEvent.submit(document.getElementById('email-form')!)

    await waitFor(() => expect(changeEmail).toHaveBeenCalled())
    expect(await screen.findByText(/Email is the same/i)).toBeTruthy()
    expect(screen.queryByText(/Confirm your new email/i)).toBeNull()
  })

  it('rejects an unchanged email without calling the API', async () => {
    render(<AccountPanel initialUser={initialUser} />)
    // Same value as the current email.
    fireEvent.submit(document.getElementById('email-form')!)
    await waitFor(() => expect(screen.getByText(/Enter a different email/i)).toBeTruthy())
    expect(changeEmail).not.toHaveBeenCalled()
  })

  it('the profile Save action never receives an email field', async () => {
    render(<AccountPanel initialUser={initialUser} />)
    fireEvent.submit(document.getElementById('account-form')!)
    await waitFor(() => expect(saveAccount).toHaveBeenCalledTimes(1))
    const payload = saveAccount.mock.calls[0]![0] as Record<string, unknown>
    expect('email' in payload).toBe(false)
    expect(payload.name).toBe('Jane Doe')
  })
})
