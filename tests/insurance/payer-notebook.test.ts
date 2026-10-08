import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EMPTY_PAYER_NOTE, payerNoteHasContent, payerNoteKey, validatePayerNote } from '@/lib/payer-notebook'

/**
 * THE PAYER NOTEBOOK (2026-10-08): the practice's own facts about a payer,
 * written once per clinic per payer. The pure half (the key, the validator)
 * and the server half (every read and write carries the org id; the write
 * is an upsert on org + key, never a second row).
 */

describe('payerNoteKey', () => {
  it('prefers the clearinghouse payer id, exactly, case-folded', () => {
    expect(payerNoteKey('amtas00425', 'Ameritas')).toBe('id:AMTAS00425')
    expect(payerNoteKey(' 77777 ', null)).toBe('id:77777')
  })
  it('falls back to the normalised name so spelling and punctuation land on one row', () => {
    expect(payerNoteKey(null, 'Delta Dental of CA')).toBe('name:deltadentalofca')
    expect(payerNoteKey('', 'delta dental of ca.')).toBe('name:deltadentalofca')
  })
  it('is null with neither — the notebook needs a payer', () => {
    expect(payerNoteKey(null, '')).toBeNull()
    expect(payerNoteKey(undefined, '  ')).toBeNull()
  })
})

describe('validatePayerNote', () => {
  it('trims, caps and nulls empties; nothing is required', () => {
    const v = validatePayerNote({ feeSchedule: '  PPO ', network: '', paysOn: 'seat', claimsAddress: '', phone: ' 800-555-0147 ', notes: 'x'.repeat(2000) })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.fields).toEqual({ feeSchedule: 'PPO', network: null, paysOn: 'seat', claimsAddress: null, phone: '800-555-0147', notes: 'x'.repeat(1000) })
    expect(validatePayerNote(null)).toEqual({ ok: true, fields: EMPTY_PAYER_NOTE })
  })
  it('refuses a network or pays-on value outside the two words', () => {
    expect(validatePayerNote({ network: 'maybe' })).toMatchObject({ ok: false })
    expect(validatePayerNote({ paysOn: 'later' })).toMatchObject({ ok: false })
  })
  it('payerNoteHasContent is false for an empty note', () => {
    expect(payerNoteHasContent(EMPTY_PAYER_NOTE)).toBe(false)
    expect(payerNoteHasContent({ ...EMPTY_PAYER_NOTE, phone: '1' })).toBe(true)
    expect(payerNoteHasContent(null)).toBe(false)
  })
})

// ── The server half ───────────────────────────────────────────────────────

const state = {
  wheres: [] as unknown[],
  rows: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<{ values: Record<string, unknown>; conflict: { target: unknown; set: Record<string, unknown> } | null }>,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    db: {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: (clause: unknown) => {
              state.wheres.push(clause)
              return { limit: async () => state.rows }
            },
          }),
        }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async (conflict: { target: unknown; set: Record<string, unknown> }) => {
            state.inserts.push({ values, conflict })
          },
        }),
      }),
    },
    schema,
  }
})

import { getPayerNote, savePayerNote } from '@/lib/services/insurance-eligibility/payer-notebook'

function sqlText(clause: unknown): string {
  const parts: string[] = []
  const seen = new Set<unknown>()
  const walk = (v: unknown) => {
    if (v == null || seen.has(v)) return
    if (typeof v !== 'object') {
      parts.push(String(v))
      return
    }
    seen.add(v)
    for (const x of Object.values(v as Record<string, unknown>)) walk(x)
  }
  walk(clause)
  return parts.join('|')
}

beforeEach(() => {
  state.wheres = []
  state.rows = []
  state.inserts = []
})

const NOW = new Date('2026-10-08T15:00:00Z')

describe('payer notebook service', () => {
  it('getPayerNote carries the org id AND the payer key, and maps the row with the writer’s name', async () => {
    state.rows = [
      {
        note: { id: 'pnote_1', organizationId: 'org_a', payerKey: 'id:77777', payerId: '77777', payerName: 'Delta Dental of California', feeSchedule: 'PPO', network: 'in', paysOn: 'seat', claimsAddress: null, phone: null, notes: null, updatedByUserId: 'u_1', createdAt: NOW, updatedAt: NOW },
        updatedByName: 'Mary',
      },
    ]
    const n = await getPayerNote('org_a', '77777', 'Delta Dental of California')
    expect(sqlText(state.wheres[0])).toContain('org_a')
    expect(sqlText(state.wheres[0])).toContain('id:77777')
    expect(n).toMatchObject({ id: 'pnote_1', payerKey: 'id:77777', feeSchedule: 'PPO', network: 'in', paysOn: 'seat', updatedByName: 'Mary', updatedAtIso: NOW.toISOString() })
  })

  it('an unidentifiable payer reads as nothing and touches no table', async () => {
    expect(await getPayerNote('org_a', null, '')).toBeNull()
    expect(state.wheres).toHaveLength(0)
  })

  it('savePayerNote upserts on (org, payer key) — the org id is on the row and the conflict set never moves it', async () => {
    await savePayerNote({
      organizationId: 'org_a',
      payerId: null,
      payerName: 'Delta Dental of CA',
      fields: { feeSchedule: 'Premier', network: 'out', paysOn: 'prep', claimsAddress: 'PO Box 1', phone: '800', notes: 'Call before 3' },
      userId: 'u_1',
      now: NOW,
    })
    expect(state.inserts).toHaveLength(1)
    const { values, conflict } = state.inserts[0]
    expect(values).toMatchObject({ organizationId: 'org_a', payerKey: 'name:deltadentalofca', payerId: null, payerName: 'Delta Dental of CA', feeSchedule: 'Premier', network: 'out', paysOn: 'prep', updatedByUserId: 'u_1' })
    expect(conflict!.set).toMatchObject({ feeSchedule: 'Premier', network: 'out', paysOn: 'prep', claimsAddress: 'PO Box 1', phone: '800', notes: 'Call before 3', updatedByUserId: 'u_1' })
    expect(Object.keys(conflict!.set)).not.toContain('organizationId')
    expect(Object.keys(conflict!.set)).not.toContain('payerKey')
    // A tenant-scoped read follows the write.
    expect(sqlText(state.wheres[0])).toContain('org_a')
  })

  it('a stored value outside the two words reads as null — never a third state on the sheet', async () => {
    state.rows = [{ note: { id: 'p', organizationId: 'org_a', payerKey: 'id:1', payerId: '1', payerName: 'X', feeSchedule: null, network: 'sideways', paysOn: 'never', claimsAddress: null, phone: null, notes: null, updatedByUserId: null, createdAt: NOW, updatedAt: NOW }, updatedByName: null }]
    const n = await getPayerNote('org_a', '1', 'X')
    expect(n).toMatchObject({ network: null, paysOn: null, updatedByName: null })
  })
})
