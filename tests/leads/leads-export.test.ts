/**
 * exportLeadsCsv — the lead queue as a CSV. Pins the header row + the LeadRow→
 * cell mapping (status / source / utm / preferred date / created) and that a
 * value containing a comma is RFC-4180 quoted. Runs the real listLeads against a
 * mocked db so the column set can't drift from the table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { rows: [] as Array<Record<string, unknown>> }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.leftJoin = () => o
    o.where = () => o
    o.orderBy = async () => state.rows
    return o
  }
  return { db: { select: () => chain() }, schema: { lead: {}, patient: {} } }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  asc: (x: unknown) => x,
  count: () => ({ count: true }),
  desc: (x: unknown) => x,
  eq: (...a: unknown[]) => ({ a }),
  isNull: (x: unknown) => x,
  or: (...a: unknown[]) => ({ a }),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }), {}),
}))

import { exportLeadsCsv } from '@/lib/services/leads'

beforeEach(() => { state.rows = [] })

describe('exportLeadsCsv', () => {
  it('emits a header row + a mapped, comma-escaped data row', async () => {
    state.rows = [
      {
        id: 'l1', name: 'Mia, Hayes', email: 'mia@example.com', phone: '555-1212',
        preferredDate: '2026-07-01', message: 'hi', sourcePage: '/book', referrer: 'google',
        utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'summer', status: 'new',
        convertedToPatientId: null, contactedAt: null, convertedAt: null, archivedAt: null,
        archivedReason: null, createdAt: new Date('2026-06-15T10:00:00Z'),
        convertedPatientFirstName: null, convertedPatientLastName: null,
      },
    ]
    const csv = await exportLeadsCsv('org_1', { status: 'new' })
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('Name,Email,Phone,Status,Source,Referrer,UTM source,UTM campaign,Preferred date,Created')
    // Name has a comma → quoted; the rest map straight through.
    expect(lines[1]).toBe('"Mia, Hayes",mia@example.com,555-1212,new,/book,google,google,summer,2026-07-01,2026-06-15')
  })

  it('returns just the header for an empty queue', async () => {
    state.rows = []
    const csv = await exportLeadsCsv('org_1', {})
    expect(csv.trimEnd()).toBe('Name,Email,Phone,Status,Source,Referrer,UTM source,UTM campaign,Preferred date,Created')
  })
})
