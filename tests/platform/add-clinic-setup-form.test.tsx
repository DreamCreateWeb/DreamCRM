import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('add=1') }))
vi.mock('@/app/(default)/ecommerce/customers/admin-actions', () => ({
  createManagedClinicAction: vi.fn(),
  checkManagedClinicSlugAction: vi.fn(async () => ({ ok: true, available: false, suggestion: 'bright-smile-2' })),
}))

import AddClinicModal from '@/app/(default)/ecommerce/customers/add-clinic-modal'

describe('Add clinic — the setup-call form', () => {
  it('asks for everything the call learns and says no tier words', () => {
    render(<AddClinicModal />)
    for (const label of [/Clinic name/, /Web address/, /Time zone/, /Phone/, /Street address/, /Practice NPI/, /Brand colour/, /Practice-management system/, /Owner name/, /Owner email/]) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.getByText('Managed (founding rate)')).toBeTruthy()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\b(basic|pro|premium|starter|enterprise)\b/i)
  })

  it('checks the slug on blur and offers the free variant', async () => {
    render(<AddClinicModal />)
    await userEvent.type(screen.getByLabelText(/Web address/), 'bright-smile')
    await userEvent.tab()
    expect(await screen.findByText(/try "bright-smile-2"/)).toBeTruthy()
  })
})
