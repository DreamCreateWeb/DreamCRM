/**
 * Unit tests for the Checkpoint 1B platform-admin approve/reject service
 * functions in `lib/services/service-library.ts`. The DB is fully mocked —
 * we assert each call's SET payload and the result-shape returned.
 *
 * Gating to platform admin happens in the route's `admin-actions.ts`, not in
 * the service module — these functions are pure mutation helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type SetCall = {
  status?: string
  reviewNotes?: string | null
  updatedAt?: Date
}

const state: {
  setCalls: SetCall[]
  returningRows: Array<{ slug: string }>
  throwOnUpdate: boolean
} = { setCalls: [], returningRows: [], throwOnUpdate: false }

vi.mock('@/lib/db', () => {
  const chain: () => any = () => {
    const obj: any = {}
    obj.set = (payload: SetCall) => {
      state.setCalls.push(payload)
      return obj
    }
    obj.where = () => obj
    obj.returning = async () => {
      if (state.throwOnUpdate) throw new Error('boom')
      return state.returningRows
    }
    return obj
  }
  return {
    db: {
      update: () => chain(),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
    },
  }
})

import {
  approveLibraryEntry,
  rejectLibraryEntry,
} from '@/lib/services/service-library'

beforeEach(() => {
  state.setCalls = []
  state.returningRows = []
  state.throwOnUpdate = false
})

describe('approveLibraryEntry', () => {
  it('flips status to active and stores the review note', async () => {
    state.returningRows = [{ slug: 'same-day-crowns' }]
    const out = await approveLibraryEntry('same-day-crowns', 'Great fit, approved.')
    expect(out.ok).toBe(true)
    expect(state.setCalls).toHaveLength(1)
    expect(state.setCalls[0].status).toBe('active')
    expect(state.setCalls[0].reviewNotes).toBe('Great fit, approved.')
    expect(state.setCalls[0].updatedAt).toBeInstanceOf(Date)
  })

  it('stores null when no review note is provided', async () => {
    state.returningRows = [{ slug: 'foo' }]
    const out = await approveLibraryEntry('foo')
    expect(out.ok).toBe(true)
    expect(state.setCalls[0].reviewNotes).toBeNull()
  })

  it('returns ok=false when the entry does not exist', async () => {
    state.returningRows = []
    const out = await approveLibraryEntry('missing')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/not found/i)
  })

  it('returns ok=false when the DB call throws', async () => {
    state.throwOnUpdate = true
    const out = await approveLibraryEntry('foo')
    expect(out.ok).toBe(false)
  })
})

describe('rejectLibraryEntry', () => {
  it('requires a non-empty review note', async () => {
    const out = await rejectLibraryEntry('foo', '   ')
    expect(out.ok).toBe(false)
    expect(state.setCalls).toHaveLength(0)
  })

  it('flips status to archived and stores the note', async () => {
    state.returningRows = [{ slug: 'foo' }]
    const out = await rejectLibraryEntry('foo', 'Off-topic.')
    expect(out.ok).toBe(true)
    expect(state.setCalls[0].status).toBe('archived')
    expect(state.setCalls[0].reviewNotes).toBe('Off-topic.')
  })

  it('returns ok=false when the entry does not exist', async () => {
    state.returningRows = []
    const out = await rejectLibraryEntry('missing', 'reason')
    expect(out.ok).toBe(false)
  })
})
