/**
 * The /website hub — the workspace home (Phase A of the website-workspace
 * consolidation). Proves:
 *  - the hub renders the REAL live-site host + domain pill + performance
 *    numbers + per-area stats (no fake content);
 *  - owner/admin get "Open the editor"; members don't (but still get the
 *    content areas — blog/SEO/careers were never role-gated);
 *  - below-plan tiers see honest upsell cards linking the billing upgrade
 *    panel instead of hidden modules;
 *  - the module registry carries exactly ONE Website-section entry with no
 *    role/plan gate (the sidebar collapse);
 *  - the slimmed editor top bar no longer hosts the hub's affordances
 *    (QR cards / Advanced edits / performance popover) and exits to /website.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'

let ctx: Record<string, unknown>
let profileRow: Record<string, unknown> | null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ctx),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (profileRow ? [profileRow] : []) }) }),
    }),
  },
}))

vi.mock('@/lib/services/clinic-site', () => ({
  publicSiteUrl: vi.fn(() => 'https://acme.dreamcreatestudio.com'),
}))
vi.mock('@/lib/services/site-analytics', () => ({
  getSitePerformance: vi.fn(async () => ({
    traffic: {
      windowDays: 30,
      total: 412,
      totalPrev: 300,
      daily: [{ day: '2026-07-01', views: 10 }],
      topPages: [{ path: '/', views: 200 }],
    },
    leads30d: 9,
    conversionPct: 2,
  })),
}))
vi.mock('@/lib/services/blog', () => ({
  getBlogStats: vi.fn(async () => ({ published: 3, drafts: 1, scheduled: 0, aiDraftsPending: 0, lastPublishedAt: null })),
}))
vi.mock('@/lib/services/seo', () => ({
  getSiteHealth: vi.fn(async () => ({ score: 88, checks: [] })),
}))
vi.mock('@/lib/services/careers', () => ({
  getCareersStats: vi.fn(async () => ({ openRoles: 2, totalApplicants: 5, newApplicants: 1 })),
}))
vi.mock('@/lib/services/website-history', () => ({
  getLastWebsiteEdit: vi.fn(async () => ({ label: 'Hero image', createdAt: new Date() })),
}))
const gscScopeMock = vi.fn(async () => ({
  perf: null,
  platformConnected: false,
  customDomain: false,
  scopeLabel: '/site/acme',
}))
vi.mock('@/lib/services/gsc', () => ({
  getClinicSeoPerformance: (...a: unknown[]) => gscScopeMock(...(a as [])),
}))

import WebsiteHubPage from '@/app/(default)/website/page'
import { clinicModules } from '@/lib/modules/clinic'

function makeProfile(over: Record<string, unknown> = {}) {
  return {
    organizationId: 'org_1',
    displayName: 'Acme Dental',
    planTier: 'premium',
    customDomainStatus: null,
    template: 'modern',
    ...over,
  }
}

beforeEach(() => {
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
    planTier: 'premium',
  }
  profileRow = makeProfile()
})

describe('WebsiteHubPage', () => {
  it('renders the live host, domain pill, performance, and real area stats', async () => {
    render(await WebsiteHubPage())
    // Host shows in the hero card AND as the Domain card's stat.
    expect(screen.getAllByText('acme.dreamcreatestudio.com').length).toBeGreaterThan(0)
    expect(screen.getByText('Free address')).toBeTruthy()
    expect(screen.getByText('412')).toBeTruthy() // visits
    expect(screen.getByText(/3 published/)).toBeTruthy()
    expect(screen.getByText(/Site health 88\/100/)).toBeTruthy()
    expect(screen.getByText(/2 open roles/)).toBeTruthy()
    expect(screen.getByText('Open the editor')).toBeTruthy()
    // The last edit shows in the hero line AND as the editor card's stat.
    expect(screen.getAllByText(/Last edit: Hero image/).length).toBeGreaterThan(0)
    cleanup()
  })

  it('shows the domain state pill from the stored status', async () => {
    profileRow = makeProfile({
      customDomainStatus: { state: 'pending_dns', domain: 'www.acmedental.com', requestedAt: 'x' },
    })
    render(await WebsiteHubPage())
    expect(screen.getByText('Domain waiting on DNS')).toBeTruthy()
    expect(screen.getByText('www.acmedental.com')).toBeTruthy()
    cleanup()
  })

  it('members get the areas but no editor affordances', async () => {
    ctx = { ...ctx, role: 'member' }
    render(await WebsiteHubPage())
    expect(screen.queryByText('Open the editor')).toBeNull()
    expect(screen.queryByText('Advanced edits')).toBeNull()
    expect(screen.getByText('Blog')).toBeTruthy()
    expect(screen.getByText('SEO')).toBeTruthy()
    cleanup()
  })

  it('below-plan tiers see honest upsell cards linking the upgrade panel', async () => {
    ctx = { ...ctx, planTier: 'basic' }
    profileRow = makeProfile({ planTier: 'basic' })
    const { container } = render(await WebsiteHubPage())
    expect(container.querySelector('a[href="/settings/billing?upgrade=blog"]')).toBeTruthy()
    expect(container.querySelector('a[href="/settings/billing?upgrade=seo"]')).toBeTruthy()
    expect(container.querySelector('a[href="/settings/billing?upgrade=careers"]')).toBeTruthy()
    // The gated pages themselves are never linked below-plan.
    expect(container.querySelector('a[href="/posts"]')).toBeNull()
    cleanup()
  })
})

describe('the go-live checklist', () => {
  it('shows real undone states with anti-shame copy (owner, nothing set up)', async () => {
    render(await WebsiteHubPage())
    expect(screen.getByText('Make the most of your site')).toBeTruthy()
    expect(screen.getByText('Personalize your site')).toBeTruthy()
    expect(screen.getByText('Connect your own domain')).toBeTruthy()
    // Optional rows say so instead of nagging.
    expect(screen.getAllByText('optional').length).toBeGreaterThan(0)
    cleanup()
  })

  it('hides entirely once every row is done (calm chrome)', async () => {
    profileRow = makeProfile({
      onboardingInterviewCompletedAt: new Date(),
      template: 'cosmetic',
      customDomainStatus: { state: 'active', domain: 'www.acmedental.com', requestedAt: 'x' },
    })
    gscScopeMock.mockResolvedValueOnce({
      perf: null,
      platformConnected: true,
      customDomain: false,
      scopeLabel: '/site/acme',
    })
    render(await WebsiteHubPage())
    expect(screen.queryByText('Make the most of your site')).toBeNull()
    cleanup()
  })

  it('never renders for members', async () => {
    ctx = { ...ctx, role: 'member' }
    render(await WebsiteHubPage())
    expect(screen.queryByText('Make the most of your site')).toBeNull()
    cleanup()
  })
})

describe('module registry — the sidebar collapse', () => {
  it('carries exactly ONE Website-section module, role- and plan-unrestricted', () => {
    const website = clinicModules.modules.filter((m) => m.section === 'Website')
    expect(website).toHaveLength(1)
    expect(website[0].id).toBe('website')
    expect(website[0].path).toBe('/website')
    expect(website[0].roles).toBeUndefined()
    expect(website[0].minPlan).toBeUndefined()
  })
})

describe('editor top bar — slimmed to editing controls', () => {
  const src = readFileSync(
    resolve(__dirname, '../../app/(default)/website/editor/website-studio.tsx'),
    'utf8',
  )
  it('exits to the hub, not the dashboard', () => {
    expect(src).toContain('<Link href="/website"')
  })
  it('no longer hosts the hub affordances (QR / advanced edits / performance)', () => {
    expect(src).not.toContain('QR cards')
    expect(src).not.toContain('Advanced edits')
    expect(src).not.toContain('showPerf')
    expect(src).not.toContain('SitePerformance')
  })
})
