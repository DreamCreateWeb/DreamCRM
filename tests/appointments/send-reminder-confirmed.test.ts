import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The drawer's single "send" reaches a CONFIRMED visit: sendReminderAction
 * passes allowConfirmed, so the compose path renders the gentler
 * 'appointment_reminder_confirmed' copy (and its own honest refusal when the
 * clinic turned that variant off). The action used to refuse every confirmed
 * visit outright, which made the drawer's primary button for the most common
 * healthy state a guaranteed error. Bulk keeps skipping confirmed rows.
 */

let tenantCtx: { tenantType: string; role: string; organizationId: string; organizationName: string; userId: string } | null = null
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let detailStatus = 'confirmed'
let detailEmail: string | null = 'mia@example.com'
vi.mock('@/lib/services/appointments', () => ({
  getAppointmentDetail: vi.fn(async (_org: string, id: string) => ({
    id,
    status: detailStatus,
    type: 'cleaning',
    startTime: new Date(Date.now() + 24 * 3600_000),
    patient: { id: 'pat_1', fullName: 'Mia Hayes', email: detailEmail },
  })),
  confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  markNoShow: vi.fn(),
  markCompleted: vi.fn(),
  rescheduleAppointment: vi.fn(),
  createInternalAppointment: vi.fn(),
}))

const sendReminderEmail = vi.fn(async () => ({ ok: true as const }))
const sendReminderSms = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/services/reminder-automation', () => ({
  sendReminderEmail: (...a: unknown[]) => sendReminderEmail(...(a as [])),
  sendReminderSms: (...a: unknown[]) => sendReminderSms(...(a as [])),
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({ name: 'Acme Dental', timeZone: 'America/Chicago' })),
}))

// The rest of actions.ts's import graph — none of it runs here.
vi.mock('@/lib/services/booking', () => ({ getSlotsForDay: vi.fn() }))
vi.mock('@/lib/services/booking-confirmation', () => ({ sendBookingConfirmation: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } }))
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: 'clinic_profile' }))
vi.mock('@/lib/services/patient-followups', () => ({ bulkCreateFollowups: vi.fn() }))
vi.mock('@/lib/services/providers', () => ({ listProviders: vi.fn(async () => []) }))
vi.mock('@/lib/services/patients', () => ({ searchPatientOptions: vi.fn(async () => []) }))
vi.mock('@/lib/services/saved-views', () => ({ createSavedView: vi.fn(), deleteSavedView: vi.fn() }))

import { sendReminderAction, bulkSendRemindersAction } from '@/app/(default)/appointments/actions'

beforeEach(() => {
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1', organizationName: 'Acme', userId: 'u1' }
  detailStatus = 'confirmed'
  detailEmail = 'mia@example.com'
  sendReminderEmail.mockClear()
  sendReminderSms.mockClear()
})

describe('sendReminderAction on a CONFIRMED visit', () => {
  it('reaches sendReminderEmail (the confirmed variant lives there) instead of refusing', async () => {
    const r = await sendReminderAction('a1', 'email')
    expect(r).toEqual({ ok: true })
    expect(sendReminderEmail).toHaveBeenCalledTimes(1)
    const [, detail] = sendReminderEmail.mock.calls[0] as unknown as [string, { status: string }]
    expect(detail.status).toBe('confirmed')
  })

  it('passes the compose path’s own honest refusal through when the variant is off', async () => {
    sendReminderEmail.mockResolvedValueOnce({ ok: false, error: 'Confirmed-visit reminders are disabled for this clinic' } as never)
    const r = await sendReminderAction('a1', 'email')
    expect(r).toEqual({ ok: false, error: 'Confirmed-visit reminders are disabled for this clinic' })
  })

  it('still refuses a completed visit', async () => {
    detailStatus = 'completed'
    const r = await sendReminderAction('a1', 'email')
    expect(r.ok).toBe(false)
    expect(sendReminderEmail).not.toHaveBeenCalled()
  })

  it('still refuses when there is no email on file', async () => {
    detailEmail = null
    const r = await sendReminderAction('a1', 'email')
    expect(r).toEqual({ ok: false, error: 'Patient has no email on file' })
    expect(sendReminderEmail).not.toHaveBeenCalled()
  })
})

describe('bulkSendRemindersAction keeps skipping confirmed rows', () => {
  it('counts a confirmed visit as skipped, not sent', async () => {
    const r = await bulkSendRemindersAction(['a1'], 'email')
    expect(r).toEqual({ attempted: 1, sent: 0, skipped: 1, errors: [] })
    expect(sendReminderEmail).not.toHaveBeenCalled()
  })

  it('sends an unconfirmed (scheduled) visit', async () => {
    detailStatus = 'scheduled'
    const r = await bulkSendRemindersAction(['a1'], 'email')
    expect(r).toEqual({ attempted: 1, sent: 1, skipped: 0, errors: [] })
    expect(sendReminderEmail).toHaveBeenCalledTimes(1)
  })
})
