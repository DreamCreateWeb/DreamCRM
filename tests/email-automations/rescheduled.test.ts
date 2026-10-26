import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EmailAutomationKey } from '@/lib/types/email-automations'

/**
 * THE `rescheduled` EMAIL. It joins the Emails hub registry (Appointments
 * group, its own on/off) and `sendRescheduleNotice` renders it for the NEW
 * row a reschedule minted: through `authEmailShell` with the one-click
 * "Confirm my new time" `/c/[token]` button, or the plain signed note when no
 * token can be minted. Exactly ONE greeting either way (the default body
 * opens with "Hi {{firstName}}", and the plain sender's own greeting defers
 * to it — `bodyOpensWithGreeting`). Off in the hub → nothing goes out and no
 * CommLog line claims it did. The CommLog mirror rides the send.
 */

const { sent } = vi.hoisted(() => ({
  sent: [] as Array<{ html?: string; subject?: string; to?: unknown }>,
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: { html?: string; subject?: string; to?: unknown }) => {
        sent.push(payload)
        return { data: { id: 'mail_1' }, error: null }
      },
    }
  },
}))

// The new row + its patient, as the service's one join reads them.
const state = {
  row: null as Record<string, unknown> | null,
  stored: null as unknown, // the clinic's email_automations jsonb
  token: 'ct_new_time' as string | null,
  tokenThrows: false,
}
vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.limit = async () => (state.row ? [state.row] : [])
    return obj
  }
  return { db: { select: () => chain() } }
})
vi.mock('@/lib/services/email-automations', async () => {
  const types = await import('@/lib/types/email-automations')
  const actual = await vi.importActual<typeof import('@/lib/services/email-automations')>('@/lib/services/email-automations')
  return {
    ...actual,
    renderAutomatedEmail: async (_org: string, key: EmailAutomationKey, fields: Record<string, string | null | undefined>) =>
      actual.renderFromResolved(key, types.resolveEmailAutomations(state.stored)[key], fields),
  }
})
vi.mock('@/lib/services/appointment-confirm', () => ({
  getOrCreateConfirmToken: vi.fn(async () => {
    if (state.tokenThrows) throw new Error('token store down')
    return state.token
  }),
}))
const commLog: Array<{ patientId: string; note: string; mode: string }> = []
vi.mock('@/lib/services/pms/sync', () => ({
  queueCommLogWriteBack: vi.fn(async (_org: string, patientId: string, entry: { note: string; mode: string }) => {
    commLog.push({ patientId, ...entry })
  }),
}))
vi.mock('@/lib/services/forms', () => ({ getBookingIntakeForm: vi.fn(async () => null) }))
vi.mock('@/lib/services/clinic-site', () => ({ publicSiteUrl: vi.fn(() => 'https://x.test') }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))

import { sendRescheduleNotice } from '@/lib/services/booking-confirmation'
import { EMAIL_AUTOMATION_SPECS, resolveEmailAutomations } from '@/lib/types/email-automations'
import { appBaseUrl } from '@/lib/clinic-site-helpers'

