/**
 * The Action Ledger service — the fire-and-forget contract. The one law that
 * makes it safe to sprinkle recordAction into every automation: bookkeeping
 * can NEVER break the action it describes. A reminder that already went out
 * must not throw because the ledger insert hiccuped.
 *
 * Plus the read half (the narrator's raw material): the limit clamp and the
 * count mapping run for real; org scoping is pinned on the source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const insertMock = vi.fn()
const readState = {
  limits: [] as number[],
  rows: [] as unknown[],
}
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: (...a: unknown[]) => insertMock(...a) }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (n: number) => {
              readState.limits.push(n)
              return readState.rows
            },
          }),
          groupBy: async () => readState.rows,
        }),
      }),
    }),
  },
}))

import { recordAction, listRecentActions, countActionsSince } from '@/lib/services/action-ledger'

beforeEach(() => {
  insertMock.mockReset()
  readState.limits = []
  readState.rows = []
})

describe('recordAction', () => {
  it('writes the row and resolves true', async () => {
    insertMock.mockResolvedValueOnce(undefined)
    const ok = await recordAction({
      organizationId: 'org_1',
      capability: 'appointment_reminder',
      patientId: 'pat_1',
      summary: 'Reminded Maria about Tue, Jul 28, 2:00 PM',
      detail: { channel: 'email' },
    })
    expect(ok).toBe(true)
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>
    expect(row.organizationId).toBe('org_1')
    expect(row.capability).toBe('appointment_reminder')
    expect(row.patientId).toBe('pat_1')
    expect(String(row.id)).toMatch(/^act_/)
  })

  it('NEVER throws when the insert fails — the action it describes already happened', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertMock.mockRejectedValueOnce(new Error('db down'))
    const ok = await recordAction({
      organizationId: 'org_1',
      capability: 'review_request',
      summary: 'Asked Rob for a Google review after their visit',
    })
    expect(ok).toBe(false)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('omits patientId/detail cleanly when not provided', async () => {
    insertMock.mockResolvedValueOnce(undefined)
    await recordAction({
      organizationId: 'org_1',
      capability: 'campaign_send',
      summary: 'Sent “Spring recall” to 41 people',
    })
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>
    expect(row.patientId).toBeNull()
    expect(row.detail).toBeNull()
  })
})

describe('the read half', () => {
  it('listRecentActions defaults to 100 and clamps runaway limits at 500', async () => {
    await listRecentActions('org_1')
    await listRecentActions('org_1', { limit: 10_000 })
    await listRecentActions('org_1', { limit: 25 })
    expect(readState.limits).toEqual([100, 500, 25])
  })

  it('countActionsSince maps grouped rows to a plain capability→count record', async () => {
    readState.rows = [
      { capability: 'appointment_reminder', c: 41 },
      { capability: 'review_request', c: '6' }, // pg count can arrive as a string
    ]
    const counts = await countActionsSince('org_1', new Date('2026-07-20'))
    expect(counts).toEqual({ appointment_reminder: 41, review_request: 6 })
  })

  it('both readers are org-scoped at the query (pinned on the source)', () => {
    const src = readFileSync(resolve(__dirname, '../../lib/services/action-ledger.ts'), 'utf8')
    const scoped = src.match(/eq\(schema\.actionLedger\.organizationId, (organizationId|input\.organizationId)\)/g) ?? []
    expect(scoped.length).toBeGreaterThanOrEqual(2)
  })

  it('the time windows are laws too — dropping either gte turns "this week" into "all time" (round-4 pin)', () => {
    const src = readFileSync(resolve(__dirname, '../../lib/services/action-ledger.ts'), 'utf8')
    expect(src).toMatch(/gte\(schema\.actionLedger\.occurredAt, opts\.since\)/)
    expect(src).toMatch(/countActionsSince[\s\S]*?gte\(schema\.actionLedger\.occurredAt, since\)/)
  })
})
