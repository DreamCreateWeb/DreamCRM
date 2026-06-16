import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

/**
 * The Open Dental detail page (/integrations/open-dental) — the deep PMS
 * dashboard moved off the marketplace grid onto its own route. These tests
 * assert: the Premium gate (a below-Premium clinic sees the upgrade state, not a
 * crash), the connected dashboard renders (status hero + KPIs + scope + field
 * map + sync/write-back logs), the unconnected-Premium state shows the connect
 * form, the back-link to /integrations, and the non-clinic redirect.
 */

type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  userId: string
  organizationName: string
}
let ctx: Ctx | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!ctx) throw new Error('no ctx')
    return ctx
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  // The deep dashboard mounts client islands (SyncControls/SyncNowButton/
  // ConnectPanel) that call useRouter — stub it.
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const svc = vi.hoisted(() => ({
  getIntegrationsDashboard: vi.fn(),
  openDentalConfigured: vi.fn(() => true),
  getIntegrationsHealth: vi.fn(async () => ({ status: 'ok', severity: 'info', message: '' })),
}))
vi.mock('@/lib/services/pms', () => ({
  getIntegrationsDashboard: svc.getIntegrationsDashboard,
  openDentalConfigured: svc.openDentalConfigured,
}))
vi.mock('@/lib/services/pms/health', () => ({
  getIntegrationsHealth: svc.getIntegrationsHealth,
}))
// The deep dashboard mounts client islands (SyncControls/SyncNowButton/
// ConnectPanel) whose handlers call the integrations actions — stub them so the
// modules import in the render-only test.
vi.mock('@/app/(default)/integrations/actions', () => ({
  connectOpenDentalAction: vi.fn(),
  syncNowAction: vi.fn(),
  disconnectPmsAction: vi.fn(),
  setSyncDirectionAction: vi.fn(),
  setAutoSyncAction: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import OpenDentalDetailPage from '@/app/(default)/integrations/open-dental/page'

function connectedDashboard() {
  return {
    connection: {
      id: 'c1',
      organizationId: 'org_1',
      provider: 'demo',
      status: 'connected',
      syncDirection: 'two_way',
      autoSyncEnabled: 1,
      lastSyncStatus: 'success',
      lastSyncAt: new Date(),
      lastError: null,
      meta: { practiceTitle: 'Dream Dental' },
    },
    counts: { patients: 15, appointments: 17, providers: 2 },
    totals: { patients: 15, appointments: 17 },
    pendingWrites: 1,
    recentRuns: [
      { id: 'r1', startedAt: new Date(), trigger: 'manual', status: 'success', counts: { patients: { created: 3 } } },
    ],
    recentWrites: [
      { id: 'w1', label: 'Appointment for Mia', entityType: 'appointment', status: 'success', externalId: '99', error: null, createdAt: new Date() },
    ],
  }
}

beforeEach(() => {
  svc.getIntegrationsDashboard.mockReset()
  svc.openDentalConfigured.mockReturnValue(true)
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'premium',
    organizationId: 'org_1',
    userId: 'u1',
    organizationName: 'Dream Dental',
  }
})

describe('Open Dental detail page — gating', () => {
  it('below Premium → renders the upgrade state, NOT a crash (no dashboard load)', async () => {
    ctx!.planTier = 'basic'
    const ui = await OpenDentalDetailPage()
    render(ui)
    expect(screen.getByText(/Open Dental is on Premium/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Upgrade to Premium/i })).toBeTruthy()
    // Below Premium never loads the dashboard.
    expect(svc.getIntegrationsDashboard).not.toHaveBeenCalled()
  })

  it('patient tenant → redirects to the portal', async () => {
    ctx!.tenantType = 'patient'
    await expect(OpenDentalDetailPage()).rejects.toThrow('REDIRECT:/patient/dashboard')
  })

  it('platform tenant → redirects to the dashboard', async () => {
    ctx!.tenantType = 'platform'
    await expect(OpenDentalDetailPage()).rejects.toThrow('REDIRECT:/dashboard')
  })
})

describe('Open Dental detail page — connected dashboard', () => {
  it('renders the deep dashboard (KPIs + scope + field map + logs) + a back-link', async () => {
    svc.getIntegrationsDashboard.mockResolvedValue(connectedDashboard())
    const ui = await OpenDentalDetailPage()
    render(ui)

    // Back-link to the marketplace.
    const back = screen.getByRole('link', { name: /All integrations/i }) as HTMLAnchorElement
    expect(back.getAttribute('href')).toBe('/integrations')

    // KPIs.
    expect(screen.getByText('Patients synced')).toBeTruthy()
    expect(screen.getByText('Appointments synced')).toBeTruthy()

    // Scope boundary + field map.
    expect(screen.getByText('What we sync')).toBeTruthy()
    expect(screen.getByText('What stays in your PMS')).toBeTruthy()
    expect(screen.getByText('Field mapping')).toBeTruthy()

    // Logs (the section headings, not the trust-banner mention of "write-back log").
    expect(screen.getByRole('heading', { name: /Sync history/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Write-back log/i })).toBeTruthy()
    // The seeded write row renders.
    expect(screen.getByText('Appointment for Mia')).toBeTruthy()

    // Trust banner.
    expect(screen.getByText(/Sanctioned/i)).toBeTruthy()
  })

  it('unconnected (Premium) → renders the connect form + scope, no dashboard logs', async () => {
    svc.getIntegrationsDashboard.mockResolvedValue({
      connection: null,
      counts: { patients: 0, appointments: 0, providers: 0 },
      totals: { patients: 0, appointments: 0 },
      pendingWrites: 0,
      recentRuns: [],
      recentWrites: [],
    })
    const ui = await OpenDentalDetailPage()
    render(ui)
    expect(screen.getByText(/Connect Open Dental/i)).toBeTruthy()
    expect(screen.getByText('What we sync')).toBeTruthy()
    // No write-back log on the unconnected state.
    expect(screen.queryByText(/Write-back log/i)).toBeNull()
  })
})
