import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  patientRows: [] as Record<string, unknown>[],
  followupRows: [] as Record<string, unknown>[],
  userRows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/db', () => {
  function chain(table?: string) {
    const ctx = { tbl: table }
    const o: Record<string, unknown> = {}
    o.from = (t: { __t?: string }) => { ctx.tbl = t?.__t; return o }
    o.where = () => o
    o.limit = () => {
      if (ctx.tbl === 'patient') return Promise.resolve(h.patientRows)
      if (ctx.tbl === 'patientFollowup') return Promise.resolve(h.followupRows)
      if (ctx.tbl === 'user') return Promise.resolve(h.userRows)
      return Promise.resolve([])
    }
    o.values = (v: Record<string, unknown>) => { h.inserts.push(v); return Promise.resolve(undefined) }
    return o
  }
  return {
    db: { select: () => chain(), insert: (t: { __t?: string }) => chain(t?.__t) },
    schema: {
      patient: { __t: 'patient', id: 'id', organizationId: 'organizationId', firstName: 'firstName', lastName: 'lastName' },
      patientFollowup: { __t: 'patientFollowup', id: 'id', organizationId: 'organizationId', sourceAppointmentId: 'sourceAppointmentId' },
      user: { __t: 'user', id: 'id', name: 'name' },
      member: { __t: 'member' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  asc: (x: unknown) => x,
  desc: (x: unknown) => x,
  eq: (...a: unknown[]) => ({ a }),
  ne: (...a: unknown[]) => ({ a }),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }), {}),
}))

import { createFollowup, autoCreateRebookFollowup } from '@/lib/services/patient-followups'

beforeEach(() => {
  h.patientRows = []
  h.followupRows = []
  h.userRows = []
  h.inserts = []
})

describe('createFollowup', () => {
  it('throws when the patient is not in the org', async () => {
    h.patientRows = [] // ownership → not found
    await expect(
      createFollowup({ organizationId: 'org_1', patientId: 'p_x', title: 'Call' }, 'u1'),
    ).rejects.toThrow(/not found/i)
    expect(h.inserts).toHaveLength(0)
  })

  it('rejects an empty title before touching the db', async () => {
    await expect(
      createFollowup({ organizationId: 'org_1', patientId: 'p1', title: '   ' }, 'u1'),
    ).rejects.toThrow(/title/i)
  })

  it('cleans the title, drops a malformed due date, and inserts', async () => {
    h.patientRows = [{ id: 'p1', firstName: 'Mia', lastName: 'Hayes' }]
    const f = await createFollowup(
      { organizationId: 'org_1', patientId: 'p1', title: '  Call   Mia  ', dueDate: 'not-a-date' },
      'u1',
    )
    expect(f.title).toBe('Call Mia')
    expect(f.dueDate).toBeNull() // malformed → null
    expect(f.patientName).toBe('Mia Hayes')
    expect(f.status).toBe('open')
    expect(h.inserts).toHaveLength(1)
  })

  it('keeps a well-formed due date + resolves the assignee name', async () => {
    h.patientRows = [{ id: 'p1', firstName: 'Mia', lastName: 'Hayes' }]
    h.userRows = [{ name: 'Dr. Reyes' }]
    const f = await createFollowup(
      { organizationId: 'org_1', patientId: 'p1', title: 'Call', dueDate: '2026-07-01', assignedUserId: 'u9' },
      'u1',
    )
    expect(f.dueDate).toBe('2026-07-01')
    expect(f.assigneeName).toBe('Dr. Reyes')
  })
})

describe('autoCreateRebookFollowup', () => {
  it('creates a rebook follow-up when none exists for the appointment', async () => {
    h.followupRows = [] // no existing follow-up for this appointment
    await autoCreateRebookFollowup('org_1', 'p1', 'Aiden Kim', 'appt_1')
    expect(h.inserts).toHaveLength(1)
    expect((h.inserts[0] as { title: string }).title).toContain('Rebook Aiden Kim')
    expect((h.inserts[0] as { sourceAppointmentId: string }).sourceAppointmentId).toBe('appt_1')
  })

  it('is idempotent — skips when one already exists for the appointment', async () => {
    h.followupRows = [{ id: 'pfu_existing' }]
    await autoCreateRebookFollowup('org_1', 'p1', 'Aiden Kim', 'appt_1')
    expect(h.inserts).toHaveLength(0)
  })
})
