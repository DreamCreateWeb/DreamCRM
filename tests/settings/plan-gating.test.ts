import { describe, it, expect } from 'vitest'
import { planAllows, PLAN_ORDER, getModuleLabel } from '@/lib/modules'
import { subscriptionStatusMeta, isDunningStatus, DUNNING_STATUSES } from '@/lib/billing-status'

describe('planAllows — single source of truth for tier ordering', () => {
  it('orders basic < pro < premium', () => {
    expect(PLAN_ORDER).toEqual(['basic', 'pro', 'premium'])
  })

  it('a tier always meets its own minimum', () => {
    for (const t of PLAN_ORDER) {
      expect(planAllows(t, t)).toBe(true)
    }
  })

  it('basic is below pro and premium', () => {
    expect(planAllows('basic', 'pro')).toBe(false)
    expect(planAllows('basic', 'premium')).toBe(false)
  })

  it('pro meets pro but not premium', () => {
    expect(planAllows('pro', 'pro')).toBe(true)
    expect(planAllows('pro', 'premium')).toBe(false)
    expect(planAllows('pro', 'basic')).toBe(true)
  })

  it('premium meets every tier', () => {
    expect(planAllows('premium', 'basic')).toBe(true)
    expect(planAllows('premium', 'pro')).toBe(true)
    expect(planAllows('premium', 'premium')).toBe(true)
  })
})

describe('getModuleLabel — for the Plans upgrade panel', () => {
  it('resolves a clinic module label by id', () => {
    expect(getModuleLabel('clinic', 'analytics')).toBe('Analytics')
    expect(getModuleLabel('clinic', 'careers')).toBe('Careers')
    expect(getModuleLabel('clinic', 'integrations')).toBe('Integrations')
  })

  it('resolves by path with or without a leading slash', () => {
    expect(getModuleLabel('clinic', '/analytics')).toBe('Analytics')
    expect(getModuleLabel('clinic', 'seo')).toBe('SEO')
  })

  it('returns null for an unknown module', () => {
    expect(getModuleLabel('clinic', 'not-a-real-module')).toBeNull()
  })
})

describe('subscriptionStatusMeta — tone/label/severity contract', () => {
  it('active is ok/emerald', () => {
    const m = subscriptionStatusMeta('active')
    expect(m.tone).toBe('ok')
    expect(m.severity).toBe('ok')
    expect(m.label).toBe('Active')
  })

  it('trialing is info (ball in their court)', () => {
    expect(subscriptionStatusMeta('trialing').tone).toBe('info')
  })

  it('past_due is warn/amber (needs our action, recoverable)', () => {
    const m = subscriptionStatusMeta('past_due')
    expect(m.tone).toBe('warn')
    expect(m.severity).toBe('warn')
  })

  it('unpaid is urgent/rose', () => {
    const m = subscriptionStatusMeta('unpaid')
    expect(m.tone).toBe('urgent')
    expect(m.severity).toBe('urgent')
  })

  it('canceled is neutral', () => {
    expect(subscriptionStatusMeta('canceled').tone).toBe('neutral')
  })

  it('null/unknown shows no pill (label null)', () => {
    expect(subscriptionStatusMeta(null).label).toBeNull()
    expect(subscriptionStatusMeta('something_weird').label).toBeNull()
  })
})

describe('isDunningStatus — drives the persistent banner', () => {
  it('fires for past_due, unpaid, incomplete_expired', () => {
    expect(DUNNING_STATUSES).toContain('past_due')
    for (const s of DUNNING_STATUSES) expect(isDunningStatus(s)).toBe(true)
  })

  it('does not fire for active/trialing/canceled/null', () => {
    expect(isDunningStatus('active')).toBe(false)
    expect(isDunningStatus('trialing')).toBe(false)
    expect(isDunningStatus('canceled')).toBe(false)
    expect(isDunningStatus(null)).toBe(false)
    expect(isDunningStatus(undefined)).toBe(false)
  })
})
