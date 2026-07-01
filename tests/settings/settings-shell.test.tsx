import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * The retired cross-page rail. The `/settings` home is now the ONLY cross-page
 * navigation; focused pages render in a single centered column and carry a
 * "‹ Settings" back-to-home link in their header (via `SettingsPage`). These
 * tests pin that contract so the rail can't creep back in.
 */
let mockPath = '/settings/clinic'
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }))

import SettingsShell from '@/app/(default)/settings/settings-shell'
import { SettingsPage } from '@/app/(default)/settings/settings-kit'

beforeEach(() => cleanup())
afterEach(() => cleanup())

describe('SettingsShell — no cross-page rail', () => {
  it('renders a focused page in a centered max-width column (no rail)', () => {
    mockPath = '/settings/clinic'
    const { container } = render(
      <SettingsShell>
        <div data-testid="child">page body</div>
      </SettingsShell>,
    )
    // The child is wrapped in the centered column…
    const child = screen.getByTestId('child')
    expect(child.closest('.max-w-4xl')).not.toBeNull()
    // …and there is NO settings navigation rail (the old <nav aria-label="Settings">)
    // and no "Search settings" box anymore.
    expect(container.querySelector('nav[aria-label="Settings"]')).toBeNull()
    expect(screen.queryByRole('textbox', { name: /search settings/i })).toBeNull()
  })

  it('renders the /settings home full-width (no centered column wrapper)', () => {
    mockPath = '/settings'
    render(
      <SettingsShell>
        <div data-testid="home">home grid</div>
      </SettingsShell>,
    )
    // Home is its own full-width navigation — the shell doesn't box it in.
    expect(screen.getByTestId('home').closest('.max-w-4xl')).toBeNull()
  })
})

describe('SettingsPage — back-to-home link', () => {
  it('every focused page inherits a "‹ Settings" link to the /settings home', () => {
    render(
      <SettingsPage title="Clinic profile" subtitle="Your details">
        <div>fields</div>
      </SettingsPage>,
    )
    const back = screen.getByRole('link', { name: /settings/i })
    expect(back.getAttribute('href')).toBe('/settings')
    expect(back.textContent).toMatch(/settings/i)
  })

  it('the page title + subtitle still render alongside the back link', () => {
    render(
      <SettingsPage title="Practice setup" subtitle="Providers and visit types">
        <div>fields</div>
      </SettingsPage>,
    )
    expect(screen.getByRole('heading', { name: 'Practice setup' })).toBeTruthy()
    expect(screen.getByText('Providers and visit types')).toBeTruthy()
  })
})
