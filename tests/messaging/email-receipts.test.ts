import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Email delivery receipts for staff→patient thread messages: the Resend
 * webhook calls recordPatientMessageReceipt with the patientMessageId tag.
 * Ladder: delivered → deliveredAt; opened → readByPatientAt (+deliveredAt);
 * bounce/complaint → meta.deliveryFailed + ONE staff bell. Idempotent
 * (set-once per field) so svix replays are no-ops.
 */

const state: {
  row: Record<string, unknown> | null
  updates: Array<Record<string, unknown>>
  patient: { firstName: string; lastName: string } | null
} = { row: null, updates: [], patient: null }

const notifyMock = vi.fn(async (..._a: unknown[]) => {})

vi.mock('@/lib/services/notifications', () => ({
  notifyOrgMembers: (...a: unknown[]) => notifyMock(...(a as [])),
}))
vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/db', async () => {
  const { patient, patientMessage, patientThread } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      select: (sel?: Record<string, unknown>) => ({
        from: (t: unknown) => ({
          where: () => ({
            limit: async () => {
              if (t === patientMessage) return state.row ? [state.row] : []
              if (t === patient) return state.patient ? [state.patient] : []
              return []
            },
          }),
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(v)
          },
        }),
      }),
    },
    schema: { patient, patientMessage, patientThread },
  }
})

import { recordPatientMessageReceipt } from '@/lib/services/patient-messaging'

function baseRow(over: Record<string, unknown> = {}) {
  return {
    id: 'pmsg_1',
    organizationId: 'org_1',
    patientId: 'pat_1',
    threadId: 'pth_1',
    deliveredAt: null,
    readByPatientAt: null,
    meta: {},
    ...over,
  }
}

beforeEach(() => {
  state.row = baseRow()
  state.updates = []
  state.patient = { firstName: 'Jola', lastName: 'Kaious' }
  notifyMock.mockClear()
})

describe('recordPatientMessageReceipt', () => {
  it('delivered sets deliveredAt once (replay = no-op)', async () => {
    expect(await recordPatientMessageReceipt({ patientMessageId: 'pmsg_1', event: 'delivered' })).toBe('updated')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].deliveredAt).toBeInstanceOf(Date)

    state.row = baseRow({ deliveredAt: new Date() })
    state.updates = []
    expect(await recordPatientMessageReceipt({ patientMessageId: 'pmsg_1', event: 'delivered' })).toBe('ignored')
    expect(state.updates).toHaveLength(0)
  })

  it('opened sets readByPatientAt AND backfills deliveredAt (opened implies delivered)', async () => {
    expect(await recordPatientMessageReceipt({ patientMessageId: 'pmsg_1', event: 'opened' })).toBe('updated')
    expect(state.updates[0].readByPatientAt).toBeInstanceOf(Date)
    expect(state.updates[0].deliveredAt).toBeInstanceOf(Date)
  })

  it('opened does not touch deliveredAt when it is already set', async () => {
    state.row = baseRow({ deliveredAt: new Date('2026-07-14T10:00:00Z') })
    await recordPatientMessageReceipt({ patientMessageId: 'pmsg_1', event: 'opened' })
    expect(state.updates[0]).not.toHaveProperty('deliveredAt')
  })

  it('bounce stamps meta.deliveryFailed (attachments preserved) + rings the staff bell once', async () => {
    state.row = baseRow({ meta: { attachments: [{ url: 'https://x/a.png' }] } })
    expect(
      await recordPatientMessageReceipt({ patientMessageId: 'pmsg_1', event: 'bounce', bounceType: 'hard' }),
    ).toBe('updated')
    const meta = state.updates[0].meta as Record<string, unknown>
    expect(meta.attachments).toEqual([{ url: 'https://x/a.png' }])
    expect(meta.deliveryFailed).toMatchObject({ type: 'bounce', bounceType: 'hard' })
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const arg = notifyMock.mock.calls[0][1] as { title: string; linkPath: string }
    expect(arg.title).toContain('Jola Kaious')
    expect(arg.linkPath).toBe('/messages?thread=pth_1')
  })

  it('a second bounce for the same message is a no-op (no double bell)', async () => {
    state.row = baseRow({ meta: { deliveryFailed: { type: 'bounce', at: 'x' } } })
    expect(await recordPatientMessageReceipt({ patientMessageId: 'pmsg_1', event: 'bounce' })).toBe('ignored')
    expect(state.updates).toHaveLength(0)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('complaint uses the spam wording in the bell body', async () => {
    await recordPatientMessageReceipt({ patientMessageId: 'pmsg_1', event: 'complaint' })
    const arg = notifyMock.mock.calls[0][1] as { body: string }
    expect(arg.body).toMatch(/spam/i)
  })

  it('unknown message id is ignored', async () => {
    state.row = null
    expect(await recordPatientMessageReceipt({ patientMessageId: 'pmsg_missing', event: 'delivered' })).toBe('ignored')
    expect(state.updates).toHaveLength(0)
  })
})
