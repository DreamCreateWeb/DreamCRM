import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Regression: the clinic profile panel has NO FAQ editor (FAQ is authored in the
 * Website Studio + drafted by the AI welcome interview). `updateClinicProfile`
 * always reads `faq` off the submitted form, so if the panel doesn't carry the
 * current value through, every Save here would post no `faq` field →
 * `parseFaq(undefined)` → null → the clinic's FAQ is silently wiped.
 *
 * These tests pin the round-trip: the panel must render a hidden `faq` input
 * carrying the saved value verbatim, and a Save must hand that value to the
 * action. The founder's exact complaint class (a control that silently undoes
 * other work).
 */

const updateClinicProfile = vi.fn<(fd: FormData) => Promise<void>>(async () => undefined)
vi.mock('@/app/(default)/settings/clinic/actions', () => ({
  updateClinicProfile: (fd: FormData) => updateClinicProfile(fd),
}))

// The picker fires AI customization server actions on mount/selection — stub it
// to a static control so the panel renders without reaching the network.
vi.mock('@/app/(default)/settings/clinic/services-library-picker', () => ({
  default: ({ name }: { name: string }) => <input type="hidden" name={name} defaultValue="[]" />,
}))

import ClinicProfilePanel from '@/app/(default)/settings/clinic/clinic-profile-panel'
import type { ClinicProfile } from '@/lib/db/schema/platform'

const FAQ = [
  { id: 'faq_1', category: 'Your Visit', question: 'Do you take walk-ins?', answer: 'Yes, call ahead.' },
  { id: 'faq_2', category: 'Billing', question: 'Do you take my insurance?', answer: 'Most major carriers.' },
]

function makeProfile(over: Partial<ClinicProfile> = {}): ClinicProfile {
  // Only the fields the panel reads matter; cast the rest.
  return {
    organizationId: 'org_1',
    displayName: 'Acme Dental',
    faq: FAQ,
    ...over,
  } as unknown as ClinicProfile
}

const baseProps = {
  orgName: 'Acme Dental',
  orgId: 'org_1',
  library: [],
  gmailAccounts: [],
}

beforeEach(() => {
  updateClinicProfile.mockClear()
})

describe('ClinicProfilePanel — FAQ preservation', () => {
  it('renders a hidden faq field carrying the saved FAQ verbatim', () => {
    render(<ClinicProfilePanel profile={makeProfile()} {...baseProps} />)
    const input = document.querySelector('input[name="faq"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(JSON.parse(input!.value)).toEqual(FAQ)
  })

  it('hands the saved FAQ to updateClinicProfile on Save (does not wipe it)', async () => {
    render(<ClinicProfilePanel profile={makeProfile()} {...baseProps} />)
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(updateClinicProfile).toHaveBeenCalledTimes(1))
    const fd = updateClinicProfile.mock.calls[0][0]
    expect(JSON.parse(String(fd.get('faq')))).toEqual(FAQ)
  })

  it('carries an empty faq field when the clinic has no FAQ (stays empty, not crash)', () => {
    render(<ClinicProfilePanel profile={makeProfile({ faq: null })} {...baseProps} />)
    const input = document.querySelector('input[name="faq"]') as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input!.value).toBe('')
  })
})

describe('ClinicProfilePanel — tabs', () => {
  it('renders the four section tabs', () => {
    render(<ClinicProfilePanel profile={makeProfile()} {...baseProps} />)
    for (const label of ['Profile & contact', 'Branding', 'Website content', 'Insurance & payments']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('keeps EVERY tab\'s inputs mounted so the single Save still submits all fields', () => {
    render(<ClinicProfilePanel profile={makeProfile()} {...baseProps} />)
    // Default tab is "Profile & contact", yet fields from other tabs are still
    // in the DOM (hidden, not unmounted) — the whole point, so Save persists all.
    expect(document.querySelector('textarea[name="paymentMethods"]')).not.toBeNull() // billing tab
    expect(document.querySelector('textarea[name="acceptedInsuranceCarriers"]')).not.toBeNull() // billing tab
    expect(document.querySelector('input[name="faq"]')).not.toBeNull() // branding tab
  })

  it('activates a tab on click', () => {
    render(<ClinicProfilePanel profile={makeProfile()} {...baseProps} />)
    const btn = screen.getByRole('button', { name: 'Insurance & payments' })
    expect(btn.className).not.toContain('border-teal-500')
    fireEvent.click(btn)
    expect(btn.className).toContain('border-teal-500')
  })
})
