/**
 * The portal footer's "Powered by" credit follows the clinic's site-credit
 * switch (clinic_profile.hide_powered_by, Website → Design) — the same column
 * the public site's layout honours — and spells the product the same way.
 * Before this the portal printed "Powered by DreamCreate" unconditionally and
 * getPortalClinicInfo never read the switch.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { PortalCredit } from '@/components/patient-portal/portal-chrome'

const ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

describe('PortalCredit', () => {
  it('prints the credit when the switch is on (the default)', () => {
    render(<PortalCredit hidden={false} />)
    expect(screen.getByText('Powered by DreamCRM')).toBeInTheDocument()
    cleanup()
  })

  it('prints nothing when the clinic turned the credit off', () => {
    const { container } = render(<PortalCredit hidden={true} />)
    expect(container.textContent).toBe('')
    expect(screen.queryByText(/Powered by/i)).toBeNull()
    cleanup()
  })

  it('spells the product the way the public site does (one credit, two surfaces)', () => {
    const site = read('components/clinic-site/powered-by.tsx')
    expect(site).toContain('DreamCRM')
    render(<PortalCredit hidden={false} />)
    expect(screen.getByText(/DreamCRM/)).toBeInTheDocument()
    expect(screen.queryByText(/DreamCreate/)).toBeNull()
    cleanup()
  })
})

describe('the switch reaches the portal', () => {
  it('getPortalClinicInfo reads hide_powered_by and the layout threads it to the credit', () => {
    const service = read('lib/services/patient-portal.ts')
    expect(service).toContain('hidePoweredBy: clinicProfile.hidePoweredBy')
    expect(service).toMatch(/hidePoweredBy:\s*row\.hidePoweredBy === true/)
    const layout = read('app/(portal)/layout.tsx')
    expect(layout).toContain('<PortalCredit hidden={clinic?.hidePoweredBy === true} />')
    // The old unconditional line is gone.
    expect(layout).not.toMatch(/Powered by Dream(CRM|Create)/)
  })

  it('the Design card tells the owner the switch covers the portal too', () => {
    const card = read('app/(default)/website/design/powered-by-card.tsx')
    expect(card).toMatch(/patient portal/i)
  })
})
