import { describe, it, expect, vi, beforeEach } from 'vitest'

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  organizationId: string
  patientId: string | null
  userName: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// redirect() throws a NEXT_REDIRECT exception by design — we catch & inspect it.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest: string }).digest = `NEXT_REDIRECT:${url}`
    throw err
  },
}))

const inserts: unknown[] = []

vi.mock('@/lib/db', async () => {
  const { appointment } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      insert: (table: unknown) => ({
        values: async (vals: unknown) => {
          if (table === appointment) inserts.push(vals)
        },
      }),
    },
  }
})

import { bookAppointment } from '@/app/(default)/patient/book/actions'

beforeEach(() => {
  inserts.length = 0
  tenantCtx = {
    tenantType: 'patient',
    organizationId: 'org_1',
    patientId: 'pat_1',
    userName: 'Jane Doe',
  }
})

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function future(ms = 86_400_000) {
  return new Date(Date.now() + ms).toISOString().slice(0, 16)
}

describe('bookAppointment', () => {
  it('rejects when not a patient tenant', async () => {
    tenantCtx = {
      tenantType: 'clinic',
      organizationId: 'org_1',
      patientId: null,
      userName: 'X',
    }
    await expect(
      bookAppointment(form({ startTime: future(), type: 'checkup' })),
    ).rejects.toThrow(/patient/i)
  })

  it('rejects when patientId is null (unlinked account)', async () => {
    tenantCtx!.patientId = null
    await expect(
      bookAppointment(form({ startTime: future(), type: 'checkup' })),
    ).rejects.toThrow(/patient record/i)
  })

  it('rejects when startTime is missing', async () => {
    await expect(bookAppointment(form({ type: 'checkup' }))).rejects.toThrow(/time/i)
  })

  it('rejects malformed startTime', async () => {
    await expect(
      bookAppointment(form({ startTime: 'invalid', type: 'checkup' })),
    ).rejects.toThrow(/Invalid/i)
  })

  it('rejects a past startTime', async () => {
    const past = new Date(Date.now() - 3600_000).toISOString().slice(0, 16)
    await expect(bookAppointment(form({ startTime: past, type: 'checkup' }))).rejects.toThrow(
      /future/i,
    )
  })

  it('inserts appointment scoped to org + patient on happy path and then redirects', async () => {
    await expect(
      bookAppointment(form({ startTime: future(), type: 'cleaning', notes: 'Sensitive teeth' })),
    ).rejects.toThrow(/NEXT_REDIRECT:\/patient\/appointments/)
    expect(inserts).toHaveLength(1)
    const vals = inserts[0] as {
      organizationId: string
      patientId: string
      type: string
      status: string
      notes: string | null
      title: string
    }
    expect(vals.organizationId).toBe('org_1')
    expect(vals.patientId).toBe('pat_1')
    expect(vals.type).toBe('cleaning')
    expect(vals.status).toBe('scheduled')
    expect(vals.notes).toBe('Sensitive teeth')
    expect(vals.title).toMatch(/Cleaning/)
  })

  it('defaults type to checkup when not provided', async () => {
    await expect(bookAppointment(form({ startTime: future() }))).rejects.toThrow(/NEXT_REDIRECT/)
    const vals = inserts[0] as { type: string }
    expect(vals.type).toBe('checkup')
  })
})
