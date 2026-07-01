import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * AccountPanel — presentation-only upgrades (v2 "Instrument Panel"):
 *  - bio character counter (N / 1,000) that turns amber near the cap,
 *  - name "up to 200" hint + a maxLength guard,
 *  - upload constraints (accepted formats + size) shown BEFORE picking a file,
 *  - a tightened pending-email confirmation card with a working Cancel.
 * The better-auth changeEmail flow itself is covered in account-panel.test.tsx;
 * here we only assert the surrounding presentation, so these guards can't rot.
 */

type ChangeEmailResult = { data: { status: boolean } | null; error: { message: string } | null }
const saveAccount = vi.fn<(input: Record<string, unknown>) => Promise<{ id: string }>>(async () => ({ id: 'u_1' }))
vi.mock('@/app/(default)/settings/actions', () => ({ saveAccount: (...a: unknown[]) => saveAccount(...(a as [Record<string, unknown>])) }))

const changeEmail = vi.fn<(input: { newEmail: string; callbackURL?: string }) => Promise<ChangeEmailResult>>(
  async () => ({ data: { status: true }, error: null }),
)
vi.mock('@/lib/auth/client', () => ({ changeEmail: (...a: unknown[]) => changeEmail(...(a as [{ newEmail: string; callbackURL?: string }])) }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

import AccountPanel from '@/app/(default)/settings/account/account-panel'
import { MAX_IMAGE_MB } from '@/lib/media'

const initialUser = {
  id: 'u_1',
  name: 'Jane Doe',
  email: 'jane@old.com',
  image: null,
  bio: 'Front desk lead',
}

beforeEach(() => {
  saveAccount.mockClear()
  changeEmail.mockReset()
  changeEmail.mockResolvedValue({ data: { status: true }, error: null })
})

describe('AccountPanel — profile presentation', () => {
  it('shows a bio character counter that reflects the current length', () => {
    render(<AccountPanel initialUser={initialUser} />)
    // 'Front desk lead' = 15 chars, cap 1000.
    expect(screen.getByText('15 / 1000')).toBeTruthy()

    const bio = screen.getByLabelText(/^Bio$/i) as HTMLTextAreaElement
    fireEvent.change(bio, { target: { value: 'Hi' } })
    expect(screen.getByText('2 / 1000')).toBeTruthy()
  })

  it('turns the bio counter amber only when within 50 of the cap', () => {
    render(<AccountPanel initialUser={initialUser} />)
    const bio = screen.getByLabelText(/^Bio$/i) as HTMLTextAreaElement

    // Comfortably under the cap → neutral (not amber).
    fireEvent.change(bio, { target: { value: 'x'.repeat(900) } })
    const neutral = screen.getByText('900 / 1000')
    expect(neutral.className).not.toMatch(/amber/)

    // Within 50 of the cap → amber warning.
    fireEvent.change(bio, { target: { value: 'x'.repeat(960) } })
    const near = screen.getByText('960 / 1000')
    expect(near.className).toMatch(/amber/)
  })

  it('caps the bio at 1000 and the name at 200 characters', () => {
    render(<AccountPanel initialUser={initialUser} />)
    expect((screen.getByLabelText(/^Bio$/i) as HTMLTextAreaElement).maxLength).toBe(1000)
    expect((screen.getByLabelText(/Full name/i) as HTMLInputElement).maxLength).toBe(200)
    // The "up to 200" hint is stated up front.
    expect(screen.getByText(/Up to 200 characters/i)).toBeTruthy()
  })

  it('states the accepted avatar formats and size limit before a file is picked', () => {
    render(<AccountPanel initialUser={initialUser} />)
    // Accepted formats + the real server cap are visible with no interaction.
    expect(screen.getByText(new RegExp(`JPG, PNG, WebP or GIF`, 'i'))).toBeTruthy()
    expect(screen.getByText(new RegExp(String(MAX_IMAGE_MB)))).toBeTruthy()

    // The file input restricts the picker to raster image types (SVG excluded).
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput.accept).toContain('image/jpeg')
    expect(fileInput.accept).toContain('image/png')
    expect(fileInput.accept).not.toContain('svg')
  })

  it('rejects an oversized avatar client-side without hitting the upload route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<AccountPanel initialUser={initialUser} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    const tooBig = new File(['x'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(tooBig, 'size', { value: (MAX_IMAGE_MB + 1) * 1024 * 1024 })
    fireEvent.change(fileInput, { target: { files: [tooBig] } })

    await waitFor(() => expect(screen.getByText(/too large/i)).toBeTruthy())
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('AccountPanel — pending-email card', () => {
  async function enterPendingState() {
    render(<AccountPanel initialUser={initialUser} />)
    fireEvent.change(screen.getByLabelText(/Email address/i), { target: { value: 'jane@new.com' } })
    fireEvent.submit(document.getElementById('email-form')!)
    await screen.findByText(/Confirm your new email/i)
  }

  it('makes the "confirm from your current inbox" model unmistakable', async () => {
    await enterPendingState()
    // Names the current inbox as where the link went + that nothing changes yet.
    expect(screen.getByText(/current/i)).toBeTruthy()
    expect(screen.getAllByText(/jane@old\.com/).length).toBeGreaterThan(0)
    expect(screen.getByText(/jane@new\.com/)).toBeTruthy()
    expect(screen.getByText(/Nothing changes until you click that link/i)).toBeTruthy()
  })

  it('Cancel drops the pending state and restores the current email into the field', async () => {
    await enterPendingState()
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    await waitFor(() => expect(screen.queryByText(/Confirm your new email/i)).toBeNull())
    const emailInput = screen.getByLabelText(/Email address/i) as HTMLInputElement
    expect(emailInput.value).toBe('jane@old.com')
    // Cancel is a pure client reset — it must never call the verified flow.
    expect(changeEmail).toHaveBeenCalledTimes(1)
  })
})
