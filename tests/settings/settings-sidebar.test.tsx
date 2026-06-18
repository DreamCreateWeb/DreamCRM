import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

/**
 * SettingsSidebar splits Settings into two surfaces by the current path:
 *   • the 3 personal pages → the USER surface (just you)
 *   • everything else → the ORG surface (clinic/platform, visible to all staff)
 * Each surface shows only its own list + a footer link to the other one.
 */

let mockPath = '/settings/account'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPath,
}))

import SettingsSidebar from '@/app/(default)/settings/settings-sidebar'

beforeEach(() => {
  cleanup()
})

describe('SettingsSidebar — user vs org surfaces', () => {
  it('on a personal page shows ONLY user settings (not clinic ones)', () => {
    mockPath = '/settings/account'
    render(<SettingsSidebar tenantType="clinic" />)

    expect(screen.getByText('Your account')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Security' })).toBeTruthy()
    // Clinic-only items must NOT appear on the personal surface.
    expect(screen.queryByRole('link', { name: 'Clinic profile' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Practice setup' })).toBeNull()
    // Footer crosses over to the clinic surface.
    expect(screen.getByRole('link', { name: 'Clinic settings' }).getAttribute('href')).toBe('/settings/clinic')
  })

  it('on a clinic page shows the clinic surface (not personal items)', () => {
    mockPath = '/settings/practice'
    render(<SettingsSidebar tenantType="clinic" />)

    expect(screen.getByText('Clinic settings')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Clinic profile' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Practice setup' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Patient portal' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Billing' })).toBeTruthy()
    // Personal pages aren't in the clinic list.
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Security' })).toBeNull()
    // Footer crosses over to the user surface.
    expect(screen.getByRole('link', { name: 'Your account' }).getAttribute('href')).toBe('/settings/account')
  })

  it('marks the active item with aria-current', () => {
    mockPath = '/settings/portal'
    render(<SettingsSidebar tenantType="clinic" />)
    const active = screen.getByRole('link', { name: 'Patient portal' })
    expect(active.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Reminders' }).getAttribute('aria-current')).toBeNull()
  })

  it('platform tenant gets the Platform surface on an org page', () => {
    mockPath = '/settings/team'
    render(<SettingsSidebar tenantType="platform" />)
    expect(screen.getByText('Platform settings')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Team' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Connected accounts' })).toBeTruthy()
    // No clinic-only Plan/Billing for the platform org.
    expect(screen.queryByRole('link', { name: 'Billing' })).toBeNull()
  })

  it('platform tenant on a personal page still gets user settings + a Platform footer', () => {
    mockPath = '/settings/notifications'
    render(<SettingsSidebar tenantType="platform" />)
    expect(screen.getByText('Your account')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Platform settings' }).getAttribute('href')).toBe('/settings/team')
  })
})

describe('SettingsSidebar — smart search', () => {
  it('deep-links to a specific setting (hours → Clinic profile › Hours)', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), {
      target: { value: 'hours' },
    })
    const link = screen.getByRole('link', { name: /opening hours/i })
    expect(link.getAttribute('href')).toBe('/settings/clinic?tab=profile&sub=hours')
    // While searching, the plain nav is replaced by results.
    expect(screen.queryByRole('link', { name: 'Patient portal' })).toBeNull()
  })

  it('matches synonyms that are not in the visible label (logo → Branding)', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), {
      target: { value: 'logo' },
    })
    expect(screen.getByRole('link', { name: /branding/i }).getAttribute('href')).toBe(
      '/settings/clinic?tab=branding',
    )
  })

  it('scopes results to the current surface (no clinic settings on the user surface)', () => {
    mockPath = '/settings/account'
    render(<SettingsSidebar tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), {
      target: { value: 'hours' },
    })
    expect(screen.getByText(/no settings match/i)).toBeTruthy()
  })

  it('shows a no-results message when nothing matches', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), {
      target: { value: 'zzzznomatch' },
    })
    expect(screen.getByText(/no settings match/i)).toBeTruthy()
  })

  it('clears the query with the clear button (restores the nav)', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    const input = screen.getByRole('textbox', { name: /search settings/i }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hours' } })
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }))
    expect(input.value).toBe('')
    expect(screen.getByRole('link', { name: 'Clinic profile' })).toBeTruthy()
  })
})

describe('SettingsSidebar — resize', () => {
  it('renders a resize handle', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    expect(screen.getByRole('button', { name: /resize settings sidebar/i })).toBeTruthy()
  })
})
