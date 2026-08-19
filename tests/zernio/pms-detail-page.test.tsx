import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * The PMS sync detail page (/integrations/pms) — the ONE deep PMS dashboard
 * (owner ruling 2026-08-19: one connector path; the old self-serve Open Dental
 * Customer-Key page is gone and its route 308s here). These tests assert: the
 * connected dashboard renders (status hero + KPIs + scope + field map +
 * sync/write-back logs), the unconnected state explains the we-set-it-up-with-
 * you install (NO key form), the back-link, the non-clinic redirects, and the
 * old /integrations/open-dental route's permanent redirect.
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
  permanentRedirect: (url: string) => {
    throw new Error(`PERMANENT_REDIRECT:${url}`)
  },
  // The deep dashboard mounts client islands (SyncControls/SyncNowButton)
  // that call useRouter — stub it.
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const svc = vi.hoisted(() => ({
  getIntegrationsDashboard: vi.fn(),
  getIntegrationsHealth: vi.fn(async () => ({ status: 'ok', severity: 'info', message: '' })),
}))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true, useConfirmSafe: () => async () => true }))
vi.mock('@/lib/services/pms', () => ({
  getIntegrationsDashboard: svc.getIntegrationsDashboard,
}))
vi.mock('@/lib/services/pms/health', () => ({
  getIntegrationsHealth: svc.getIntegrationsHealth,
}))
// The deep dashboard mounts client islands (SyncControls/SyncNowButton) whose
// handlers call the integrations actions — stub them so the modules import in
// the render-only test.
vi.mock('@/app/(default)/integrations/actions', () => ({
  syncNowAction: vi.fn(),
  disconnectPmsAction: vi.fn(),
  setSyncDirectionAction: vi.fn(),
  setAutoSyncAction: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import PmsDetailPage from '@/app/(default)/integrations/pms/page'
import OpenDentalRedirect from '@/app/(default)/integrations/open-dental/page'

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
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'premium',
    organizationId: 'org_1',
    userId: 'u1',
    organizationName: 'Dream Dental',
  }
})

describe('PMS detail page — gating', () => {
  it('patient tenant → redirects to the portal', async () => {
    ctx!.tenantType = 'patient'
    await expect(PmsDetailPage()).rejects.toThrow('REDIRECT:/patient/dashboard')
  })

  it('platform tenant → redirects to the dashboard', async () => {
    ctx!.tenantType = 'platform'
    await expect(PmsDetailPage()).rejects.toThrow('REDIRECT:/dashboard')
  })
})

describe('the retired /integrations/open-dental route', () => {
  it('308s to /integrations/pms — one PMS door', () => {
    expect(() => OpenDentalRedirect()).toThrow('PERMANENT_REDIRECT:/integrations/pms')
  })
})

describe('PMS detail page — connected dashboard', () => {
  it('renders the deep dashboard (KPIs + scope + field map + logs) + a back-link', async () => {
    svc.getIntegrationsDashboard.mockResolvedValue(connectedDashboard())
    const ui = await PmsDetailPage()
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

    // Trust banner is provider-neutral — no hardcoded Open Dental claim.
    expect(screen.getByText(/Sanctioned & audit-clean/i)).toBeTruthy()
    expect(screen.queryByText(/Open Dental's official API/i)).toBeNull()
  })

  it('unconnected → explains the guided install; NO Customer-Key form', async () => {
    svc.getIntegrationsDashboard.mockResolvedValue({
      connection: null,
      counts: { patients: 0, appointments: 0, providers: 0 },
      totals: { patients: 0, appointments: 0 },
      pendingWrites: 0,
      recentRuns: [],
      recentWrites: [],
    })
    const ui = await PmsDetailPage()
    render(ui)
    expect(screen.getByText(/One bridge reaches nearly every PMS/i)).toBeTruthy()
    expect(screen.getByText('What we sync')).toBeTruthy()
    // The old self-serve key entry must not come back.
    expect(screen.queryByLabelText(/Customer Key/i)).toBeNull()
    expect(screen.queryByText(/Write-back log/i)).toBeNull()
  })

  it('member (non-admin) unconnected → the ask-your-admin line', async () => {
    ctx!.role = 'member'
    svc.getIntegrationsDashboard.mockResolvedValue({
      connection: null,
      counts: { patients: 0, appointments: 0, providers: 0 },
      totals: { patients: 0, appointments: 0 },
      pendingWrites: 0,
      recentRuns: [],
      recentWrites: [],
    })
    const ui = await PmsDetailPage()
    render(ui)
    expect(screen.getByText(/needs an owner or admin/i)).toBeTruthy()
  })
})
