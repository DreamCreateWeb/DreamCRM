/**
 * Smoke tests for the public per-job /careers/[jobSlug] detail page. Focus:
 * the generateMetadata description fallback (a published role can carry a
 * blank description because the column is .notNull().default('')), a basic
 * render, and notFound on an unknown jobSlug.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { JobPostingRow } from '@/lib/types/careers'

function makeData(overrides: Partial<ClinicSiteData['profile']> = {}): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Acme Dental',
    slug: 'acme-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      legalName: null,
      displayName: 'Acme Dental',
      tagline: null,
      about: null,
      npi: null,
      brandColor: '#9CAF9F',
      template: 'modern',
      phone: '(555) 555-0100',
      email: null,
      websiteDomain: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: 'US',
      hours: null,
      planTier: 'premium',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      services: null,
      staff: null,
      stats: null,
      testimonials: null,
      officePhotos: null,
      faq: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as ClinicSiteData['profile'],
  }
}

function makeJob(overrides: Partial<JobPostingRow> = {}): JobPostingRow {
  return {
    id: 'job_1',
    title: 'Dental Hygienist',
    slug: 'dental-hygienist',
    role: 'hygienist',
    employmentType: 'full_time',
    description: 'We are hiring a warm, gentle hygienist for our growing team.',
    responsibilities: null,
    requirements: null,
    benefits: null,
    compMinCents: null,
    compMaxCents: null,
    compPeriod: 'hour',
    showComp: false,
    status: 'open',
    applyMethod: 'in_app',
    externalApplyUrl: null,
    validThrough: null,
    postedAt: new Date('2026-06-01T00:00:00Z'),
    createdAt: new Date('2026-06-01T00:00:00Z'),
    applicantCount: 0,
    newApplicantCount: 0,
    ...overrides,
  }
}

const notFoundError = new Error('NEXT_NOT_FOUND')
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw notFoundError
  }),
}))

vi.mock('@/lib/services/clinic-site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/clinic-site')>(
    '@/lib/services/clinic-site',
  )
  return {
    ...actual,
    // The template-dispatching chrome resolves the active template per
    // request; a null orgId short-circuits it to the modern default with no
    // cookie/auth reads.
    getClinicThemeBySlug: vi.fn(async () => ({ orgId: null, brand: null, template: null })),
    getClinicSiteBySlug: vi.fn(),
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
    appBaseUrl: vi.fn(() => 'https://app.example.com'),
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
  }
})

vi.mock('@/lib/services/blog', () => ({ listPublishedPosts: vi.fn(async () => []) }))
vi.mock('@/lib/services/membership', () => ({ listActivePlans: vi.fn(async () => []) }))
vi.mock('@/lib/services/careers', () => ({
  getOpenJobBySlug: vi.fn(),
  getOpenJobs: vi.fn(async () => []),
}))

import JobDetailPage, { generateMetadata } from '@/app/site/[slug]/careers/[jobSlug]/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
import { getOpenJobBySlug } from '@/lib/services/careers'

const getSite = getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>
const getJob = getOpenJobBySlug as unknown as ReturnType<typeof vi.fn>

describe('Clinic careers job-detail page', () => {
  it('renders the job title as the H1', async () => {
    getSite.mockResolvedValue(makeData())
    getJob.mockResolvedValue(makeJob())
    const ui = await JobDetailPage({
      params: Promise.resolve({ slug: 'acme-dental', jobSlug: 'dental-hygienist' }),
    })
    render(ui as React.ReactElement)
    expect(
      screen.getByRole('heading', { level: 1, name: /Dental Hygienist/i }),
    ).toBeInTheDocument()
  })

  it('404s on an unknown jobSlug', async () => {
    getSite.mockResolvedValue(makeData())
    getJob.mockResolvedValue(null)
    await expect(
      JobDetailPage({
        params: Promise.resolve({ slug: 'acme-dental', jobSlug: 'nope' }),
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)
  })

  it('uses the real description in metadata when present', async () => {
    getSite.mockResolvedValue(makeData())
    getJob.mockResolvedValue(
      makeJob({ description: 'Join our caring hygiene team in a modern, judgment-free office.' }),
    )
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'acme-dental', jobSlug: 'dental-hygienist' }),
    })
    expect(meta.description).toMatch(/caring hygiene team/i)
  })

  it('falls back to a warm generic meta description when the role has a blank description', async () => {
    // description is .notNull().default('') — a published role can carry an
    // empty string. The old code did ''.slice(0,180) → an empty meta
    // description. It must now fall back to a real sentence.
    getSite.mockResolvedValue(makeData())
    getJob.mockResolvedValue(makeJob({ description: '   ' }))
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'acme-dental', jobSlug: 'dental-hygienist' }),
    })
    expect(meta.description).toBeTruthy()
    expect((meta.description as string).trim().length).toBeGreaterThan(0)
    expect(meta.description).toMatch(/Acme Dental/)
    expect(meta.description).toMatch(/Dental Hygienist/)
  })
})
