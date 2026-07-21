/**
 * Regression guards for "lying" deep-link controls — links whose href looked
 * wired but pointed at a route that 404s or a query param the target page
 * never reads (so the promised filtered/pre-filled view silently never
 * happened). One such control class (a no-op href) shipped through 2000+ unit
 * tests because nobody asserted each control's target. These tests assert the
 * exact href so the param/route can't drift back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockGetRecallStats, mockListAudiences, mockRequireTenant } = vi.hoisted(() => ({
  mockGetRecallStats: vi.fn(),
  mockListAudiences: vi.fn(),
  mockRequireTenant: vi.fn(),
}))

vi.mock('@/lib/services/recall-stats', () => ({
  getRecallStats: mockGetRecallStats,
}))
vi.mock('@/lib/services/marketing', () => ({
  listAudiences: mockListAudiences,
}))
// The newsletter card counts published posts — not what this suite tests.
vi.mock('@/lib/services/blog', () => ({ listPublishedPosts: vi.fn(async () => []) }))
// The refer-a-friend card reads the org-wide program pulse — also not under test.
vi.mock('@/lib/services/patient-referrals', () => ({
  getReferralProgramStats: vi.fn(async () => ({ referredPatients: 0, referrers: 0 })),
}))

vi.mock('@/lib/services/retention-automation', () => ({
  getRetentionSettings: vi.fn(async () => ({
    birthdayAutoSend: false,
    lapsedReactivation: false,
    benefitsAutoSend: false,
    welcomeAutoSend: false,
  })),
  previewRetentionAudiences: vi.fn(async () => ({
    birthdaysThisMonth: 0,
    newlyLapsed: 0,
    benefitsEligible: 0,
    newThisWeek: 0,
  })),
  getAutomationStats: vi.fn(async () => ({
    birthday: { sent: 0, booked: 0 },
    reactivation: { sent: 0, booked: 0 },
    benefits: { sent: 0, booked: 0 },
    welcome: { sent: 0, booked: 0 },
  })),
}))
vi.mock('@/lib/services/marketing-templates', () => ({
  getAutomationOverride: vi.fn(async () => null),
  listTemplates: vi.fn(async () => []),
}))
// The hub renders the folded-in campaign history (phase 3) — empty here.
vi.mock('@/lib/services/marketing-campaigns', () => ({
  listCampaignsWithFunnels: vi.fn(async () => []),
}))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: mockRequireTenant,
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import ClinicRecallDashboard from '@/app/(default)/marketing/clinic-recall-dashboard'
import RevenuePage from '@/app/(default)/dashboard/fintech/page'
import type { RecallStats } from '@/lib/services/recall-stats'

const baseStats: RecallStats = {
  recallDueCount: 0,
  recallDueReachableCount: 0,
  lapsedCount: 0,
  lapsedReachableCount: 0,
  newPatientsCount: 0,
  birthdayThisMonthCount: 0,
  sentThisMonthCount: 0,
  bookedFromRecallCount: 0,
  openRate30d: null,
  clickRate30d: null,
  optedOutCount: 0,
  marketableCount: 0,
  upcomingSends: [],
  recentSends: [],
  recentActivity: [],
}

const clinicCtx = {
  tenantType: 'clinic' as const,
  role: 'owner' as const,
  organizationId: 'org_1',
  organizationName: 'Acme Dental',
  planTier: 'pro' as const,
  patientId: null,
}

beforeEach(() => {
  mockGetRecallStats.mockReset()
  mockListAudiences.mockReset()
  mockRequireTenant.mockReset()
})

describe('Recall dashboard audience link pre-targets a new campaign', () => {
  // Regression: this link used ?audience=, but the campaign home reads
  // ?prefill_audience= (and ignores ?audience=). The audience row therefore
  // landed with nothing pre-selected. Param must match the reader — which,
  // since the phase-3 fold, is the Outreach hub itself.
  it('links a patient audience to /growth/outreach?prefill_audience={id}', async () => {
    mockGetRecallStats.mockResolvedValueOnce(baseStats)
    mockListAudiences.mockResolvedValueOnce([
      { id: 42, name: 'Recall due', description: null, recipientSource: 'patients' },
    ])
    const ui = await ClinicRecallDashboard({ ctx: clinicCtx as never })
    render(ui)
    const link = screen.getByRole('link', { name: /Recall due/i })
    expect(link).toHaveAttribute('href', '/growth/outreach?prefill_audience=42')
  })
})

describe('Clinic Revenue legacy path goes straight to the real money surface', () => {
  // The clinic branch used to render a placeholder card (before that, a dead
  // /invoices link). Clinic revenue is a real surface now — the legacy Mosaic
  // path redirects to it instead of describing it.
  it('redirects clinic tenants to /payments/online', async () => {
    mockRequireTenant.mockResolvedValueOnce(clinicCtx)
    let thrown = ''
    try {
      await RevenuePage()
    } catch (e) {
      thrown = e instanceof Error ? e.message : String(e)
    }
    expect(thrown).toBe('REDIRECT:/payments/online')
  })
})
