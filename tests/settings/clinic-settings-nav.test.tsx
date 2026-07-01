import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * The clinic hub's section nav is now a single horizontal chip bar (the old
 * second left-rail is gone). It flattens the groups into one row of anchor
 * chips and marks the first section active by default.
 */
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import ClinicSettingsNav from '@/app/(default)/settings/clinic/clinic-settings-nav'

beforeEach(() => cleanup())

const groups = [
  { label: 'Your clinic', items: [{ id: 'basics', label: 'Basics' }, { id: 'hours', label: 'Hours' }] },
  { label: 'Website content', items: [{ id: 'branding', label: 'Branding' }] },
]

describe('ClinicSettingsNav (horizontal section nav)', () => {
  it('renders a chip per section, flattened across groups, linking to #id', () => {
    render(<ClinicSettingsNav groups={groups} />)
    expect(screen.getByRole('link', { name: 'Basics' }).getAttribute('href')).toBe('#basics')
    expect(screen.getByRole('link', { name: 'Hours' }).getAttribute('href')).toBe('#hours')
    expect(screen.getByRole('link', { name: 'Branding' }).getAttribute('href')).toBe('#branding')
  })

  it('marks the first section active by default', () => {
    render(<ClinicSettingsNav groups={groups} />)
    expect(screen.getByRole('link', { name: 'Basics' }).getAttribute('aria-current')).toBe('true')
  })
})
