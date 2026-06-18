import { describe, it, expect, vi, beforeEach } from 'vitest'
import { csvCell, toCsv, csvDollars } from '@/lib/csv'

describe('csv helpers', () => {
  it('quotes cells with commas, quotes, or newlines (RFC 4180) and doubles quotes', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(42)).toBe('42')
  })

  it('builds a CRLF-joined CSV with an escaped header + rows', () => {
    const csv = toCsv(['Name', 'Note'], [['Mia', 'fine'], ['Liam, Jr', 'said "ok"']])
    expect(csv).toBe('Name,Note\r\nMia,fine\r\n"Liam, Jr","said ""ok"""')
  })

  it('formats cents as decimal dollars', () => {
    expect(csvDollars(1490)).toBe('14.90')
    expect(csvDollars(0)).toBe('0.00')
    expect(csvDollars(null)).toBe('0.00')
    expect(csvDollars(99)).toBe('0.99')
  })
})

// ── exportBalancePaymentsCsv (single-query path) ──────────────────────────────
const state = { rows: [] as Record<string, unknown>[] }
vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    for (const m of ['from', 'innerJoin', 'where', 'orderBy']) o[m] = () => o
    o.limit = async () => state.rows
    return o
  }
  return { db: { select: () => chain() }, schema: new Proxy({}, { get: () => ({}) }) }
})
vi.mock('drizzle-orm', () => ({ and: vi.fn(() => ({})), eq: vi.fn(() => ({})), desc: vi.fn((x) => x), ne: vi.fn(() => ({})) }))
vi.mock('@/lib/stripe', () => ({ stripe: {} }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))

import { exportBalancePaymentsCsv } from '@/lib/services/balance-payments'

beforeEach(() => {
  state.rows = []
})

describe('exportBalancePaymentsCsv', () => {
  it('emits just the header row when there are no payments', async () => {
    const csv = await exportBalancePaymentsCsv('org_1')
    expect(csv).toBe('Payment ID,Date,Patient,Amount,Balance at payment,Status,Paid at')
  })

  it('maps a paid payment into a dollar-formatted CSV row', async () => {
    state.rows = [
      {
        id: 'pay_1',
        patientId: 'pat_1',
        firstName: 'Mia',
        lastName: 'Hayes',
        amountCents: 12500,
        status: 'paid',
        paidAt: new Date('2026-06-01T12:00:00.000Z'),
        createdAt: new Date('2026-06-01T11:59:00.000Z'),
        balanceCentsAtPayment: 20000,
      },
    ]
    const csv = await exportBalancePaymentsCsv('org_1')
    const [, row] = csv.split('\r\n')
    expect(row).toContain('pay_1')
    expect(row).toContain('Mia Hayes')
    expect(row).toContain('125.00') // amount
    expect(row).toContain('200.00') // balance at payment
    expect(row).toContain('paid')
    expect(row).toContain('2026-06-01T12:00:00.000Z')
  })
})