const SENDER = {
  name: 'Acme Dental',
  from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
  replyTo: 'front@acmedental.com',
  timeZone: 'America/Chicago',
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
function salutations(text: string): number {
  return (text.match(/\bHi\b/g) ?? []).length
}

beforeEach(() => {
  sent.length = 0
  commLog.length = 0
  state.stored = null
  state.token = 'ct_new_time'
  state.tokenThrows = false
  state.row = {
    patientId: 'pat_1',
    startTime: new Date('2026-11-03T20:00:00Z'), // 2:00 PM Chicago
    type: 'crown_prep',
    email: 'mary@x.com',
    firstName: 'Mary',
    lastName: 'Hayes',
  }
  process.env.EMAIL_DRIVER = 'resend'
  process.env.RESEND_API_KEY = 're_test_key'
})

describe('the rescheduled key in the registry', () => {
  it('is an Appointments email with its own on/off switch', () => {
    const spec = EMAIL_AUTOMATION_SPECS.rescheduled
    expect(spec.category).toBe('appointments')
    expect(spec.enableSource).toBe('email_automations')
    expect(spec.moduleHref).toBe('/appointments')
    expect(spec.slotFields.map((f) => f.slot)).toEqual(['subject', 'body'])
    expect(spec.tokens.map((t) => t.token)).toEqual(
      expect.arrayContaining(['{{firstName}}', '{{clinicName}}', '{{appointmentType}}', '{{appointmentTime}}']),
    )
    expect(spec.includesNote.join(' ')).toMatch(/Confirm my new time/)
  })

  it('resolves on by default and honours a clinic that turned it off', () => {
    expect(resolveEmailAutomations(null).rescheduled.enabled).toBe(true)
    expect(resolveEmailAutomations({ rescheduled: { enabled: false } }).rescheduled.enabled).toBe(false)
  })
})

describe('sendRescheduleNotice', () => {
  it('renders the key through the shell with the one-click confirm, the clinic time, and ONE greeting', async () => {
    const r = await sendRescheduleNotice('org_1', 'appt_new', SENDER)
    expect(r).toEqual({ sent: true })
    expect(sent).toHaveLength(1)
    const html = sent[0].html ?? ''
    const text = textOf(html)
    expect(sent[0].subject).toBe('Your crown prep at Acme Dental has a new time')
    expect(html).toContain(`${appBaseUrl()}/c/ct_new_time`)
    expect(text).toContain('Confirm my new time')
    // The CLINIC's wall clock, not the server's UTC.
    expect(text).toContain('Tuesday, November 3, 2026 at 2:00 PM')
    expect(text).toContain('Hi Mary — your crown prep at Acme Dental has been moved to')
    expect(salutations(text)).toBe(1)
    // The CommLog mirror says what went out, at the clinic's time.
    expect(commLog).toEqual([
      { patientId: 'pat_1', note: 'Appointment rescheduled to Tue, Nov 3, 2:00 PM — patient notified by email.', mode: 'Email' },
    ])
  })

  it('uses the clinic’s edited copy when they changed it', async () => {
    state.stored = { rescheduled: { subject: 'New time for {{firstName}}', body: 'Your visit moved to {{appointmentTime}}. See you then!' } }
    await sendRescheduleNotice('org_1', 'appt_new', SENDER)
    expect(sent[0].subject).toBe('New time for Mary')
    const text = textOf(sent[0].html ?? '')
    expect(text).toContain('Your visit moved to Tuesday, November 3, 2026 at 2:00 PM. See you then!')
    // The shell path adds no greeting of its own; an edited body without one is sent as written.
    expect(salutations(text)).toBe(0)
  })

  it('falls back to the plain signed note — still one greeting — when no token can be minted', async () => {
    state.tokenThrows = true
    const r = await sendRescheduleNotice('org_1', 'appt_new', SENDER)
    expect(r).toEqual({ sent: true })
    const text = textOf(sent[0].html ?? '')
    expect(text).not.toContain('Confirm my new time')
    expect(text).toMatch(/^Hi Mary — your crown prep/)
    expect(salutations(text)).toBe(1)
    expect(text).toContain('— Acme Dental')
    expect(commLog).toHaveLength(1)
  })

  it('sends nothing — and mirrors nothing — when the clinic turned the email off', async () => {
    state.stored = { rescheduled: { enabled: false } }
    const r = await sendRescheduleNotice('org_1', 'appt_new', SENDER)
    expect(r).toEqual({ sent: false, reason: 'disabled' })
    expect(sent).toHaveLength(0)
    expect(commLog).toHaveLength(0)
  })

  it('answers honestly for a patient with no email, or a row that is not this clinic’s', async () => {
    state.row = { ...state.row!, email: null }
    expect(await sendRescheduleNotice('org_1', 'appt_new', SENDER)).toEqual({ sent: false, reason: 'no_email' })
    state.row = null
    expect(await sendRescheduleNotice('org_1', 'appt_new', SENDER)).toEqual({ sent: false, reason: 'not_found' })
    expect(sent).toHaveLength(0)
  })

  it('escapes the body on the shell path', async () => {
    state.stored = { rescheduled: { body: 'Moved to {{appointmentTime}} <script>alert(1)</script>' } }
    await sendRescheduleNotice('org_1', 'appt_new', SENDER)
    const html = sent[0].html ?? ''
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
