import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

let stubSubs = {
  activeClinics: 0,
  byTier: { basic: 0, pro: 0, premium: 0 },
  monthlyRecurringCents: 0,
  newClinics30d: 0,
}
let stubProjects = {
  totalProjects: 0,
  openProjects: 0,
  completedThisMonth: 0,
  byStatus: {
    lead: 0,
    discovery: 0,
    in_progress: 0,
    review: 0,
    completed: 0,
    on_hold: 0,
    cancelled: 0,
  },
  byType: {
    website: 0,
    ecommerce: 0,
    intake_form: 0,
    videography: 0,
    photography: 0,
    content: 0,
    other: 0,
  },
  pipelineValueCents: 0,
  completedValueCents: 0,
  recentlyUpdated: [] as Array<{
    id: string
    title: string
    type: string
    status: string
    clinicName: string | null
    updatedAt: Date
  }>,
}

vi.mock('@/lib/services/projects', () => ({
  getSubscriptionStats: async () => stubSubs,
  getProjectStats: async () => stubProjects,
}))

import PlatformOverview from '@/app/(default)/dashboard/platform-overview'

describe('PlatformOverview', () => {
  it('shows zero-state KPIs when nothing exists', async () => {
    stubSubs = {
      activeClinics: 0,
      byTier: { basic: 0, pro: 0, premium: 0 },
      monthlyRecurringCents: 0,
      newClinics30d: 0,
    }
    stubProjects = { ...stubProjects, totalProjects: 0, openProjects: 0 }

    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText('Active Clinics')).toBeInTheDocument()
    expect(screen.getByText('MRR')).toBeInTheDocument()
    expect(screen.getByText(/No paid clinics yet/)).toBeInTheDocument()
    expect(screen.getByText(/No projects logged yet/)).toBeInTheDocument()
  })

  it('renders MRR formatted from subscription tier counts', async () => {
    stubSubs = {
      activeClinics: 6,
      byTier: { basic: 2, pro: 3, premium: 1 },
      monthlyRecurringCents: 2 * 9900 + 3 * 14900 + 1 * 19900, // $844
      newClinics30d: 4,
    }
    stubProjects = { ...stubProjects, totalProjects: 0, openProjects: 0 }
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText('6')).toBeInTheDocument() // Active Clinics
    // $844 — short-formatter keeps it < 1k so renders as $844
    expect(screen.getByText('$844')).toBeInTheDocument()
    expect(screen.getByText(/4 new in 30d/)).toBeInTheDocument()
  })

  it('renders every service-mix tile with its label', async () => {
    stubProjects = {
      ...stubProjects,
      byType: {
        website: 2,
        ecommerce: 1,
        intake_form: 3,
        videography: 4,
        photography: 5,
        content: 0,
        other: 1,
      },
    }
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText('Website')).toBeInTheDocument()
    expect(screen.getByText('Ecommerce')).toBeInTheDocument()
    expect(screen.getByText('Patient Intake Form')).toBeInTheDocument()
    expect(screen.getByText('Videography')).toBeInTheDocument()
    expect(screen.getByText('Photography')).toBeInTheDocument()
  })

  it('renders the 5 pipeline stages with counts', async () => {
    stubProjects = {
      ...stubProjects,
      byStatus: {
        lead: 3,
        discovery: 2,
        in_progress: 5,
        review: 1,
        completed: 8,
        on_hold: 0,
        cancelled: 0,
      },
    }
    const ui = await PlatformOverview()
    render(ui)
    // The 5 active pipeline stages — Lead, Discovery, In Progress, In Review, Completed
    expect(screen.getByText('Lead')).toBeInTheDocument()
    expect(screen.getByText('Discovery')).toBeInTheDocument()
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0)
    expect(screen.getByText('In Review')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('lists recently-updated projects with clinic names', async () => {
    stubProjects = {
      ...stubProjects,
      recentlyUpdated: [
        {
          id: 'p1',
          title: 'Smile Spa rebrand video',
          type: 'videography',
          status: 'in_progress',
          clinicName: 'Smile Spa',
          updatedAt: new Date(),
        },
        {
          id: 'p2',
          title: 'New intake form for Bright',
          type: 'intake_form',
          status: 'review',
          clinicName: 'Bright Dental',
          updatedAt: new Date(),
        },
      ],
      completedThisMonth: 2,
    }
    const ui = await PlatformOverview()
    render(ui)
    expect(screen.getByText('Smile Spa rebrand video')).toBeInTheDocument()
    expect(screen.getByText('New intake form for Bright')).toBeInTheDocument()
    expect(screen.getByText(/2 completed this month/)).toBeInTheDocument()
  })
})
