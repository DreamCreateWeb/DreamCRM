import { describe, it, expect, vi, beforeEach } from 'vitest'
import { domainMatchesWebsite } from '@/lib/prospect-email'

/**
 * The self-serve win loop (marketing-engine slice 1c): a signup whose email
 * matches a Hunter prospect marks that prospect converted + linked to the
 * new org — conservatively (exact email, then unambiguous practice domain;
 * never a guess), idempotently, and without ever stealing a prospect
 * already converted to a different org.
 */

const state: {
  selectQueue: unknown[][]
  updates: { table: unknown; values: Record<string, unknown> }[]
} = { selectQueue: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.groupBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table, values })
          },
        }),
      }),
    },
    schema,
  }
})

import { convertProspectForSignup } from '@/lib/services/prospecting'

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
})

describe('domainMatchesWebsite', () => {
  it('matches the host and its subdomains, never substrings', () => {
    expect(domainMatchesWebsite('smilebright.com', 'https://www.smilebright.com/about')).toBe(true)
    expect(domainMatchesWebsite('smilebright.com', 'booking.smilebright.com')).toBe(true)
    expect(domainMatchesWebsite('smilebright.com', 'https://mysmilebright.com')).toBe(false)
    expect(domainMatchesWebsite('smilebright.com', 'not a url')).toBe(false)
    expect(domainMatchesWebsite('smilebright.com', null)).toBe(false)
    expect(domainMatchesWebsite('', 'https://smilebright.com')).toBe(false)
  })
})

describe('convertProspectForSignup', () => {
  it('converts on an exact prospect.email match', async () => {
    state.selectQueue.push([{ id: 'p1', status: 'contacted', convertedOrganizationId: null }])
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'Doc@SmileBright.com' })
    expect(res).toEqual({ converted: true, prospectId: 'p1' })
    // markConverted: prospect status update + enrollment stop.
    expect(state.updates).toHaveLength(2)
    expect(state.updates[0].values).toMatchObject({ status: 'converted', convertedOrganizationId: 'org1' })
    expect(state.updates[1].values).toMatchObject({ status: 'stopped_manual', stopReason: 'converted' })
  })

  it('falls back to a crawled contact email', async () => {
    state.selectQueue.push([]) // prospect.email miss
    state.selectQueue.push([{ id: 'p2', status: 'engaged', convertedOrganizationId: null }]) // contact hit
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'frontdesk@smilebright.com' })
    expect(res.converted).toBe(true)
    expect(res.prospectId).toBe('p2')
  })

  it('matches an unambiguous practice domain, filtering ilike cousins', async () => {
    state.selectQueue.push([]) // prospect.email miss
    state.selectQueue.push([]) // contact miss
    state.selectQueue.push([
      { id: 'p3', status: 'discovered', convertedOrganizationId: null, websiteUrl: 'https://www.smilebright.com' },
      { id: 'p4', status: 'discovered', convertedOrganizationId: null, websiteUrl: 'https://mysmilebright.com' },
    ])
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'dr@smilebright.com' })
    expect(res).toMatchObject({ converted: true, prospectId: 'p3' })
  })

  it('refuses an ambiguous domain match — never a guess', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    state.selectQueue.push([
      { id: 'p3', status: 'discovered', convertedOrganizationId: null, websiteUrl: 'https://smilebright.com' },
      { id: 'p5', status: 'discovered', convertedOrganizationId: null, websiteUrl: 'https://dental.smilebright.com' },
    ])
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'dr@smilebright.com' })
    expect(res.converted).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('never domain-matches a freemail signup', async () => {
    state.selectQueue.push([]) // prospect.email miss
    state.selectQueue.push([]) // contact miss
    // No third query should run — the freemail gate short-circuits. If it
    // DID run, the empty queue would return [] anyway; assert via updates.
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'dentist@gmail.com' })
    expect(res.converted).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('is idempotent for a prospect already converted to THIS org', async () => {
    state.selectQueue.push([{ id: 'p1', status: 'converted', convertedOrganizationId: 'org1' }])
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'doc@smilebright.com' })
    expect(res).toEqual({ converted: true, prospectId: 'p1' })
    expect(state.updates).toHaveLength(0)
  })

  it('leaves a prospect converted to a DIFFERENT org alone', async () => {
    state.selectQueue.push([{ id: 'p1', status: 'converted', convertedOrganizationId: 'other-org' }])
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'doc@smilebright.com' })
    expect(res.converted).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('a junk email converts nothing', async () => {
    const res = await convertProspectForSignup({ organizationId: 'org1', email: 'not-an-email' })
    expect(res.converted).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})
