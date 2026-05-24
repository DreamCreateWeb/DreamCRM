import { describe, it, expect, vi, beforeEach } from 'vitest'

// We mock the SQL execution at the chain leaves — each test pre-populates
// the rows that the next select/insert/update will return.
interface CallStub {
  selectRows?: unknown[]
  selectMap?: Map<string, unknown[]> // dispatch by groupBy key
}

const state: {
  inserts: Array<{ table: string; values: Record<string, unknown> }>
  updates: Array<{ table: string; set: Record<string, unknown>; id: string | null }>
  deletes: string[]
  // queueing: services call select() multiple times — push rows in order
  selectQueue: unknown[][]
} = {
  inserts: [],
  updates: [],
  deletes: [],
  selectQueue: [],
}

// Walk the eq() clause (Drizzle SQL chunks have circular refs, so JSON.stringify
// won't work) and find the first string param value — that's the bound id.
function literalFrom(clause: unknown): string | null {
  const seen = new Set<unknown>()
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string') return v
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (typeof obj.value === 'string') return obj.value as string
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return null
}

vi.mock('@/lib/db', async () => {
  const platform = await import('@/lib/db/schema/platform')
  const auth = await import('@/lib/db/schema/auth')
  const tableName = (t: unknown) => {
    if (t === platform.agencyProject) return 'agency_project'
    if (t === platform.clinicProfile) return 'clinic_profile'
    if (t === auth.organization) return 'organization'
    return 'unknown'
  }

  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.groupBy = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }

  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: (vals: Record<string, unknown>) => ({
          returning: async () => {
            state.inserts.push({ table: tableName(t), values: vals })
            return [{ ...vals }]
          },
        }),
      }),
      update: (t: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: async (clause: unknown) => {
            state.updates.push({ table: tableName(t), set, id: literalFrom(clause) })
          },
        }),
      }),
      delete: (t: unknown) => ({
        where: async (clause: unknown) => {
          state.deletes.push(literalFrom(clause) ?? '')
          return { table: tableName(t) }
        },
      }),
    },
  }
})

import {
  createProject,
  updateProject,
  deleteProject,
  getProjectStats,
  getSubscriptionStats,
  listActiveProjectsForOrg,
} from '@/lib/services/projects'

beforeEach(() => {
  state.inserts.length = 0
  state.updates.length = 0
  state.deletes.length = 0
  state.selectQueue.length = 0
})

describe('createProject', () => {
  it('requires a non-empty title', async () => {
    await expect(createProject({ type: 'website', title: '   ' })).rejects.toThrow(/title/i)
  })

  it('coerces unknown types and statuses to safe defaults', async () => {
    await createProject({ type: 'bogus' as never, title: 'X', status: 'launched' as never })
    expect(state.inserts).toHaveLength(1)
    const v = state.inserts[0].values
    expect(v.type).toBe('other')
    expect(v.status).toBe('lead')
  })

  it('persists the canonical project types', async () => {
    for (const t of ['website', 'ecommerce', 'intake_form', 'videography', 'photography'] as const) {
      await createProject({ type: t, title: 'X' })
    }
    const types = state.inserts.map((i) => i.values.type)
    expect(types).toEqual(['website', 'ecommerce', 'intake_form', 'videography', 'photography'])
  })

  it('sets startedAt when status is in_progress', async () => {
    await createProject({ type: 'website', title: 'X', status: 'in_progress' })
    expect(state.inserts[0].values.startedAt).toBeInstanceOf(Date)
    expect(state.inserts[0].values.completedAt).toBeNull()
  })

  it('sets completedAt when status is completed at creation', async () => {
    await createProject({ type: 'photography', title: 'X', status: 'completed' })
    expect(state.inserts[0].values.completedAt).toBeInstanceOf(Date)
  })

  it('leaves startedAt/completedAt null for early statuses', async () => {
    await createProject({ type: 'website', title: 'X', status: 'lead' })
    expect(state.inserts[0].values.startedAt).toBeNull()
    expect(state.inserts[0].values.completedAt).toBeNull()
  })

  it('trims title and stores empty description as null', async () => {
    await createProject({ type: 'website', title: '  Hello  ', description: '   ' })
    expect(state.inserts[0].values.title).toBe('Hello')
    expect(state.inserts[0].values.description).toBeNull()
  })
})

describe('updateProject', () => {
  it('only sets supplied fields plus updatedAt', async () => {
    await updateProject('p_1', { title: 'New Title' })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set.title).toBe('New Title')
    expect(state.updates[0].set.updatedAt).toBeInstanceOf(Date)
    expect(state.updates[0].set.description).toBeUndefined()
  })

  it('writes completedAt when transitioning to completed', async () => {
    await updateProject('p_1', { status: 'completed' })
    expect(state.updates[0].set.completedAt).toBeInstanceOf(Date)
  })

  it('clears completedAt when moving away from completed', async () => {
    await updateProject('p_1', { status: 'in_progress' })
    expect(state.updates[0].set.completedAt).toBeNull()
  })

  it('coerces unknown statuses', async () => {
    await updateProject('p_1', { status: 'wat' as never })
    expect(state.updates[0].set.status).toBe('lead')
  })
})

