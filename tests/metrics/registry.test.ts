import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/services/recall-stats', () => ({ getRecallStats: vi.fn() }))
vi.mock('@/lib/services/pms-link', () => ({ getPmsLink: vi.fn() }))
vi.mock('@/lib/services/platform-metrics', () => ({ getMrrSnapshot: vi.fn() }))

import { METRICS, METRIC_KEYS, metricsFor, SERIES_FLOOR } from '@/lib/metrics-registry'
import { ORG_READERS, PLATFORM_READERS } from '@/lib/services/metric-readers'

describe('metric registry', () => {
  it('names the metrics the punch list asks for', () => {
    expect(METRIC_KEYS.length).toBeGreaterThanOrEqual(12)
    for (const k of ['recall_due_reachable', 'recall_sent', 'recall_opened', 'recall_booked', 'reviews_requested', 'reviews_received', 'new_patients', 'visits', 'bookings', 'revenue_collected', 'outstanding_balance', 'mrr', 'active_clinics', 'hunt_sent']) {
      expect(METRIC_KEYS, k).toContain(k)
    }
  })

  it('every metric has a reader in the map its scope names, and a label, granularity, unit and kind', () => {
    for (const k of METRIC_KEYS) {
      const def = METRICS[k]
      expect(def.label.length, k).toBeGreaterThan(0)
      expect(['day', 'hour']).toContain(def.granularity)
      expect(['org', 'platform']).toContain(def.scope)
      expect(['count', 'cents']).toContain(def.unit)
      expect(['flow', 'stock']).toContain(def.kind)
      const map = def.scope === 'org' ? ORG_READERS : PLATFORM_READERS
      expect(typeof (map as Record<string, unknown>)[k], `${k} reader`).toBe('function')
    }
  })

  it('has no reader without a registry entry', () => {
    for (const k of [...Object.keys(ORG_READERS), ...Object.keys(PLATFORM_READERS)]) expect(METRIC_KEYS).toContain(k)
  })

  it('only platform metrics are hourly (a clinic has no hourly series)', () => {
    expect(metricsFor('org', 'hour')).toEqual([])
    expect(metricsFor('platform', 'hour')).toEqual(['hunt_sent'])
  })

  it('PMS-sourced metrics say so', () => {
    expect(METRICS.outstanding_balance.needsPms).toBe(true)
  })

  it('the floor is 14 days', () => {
    expect(SERIES_FLOOR).toBe(14)
  })
})
