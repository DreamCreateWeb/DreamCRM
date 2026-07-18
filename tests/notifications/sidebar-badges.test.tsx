import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ModuleDef } from '@/lib/modules/types'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

// Expanded (non-rail) sidebar: railCollapsed=false renders inline labels +
// the visible count pill (with its accessible label) next to each entry.
vi.mock('@/app/app-provider', () => ({
  useAppProvider: () => ({
    sidebarOpen: false,
    setSidebarOpen: vi.fn(),
    sidebarExpanded: true,
    railCollapsed: false,
    toggleRail: vi.fn(),
  }),
}))

// Brand mark + NavIcon pull in assets/icons we don't care about here.
vi.mock('@/components/brand/dream-create-logo', () => ({ DreamCreateMark: () => <div data-testid="logo" />, DreamCrmLogo: () => <div data-testid="logo-lockup" /> }))
vi.mock('@/components/ui/nav-icons', () => ({ NavIcon: () => <svg /> }))
vi.mock('@/components/dropdown-profile', () => ({ default: () => <div data-testid="profile" /> }))

import TenantSidebar from '@/components/ui/tenant-sidebar'

const MODULES: ModuleDef[] = [
  { id: 'overview', path: '/', label: 'Overview', section: 'Daily', icon: 'home', status: 'live' },
  { id: 'messages', path: '/messages', label: 'Messages', section: 'Daily', icon: 'chat', status: 'live' },
  { id: 'followups', path: '/followups', label: 'Follow-ups', section: 'Daily', icon: 'check', status: 'live' },
  { id: 'leads', path: '/leads', label: 'Leads', section: 'Daily', icon: 'megaphone', status: 'live' },
  { id: 'shop', path: '/shop', label: 'Shop', section: 'Business', icon: 'bag', status: 'live' },
  { id: 'reviews', path: '/reviews', label: 'Reviews', section: 'Growth', icon: 'star', status: 'live' },
]

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response
}

describe('TenantSidebar badges', () => {
  it('renders amber count pills next to Messages/Leads/Shop for a clinic tenant', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: 3, leads: 2, shop: 5 }))
    render(<TenantSidebar modules={MODULES} tenantType="clinic" />)
    // Pills appear after the polling effect's fetch resolves.
    await waitFor(() => {
      expect(screen.getByLabelText(/3 items need attention/i)).toHaveTextContent('3')
    })
    expect(screen.getByLabelText(/2 items need attention/i)).toHaveTextContent('2')
    expect(screen.getByLabelText(/5 items need attention/i)).toHaveTextContent('5')
    expect(fetchMock).toHaveBeenCalledWith('/api/nav-badges', { cache: 'no-store' })
  })

  it('renders a Follow-ups pill from the followups-due count', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: 0, leads: 0, shop: 0, followups: 6 }))
    render(<TenantSidebar modules={MODULES} tenantType="clinic" />)
    await waitFor(() => {
      expect(screen.getByLabelText(/6 items need attention/i)).toHaveTextContent('6')
    })
  })

  it('renders a Reviews pill from the reviews-need-reply count', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: 0, leads: 0, shop: 0, reviews: 4 }))
    render(<TenantSidebar modules={MODULES} tenantType="clinic" />)
    await waitFor(() => {
      expect(screen.getByLabelText(/4 items need attention/i)).toHaveTextContent('4')
    })
  })

  it('shows no pill when a count is zero', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: 0, leads: 4, shop: 0 }))
    render(<TenantSidebar modules={MODULES} tenantType="clinic" />)
    await waitFor(() => {
      expect(screen.getByLabelText(/4 items need attention/i)).toBeInTheDocument()
    })
    // Only the leads pill rendered — messages + shop are zero.
    expect(screen.getAllByText(/^\d+$/)).toHaveLength(1)
  })

  it('uses the singular aria-label for a count of 1', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: 1, leads: 0, shop: 0 }))
    render(<TenantSidebar modules={MODULES} tenantType="clinic" />)
    await waitFor(() => {
      expect(screen.getByLabelText(/1 item needs attention/i)).toBeInTheDocument()
    })
  })

  it('caps the displayed count at 99+', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: 0, leads: 0, shop: 150 }))
    render(<TenantSidebar modules={MODULES} tenantType="clinic" />)
    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument()
    })
  })

  it('does NOT poll for a non-clinic (platform) tenant', async () => {
    render(<TenantSidebar modules={MODULES} tenantType="platform" />)
    // Give any effect a tick.
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument()
  })
})
