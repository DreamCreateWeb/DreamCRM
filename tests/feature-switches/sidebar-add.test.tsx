import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ModuleDef } from '@/lib/modules/types'

/**
 * THE "ADD" GROUP (docs/ACTIVATION.md law 1, S3). The sidebar lists what
 * is on, then the doors not yet opened as a quiet "Add" group; each row
 * links to its own intro. No addable → no group.
 */

vi.mock('@/app/app-provider', () => ({
  useAppProvider: () => ({ sidebarOpen: false, setSidebarOpen: vi.fn(), railCollapsed: false, toggleRail: vi.fn() }),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/components/brand/dream-create-logo', () => ({
  DreamCreateMark: () => <div />,
  DreamCrmLogo: () => <div />,
}))
vi.mock('@/components/ui/nav-icons', () => ({ NavIcon: () => <svg /> }))
vi.mock('@/components/dropdown-profile', () => ({ default: () => <div /> }))
vi.mock('@/components/realtime/realtime-provider', () => ({ useRealtime: () => {} }))

// The sidebar polls /api/nav-badges on mount; there is no server here.
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))

import TenantSidebar from '@/components/ui/tenant-sidebar'

const ON: ModuleDef[] = [
  { id: 'overview', path: '/dashboard', label: 'Overview', section: 'Daily', pinned: true },
  { id: 'patients', path: '/patients', label: 'Patients', section: 'Daily' },
  { id: 'settings', path: '/settings', label: 'Settings', section: 'Settings' },
]
const ADD: ModuleDef[] = [
  { id: 'my_day', path: '/my-day', label: 'My Day', section: 'Daily' },
  { id: 'growth', path: '/growth', label: 'Growth', section: 'Growth' },
]

describe('TenantSidebar — the Add group', () => {
  it('renders the switched-off modules under "Add", each linking to its intro', () => {
    render(<TenantSidebar modules={ON} addable={ADD} orgName="Acme" tenantType="clinic" />)
    expect(screen.getByRole('button', { name: /^Add$/ })).toBeInTheDocument()
    const group = screen.getByTestId('nav-add-group')
    const links = within(group).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/my-day', '/growth'])
    expect(within(group).getByText('My Day')).toBeInTheDocument()
    // The switched-off module is NOT also listed in its home section.
    const daily = screen.getAllByRole('list').filter((l) => l !== group)
    for (const l of daily) expect(within(l).queryByText('Growth')).toBeNull()
  })

  it('no addable modules → no Add group', () => {
    render(<TenantSidebar modules={ON} orgName="Acme" tenantType="clinic" />)
    expect(screen.queryByRole('button', { name: /^Add$/ })).toBeNull()
    expect(screen.queryByTestId('nav-add-group')).toBeNull()
  })
})
