import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The /appointments URL seam, EXECUTED (round-5 close-out). Round 4 pinned the
 * page's parseAttention by source-slicing; these tests actually run it — and
 * run the CSV export route's query parsing — against the single-home
 * APPT_ATTENTION_KEYS registry, so a locally-copied vocabulary list can never
 * silently drop a key again (the export route's copy was missing 'unmarked':
 * the Overview catch-net's "download the call sheet" flow exported the whole
 * window instead of the filtered one).
 */

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
  })),
  getTenantContext: vi.fn(async () => ({
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
  })),
}))

const svc = vi.hoisted(() => ({
  listAppointments: vi.fn(async () => []),
  getAppointmentFilterMeta: vi.fn(async () => ({ providers: [], sources: [] })),
  groupByDay: vi.fn(() => []),
  exportAppointmentsCsv: vi.fn(async (..._a: unknown[]) => 'csv'),
}))
vi.mock('@/lib/services/appointments', () => svc)
vi.mock('@/lib/services/saved-views', () => ({ listSavedViews: vi.fn(async () => []) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/New_York') }))
vi.mock('@/lib/services/appointment-waitlist', () => ({ listWaitlist: vi.fn(async () => []) }))

import { parseAttention } from '@/app/(default)/appointments/page'
import { GET as exportGET } from '@/app/(default)/appointments/export/route'
import { APPT_ATTENTION_KEYS } from '@/lib/types/appointment-views'

beforeEach(() => {
  svc.exportAppointmentsCsv.mockClear()
})

describe('parseAttention (the page URL parser, executed)', () => {
  it('passes through EVERY registry key — including unmarked (registry-driven, so a new key is covered automatically)', () => {
    for (const key of APPT_ATTENTION_KEYS) {
      expect(parseAttention(key), key).toEqual([key])
    }
  })

  it('parses comma-joined lists and drops junk', () => {
    expect(parseAttention('unmarked,bogus,unconfirmed')).toEqual(['unmarked', 'unconfirmed'])
  })

  it('handles missing / array-shaped params', () => {
    expect(parseAttention(undefined)).toEqual([])
    expect(parseAttention(['unmarked'])).toEqual([])
    expect(parseAttention('')).toEqual([])
  })
})

describe('GET /appointments/export (the CSV route, executed)', () => {
  function req(qs: string): NextRequest {
    return new NextRequest(`https://app.example/appointments/export${qs}`)
  }

  it("forwards EVERY registry attention key to the export — 'unmarked' included (its local copy once dropped it)", async () => {
    for (const key of APPT_ATTENTION_KEYS) {
      svc.exportAppointmentsCsv.mockClear()
      const res = await exportGET(req(`?window=past_30d&attention=${key}`))
      expect(res.status).toBe(200)
      const [, filters] = svc.exportAppointmentsCsv.mock.calls[0] as [string, { attention: string[] }]
      expect(filters.attention, key).toEqual([key])
    }
  })

  it('drops junk keys but keeps valid ones from a mixed list', async () => {
    await exportGET(req('?window=past_30d&attention=unmarked,bogus,no_show'))
    const [, filters] = svc.exportAppointmentsCsv.mock.calls[0] as [string, { attention: string[] }]
    expect(filters.attention).toEqual(['unmarked', 'no_show'])
  })

  it('falls back to the default window on junk and 404s a non-clinic context', async () => {
    await exportGET(req('?window=bogus'))
    const [, filters] = svc.exportAppointmentsCsv.mock.calls[0] as [string, { window: string }]
    expect(filters.window).toBe('next_14d')

    const { getTenantContext } = await import('@/lib/auth/context')
    ;(getTenantContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tenantType: 'platform' })
    const res = await exportGET(req(''))
    expect(res.status).toBe(404)
  })
})
