import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { PgDialect } from 'drizzle-orm/pg-core'

const executed: unknown[] = []
let failNext = false
vi.mock('@/lib/db', () => ({
  db: {
    execute: async (q: unknown) => {
      if (failNext) throw new Error('boom')
      executed.push(q)
      return { rows: [] }
    },
  },
  schema: {},
}))

import {
  ATTRIBUTION_WINDOW_DAYS,
  attributeBookingToCampaign,
  buildAttributionStatement,
} from '@/lib/services/campaign-attribution'
import { tallyCampaignFunnel } from '@/lib/services/campaign-funnel'

const dialect = new PgDialect()
const BOOKED_AT = new Date('2026-11-03T15:00:00.000Z')
const render = () => dialect.sqlToQuery(buildAttributionStatement('org_1', 'appt_1', 'pat_1', BOOKED_AT))

beforeEach(() => {
  executed.length = 0
  failNext = false
})

describe('campaign attribution statement (real dialect)', () => {
  it('is one idempotent INSERT…SELECT: identical on a second render, guarded by NOT EXISTS on the appointment', () => {
    const a = render()
    const b = render()
    expect(a.sql).toBe(b.sql)
    expect(a.params).toEqual(b.params)
    expect(a.sql).toMatch(/INSERT INTO campaign_events/)
    expect(a.sql).toMatch(/WHERE NOT EXISTS/)
    expect(a.sql).toMatch(/b\.booked_appointment_id = \$\d+::text/)
    expect(a.sql).toMatch(/ON CONFLICT DO NOTHING/)
  })

  it('types every bound parameter (no 42P18) and scopes both reads by org through campaigns', () => {
    const { sql, params } = render()
    expect(sql.match(/\$\d+(?!\d|::)/g)).toBeNull()
    expect(sql).toMatch(/c\.organization_id = \$\d+::text/)
    expect(sql).toMatch(/bc\.organization_id = \$\d+::text/)
    expect(params).toContain('org_1')
  })

  it('uses only sent/click as the source, inside a 30-day window before the booking', () => {
    const { sql, params } = render()
    expect(sql).toMatch(/ce\.type IN \('sent', 'click'\)/)
    expect(sql).toMatch(/ORDER BY ce\.occurred_at DESC/)
    expect(sql).toMatch(/LIMIT 1/)
    expect(ATTRIBUTION_WINDOW_DAYS).toBe(30)
    const start = new Date(BOOKED_AT.getTime() - 30 * 86_400_000).toISOString()
    expect(params).toContain(start)
    expect(params).toContain(BOOKED_AT.toISOString())
  })
})

describe('attributeBookingToCampaign', () => {
  it('issues exactly one statement per call', async () => {
    await attributeBookingToCampaign('org_1', 'appt_1', 'pat_1', BOOKED_AT)
    expect(executed).toHaveLength(1)
  })

  it('never throws — a failed attribution cannot fail the booking', async () => {
    failNext = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(attributeBookingToCampaign('org_1', 'appt_1', 'pat_1', BOOKED_AT)).resolves.toBeUndefined()
    warn.mockRestore()
  })
})

describe('the funnel counts people, not booked rows', () => {
  it('two booked rows for one patient in one campaign are one person', () => {
    const f = tallyCampaignFunnel([
      { type: 'booked', campaignId: 1, patientId: 'pat_1', id: 1 },
      { type: 'booked', campaignId: 1, patientId: 'pat_1', id: 2 },
      { type: 'booked', campaignId: 1, patientId: 'pat_2', id: 3 },
    ])
    expect(f.booked).toBe(2)
  })
})

describe('the three doors are wired', () => {
  it.each(['lib/services/appointments.ts', 'lib/services/booking.ts', 'lib/services/pms/sync.ts'])(
    '%s calls attributeBookingToCampaign',
    (file) => {
      expect(readFileSync(file, 'utf8')).toMatch(/attributeBookingToCampaign\(/)
    },
  )
})
