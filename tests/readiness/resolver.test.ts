import { describe, it, expect } from 'vitest'
import {
  resolveReadiness,
  hoursLookSeeded,
  type ReadinessInput,
  type ReadinessFact,
} from '@/lib/readiness'

const SEED = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
  sat: { open: null, close: null },
  sun: { open: null, close: null },
}

/** A healthy, fully-set-up clinic — individual tests break one thing. */
function baseInput(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    personalizationNeeded: false,
    logoUrl: 'https://x/logo.png',
    heroImageUrl: null,
    siteTeamCount: 2,
    hours: { present: true, source: 'manual', looksSeeded: false },
    selfBookingEnabled: true,
    siteLive: true,
    domainState: null,
    gsc: { platformConnected: true, customDomain: false },
    gbp: { connected: true, errored: false, websiteButton: 'ok' },
    socialCount: 1,
    pms: { severity: 'info', status: 'ok', message: 'Sync is healthy.' },
    hasPatients: true,
    inbox: { connected: true, errored: false },
    stripeStatus: 'active',
    smsState: 'approved',
    reviewsConfigured: true,
    portalCustomized: true,
    memberCount: 3,
    hasShopProduct: true,
    ...over,
  }
}

function get(facts: ReadinessFact[], id: string): ReadinessFact {
  const f = facts.find((x) => x.id === id)
  if (!f) throw new Error(`fact ${id} missing`)
  return f
}

describe('hoursLookSeeded', () => {
  it('matches the untouched day-0 seed', () => {
    expect(hoursLookSeeded(structuredClone(SEED), SEED)).toBe(true)
  })
  it('is false once any day differs', () => {
    const h = structuredClone(SEED) as Record<string, { open: string | null; close: string | null }>
    h.mon = { open: '08:00', close: '17:00' }
    expect(hoursLookSeeded(h, SEED)).toBe(false)
  })
  it('is false for null / non-object / extra keys', () => {
    expect(hoursLookSeeded(null, SEED)).toBe(false)
    expect(hoursLookSeeded('9-5', SEED)).toBe(false)
    expect(hoursLookSeeded({ ...structuredClone(SEED), note: 'x' }, SEED)).toBe(false)
  })
})

describe('resolveReadiness — the healthy clinic', () => {
  it('grades everything ready with nothing open', () => {
    const r = resolveReadiness(baseInput())
    expect(r.attention).toHaveLength(0)
    expect(r.waiting).toHaveLength(0)
    expect(r.openRequired).toHaveLength(0)
    expect(r.counts.requiredReady).toBe(r.counts.requiredTotal)
  })
})

describe('the ghost schedule (booking on unconfirmed hours)', () => {
  it('flags ATTENTION when booking is live on the untouched seed', () => {
    const r = resolveReadiness(
      baseInput({ hours: { present: true, source: 'manual', looksSeeded: true } }),
    )
    expect(get(r.facts, 'booking').grade).toBe('attention')
    expect(get(r.facts, 'hours').grade).toBe('todo')
  })
  it('google-sourced hours count as confirmed', () => {
    const r = resolveReadiness(
      baseInput({ hours: { present: true, source: 'google', looksSeeded: true } }),
    )
    expect(get(r.facts, 'hours').grade).toBe('ready')
    expect(get(r.facts, 'booking').grade).toBe('ready')
  })
  it('behind the go-live lever the ghost schedule is impossible — booking grades na', () => {
    const r = resolveReadiness(
      baseInput({
        siteLive: false,
        hours: { present: true, source: 'manual', looksSeeded: true },
      }),
    )
    expect(get(r.facts, 'booking').grade).toBe('na')
    expect(r.attention).toHaveLength(0)
    // The hours themselves still want confirming — that's what feeds the
    // go-live card's open list.
    expect(get(r.facts, 'hours').grade).toBe('todo')
  })

  it('request mode is a valid choice, never an alarm', () => {
    const r = resolveReadiness(
      baseInput({
        selfBookingEnabled: false,
        hours: { present: true, source: 'manual', looksSeeded: true },
      }),
    )
    expect(get(r.facts, 'booking').grade).toBe('ready')
  })
})

describe('health beats existence (the old checklist lies)', () => {
  it('a broken PMS connection is attention, never done', () => {
    const r = resolveReadiness(
      baseInput({ pms: { severity: 'error', status: 'errored', message: 'Last sync failed.' } }),
    )
    expect(get(r.facts, 'pms').grade).toBe('attention')
  })
  it('connected-awaiting-first-sync is waiting, not done and not broken', () => {
    const r = resolveReadiness(
      baseInput({ pms: { severity: 'info', status: 'never_synced', message: 'No sync yet.' } }),
    )
    expect(get(r.facts, 'pms').grade).toBe('waiting')
  })
  it('GBP alone never ticks social (the conflation dies)', () => {
    const r = resolveReadiness(baseInput({ socialCount: 0 }))
    expect(get(r.facts, 'social').grade).toBe('todo')
    expect(get(r.facts, 'gbp').grade).toBe('ready')
  })
  it('a dropped inbox is attention even though optional', () => {
    const r = resolveReadiness(baseInput({ inbox: { connected: true, errored: true } }))
    expect(get(r.facts, 'inbox').grade).toBe('attention')
    expect(r.attention.map((f) => f.id)).toContain('inbox')
  })
  it('restricted Stripe is attention', () => {
    const r = resolveReadiness(baseInput({ stripeStatus: 'restricted' }))
    expect(get(r.facts, 'payments').grade).toBe('attention')
  })
})

