import { describe, it, expect } from 'vitest'
import { buildProspectingDigestContent, type DigestStats } from '@/lib/services/prospecting-digest'
import type { HuntStats } from '@/lib/services/prospecting'
import type { ProspectFunnelStats } from '@/lib/types/prospecting'

/**
 * The daily hunt digest content builder — pure, DB-free. Covers the
 * nothing-happened gate, the subject line, the live-vs-dry-run send label,
 * call-list names, and the deliverability health line.
 */

const FUNNEL: ProspectFunnelStats = {
  discovered: 1200,
  enriched: 340,
  contacted: 120,
  engaged: 8,
  callList: 3,
  converted: 1,
}

function hunt(over: Partial<HuntStats> = {}): HuntStats {
  return {
    sinceIso: '2026-07-03T00:00:00.000Z',
    sent24h: 0,
    dryRun24h: 0,
    opens24h: 0,
    clicks24h: 0,
    replies24h: 0,
    newCallList24h: 0,
    autoEnrolledToday: 0,
    hottest: [],
    ...over,
  }
}

function stats(over: Partial<DigestStats> = {}): DigestStats {
  return {
    hunt: hunt(),
    funnel: FUNNEL,
    watchdogTripped: false,
    callList: [],
    ...over,
  }
}

describe('buildProspectingDigestContent', () => {
  it('reports no content when the machine did nothing', () => {
    const c = buildProspectingDigestContent(stats())
    expect(c.hasContent).toBe(false)
    expect(c.subject).toBe('')
    expect(c.body).toBe('')
  })

  it('any single signal (even an auto-enroll) makes it worth sending', () => {
    expect(buildProspectingDigestContent(stats({ hunt: hunt({ autoEnrolledToday: 2 }) })).hasContent).toBe(true)
    expect(buildProspectingDigestContent(stats({ hunt: hunt({ opens24h: 1 }) })).hasContent).toBe(true)
  })

  it('summarizes live sends in the subject and lists call-list names', () => {
    const c = buildProspectingDigestContent(
      stats({
        hunt: hunt({ sent24h: 42, opens24h: 10, clicks24h: 3, replies24h: 2, newCallList24h: 1 }),
        callList: [{ name: 'Bright Smiles', intentSummary: 'wants a demo Tuesday' }],
      }),
    )
    expect(c.subject).toBe('The hunt: 42 sent · 2 replies · 1 for your call list')
    expect(c.body).toContain('42 sent · 10 opened · 3 clicked · 2 replied')
    expect(c.body).toContain('Bright Smiles — "wants a demo Tuesday"')
    expect(c.body).toContain('Deliverability: healthy')
    expect(c.body).toContain('1,200 discovered')
  })

  it('labels dry-run drafting when nothing is sent live', () => {
    const c = buildProspectingDigestContent(stats({ hunt: hunt({ dryRun24h: 17 }) }))
    expect(c.subject).toContain('17 drafted (dry-run)')
    expect(c.body).toContain('17 drafted (dry-run)')
  })

  it('shouts the deliverability alarm when the watchdog is tripped', () => {
    const c = buildProspectingDigestContent(
      stats({ hunt: hunt({ sent24h: 30 }), watchdogTripped: true }),
    )
    expect(c.body).toContain('ALARM — sending is auto-paused')
  })
})
