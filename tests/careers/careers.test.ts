import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatComp, jobPostingJsonLd, type JobPostingRow } from '@/lib/types/careers'

const state: { selectQueue: unknown[][]; inserts: Record<string, unknown>[]; updates: Record<string, unknown>[] } = {
  selectQueue: [],
  inserts: [],
  updates: [],
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'innerJoin', 'orderBy', 'groupBy', 'limit']) c[m] = () => c
    c.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return c
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: (v: Record<string, unknown>) => { state.inserts.push(v); return Promise.resolve() } }),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: () => { state.updates.push(s); return Promise.resolve() } }) }),
    },
    schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }),
  }
})

import { createJob, setApplicationStatus } from '@/lib/services/careers'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.updates.length = 0
})

const baseJob: JobPostingRow = {
  id: 'job_1',
  title: 'Dental Hygienist',
  slug: 'dental-hygienist',
  role: 'hygienist',
  employmentType: 'full_time',
  description: 'Join our hygiene team.',
  responsibilities: 'Cleanings.',
  requirements: 'RDH license.',
  benefits: '401k.',
  compMinCents: 3800,
  compMaxCents: 4800,
  compPeriod: 'hour',
  showComp: true,
  status: 'open',
  applyMethod: 'in_app',
  externalApplyUrl: null,
  validThrough: null,
  postedAt: new Date('2026-05-01'),
  createdAt: new Date('2026-05-01'),
  applicantCount: 0,
  newApplicantCount: 0,
}

describe('formatComp', () => {
  it('formats hourly ranges, single values, yearly, and hides when off', () => {
    expect(formatComp(baseJob)).toBe('$38–$48/hr')
    expect(formatComp({ ...baseJob, compMaxCents: null })).toBe('$38/hr')
    expect(formatComp({ ...baseJob, compMinCents: 9000000, compMaxCents: 12000000, compPeriod: 'year' })).toBe('$90k–$120k/yr')
    expect(formatComp({ ...baseJob, showComp: false })).toBeNull()
    expect(formatComp({ ...baseJob, compMinCents: null, compMaxCents: null })).toBeNull()
  })
})

describe('jobPostingJsonLd', () => {
  it('builds a schema.org JobPosting with mapped employmentType, salary, location, directApply', () => {
    const ld = jobPostingJsonLd(baseJob, {
      orgName: 'Acme Dental',
      jobUrl: 'https://acme.example/careers/dental-hygienist',
      datePosted: new Date('2026-05-01T00:00:00Z'),
      location: { streetAddress: '500 Main St', addressLocality: 'Austin', addressRegion: 'TX', postalCode: '78701' },
    }) as Record<string, any>

    expect(ld['@type']).toBe('JobPosting')
    expect(ld.employmentType).toBe('FULL_TIME')
    expect(ld.directApply).toBe(true)
    expect(ld.hiringOrganization.name).toBe('Acme Dental')
    expect(ld.jobLocation.address.addressLocality).toBe('Austin')
    expect(ld.baseSalary.value.minValue).toBe(38)
    expect(ld.baseSalary.value.unitText).toBe('HOUR')
    expect(ld.datePosted).toBe('2026-05-01')
  })

  it('omits salary when comp is hidden and marks external apply', () => {
    const ld = jobPostingJsonLd(
      { ...baseJob, showComp: false, applyMethod: 'external' },
      { orgName: 'Acme', jobUrl: 'https://x', datePosted: new Date(), location: null },
    ) as Record<string, any>
    expect(ld.baseSalary).toBeUndefined()
    expect(ld.jobLocation).toBeUndefined()
    expect(ld.directApply).toBe(false)
  })
})

describe('createJob', () => {
  it('disambiguates the slug when the title collides', async () => {
    state.selectQueue.push([{ slug: 'dental-hygienist', id: 'other' }]) // uniqueJobSlug existing
    await createJob('org_1', { title: 'Dental Hygienist', role: 'hygienist', employmentType: 'full_time', description: 'x' })
    expect(state.inserts).toHaveLength(1)
    expect((state.inserts[0] as { slug: string }).slug).toBe('dental-hygienist-2')
  })

  it('sets postedAt when created directly as open', async () => {
    state.selectQueue.push([]) // no existing slugs
    await createJob('org_1', { title: 'Front Desk', role: 'front_desk', employmentType: 'full_time', description: 'x', status: 'open' })
    expect((state.inserts[0] as { postedAt: Date | null }).postedAt).toBeInstanceOf(Date)
  })
})

describe('setApplicationStatus', () => {
  it('stamps decidedAt on terminal decisions', async () => {
    await setApplicationStatus('org_1', 'app_1', 'hired')
    expect((state.updates[0] as { status: string }).status).toBe('hired')
    expect((state.updates[0] as { decidedAt: Date | null }).decidedAt).toBeInstanceOf(Date)
  })

  it('clears decidedAt for non-terminal stages', async () => {
    await setApplicationStatus('org_1', 'app_1', 'reviewing')
    expect((state.updates[0] as { decidedAt: Date | null }).decidedAt).toBeNull()
  })
})
