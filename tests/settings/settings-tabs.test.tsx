import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { SettingsTabs } from '@/app/(default)/settings/settings-tabs'

/**
 * The reusable two-level (tabs + subtabs) nav every settings page is built on.
 * Critical invariant: ALL content stays mounted (inactive hidden, not
 * unmounted) so one form Save submits every field across every tab.
 */

// Configurable ?tab=&sub= so we can exercise deep-linking.
let mockParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
}))

beforeEach(() => {
  cleanup()
  mockParams = new URLSearchParams()
})

const tabs = [
  { id: 'a', label: 'Alpha', content: <div data-testid="a">A content</div> },
  {
    id: 'b',
    label: 'Beta',
    subtabs: [
      { id: 'b1', label: 'Beta one', content: <div data-testid="b1">B1</div> },
      { id: 'b2', label: 'Beta two', content: <div data-testid="b2">B2</div> },
    ],
  },
]

describe('SettingsTabs', () => {
  it('renders top tabs and keeps EVERY tab + subtab content mounted', () => {
    render(<SettingsTabs tabs={tabs} />)
    expect(screen.getByRole('tab', { name: 'Alpha' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Beta' })).toBeTruthy()
    // Inactive content is hidden, not unmounted — so it's still in the DOM.
    expect(screen.getByTestId('a')).toBeTruthy()
    expect(screen.getByTestId('b1')).toBeTruthy()
    expect(screen.getByTestId('b2')).toBeTruthy()
  })

  it('surfaces a tab\'s subtabs when it becomes active', () => {
    render(<SettingsTabs tabs={tabs} />)
    // Beta isn't active initially, so its subtab nav is hidden.
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }))
    expect(screen.getByRole('tab', { name: 'Beta one' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Beta two' })).toBeTruthy()
  })

  it('marks the active tab selected', () => {
    render(<SettingsTabs tabs={tabs} />)
    const alpha = screen.getByRole('tab', { name: 'Alpha' })
    const beta = screen.getByRole('tab', { name: 'Beta' })
    expect(alpha.getAttribute('aria-selected')).toBe('true')
    expect(beta.getAttribute('aria-selected')).toBe('false')
    fireEvent.click(beta)
    expect(beta.getAttribute('aria-selected')).toBe('true')
    expect(alpha.getAttribute('aria-selected')).toBe('false')
  })

  it('opens the tab named in ?tab= (deep link)', () => {
    mockParams = new URLSearchParams('tab=b')
    render(<SettingsTabs tabs={tabs} />)
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('false')
  })

  it('opens the subtab named in ?sub= under its tab', () => {
    mockParams = new URLSearchParams('tab=b&sub=b2')
    render(<SettingsTabs tabs={tabs} />)
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Beta two' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Beta one' }).getAttribute('aria-selected')).toBe('false')
  })

  it('falls back to the first tab when ?tab= is unknown', () => {
    mockParams = new URLSearchParams('tab=nope')
    render(<SettingsTabs tabs={tabs} />)
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true')
  })
})
