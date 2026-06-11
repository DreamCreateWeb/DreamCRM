/**
 * Tests for the clinic-site sitemap's conditional URLs: /careers (+ per-job
 * pages) only when there are open postings, and /services only when the clinic
 * has ≥1 resolved (library-linked) service. All data services are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const data = {
  site: {
    orgId: 'org_1',
    orgName: 'Bright Smiles',
    slug: 'bright',
    profile: {
      updatedAt: new Date('2026-06-01'),
      planTier: 'basic',
      services: [] as unknown[],
      staff: [] as unknown[],
      displayName: 'Bright Smiles',
      city: 'Austin',
    },
    primaryLocation: null as unknown,
  } as Record<string, unknown> | null,
  posts: [] as unknown[],
  plans: [] as unknown[],
  jobs: [] as Array<{ slug: string }>,
  services: [] as unknown[],
}

vi.mock('@/lib/services/clinic-site', () => ({
  getClinicSiteBySlug: vi.fn(async () => data.site),
  publicSiteUrl: () => 'https://bright.dreamcreatestudio.com',
}))
vi.mock('@/lib/services/blog', () => ({ listPublishedPosts: vi.fn(async () => data.posts) }))
vi.mock('@/lib/services/membership', () => ({ listActivePlans: vi.fn(async () => data.plans) }))
vi.mock('@/lib/services/careers', () => ({ getOpenJobs: vi.fn(async () => data.jobs) }))
vi.mock('@/lib/services/service-library', () => ({
  resolveClinicServices: vi.fn(async () => data.services),
}))

import { GET } from '@/app/site/[slug]/sitemap.xml/route'

async function sitemap(): Promise<string> {
  const res = await GET(new Request('https://x'), { params: Promise.resolve({ slug: 'bright' }) })
  return res.text()
}

beforeEach(() => {
  data.posts = []
  data.plans = []
  data.jobs = []
  data.services = []
})

describe('sitemap careers gating', () => {
  it('omits /careers when there are no open jobs', async () => {
    const xml = await sitemap()
    expect(xml).not.toContain('/careers')
  })

  it('includes /careers + a URL per open job', async () => {
    data.jobs = [{ slug: 'hygienist' }, { slug: 'front-desk' }]
    const xml = await sitemap()
    expect(xml).toContain('https://bright.dreamcreatestudio.com/careers</loc>')
    expect(xml).toContain('/careers/hygienist')
    expect(xml).toContain('/careers/front-desk')
  })
})

describe('sitemap services gating', () => {
  it('omits /services when the clinic has no resolved services', async () => {
    data.services = []
    const xml = await sitemap()
    expect(xml).not.toContain('/services')
  })

  it('includes /services when the clinic has ≥1 resolved service', async () => {
    data.services = [{ slug: 'whitening' }]
    const xml = await sitemap()
    expect(xml).toContain('/services</loc>')
  })
})

describe('sitemap always-present URLs', () => {
  it('always includes home, about, faq', async () => {
    const xml = await sitemap()
    expect(xml).toContain('https://bright.dreamcreatestudio.com/</loc>')
    expect(xml).toContain('/about</loc>')
    expect(xml).toContain('/faq</loc>')
  })
})
