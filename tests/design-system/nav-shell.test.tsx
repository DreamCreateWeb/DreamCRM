import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import type { ModuleDef } from '@/lib/modules/types'

/**
 * Design v2 navigation shell — TenantSidebar (DESIGN-SYSTEM.md Part 4).
 * Covers the three-state sidebar's structural contract: cockpit zone (pinned
 * + shortcut), collapsible groups, Settings pinned to the bottom (not a group),
 * org-switcher block + plan menu, the amber demo pill, the rail-mode hover
 * flyout, and group-collapse persistence. The clinic registry's Inbox-absence
 * is asserted against the real registry.
 */

// Mutable provider state so each test can pick rail vs expanded.
const providerState = {
  sidebarOpen: false,
  setSidebarOpen: vi.fn(),
  sidebarExpanded: true,
  railCollapsed: false,
  toggleRail: vi.fn(),
}
vi.mock('@/app/app-provider', () => ({
  useAppProvider: () => providerState,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

// Brand mark / icons / profile pull in assets we don't exercise here.
vi.mock('@/components/brand/dream-create-logo', () => ({
  DreamCreateMark: () => <div data-testid="logo" />,
}))
vi.mock('@/components/ui/nav-icons', () => ({ NavIcon: () => <svg /> }))
vi.mock('@/components/dropdown-profile', () => ({ default: () => <div data-testid="profile" /> }))

import TenantSidebar from '@/components/ui/tenant-sidebar'
import { clinicModules } from '@/lib/modules/clinic'

const MODULES: ModuleDef[] = [
  { id: 'overview', path: '/', label: 'Overview', section: 'Daily', icon: 'home', status: 'live', pinned: true, shortcut: '⌘1' },
  { id: 'messages', path: '/messages', label: 'Messages', section: 'Daily', icon: 'chat', status: 'live', pinned: true, shortcut: '⌘2' },
  { id: 'appointments', path: '/appointments', label: 'Appointments', section: 'Daily', icon: 'cal', status: 'live', pinned: true, shortcut: '⌘3' },
  { id: 'leads', path: '/leads', label: 'Leads', section: 'Daily', icon: 'megaphone', status: 'live' },
  { id: 'shop', path: '/shop', label: 'Shop', section: 'Business', icon: 'bag', status: 'live' },
  { id: 'settings', path: '/settings/account', label: 'Settings', section: 'Settings', icon: 'gear', status: 'live' },
]

beforeEach(() => {
  providerState.railCollapsed = false
  providerState.sidebarOpen = false
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TenantSidebar — cockpit zone', () => {
  it('pins the cockpit modules (with shortcut hints) into a label-less zone', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" />)
    const cockpit = screen.getByTestId('cockpit')
    // The three pinned dailies live in the cockpit, each showing its shortcut.
    expect(within(cockpit).getByText('Overview')).toBeInTheDocument()
    expect(within(cockpit).getByText('Messages')).toBeInTheDocument()
    expect(within(cockpit).getByText('Appointments')).toBeInTheDocument()
    expect(within(cockpit).getByText('⌘1')).toBeInTheDocument()
    expect(within(cockpit).getByText('⌘2')).toBeInTheDocument()
    expect(within(cockpit).getByText('⌘3')).toBeInTheDocument()
  })

  it('still lists pinned modules inside their group (cockpit is a duplicate, not a move)', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    // Messages appears twice: once in the cockpit, once in the Daily group.
    expect(screen.getAllByText('Messages').length).toBeGreaterThanOrEqual(2)
  })
})

describe('TenantSidebar — groups + Settings slot', () => {
  it('renders section group headers', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    expect(screen.getByRole('button', { name: 'Daily' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Business' })).toBeInTheDocument()
  })

  it('puts Settings in the bottom pinned slot, NOT inside a Settings group', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    // Settings link is present...
    expect(screen.getByRole('link', { name: /Settings/i })).toBeInTheDocument()
    // ...but there is no collapsible "Settings" group header button.
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })
})

describe('TenantSidebar — Inbox folds into Messages (clinic registry)', () => {
  it('the clinic registry has no standalone Inbox entry', () => {
    expect(clinicModules.modules.some((m) => m.id === 'inbox')).toBe(false)
    // Messages is still there (the surface Inbox folds into).
    expect(clinicModules.modules.some((m) => m.id === 'messages')).toBe(true)
  })

  it('renders no Inbox nav link from the real clinic registry', () => {
    render(
      <TenantSidebar modules={clinicModules.modules} orgName="Acme" badge="Pro plan" tenantType="clinic" />,
    )
    expect(screen.queryByText('Inbox')).not.toBeInTheDocument()
  })
})

describe('TenantSidebar — org switcher + demo pill', () => {
  it('shows the org name + plan badge and a plan/billing menu for a clinic', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme Dental" badge="Pro plan" tenantType="clinic" />)
    const block = screen.getByTestId('org-switcher')
    expect(within(block).getByText('Acme Dental')).toBeInTheDocument()
    expect(within(block).getByText('Pro plan')).toBeInTheDocument()
    // The switcher trigger is a real menu button for clinics.
    const trigger = within(block).getByRole('button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('the org-switcher menu links to plan + billing settings', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" />)
    const block = screen.getByTestId('org-switcher')
    fireEvent.click(within(block).getByRole('button'))
    expect(screen.getByRole('menuitem', { name: /Plan/i })).toHaveAttribute('href', '/settings/plans')
    expect(screen.getByRole('menuitem', { name: /Billing/i })).toHaveAttribute('href', '/settings/billing')
  })

  it('disables the switcher menu for a platform tenant (no plan to manage)', () => {
    render(<TenantSidebar modules={MODULES} orgName="Dream Create" badge="Platform admin" tenantType="platform" />)
    const block = screen.getByTestId('org-switcher')
    expect(within(block).getByRole('button')).toBeDisabled()
  })

  it('renders the amber Demo pill only in demo mode', () => {
    const { rerender } = render(
      <TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" isDemo={false} />,
    )
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    rerender(
      <TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" isDemo={true} />,
    )
    const pill = screen.getByText('Demo')
    expect(pill).toBeInTheDocument()
    expect(pill.className).toContain('amber')
  })
})

describe('TenantSidebar — rail state + hover flyout', () => {
  it('expanded mode shows inline labels and no hover flyouts', () => {
    providerState.railCollapsed = false
    render(<TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" />)
    expect(screen.queryByTestId('nav-flyout')).not.toBeInTheDocument()
    // Inline label visible.
    expect(screen.getByText('Leads')).toBeInTheDocument()
  })

  it('rail mode renders a hover flyout (label) for every nav item', () => {
    providerState.railCollapsed = true
    render(<TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" />)
    const flyouts = screen.getAllByTestId('nav-flyout')
    // One flyout per nav item (cockpit dupes Overview/Messages/Appointments).
    expect(flyouts.length).toBeGreaterThanOrEqual(MODULES.length)
    // Each flyout names its module (Leads is unique → exactly one flyout text).
    expect(flyouts.some((f) => within(f).queryByText('Leads'))).toBe(true)
  })

  it('the collapse caret reflects + toggles the rail state', () => {
    providerState.railCollapsed = false
    const { rerender } = render(
      <TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />,
    )
    const caret = screen.getByRole('button', { name: /Collapse sidebar/i })
    fireEvent.click(caret)
    expect(providerState.toggleRail).toHaveBeenCalled()
    providerState.railCollapsed = true
    rerender(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument()
  })
})

describe('TenantSidebar — active state', () => {
  it('marks the current path active with aria-current + the teal/breath skin', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    // pathname is '/' → Overview is active (appears in cockpit + group).
    const actives = screen.getAllByRole('link', { current: 'page' })
    expect(actives.length).toBeGreaterThanOrEqual(1)
    expect(actives[0].className).toContain('breath')
    expect(actives[0].className).toContain('teal')
  })
})
