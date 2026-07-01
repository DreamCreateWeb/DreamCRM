import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

/**
 * The rebuilt settings rail: ONE unified list (org groups + Your account + Help)
 * — no surface split, no footer switcher, no drag-resize handle — headed by a
 * "‹ Settings" link back to the home, with deep search across the org AND the
 * personal pages.
 */
let mockPath = '/settings/clinic'
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }))

import SettingsSidebar from '@/app/(default)/settings/settings-sidebar'

beforeEach(() => cleanup())

describe('SettingsSidebar — unified rail', () => {
  it('shows org groups + your account + help all in one list', () => {
    mockPath = '/settings/practice'
    render(<SettingsSidebar tenantType="clinic" />)
    expect(screen.getByRole('link', { name: 'Clinic profile' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Practice setup' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Patient portal' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Automated emails' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Plan & billing' })).toBeTruthy()
    // Personal + help live in the SAME rail now (the surface split is gone).
    expect(screen.getByRole('link', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Security' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Send feedback' })).toBeTruthy()
  })

  it('has a "Settings" home link and NO resize handle or surface switcher', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    expect(screen.getByRole('link', { name: /^settings$/i }).getAttribute('href')).toBe('/settings')
    expect(screen.queryByRole('button', { name: /resize/i })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Clinic settings' })).toBeNull()
  })

  it('marks the active item with aria-current', () => {
    mockPath = '/settings/portal'
    render(<SettingsSidebar tenantType="clinic" />)
    expect(screen.getByRole('link', { name: 'Patient portal' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Automated emails' }).getAttribute('aria-current')).toBeNull()
  })

  it('platform tenant shows the Platform group (no clinic-only pages)', () => {
    mockPath = '/settings/team'
    render(<SettingsSidebar tenantType="platform" />)
    expect(screen.getByRole('link', { name: 'Team' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Connected accounts' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Profile' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Plan & billing' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Patient portal' })).toBeNull()
  })
})

describe('SettingsSidebar — smart search', () => {
  it('deep-links to a specific setting (hours → Clinic profile › Hours)', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), { target: { value: 'hours' } })
    expect(screen.getByRole('link', { name: /opening hours/i }).getAttribute('href')).toBe(
      '/settings/clinic?tab=profile&sub=hours',
    )
    // While searching, the plain nav is replaced by results.
    expect(screen.queryByRole('link', { name: 'Patient portal' })).toBeNull()
  })

  it('finds personal settings from the same rail (unified across surfaces)', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), { target: { value: 'password' } })
    expect(screen.getAllByRole('link').some((l) => /password/i.test(l.textContent || ''))).toBe(true)
  })

  it('shows a no-results message when nothing matches', () => {
    mockPath = '/settings/clinic'
    render(<SettingsSidebar tenantType="clinic" />)
    fireEvent.change(screen.getByRole('textbox', { name: /search settings/i }), { target: { value: 'zzzznomatch' } })
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
