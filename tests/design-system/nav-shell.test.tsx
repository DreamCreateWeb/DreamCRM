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
  DreamCrmLogo: () => <div data-testid="logo-lockup" />,
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
  { id: 'settings', path: '/settings', label: 'Settings', section: 'Settings', icon: 'gear', status: 'live' },
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

  it('puts Settings in the bottom pinned slot pointing at the /settings home', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    // The ONE settings entry point → the settings home.
    const link = screen.getByRole('link', { name: /Settings/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/settings')
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
  it('shows the org name + plan badge as a STATIC block (no dropdown menu)', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme Dental" badge="Pro plan" tenantType="clinic" />)
    const block = screen.getByTestId('org-switcher')
    expect(within(block).getByText('Acme Dental')).toBeInTheDocument()
    expect(within(block).getByText('Pro plan')).toBeInTheDocument()
    // The org block is no longer a menu — Settings has ONE entry point (the nav
    // "Settings" button → the /settings home), so there's no chevron dropdown here.
    expect(within(block).queryByRole('button')).not.toBeInTheDocument()
  })

  it('has no Clinic settings / Plan & billing links in the org block', () => {
    render(<TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" />)
    const block = screen.getByTestId('org-switcher')
    expect(within(block).queryByRole('menuitem')).not.toBeInTheDocument()
    expect(within(block).queryByText(/Clinic settings/i)).not.toBeInTheDocument()
    expect(within(block).queryByText(/Plan & billing/i)).not.toBeInTheDocument()
  })

  it('renders the org block statically for a platform tenant too', () => {
    render(<TenantSidebar modules={MODULES} orgName="Dream Create" badge="Platform admin" tenantType="platform" />)
    const block = screen.getByTestId('org-switcher')
    expect(within(block).getByText('Dream Create')).toBeInTheDocument()
    expect(within(block).queryByRole('button')).not.toBeInTheDocument()
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
  it('expanded mode shows inline labels and no flyout on focus', () => {
    providerState.railCollapsed = false
    render(<TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" />)
    // Inline label visible.
    expect(screen.getByText('Leads')).toBeInTheDocument()
    // Focusing a nav item does NOT spawn a flyout in expanded mode.
    fireEvent.focus(screen.getByText('Leads').closest('a')!)
    expect(screen.queryByTestId('nav-flyout')).not.toBeInTheDocument()
  })

  it('rail mode reveals a portaled flyout (label) on focus, gone on blur', async () => {
    providerState.railCollapsed = true
    render(<TenantSidebar modules={MODULES} orgName="Acme" badge="Pro plan" tenantType="clinic" />)
    // No flyout at rest — it portals to <body> only on interaction, so it can
    // escape the sidebar's overflow clip (the whole point of the change).
    expect(screen.queryByTestId('nav-flyout')).not.toBeInTheDocument()
    // The rail link carries its label as aria-label (icon-only); focus reveals it.
    const leadsLink = screen.getByLabelText(/^Leads/)
    fireEvent.focus(leadsLink)
    const flyout = await screen.findByTestId('nav-flyout')
    expect(within(flyout).getByText('Leads')).toBeInTheDocument()
    fireEvent.blur(leadsLink)
    expect(screen.queryByTestId('nav-flyout')).not.toBeInTheDocument()
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

/* ── THE DRAWER BELOW lg (2026-10-26) ─────────────────────────────────────
   Closed, the aside is slid off-screen but still in the DOM. Without `inert`
   every nav link, the org tile and the profile menu stayed in the tab order
   while invisible — a keyboard or screen-reader user on a phone tabbed through
   ~20 hidden links before reaching the page — and opening the drawer left
   focus on the hamburger. These pin the drawer contract: inert while closed
   on a phone (never at lg+, where the same element is the in-flow sidebar),
   focus into the Close button on open, back to the opener on close, Escape
   closes. */

function stubMatchMedia(matches: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  return () => {
    if (original) Object.defineProperty(window, 'matchMedia', original)
    else delete (window as { matchMedia?: unknown }).matchMedia
  }
}

describe('TenantSidebar — the off-canvas drawer below lg', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('is inert while closed on a phone, so its hidden links leave the tab order', () => {
    restore = stubMatchMedia(true)
    providerState.sidebarOpen = false
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    expect(document.getElementById('sidebar')).toHaveAttribute('inert')
  })

  it('is live again the moment it opens', () => {
    restore = stubMatchMedia(true)
    providerState.sidebarOpen = true
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    expect(document.getElementById('sidebar')).not.toHaveAttribute('inert')
  })

  it('is never inert at lg+, where it is the in-flow sidebar whatever the mobile flag says', () => {
    restore = stubMatchMedia(false)
    providerState.sidebarOpen = false
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    expect(document.getElementById('sidebar')).not.toHaveAttribute('inert')
  })

  it('opening moves focus to the Close button; closing returns it to the opener', () => {
    restore = stubMatchMedia(true)
    providerState.sidebarOpen = false
    const tree = () => (
      <>
        <button type="button">opener</button>
        <TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />
      </>
    )
    const { rerender } = render(tree())
    const opener = screen.getByRole('button', { name: 'opener' })
    opener.focus()
    expect(document.activeElement).toBe(opener)

    providerState.sidebarOpen = true
    rerender(tree())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close sidebar' }))

    providerState.sidebarOpen = false
    rerender(tree())
    expect(document.activeElement).toBe(opener)
  })

  it('Escape closes the open drawer', () => {
    restore = stubMatchMedia(true)
    providerState.sidebarOpen = true
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(providerState.setSidebarOpen).toHaveBeenCalledWith(false)
  })

  it('the Close button is a 40px control (DESIGN-SYSTEM §2.2)', () => {
    restore = stubMatchMedia(true)
    providerState.sidebarOpen = true
    render(<TenantSidebar modules={MODULES} orgName="Acme" tenantType="clinic" />)
    const close = screen.getByRole('button', { name: 'Close sidebar' })
    expect(close.className).toMatch(/\bh-10\b/)
    expect(close.className).toMatch(/\bw-10\b/)
  })
})

/* ── CHROME COPY READS ON ink-500, NEVER THE DISABLED STEP (2026-10-26) ──
   `--color-ink-400` is "disabled only" (style.css); on surface-1 in the light
   theme it measures ~2.5:1. The "Add" group is the activation program's one
   door to every module a practice has not opened — at that ink the whole
   offer read as disabled. Note the ink ramp INVERTS in `.dark` (ink-500 →
   #8290b3), so the readable step needs no `dark:` half, unlike `gray-*`. */

describe('TenantSidebar — readable chrome ink', () => {
  const ADDABLE: ModuleDef[] = [
    { id: 'payments', path: '/payments', label: 'Payments', section: 'Business', icon: 'bag', status: 'live' },
  ]

  it('renders Add rows, the Pinned eyebrow and the shortcut hints on ink-500', () => {
    render(<TenantSidebar modules={MODULES} addable={ADDABLE} orgName="Acme" tenantType="clinic" />)
    const addRow = within(screen.getByTestId('nav-add-group')).getByText('Payments').closest('a')!
    expect(addRow.className).toMatch(/\btext-ink-500\b/)
    expect(addRow.className).not.toMatch(/\btext-ink-400\b/)
    expect(screen.getByText('Pinned').className).toMatch(/\btext-ink-500\b/)
    // ⌘2, not ⌘1: pathname is '/' so Overview is the ACTIVE row and its hint
    // rides white on the gradient by design.
    expect(screen.getByText('⌘2').className).toMatch(/\btext-ink-500\b/)
    expect(screen.getByText('⌘2').className).not.toMatch(/\btext-ink-400\b/)
  })
})
