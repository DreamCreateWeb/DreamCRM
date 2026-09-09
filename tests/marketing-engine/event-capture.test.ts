import { describe, it, expect, vi, beforeEach } from 'vitest'

// House chain mock. Every select resolves the next queued result; writes
// are recorded so the tests can assert what got durable and in what order.
const state: {
  selectQueue: unknown[][]
  inserts: { table: string; values: unknown }[]
  updates: { set: unknown }[]
  deletes: number
} = { selectQueue: [], inserts: [], updates: [], deletes: 0 }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: (v: unknown) => {
          state.inserts.push({ table: tableName(t), values: v })
          const p: any = Promise.resolve()
          p.onConflictDoNothing = async () => {}
          return p
        },
      }),
      update: () => ({ set: (v: unknown) => ({ where: async () => void state.updates.push({ set: v }) }) }),
      delete: () => ({ where: async () => void state.deletes++ }),
    },
    schema,
  }
})

const { runGradeMock, deliverMock, uploadMock, addProspectMock, findExistingMock } = vi.hoisted(() => ({
  runGradeMock: vi.fn(async (_i: unknown) => ({ ok: true as const, token: 'g'.repeat(32) })),
  deliverMock: vi.fn(async (_m: unknown) => {}),
  uploadMock: vi.fn(async (_p: string, _b: unknown, _o: unknown) => ({ url: 'https://bucket/events/asda-2026/x.jpg' })),
  addProspectMock: vi.fn(async (_i: unknown) => ({ id: 'pros_new' })),
  findExistingMock: vi.fn(async (_i: unknown) => null as null | { id: string }),
}))
vi.mock('@/lib/services/practice-grader', () => ({ runPracticeGrade: runGradeMock }))
vi.mock('@/lib/services/prospecting', () => ({
  addGraderProspect: addProspectMock,
  findExistingProspect: findExistingMock,
}))
vi.mock('@/lib/blob', () => ({ uploadBlob: uploadMock }))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  authEmailShell: (o: { heading: string; introHtml: string; buttonUrl?: string; footnoteHtml?: string }) =>
    `<html>${o.heading}|${o.introHtml}|${o.buttonUrl ?? ''}|${o.footnoteHtml ?? ''}</html>`,
}))

import {
  captureStatusOf,
  consentFootnote,
  eventTaggedUrl,
  headshotObjectPath,
  isEventSlug,
  scanLine,
  suggestEventSlug,
  validateCapture,
} from '@/lib/event-capture'
import { classifyChannel, MARKETING_CHANNELS } from '@/lib/marketing-attribution'
import { attachHeadshot, createCapture, createEvent, type EventRow } from '@/lib/services/event-capture'

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  state.deletes = 0
  vi.clearAllMocks()
})

const event: EventRow = {
  id: 'mevt_1',
  slug: 'asda-2026',
  name: 'ASDA Annual Session 2026',
  organizer: 'Arkansas State Dental Association',
  state: 'AR',
  startsOn: '2026-10-09',
  endsOn: '2026-10-10',
  captureToken: 'c'.repeat(32),
  active: true,
  createdAt: new Date('2026-09-09T00:00:00Z'),
}

const good = {
  firstName: 'Dana',
  lastName: 'Reyes',
  email: 'Dana@SmileBright.com',
  practiceName: 'Smile Bright Dental',
  role: 'dentist',
  city: 'Conway',
  photoRelease: 'on',
  optIn: '',
}

