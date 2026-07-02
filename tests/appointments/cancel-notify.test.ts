import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * cancelAppointment + markNoShow now fire a staff notification (and, for
 * cancel only, a patient confirmation email — never on no-show). All
 * best-effort: a comms failure must never throw past the state write.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => { state.updates.push(set) },
        }),
      }),
    },
    schema: {
      appointment: { organizationId: 'org', id: 'id', status: 'status', patientId: 'patientId', type: 'type', startTime: 'startTime' },
      patient: { organizationId: 'org', id: 'id', firstName: 'firstName', lastName: 'lastName', email: 'email' },
      clinicProfile: { organizationId: 'org', phone: 'phone', planTier: 'planTier', websiteDomain: 'websiteDomain' },
      organization: { id: 'id', slug: 'slug' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  or: vi.fn(() => ({ _: 'or' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

const { queueStatusMock } = vi.hoisted(() => ({ queueStatusMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/New_York'),
}))
vi.mock('@/lib/services/pms', () => ({
  queueAppointmentWriteBack: vi.fn(async () => undefined),
  queueAppointmentStatusWriteBack: queueStatusMock,
}))

const { notifyOrgMembersMock } = vi.hoisted(() => ({ notifyOrgMembersMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyOrgMembersMock }))

const { sendCancellationMock, sendNotificationMock, deliverMock } = vi.hoisted(() => ({
  sendCancellationMock: vi.fn<(to: string, data: { rebookUrl: string | null }, sender: unknown) => Promise<void>>(
    async () => undefined,
  ),
  sendNotificationMock: vi.fn(async () => undefined),
  deliverMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/email', () => ({
  sendCancellationConfirmation: sendCancellationMock,
  sendNotificationEmail: sendNotificationMock,
  deliver: deliverMock,
  authEmailShell: vi.fn(() => '<html>rebook</html>'),
}))

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
    replyTo: 'front@acmedental.com',
    name: 'Acme Dental',
    timeZone: 'America/New_York',
  })),
}))

vi.mock('@/lib/services/clinic-site', () => ({
  publicSiteUrl: () => 'https://acme.dreamcreatestudio.com',
}))

import { cancelAppointment, markNoShow } from '@/lib/services/appointments'

const FUTURE = new Date(Date.now() + 3 * 86_400_000)

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
})

/** Queue the selects cancelAppointment makes BEFORE the notify/email: assert
 *  mutable (status), then load context (appointment, patient). */
function queueCancelContext(opts: { email?: string | null; planTier?: string } = {}) {
  state.selectQueue.push([{ status: 'scheduled' }]) // assertAppointmentMutable
  state.selectQueue.push([{ patientId: 'pat_1', type: 'cleaning', startTime: FUTURE }]) // loadAppointmentNotifyContext appt
  state.selectQueue.push([{ firstName: 'Mia', lastName: 'Hayes', email: opts.email === undefined ? 'mia@example.com' : opts.email }]) // patient
  // sendCancellationEmailToPatient: clinicProfile, organization
  state.selectQueue.push([{ phone: '555-1212', planTier: opts.planTier ?? 'pro', websiteDomain: null }])
  state.selectQueue.push([{ slug: 'acme' }])
}

describe('cancelAppointment notifications', () => {
  it('pings owners/admins with a cancellation notice → the patient record', async () => {
    queueCancelContext()
    await cancelAppointment('org_1', 'appt_1')
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'appointment_cancelled',
        title: expect.stringContaining('Mia Hayes'),
        // CTA opens the patient (richest follow-up surface), with a named label.
        linkPath: '/patients/pat_1',
        linkLabel: 'View Mia’s record →',
      }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('sends the patient a cancellation confirmation when they have an email', async () => {
    queueCancelContext({ email: 'mia@example.com', planTier: 'pro' })
    await cancelAppointment('org_1', 'appt_1')
    expect(sendCancellationMock).toHaveBeenCalledWith(
      'mia@example.com',
      expect.objectContaining({
        patientName: 'Mia Hayes',
        clinicName: 'Acme Dental',
        appointmentType: 'cleaning',
        rebookUrl: 'https://acme.dreamcreatestudio.com/book', // pro tier → online booking
      }),
      expect.objectContaining({ from: 'Acme Dental <acme-dental@dreamcreatestudio.com>' }),
      // 4th arg = the resolved editable-email override ({} when the clinic hasn't customized it).
      expect.anything(),
    )
  })

  it('does NOT include a rebook link on basic tier (no online booking)', async () => {
    queueCancelContext({ email: 'mia@example.com', planTier: 'basic' })
    await cancelAppointment('org_1', 'appt_1')
    const arg = sendCancellationMock.mock.calls[0]![1]
    expect(arg.rebookUrl).toBeNull()
  })

  it('skips the patient email when no email is on file (but still notifies staff)', async () => {
    state.selectQueue.push([{ status: 'scheduled' }])
    state.selectQueue.push([{ patientId: 'pat_1', type: 'cleaning', startTime: FUTURE }])
    state.selectQueue.push([{ firstName: 'Mia', lastName: 'Hayes', email: null }])
    await cancelAppointment('org_1', 'appt_1')
    expect(sendCancellationMock).not.toHaveBeenCalled()
    expect(notifyOrgMembersMock).toHaveBeenCalled()
  })

  it('still cancels even if the notification path throws', async () => {
    notifyOrgMembersMock.mockRejectedValueOnce(new Error('notify boom'))
    queueCancelContext()
    await expect(cancelAppointment('org_1', 'appt_1')).resolves.toBeUndefined()
    // the cancel state write happened
    expect(state.updates.some((u) => u.status === 'cancelled')).toBe(true)
    expect(queueStatusMock).toHaveBeenCalledWith('org_1', 'appt_1', 'cancelled')
  })
})

describe('markNoShow notifications', () => {
  it('pings owners/admins + sends the warm REBOOK note (never the cancellation email)', async () => {
    state.selectQueue.push([{ status: 'scheduled' }]) // mutable
    state.selectQueue.push([{ patientId: 'pat_1', type: 'cleaning', startTime: FUTURE }]) // appt
    state.selectQueue.push([{ firstName: 'Aiden', lastName: 'Brooks', email: 'aiden@example.com' }]) // patient
    // sendNoShowRebookEmail: profile (basic tier → no /book button) + org, then
    // renderAutomatedEmail's config read — all off the exhausted queue.
    await markNoShow('org_1', 'appt_2')
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'appointment_no_show',
        title: expect.stringContaining('Aiden Brooks'),
        linkPath: '/patients/pat_1',
        linkLabel: 'View Aiden’s record →',
      }),
      { roles: ['owner', 'admin'] },
    )
    // A no-show never sends the "your visit was cancelled" CONFIRMATION…
    expect(sendCancellationMock).not.toHaveBeenCalled()
    // …but it DOES send the service-recovery rebook note (plain signed email
    // on basic tier — no online booking, so no button shell).
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'aiden@example.com',
        title: expect.stringContaining('We missed you'),
      }),
      expect.anything(),
    )
  })

  it('skips the rebook note when the patient has no email (staff ping still fires)', async () => {
    state.selectQueue.push([{ status: 'scheduled' }])
    state.selectQueue.push([{ patientId: 'pat_1', type: 'cleaning', startTime: FUTURE }])
    state.selectQueue.push([{ firstName: 'Aiden', lastName: 'Brooks', email: null }])
    await markNoShow('org_1', 'appt_2')
    expect(notifyOrgMembersMock).toHaveBeenCalled()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(deliverMock).not.toHaveBeenCalled()
  })
})
