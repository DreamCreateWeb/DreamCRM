import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Stub the query chain so we control what the overview sees.
const stubs: {
  profile: Record<string, unknown> | null
  activeProjects: Array<Record<string, unknown>>
} = { profile: null, activeProjects: [] }

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  return {
    db: {
      select: () => ({
        from: (t: unknown) => ({
          where: () => ({
            limit: async () => (t === clinicProfile && stubs.profile ? [stubs.profile] : []),
          }),
        }),
      }),
    },
  }
})

vi.mock('@/lib/services/projects', () => ({
  listActiveProjectsForOrg: async () => stubs.activeProjects,
}))

import ClinicOverview from '@/app/(default)/dashboard/clinic-overview'
import type { TenantContext } from '@/lib/auth/context'

function makeCtx(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'u_1',
    userEmail: 'a@b.com',
    userName: 'Test',
    platformAdmin: false,
    organizationId: 'org_1',
    organizationName: 'Acme Dental',
    organizationSlug: 'acme',
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'pro',
    patientId: null,
    isDemo: false,
    ...overrides,
  }
}

describe('ClinicOverview', () => {
  it('shows getting-started checklist with all items undone when profile is empty', async () => {
    stubs.profile = null
    stubs.activeProjects = []
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/Get your website ready/)).toBeInTheDocument()
    expect(screen.getByText(/0 of 6 done/)).toBeInTheDocument()
    expect(screen.getByText('Add a tagline')).toBeInTheDocument()
    expect(screen.getByText('Set office hours')).toBeInTheDocument()
  })

  it('marks items as done once the corresponding profile fields exist', async () => {
    stubs.profile = {
      tagline: 'Caring smiles',
      about: 'About text',
      hours: { mon: { open: '09:00', close: '17:00' } },
      services: [{ id: 'a', name: 'Cleanings' }],
      logoUrl: null,
      staff: null,
    }
    stubs.activeProjects = []
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/4 of 6 done/)).toBeInTheDocument()
  })

  it('shows the correct plan label and upgrade vs manage CTA', async () => {
    stubs.profile = { subscriptionStatus: 'active' }
    const proUi = await ClinicOverview({ ctx: makeCtx({ planTier: 'pro' }) })
    const { unmount } = render(proUi)
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('Upgrade plan →')).toBeInTheDocument()
    unmount()

    const premiumUi = await ClinicOverview({ ctx: makeCtx({ planTier: 'premium' }) })
    render(premiumUi)
    expect(screen.getByText('Premium')).toBeInTheDocument()
    expect(screen.getByText('Manage subscription →')).toBeInTheDocument()
  })

  it('renders quick-link to Appointments only for pro+ tenants', async () => {
    stubs.profile = null
    stubs.activeProjects = []
    const basicUi = await ClinicOverview({ ctx: makeCtx({ planTier: 'basic' }) })
    const { unmount } = render(basicUi)
    expect(screen.queryByText('Appointments')).not.toBeInTheDocument()
    expect(screen.queryByText('Patients')).not.toBeInTheDocument()
    unmount()

    const proUi = await ClinicOverview({ ctx: makeCtx({ planTier: 'pro' }) })
    render(proUi)
    expect(screen.getByText('Appointments')).toBeInTheDocument()
    expect(screen.getByText('Patients')).toBeInTheDocument()
  })

  it('renders active projects when present', async () => {
    stubs.profile = null
    stubs.activeProjects = [
      {
        id: 'p1',
        title: 'Rebrand video shoot',
        type: 'videography',
        status: 'in_progress',
        dueDate: null,
        updatedAt: new Date(),
      },
      {
        id: 'p2',
        title: 'New intake form',
        type: 'intake_form',
        status: 'review',
        dueDate: null,
        updatedAt: new Date(),
      },
    ]
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText('Rebrand video shoot')).toBeInTheDocument()
    expect(screen.getByText('New intake form')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('In Review')).toBeInTheDocument()
  })

  it('shows an empty-state when no projects', async () => {
    stubs.profile = null
    stubs.activeProjects = []
    const ui = await ClinicOverview({ ctx: makeCtx() })
    render(ui)
    expect(screen.getByText(/No active projects/)).toBeInTheDocument()
  })

  it('renders the preview-site URL from slug when no custom websiteDomain', async () => {
    stubs.profile = { websiteDomain: null }
    stubs.activeProjects = []
    const ui = await ClinicOverview({ ctx: makeCtx({ organizationSlug: 'shiny-smile' }) })
    render(ui)
    const link = screen.getByText(/View website/) as HTMLAnchorElement
    expect(link.getAttribute('href')).toContain('shiny-smile')
  })
})
