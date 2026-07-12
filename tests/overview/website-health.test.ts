import { describe, it, expect } from 'vitest'
import {
  websiteHealthNotice,
  TRAFFIC_DROP_MIN_PRIOR,
  NO_LEADS_MIN_VISITS,
} from '@/lib/website-health'

describe('websiteHealthNotice', () => {
  it('flags a real traffic drop (≥ half lost against a substantive prior week)', () => {
    const n = websiteHealthNotice({ total: 40, totalPrev: 120, leads14d: 5 })
    expect(n?.kind).toBe('traffic_drop')
    expect(n?.body).toContain('40 visits')
    expect(n?.body).toContain('down 67%')
    expect(n?.href).toBe('/growth/analytics')
  })

  it('never flags a drop against a quiet prior week (volume floor)', () => {
    expect(
      websiteHealthNotice({ total: 2, totalPrev: TRAFFIC_DROP_MIN_PRIOR - 1, leads14d: 0 }),
    ).toBeNull()
  })

  it('does not flag a mild dip (49% down is not a signal)', () => {
    expect(websiteHealthNotice({ total: 61, totalPrev: 120, leads14d: 5 })).toBeNull()
  })

  it('flags silent forms — real traffic, zero leads in 14 days', () => {
    const n = websiteHealthNotice({ total: NO_LEADS_MIN_VISITS, totalPrev: 60, leads14d: 0 })
    expect(n?.kind).toBe('no_leads')
    expect(n?.href).toBe('/website/editor')
  })

  it('never flags silent forms on a low-traffic site', () => {
    expect(
      websiteHealthNotice({ total: NO_LEADS_MIN_VISITS - 1, totalPrev: 40, leads14d: 0 }),
    ).toBeNull()
  })

  it('never flags silent forms when the lead read failed (null ≠ zero)', () => {
    expect(websiteHealthNotice({ total: 500, totalPrev: 480, leads14d: null })).toBeNull()
  })

  it('traffic drop wins when both fire (the upstream problem)', () => {
    const n = websiteHealthNotice({ total: 50, totalPrev: 200, leads14d: 0 })
    expect(n?.kind).toBe('traffic_drop')
  })

  it('healthy site → null', () => {
    expect(websiteHealthNotice({ total: 100, totalPrev: 90, leads14d: 4 })).toBeNull()
  })

  it('flags a stuck custom domain (pending_dns) → the domain page', () => {
    const n = websiteHealthNotice({ total: 100, totalPrev: 90, leads14d: 4, domainState: 'pending_dns' })
    expect(n?.kind).toBe('domain_pending')
    expect(n?.href).toBe('/website/domain')
  })

  it('flags a failed domain as the top-priority signal (beats traffic drop)', () => {
    const n = websiteHealthNotice({ total: 40, totalPrev: 120, leads14d: 0, domainState: 'failed' })
    expect(n?.kind).toBe('domain_failed')
    expect(n?.href).toBe('/website/domain')
  })

  it('traffic drop outranks a merely-pending domain', () => {
    const n = websiteHealthNotice({ total: 40, totalPrev: 120, leads14d: 5, domainState: 'pending_dns' })
    expect(n?.kind).toBe('traffic_drop')
  })

  it('an active domain never flags', () => {
    expect(websiteHealthNotice({ total: 100, totalPrev: 90, leads14d: 4, domainState: 'active' })).toBeNull()
  })
})
