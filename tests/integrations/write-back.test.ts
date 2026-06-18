import { describe, it, expect, vi, beforeEach } from 'vitest'

// Table-routed db mock (mirrors tests/leads/convert.test.ts): each select is
// served from a per-table queue; inserts/updates are captured. Lets us script
// the two-way write-back path precisely. Real drizzle-orm runs on proxy column
// tokens (never executed — the mock intercepts).
type Row = Record<string, unknown>
const state = {
  selects: {} as Record<string, Row[][]>,
  inserts: [] as { table: string; values: unknown }[],
  updates: [] as { table: string; set: Row }[],
}
function nextSelect(table: string): Row[] {
  const q = state.selects[table]
  return q && q.length ? q.shift()! : []
}
function tableName(t: unknown): string {
  return String(t)
}
function makeDb() {
  return {
    select: () => {
      let table = ''
      const chain: Record<string, unknown> = {}
      chain.from = (t: unknown) => {
        table = tableName(t)
        return chain
      }
      chain.where = () => chain
      chain.orderBy = () => chain
      chain.groupBy = () => chain
      chain.limit = () => chain
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(nextSelect(table))
      return chain
    },
    insert: (t: unknown) => ({
      values: (v: unknown) => {
        state.inserts.push({ table: tableName(t), values: v })
        const ret: Record<string, unknown> = {
          onConflictDoUpdate: () => Promise.resolve(),
          onConflictDoNothing: () => Promise.resolve(),
        }
        ;(ret as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(undefined)
        return ret
      },
    }),
    update: (t: unknown) => ({
      set: (s: Row) => ({
        where: () => {
          state.updates.push({ table: tableName(t), set: s })
          return Promise.resolve()
        },
      }),
    }),
  }
}
vi.mock('@/lib/db', () => {
  const schema = new Proxy(
    {},
    {
      get: (_t, prop) => {
        const name = String(prop)
        return new Proxy(
          {},
          { get: (_x, p) => (p === Symbol.toPrimitive || p === 'toString' || p === 'valueOf' ? () => name : {}) },
        )
      },
    },
  )
  return { db: makeDb(), schema }
})

import { queueAppointmentWriteBack, queueAppointmentStatusWriteBack, retryPendingWrites } from '@/lib/services/pms/sync'

function queue(table: string, ...results: Row[][]) {
  ;(state.selects[table] ??= []).push(...results)
}
function writeOpInserts() {
  return state.inserts.filter((i) => i.table === 'pmsWriteOp')
}
function makeFakeClient() {
  return {
    id: 'open_dental' as const,
    testConnection: vi.fn(async () => ({ ok: true })),
    listProviders: vi.fn(async () => []),
    listPatients: vi.fn(async () => []),
    listAppointments: vi.fn(async () => []),
    createPatient: vi.fn(async (_p: unknown) => ({ externalId: 'od-pat-X' })),
    createAppointment: vi.fn(async (_p: unknown) => ({ externalId: 'od-apt-X' })),
    updateAppointment: vi.fn(async (_e: unknown, _c: unknown) => {}),
  }
}
// Cast the mock to the provider-client param type only at the call boundary,
// so the `.mock` assertions on each vi.fn stay typed in the test body.
function asClient(c: ReturnType<typeof makeFakeClient>) {
  return c as unknown as Parameters<typeof retryPendingWrites>[1]
}

beforeEach(() => {
  state.selects = {}
  state.inserts.length = 0
  state.updates.length = 0
})

describe('queueAppointmentWriteBack — gating + idempotency', () => {
  it('queues a pending write_op when two-way + connected + unmapped + no existing op', async () => {
    queue('pmsConnection', [{ organizationId: 'org1', provider: 'open_dental', status: 'connected', syncDirection: 'two_way', autoSyncEnabled: 1 }])
    queue('pmsEntityMap', []) // not yet mapped
    queue('pmsWriteOp', []) // no existing op
    await queueAppointmentWriteBack('org1', 'apt1')
    const ops = writeOpInserts()
    expect(ops).toHaveLength(1)
    const v = ops[0].values as Row
    expect(v.status).toBe('pending')
    expect(v.entityType).toBe('appointment')
    expect(v.internalId).toBe('apt1')
  })

  it('no-ops when the connection is import-only', async () => {
    queue('pmsConnection', [{ provider: 'open_dental', status: 'connected', syncDirection: 'import' }])
    await queueAppointmentWriteBack('org1', 'apt1')
    expect(writeOpInserts()).toHaveLength(0)
  })

  it('no-ops when no PMS is connected', async () => {
    queue('pmsConnection', []) // null
    await queueAppointmentWriteBack('org1', 'apt1')
    expect(writeOpInserts()).toHaveLength(0)
  })

  it('no-ops when the appointment is already mapped (idempotent)', async () => {
    queue('pmsConnection', [{ provider: 'open_dental', status: 'connected', syncDirection: 'two_way' }])
    queue('pmsEntityMap', [{ externalId: 'od-apt-1' }]) // already pushed
    await queueAppointmentWriteBack('org1', 'apt1')
    expect(writeOpInserts()).toHaveLength(0)
  })
})

describe('retryPendingWrites — pushing into the PMS', () => {
  it('pushes the appointment when the patient is already mapped', async () => {
    const client = makeFakeClient()
    client.createAppointment = vi.fn(async (_p: unknown) => ({ externalId: 'od-apt-77' }))
    queue('pmsWriteOp', [{ id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'apt1', status: 'pending', attempts: 0 }])
    queue('appointment', [{ id: 'apt1', organizationId: 'org1', patientId: 'pat1', providerId: null, startTime: new Date('2026-06-01T09:00:00Z'), endTime: null, notes: 'n' }])
    // pmsEntityMap is now consulted TWICE: first the appointment-already-mapped
    // check (empty → not mapped), then the patient mapping.
    queue('pmsEntityMap', [], [{ externalId: 'od-pat-1' }]) // appt not mapped; patient mapped

    await retryPendingWrites('org1', asClient(client))

    expect(client.createPatient).not.toHaveBeenCalled()
    expect(client.createAppointment).toHaveBeenCalledTimes(1)
    expect((client.createAppointment.mock.calls[0][0] as { patientExternalId: string }).patientExternalId).toBe('od-pat-1')
    const success = state.updates.find((u) => u.table === 'pmsWriteOp' && u.set.status === 'success')
    expect(success).toBeTruthy()
    expect(success!.set.externalId).toBe('od-apt-77')
    // the new appointment gets a dreamcrm-origin entity map
    expect(state.inserts.some((i) => i.table === 'pmsEntityMap')).toBe(true)
  })

  it('creates the patient in the PMS first when it is not yet mapped', async () => {
    const client = makeFakeClient()
    client.createPatient = vi.fn(async (_p: unknown) => ({ externalId: 'od-pat-9' }))
    client.createAppointment = vi.fn(async (_p: unknown) => ({ externalId: 'od-apt-9' }))
    queue('pmsWriteOp', [{ id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'apt1', status: 'pending', attempts: 0 }])
    queue('appointment', [{ id: 'apt1', organizationId: 'org1', patientId: 'pat1', providerId: null, startTime: new Date('2026-06-01T09:00:00Z'), endTime: null, notes: null }])
    queue('pmsEntityMap', []) // patient NOT mapped → push patient first
    queue('patient', [{ id: 'pat1', organizationId: 'org1', firstName: 'New', lastName: 'Patient', email: 'n@p.com', phone: null, dateOfBirth: null }])

    await retryPendingWrites('org1', asClient(client))

    expect(client.createPatient).toHaveBeenCalledTimes(1)
    expect(client.createAppointment).toHaveBeenCalledTimes(1)
    expect((client.createAppointment.mock.calls[0][0] as { patientExternalId: string }).patientExternalId).toBe('od-pat-9')
    // a patient write_op was recorded for the audit log
    expect(writeOpInserts().some((i) => (i.values as Row).entityType === 'patient')).toBe(true)
  })

  it('records an error (not a throw) when the PMS write fails', async () => {
    const client = makeFakeClient()
    client.createAppointment = vi.fn(async (_p: unknown) => {
      throw new Error('eConnector unreachable')
    })
    queue('pmsWriteOp', [{ id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'apt1', status: 'pending', attempts: 0 }])
    queue('appointment', [{ id: 'apt1', organizationId: 'org1', patientId: 'pat1', providerId: null, startTime: new Date(), endTime: null, notes: null }])
    queue('pmsEntityMap', [], [{ externalId: 'od-pat-1' }]) // appt not mapped; patient mapped

    await expect(retryPendingWrites('org1', asClient(client))).resolves.toBeUndefined()
    const errUpdate = state.updates.find((u) => u.table === 'pmsWriteOp' && u.set.status === 'error')
    expect(errUpdate).toBeTruthy()
    expect(String(errUpdate!.set.error)).toMatch(/eConnector/)
  })

  it('does NOT re-create an appointment that is already mapped (idempotent retry)', async () => {
    const client = makeFakeClient()
    queue('pmsWriteOp', [{ id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'apt1', status: 'pending', attempts: 1 }])
    queue('appointment', [{ id: 'apt1', organizationId: 'org1', patientId: 'pat1', providerId: null, startTime: new Date(), endTime: null, notes: null }])
    queue('pmsEntityMap', [{ externalId: 'od-apt-existing' }]) // appointment ALREADY mapped

    await retryPendingWrites('org1', asClient(client))

    // No second OD appointment created; the op is just settled to success.
    expect(client.createAppointment).not.toHaveBeenCalled()
    const success = state.updates.find((u) => u.table === 'pmsWriteOp' && u.set.status === 'success')
    expect(success!.set.externalId).toBe('od-apt-existing')
  })

  it('recovers a prior external id instead of creating a duplicate when a past map-write failed', async () => {
    const client = makeFakeClient()
    queue(
      'pmsWriteOp',
      [{ id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'apt1', status: 'pending', attempts: 1 }], // pending list
      [{ externalId: 'od-apt-prior' }], // a prior op recorded the external id but failed to map
    )
    queue('appointment', [{ id: 'apt1', organizationId: 'org1', patientId: 'pat1', providerId: null, startTime: new Date(), endTime: null, notes: null }])
    queue('pmsEntityMap', []) // appointment NOT mapped yet

    await retryPendingWrites('org1', asClient(client))

    // Reuse the recorded id + (re)write the map — never create a second OD appt.
    expect(client.createAppointment).not.toHaveBeenCalled()
    expect(state.inserts.some((i) => i.table === 'pmsEntityMap')).toBe(true)
    const success = state.updates.find((u) => u.table === 'pmsWriteOp' && u.set.status === 'success')
    expect(success!.set.externalId).toBe('od-apt-prior')
  })

  it('advances the attempt counter when the appointment no longer exists (no infinite retry)', async () => {
    const client = makeFakeClient()
    queue('pmsWriteOp', [{ id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'gone', status: 'pending', attempts: 2 }])
    queue('appointment', []) // appointment was deleted on our side
    await retryPendingWrites('org1', asClient(client))
    expect(client.createAppointment).not.toHaveBeenCalled()
    const errUpdate = state.updates.find((u) => u.table === 'pmsWriteOp' && u.set.status === 'error')
    expect(errUpdate).toBeTruthy()
    // Counter advanced 2 → 3; previously it stayed at 2 and retried every sync forever.
    expect(errUpdate!.set.attempts).toBe(3)
  })

  it('skips write_ops past the max attempt cap', async () => {
    const client = makeFakeClient()
    queue('pmsWriteOp', [{ id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'apt1', status: 'error', attempts: 6 }])
    await retryPendingWrites('org1', asClient(client))
    expect(client.createAppointment).not.toHaveBeenCalled()
  })

  it('flushes an update op via client.updateAppointment', async () => {
    const client = makeFakeClient()
    queue('pmsWriteOp', [
      { id: 'op1', organizationId: 'org1', entityType: 'appointment', internalId: 'apt1', operation: 'update', status: 'pending', attempts: 0, requestPayload: { status: 'cancelled' } },
    ])
    queue('pmsEntityMap', [{ externalId: 'od-apt-1' }]) // appt is mapped

    await retryPendingWrites('org1', asClient(client))

    expect(client.createAppointment).not.toHaveBeenCalled()
    expect(client.updateAppointment).toHaveBeenCalledTimes(1)
    expect(client.updateAppointment.mock.calls[0][0]).toBe('od-apt-1')
    expect((client.updateAppointment.mock.calls[0][1] as { status: string }).status).toBe('cancelled')
    expect(state.updates.some((u) => u.table === 'pmsWriteOp' && u.set.status === 'success')).toBe(true)
  })
})

describe('queueAppointmentStatusWriteBack — cancellation', () => {
  it('enqueues an update op when the appointment is already mapped', async () => {
    queue('pmsConnection', [{ provider: 'open_dental', status: 'connected', syncDirection: 'two_way' }])
    queue('pmsEntityMap', [{ externalId: 'od-apt-1' }]) // mapped
    queue('pmsWriteOp', []) // no dup pending update
    await queueAppointmentStatusWriteBack('org1', 'apt1', 'cancelled')
    const ops = writeOpInserts()
    expect(ops).toHaveLength(1)
    const v = ops[0].values as Row
    expect(v.operation).toBe('update')
    expect((v.requestPayload as Row).status).toBe('cancelled')
  })

  it('supersedes a still-pending create when cancelled before it syncs', async () => {
    queue('pmsConnection', [{ provider: 'open_dental', status: 'connected', syncDirection: 'two_way' }])
    queue('pmsEntityMap', []) // not yet mapped
    queue('pmsWriteOp', [{ id: 'create1' }]) // a pending create exists
    await queueAppointmentStatusWriteBack('org1', 'apt1', 'cancelled')
    expect(writeOpInserts()).toHaveLength(0) // no new op
    const skip = state.updates.find((u) => u.table === 'pmsWriteOp' && u.set.status === 'skipped')
    expect(skip).toBeTruthy()
  })

  it('no-ops on an import-only connection', async () => {
    queue('pmsConnection', [{ provider: 'open_dental', status: 'connected', syncDirection: 'import' }])
    await queueAppointmentStatusWriteBack('org1', 'apt1', 'cancelled')
    expect(writeOpInserts()).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })
})