describe('the pure half', () => {
  it("'association' is a registered channel, and the source OR medium marker classifies to it", () => {
    expect(MARKETING_CHANNELS).toContain('association')
    expect(classifyChannel({ utmSource: 'association', utmCampaign: 'asda-2026' } as never)).toBe('association')
    expect(classifyChannel({ utmMedium: 'association' })).toBe('association')
    // The grader marker still wins its own channel (a report link from the delivery email).
    expect(classifyChannel({ utmSource: 'grader', utmMedium: 'email' })).toBe('grader')
  })

  it('slugs: valid campaign keys only; suggestions are stable and capped', () => {
    expect(isEventSlug('asda-2026')).toBe(true)
    expect(isEventSlug('ASDA 2026')).toBe(false)
    expect(isEventSlug('ab')).toBe(false)
    expect(isEventSlug('-leading')).toBe(false)
    expect(suggestEventSlug('ASDA Annual Session', 2026)).toBe('asda-annual-session-2026')
    expect(isEventSlug(suggestEventSlug('A'.repeat(90), 2026))).toBe(true)
  })

  it('validateCapture: the release is required, the opt-in defaults to NO, fields are capped', () => {
    const ok = validateCapture(good)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.value.email).toBe('dana@smilebright.com')
      expect(ok.value.optIn).toBe(false)
      expect(ok.value.role).toBe('dentist')
    }
    expect(validateCapture({ ...good, photoRelease: '' })).toMatchObject({ ok: false })
    expect(validateCapture({ ...good, practiceName: '' })).toMatchObject({ ok: false })
    expect(validateCapture({ ...good, email: 'nope' })).toMatchObject({ ok: false })
    const weird = validateCapture({ ...good, role: 'ceo', optIn: 'on', firstName: 'x'.repeat(500) })
    expect(weird.ok && weird.value.role).toBe('other')
    expect(weird.ok && weird.value.optIn).toBe(true)
    expect(weird.ok && weird.value.firstName.length).toBe(80)
  })

  it('copy: the scan line is silent without a grade; the footnote says which box was ticked', () => {
    const base = { firstName: 'Dana', eventName: 'ASDA', organizer: 'ASDA', practiceName: 'Smile Bright', optIn: false }
    expect(scanLine({ ...base, grade: null })).toBeNull()
    expect(scanLine({ ...base, grade: { letter: 'C', overall: 61 } })).toContain('graded C (61/100)')
    expect(scanLine({ ...base, grade: { letter: null, overall: null } })).not.toContain('graded')
    expect(consentFootnote({ optIn: false, organizer: 'ASDA' })).toContain('only email')
    expect(consentFootnote({ optIn: true, organizer: null })).toContain('unsubscribe')
  })

  it('paths + urls', () => {
    expect(headshotObjectPath('asda-2026', 'mcap_1', 'image/png')).toBe('events/asda-2026/mcap_1.png')
    expect(eventTaggedUrl('https://x.com/', '/h/abc', 'asda-2026')).toBe(
      'https://x.com/h/abc?utm_source=association&utm_medium=email&utm_campaign=asda-2026',
    )
    expect(captureStatusOf({ photoUrl: 'u', deliveredAt: null })).toBe('awaiting_photo')
    expect(captureStatusOf({ photoUrl: 'u', deliveredAt: new Date() })).toBe('delivered')
  })
})

describe('createEvent', () => {
  it('refuses a bad slug and a duplicate; mints a capture token otherwise', async () => {
    expect(await createEvent({ name: 'X', slug: 'Bad Slug' })).toMatchObject({ ok: false })
    state.selectQueue.push([{ id: 'mevt_dupe' }])
    expect(await createEvent({ name: 'X', slug: 'asda-2026' })).toMatchObject({ ok: false })
    state.selectQueue.push([])
    const res = await createEvent({ name: 'ASDA', slug: 'asda-2026', state: 'ar', startsOn: '2026-10-09' })
    expect(res.ok).toBe(true)
    const ins = state.inserts[0].values as { captureToken: string; state: string; active: number }
    expect(ins.captureToken).toMatch(/^[a-f0-9]{32}$/)
    expect(ins.state).toBe('AR')
    expect(ins.active).toBe(1)
  })
})

