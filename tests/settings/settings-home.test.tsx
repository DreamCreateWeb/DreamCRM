import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SettingsHome from '@/app/(default)/settings/settings-home'

/**
 * The Settings home is the card-grid landing that IS the navigation — grouped
 * tiles (org groups + Your account + Help) that link into the focused pages,
 * plus a search that filters to deep results.
 */
beforeEach(() => cleanup())

describe('SettingsHome', () => {
  it('renders grouped tiles that link to real settings pages (clinic)', () => {
    render(<SettingsHome tenantType="clinic" />)
    expect(screen.getByText('Clinic')).toBeTruthy()
    expect(screen.getByText('Patients')).toBeTruthy()
    expect(screen.getByText('Your account')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Clinic profile/ }).getAttribute('href')).toBe('/settings/clinic')
    expect(screen.getByRole('link', { name: /Automated emails/ }).getAttribute('href')).toBe(
      '/settings/automations/emails',
    )
    expect(screen.getByRole('link', { name: /Profile/ }).getAttribute('href')).toBe('/settings/account')
  })

  it('platform tenant shows the Platform group, not clinic-only Billing', () => {
    render(<SettingsHome tenantType="platform" />)
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Team/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Plan & billing/ })).toBeNull()
    // Your account is still reachable from the platform home.
    expect(screen.getByRole('link', { name: /Profile/ }).getAttribute('href')).toBe('/settings/account')
  })

  it('filters to search results as you type (and hides the group headers)', () => {
    render(<SettingsHome tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), { target: { value: 'hours' } })
    expect(screen.getByRole('link', { name: /opening hours/i }).getAttribute('href')).toBe(
      '/settings/clinic?tab=profile&sub=hours',
    )
    expect(screen.queryByText('Patients')).toBeNull()
  })
})
