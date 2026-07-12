import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor, screen, cleanup } from '@testing-library/react'
import React from 'react'

/**
 * The Business-profile panel (post website-carve): identity ONLY — names,
 * contact/email sender, address, hours, timezone, logo. The old FAQ/template
 * round-trip bug class is structurally impossible now (the action's payload
 * excludes every website column; tests/settings/clinic-actions.test.ts pins
 * that) — these tests pin the PANEL side: no website inputs render, the
 * identity sections all do, and a Save posts identity fields only.
 */

const updateClinicProfile = vi.fn<(fd: FormData) => Promise<void>>(async () => undefined)
vi.mock('@/app/(default)/settings/clinic/actions', () => ({
  updateClinicProfile: (fd: FormData) => updateClinicProfile(fd),
}))

import ClinicProfilePanel from '@/app/(default)/settings/clinic/clinic-profile-panel'
import type { ClinicProfile } from '@/lib/db/schema/platform'

function makeProfile(over: Partial<ClinicProfile> = {}): ClinicProfile {
  return {
    organizationId: 'org_1',
    displayName: 'Acme Dental',
    legalName: 'Acme Dental PLLC',
    phone: '555',
    email: 'hi@acme.test',
    timezone: 'America/Chicago',
    hours: { mon: { open: '09:00', close: '17:00' } },
    logoUrl: null,
    emailSenderName: null,
    emailSendingAccountId: null,
    ...over,
  } as ClinicProfile
}

describe('ClinicProfilePanel — identity only', () => {
  it('renders the four identity sections as anchorable rail targets', () => {
    const { container } = render(
      <ClinicProfilePanel profile={makeProfile()} orgName="Acme Dental" gmailAccounts={[]} />,
    )
    for (const id of ['basics', 'contact', 'hours', 'logo']) {
      expect(container.querySelector(`section#${id}`), `#${id} missing`).toBeTruthy()
    }
    cleanup()
  })

  it('renders NO website-content inputs (tagline/about/services/staff live in the workspace)', () => {
    const { container } = render(
      <ClinicProfilePanel profile={makeProfile()} orgName="Acme Dental" gmailAccounts={[]} />,
    )
    for (const name of [
      'tagline', 'about', 'brandColor', 'template', 'heroImageUrl', 'faq',
      'services', 'staff', 'stats', 'officePhotos', 'acceptedInsuranceCarriers',
      'paymentMethods', 'financingPartners', 'cancellationPolicy',
    ]) {
      expect(container.querySelector(`[name="${name}"]`), `unexpected input '${name}'`).toBeNull()
    }
    cleanup()
  })

  it('points at the Website workspace for everything that moved', () => {
    const { container } = render(
      <ClinicProfilePanel profile={makeProfile()} orgName="Acme Dental" gmailAccounts={[]} />,
    )
    expect(container.querySelector('a[href="/website"]')).toBeTruthy()
    cleanup()
  })

  it('a Save posts the identity fields through the action', async () => {
    const { container } = render(
      <ClinicProfilePanel profile={makeProfile()} orgName="Acme Dental" gmailAccounts={[]} />,
    )
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(updateClinicProfile).toHaveBeenCalledTimes(1))
    const fd = updateClinicProfile.mock.calls[0][0]
    expect(fd.get('displayName')).toBe('Acme Dental')
    expect(fd.get('phone')).toBe('555')
    expect(fd.get('timezone')).toBe('America/Chicago')
    // No website fields ride along.
    expect(fd.get('tagline')).toBeNull()
    expect(fd.get('faq')).toBeNull()
    expect(fd.get('template')).toBeNull()
    cleanup()
  })
})