describe('the Google listing website button', () => {
  it('mismatch is attention with inbox pointer', () => {
    const r = resolveReadiness(
      baseInput({ gbp: { connected: true, errored: false, websiteButton: 'mismatch' } }),
    )
    const f = get(r.facts, 'gbp_website_button')
    expect(f.grade).toBe('attention')
    expect(f.summary).toMatch(/wrong place|fix card/i)
  })
  it('missing link is attention; unknown is quiet waiting', () => {
    expect(
      get(
        resolveReadiness(
          baseInput({ gbp: { connected: true, errored: false, websiteButton: 'missing' } }),
        ).facts,
        'gbp_website_button',
      ).grade,
    ).toBe('attention')
    expect(
      get(
        resolveReadiness(
          baseInput({ gbp: { connected: true, errored: false, websiteButton: 'unknown' } }),
        ).facts,
        'gbp_website_button',
      ).grade,
    ).toBe('waiting')
  })
  it('no button fact at all when GBP is not connected', () => {
    const r = resolveReadiness(
      baseInput({ gbp: { connected: false, errored: false, websiteButton: null } }),
    )
    expect(r.facts.find((f) => f.id === 'gbp_website_button')).toBeUndefined()
  })
})

describe('the impossible Search-Console row dies', () => {
  it('custom-domain clinics get na — excluded from every count', () => {
    const r = resolveReadiness(baseInput({ gsc: { platformConnected: true, customDomain: true } }))
    expect(get(r.facts, 'search_console').grade).toBe('na')
    expect(r.openRequired.map((f) => f.id)).not.toContain('search_console')
    expect(r.attention.map((f) => f.id)).not.toContain('search_console')
  })
  it('platform-side disconnect is also na — not the clinic’s todo', () => {
    const r = resolveReadiness(baseInput({ gsc: { platformConnected: false, customDomain: false } }))
    expect(get(r.facts, 'search_console').grade).toBe('na')
  })
})

describe('texting registration states', () => {
  it('maps the carrier pipeline honestly', () => {
    const g = (smsState: string | null) =>
      get(resolveReadiness(baseInput({ smsState })).facts, 'sms').grade
    expect(g('approved')).toBe('ready')
    expect(g('brand_pending')).toBe('waiting')
    expect(g('campaign_pending')).toBe('waiting')
    expect(g('number_pending')).toBe('waiting')
    expect(g('brand_action_needed')).toBe('attention')
    expect(g('rejected')).toBe('attention')
    expect(g(null)).toBe('todo')
    expect(g('none')).toBe('todo')
  })
  it('suspended stays a quiet wait — ours to chase, never the clinic’s alarm', () => {
    const f = get(resolveReadiness(baseInput({ smsState: 'suspended' })).facts, 'sms')
    expect(f.grade).toBe('waiting')
    expect(f.summary).not.toMatch(/suspend/i)
  })
})

describe('counts + optional semantics', () => {
  it('optional todos never appear in openRequired', () => {
    const r = resolveReadiness(
      baseInput({ socialCount: 0, hasShopProduct: false, portalCustomized: false, memberCount: 1 }),
    )
    const openIds = r.openRequired.map((f) => f.id)
    expect(openIds).not.toContain('social')
    expect(openIds).not.toContain('shop')
    expect(openIds).not.toContain('portal')
    expect(openIds).not.toContain('team')
  })
  it('required todos do appear', () => {
    const r = resolveReadiness(
      baseInput({
        hasPatients: false,
        pms: null,
        gbp: { connected: false, errored: false, websiteButton: null },
      }),
    )
    const openIds = r.openRequired.map((f) => f.id)
    expect(openIds).toContain('patients')
    expect(openIds).toContain('pms')
    expect(openIds).toContain('gbp')
  })
  it('domain pending is waiting; failed is attention; free address a quiet optional todo', () => {
    expect(get(resolveReadiness(baseInput({ domainState: 'pending' })).facts, 'domain').grade).toBe('waiting')
    expect(get(resolveReadiness(baseInput({ domainState: 'failed' })).facts, 'domain').grade).toBe('attention')
    const free = get(resolveReadiness(baseInput({ domainState: null })).facts, 'domain')
    expect(free.grade).toBe('todo')
    expect(free.optional).toBe(true)
  })
})