describe('createCapture', () => {
  const input = {
    firstName: 'Dana', lastName: 'Reyes', email: 'dana@smilebright.com', practiceName: 'Smile Bright Dental',
    role: 'dentist' as const, city: 'Conway', photoRelease: true, optIn: false,
  }

  it('NO opt-in: row durable first, a no_consent suppression, the scan runs QUIETLY, nurture stamps resolved, no email without a photo', async () => {
    state.selectQueue.push([{ id: 'pgrd_1' }]) // grade row by token
    state.selectQueue.push([]) // prospect by email → none
    const res = await createCapture(event, input, null)
    expect(res).toMatchObject({ ok: true, delivered: false, scanned: true })
    expect(state.inserts[0].table).toBe('eventCapture')
    expect(state.inserts[1]).toMatchObject({ table: 'prospectSuppression', values: { reason: 'no_consent', email: 'dana@smilebright.com' } })
    expect(runGradeMock).toHaveBeenCalledWith(expect.objectContaining({ quiet: true, hunter: false, state: 'AR' }))
    // nurture stamps resolved (the no-opt-in law), then the grade's prospect link, then the capture link
    expect(state.updates.some((u) => (u.set as { nurtureReportAt?: unknown }).nurtureReportAt instanceof Date)).toBe(true)
    expect(addProspectMock).toHaveBeenCalledWith(expect.objectContaining({ intent: { emailSource: 'event', signal: 'event_met' } }))
    expect(state.updates.at(-1)).toMatchObject({ set: { gradeId: 'pgrd_1', prospectId: 'pros_new' } })
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('opt-in: a prior unsubscribe is cleared, no nurture stamp, an existing prospect by email is promoted quietly', async () => {
    state.selectQueue.push([{ id: 'pgrd_1' }])
    state.selectQueue.push([{ id: 'pros_old', status: 'contacted' }])
    const res = await createCapture(event, { ...input, optIn: true }, null)
    expect(res.ok).toBe(true)
    expect(state.deletes).toBe(1)
    expect(state.inserts.some((i) => i.table === 'prospectSuppression')).toBe(false)
    expect(state.updates.some((u) => (u.set as { nurtureReportAt?: unknown }).nurtureReportAt)).toBe(false)
    expect(state.updates.some((u) => (u.set as { intentSignal?: string }).intentSignal === 'event_met')).toBe(true)
    expect(addProspectMock).not.toHaveBeenCalled()
  })

  it('a failed scan still leaves a person with a headshot coming', async () => {
    runGradeMock.mockRejectedValueOnce(new Error('places down'))
    state.selectQueue.push([]) // prospect by email
    const res = await createCapture(event, input, null)
    expect(res).toMatchObject({ ok: true, scanned: false })
    expect(state.inserts[0].table).toBe('eventCapture')
  })

  it('with a phone photo: uploads, delivers with the scan line + tagged links, stamps deliveredAt', async () => {
    state.selectQueue.push([{ id: 'pgrd_1' }])
    state.selectQueue.push([])
    // attachHeadshot: capture row, event row, then the grade summary
    state.selectQueue.push([
      { id: 'mcap_1', eventId: 'mevt_1', token: 'h'.repeat(32), firstName: 'Dana', lastName: 'Reyes', email: 'dana@smilebright.com',
        practiceName: 'Smile Bright Dental', role: 'dentist', city: 'Conway', photoUrl: null, optIn: 0, gradeId: 'pgrd_1', prospectId: null, deliveredAt: null },
    ])
    state.selectQueue.push([{ ...event, active: 1 }])
    state.selectQueue.push([{ token: 'g'.repeat(32), result: { letter: 'C', overall: 61, axes: {} } }])
    const res = await createCapture(event, input, { bytes: Buffer.from([0xff, 0xd8, 0xff, 1, 2]), contentType: 'image/jpeg' })
    expect(res).toMatchObject({ ok: true, delivered: true })
    expect(uploadMock).toHaveBeenCalledWith(expect.stringMatching(/^events\/asda-2026\/mcap_[a-z0-9]+\.jpg$/), expect.anything(), { contentType: 'image/jpeg' })
    const mail = deliverMock.mock.calls[0][0] as { to: string; subject: string; html: string }
    expect(mail.to).toBe('dana@smilebright.com')
    expect(mail.subject).toBe('Your headshot from ASDA Annual Session 2026')
    expect(mail.html).toContain('/h/' + 'h'.repeat(32) + '?utm_source=association&utm_medium=email&utm_campaign=asda-2026')
    expect(mail.html).toContain('/g/' + 'g'.repeat(32) + '?utm_source=grader')
    expect(mail.html).toContain('only email')
    expect(state.updates.at(-1)).toMatchObject({ set: { deliveredAt: expect.any(Date) } })
  })
})

describe('attachHeadshot', () => {
  it('a capture already delivered gets the photo REPLACED but no second email', async () => {
    state.selectQueue.push([{ id: 'mcap_1', eventId: 'mevt_1', photoUrl: 'old', deliveredAt: new Date(), optIn: 1, gradeId: null, token: 'h'.repeat(32), firstName: 'D', email: 'd@x.com', practiceName: 'P' }])
    state.selectQueue.push([{ ...event, active: 1 }])
    const res = await attachHeadshot('mcap_1', { bytes: Buffer.from([1]), contentType: 'image/png' })
    expect(res).toEqual({ ok: true, delivered: false })
    expect(uploadMock).toHaveBeenCalled()
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('a delivery failure does NOT stamp — the owner can resend', async () => {
    state.selectQueue.push([{ id: 'mcap_1', eventId: 'mevt_1', photoUrl: null, deliveredAt: null, optIn: 1, gradeId: null, token: 'h'.repeat(32), firstName: 'D', email: 'd@x.com', practiceName: 'P' }])
    state.selectQueue.push([{ ...event, active: 1 }])
    deliverMock.mockRejectedValueOnce(new Error('smtp down'))
    const res = await attachHeadshot('mcap_1', { bytes: Buffer.from([1]), contentType: 'image/jpeg' })
    expect(res).toEqual({ ok: true, delivered: false })
    expect(state.updates).toHaveLength(1) // the photoUrl write only
    expect(state.updates[0]).toMatchObject({ set: { photoUrl: expect.any(String) } })
  })

  it('refuses empty and oversized bytes', async () => {
    expect(await attachHeadshot('mcap_1', { bytes: Buffer.alloc(0), contentType: 'image/jpeg' })).toMatchObject({ ok: false })
    expect(await attachHeadshot('mcap_1', { bytes: Buffer.alloc(9 * 1024 * 1024), contentType: 'image/jpeg' })).toMatchObject({ ok: false })
  })
})