describe('deleteProject', () => {
  it('deletes by id', async () => {
    await deleteProject('p_42')
    expect(state.deletes).toContain('p_42')
  })
})

describe('listActiveProjectsForOrg', () => {
  it('returns the rows from the chain', async () => {
    state.selectQueue.push([
      { id: 'p_1', status: 'in_progress' },
      { id: 'p_2', status: 'review' },
    ])
    const rows = await listActiveProjectsForOrg('org_1')
    expect(rows).toHaveLength(2)
  })
})

describe('getProjectStats', () => {
  it('aggregates totals, by-status, by-type, and recent rows', async () => {
    // 1. totals
    state.selectQueue.push([
      {
        total: 8,
        open: 5,
        completedMonth: 2,
        pipelineValue: 75_000_00,
        completedValue: 30_000_00,
      },
    ])
    // 2. statusRows
    state.selectQueue.push([
      { status: 'in_progress', count: 3 },
      { status: 'review', count: 2 },
      { status: 'completed', count: 2 },
      { status: 'lead', count: 1 },
    ])
    // 3. typeRows
    state.selectQueue.push([
      { type: 'videography', count: 3 },
      { type: 'website', count: 2 },
      { type: 'ecommerce', count: 2 },
      { type: 'photography', count: 1 },
    ])
    // 4. recentRows
    state.selectQueue.push([
      { id: 'p_1', title: 'Smile Spa rebrand video', type: 'videography', status: 'in_progress', updatedAt: new Date(), clinicName: 'Smile Spa' },
    ])

    const stats = await getProjectStats()
    expect(stats.totalProjects).toBe(8)
    expect(stats.openProjects).toBe(5)
    expect(stats.completedThisMonth).toBe(2)
    expect(stats.pipelineValueCents).toBe(7_500_000)
    expect(stats.byStatus.in_progress).toBe(3)
    expect(stats.byStatus.review).toBe(2)
    expect(stats.byStatus.on_hold).toBe(0) // default 0 for unseen statuses
    expect(stats.byType.videography).toBe(3)
    expect(stats.byType.intake_form).toBe(0)
    expect(stats.recentlyUpdated).toHaveLength(1)
    expect(stats.recentlyUpdated[0].clinicName).toBe('Smile Spa')
  })

  it('handles empty state without throwing', async () => {
    state.selectQueue.push([]) // totals
    state.selectQueue.push([]) // statusRows
    state.selectQueue.push([]) // typeRows
    state.selectQueue.push([]) // recentRows
    const stats = await getProjectStats()
    expect(stats.totalProjects).toBe(0)
    expect(stats.openProjects).toBe(0)
    expect(stats.recentlyUpdated).toHaveLength(0)
  })
})

describe('graceful degradation when migrations are pending', () => {
  it('getProjectStats returns empty stats when table is missing', async () => {
    const { db } = await import('@/lib/db')
    const original = db.select
    const err = Object.assign(new Error('relation "agency_project" does not exist'), {
      code: '42P01',
    })
    ;(db as { select: () => unknown }).select = () => {
      throw err
    }
    try {
      const stats = await getProjectStats()
      expect(stats.totalProjects).toBe(0)
      expect(stats.recentlyUpdated).toHaveLength(0)
      expect(stats.byStatus.lead).toBe(0)
    } finally {
      ;(db as { select: unknown }).select = original
    }
  })

  it('listActiveProjectsForOrg returns [] when table is missing', async () => {
    const { db } = await import('@/lib/db')
    const original = db.select
    const err = Object.assign(new Error('relation "agency_project" does not exist'), {
      code: '42P01',
    })
    ;(db as { select: () => unknown }).select = () => {
      throw err
    }
    try {
      const rows = await listActiveProjectsForOrg('org_1')
      expect(rows).toEqual([])
    } finally {
      ;(db as { select: unknown }).select = original
    }
  })

  it('still rethrows non-schema errors', async () => {
    const { db } = await import('@/lib/db')
    const original = db.select
    ;(db as { select: () => unknown }).select = () => {
      throw new Error('connection refused')
    }
    try {
      await expect(getProjectStats()).rejects.toThrow(/connection refused/)
    } finally {
      ;(db as { select: unknown }).select = original
    }
  })
})

describe('getSubscriptionStats', () => {
  it('computes MRR from active clinics at each tier', async () => {
    state.selectQueue.push([
      { planTier: 'basic', count: 2 },
      { planTier: 'pro', count: 3 },
      { planTier: 'premium', count: 1 },
    ])
    state.selectQueue.push([{ count: 4 }])
    const stats = await getSubscriptionStats()
    expect(stats.activeClinics).toBe(6)
    expect(stats.byTier).toEqual({ basic: 2, pro: 3, premium: 1 })
    // 2 × $99 + 3 × $149 + 1 × $199 = 198 + 447 + 199 = 844 → 84400 cents
    expect(stats.monthlyRecurringCents).toBe(2 * 9900 + 3 * 14900 + 1 * 19900)
    expect(stats.newClinics30d).toBe(4)
  })

  it('returns zeros when no clinics are active', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([{ count: 0 }])
    const stats = await getSubscriptionStats()
    expect(stats.activeClinics).toBe(0)
    expect(stats.monthlyRecurringCents).toBe(0)
  })
})
