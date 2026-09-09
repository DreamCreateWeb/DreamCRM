import { describe, it, expect, vi, beforeEach } from 'vitest'

// House chain mock. runGraderNurture's select order: touch-1 batch → per
// kept row [suppression → user → newer-run] (short-circuit) → touch-2
// batch → same per row. update() records the stamps.
const state: {
  selectQueue: unknown[][]
  updates: { set: unknown }[]
} = { selectQueue: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
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
      update: () => ({ set: (v: unknown) => ({ where: async () => void state.updates.push({ set: v }) }) }),
    },
    schema,
  }
})

const { deliverMock } = vi.hoisted(() => ({ deliverMock: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
  deliver: deliverMock,
  authEmailShell: (o: { heading: string; introHtml: string; buttonUrl?: string; footnoteHtml?: string }) =>
    `<html>${o.heading}|${o.introHtml}|${o.buttonUrl ?? ''}|${o.footnoteHtml ?? ''}</html>`,
}))

import { runGraderNurture } from '@/lib/services/grader-nurture'
import {
  NURTURE_REGRADE_DAYS,
  NURTURE_REPORT_DAYS,
  NURTURE_REPORT_MAX_DAYS,
  inNurtureWindow,
  topFixFor,
} from '@/lib/grader-nurture'
import { gradeOnlinePresence } from '@/lib/practice-grade'
import type { ProspectCrawlSignals, ProspectAiVerdict } from '@/lib/types/prospecting'

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
})

const NOW = new Date('2026-09-09T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000)

const signals: ProspectCrawlSignals = {
  ssl: true, mobileViewport: true, copyrightYear: 2026, titleTag: null, metaDescription: null,
  bookingWidget: false, socialLinks: {}, builder: null, pageWeightKb: 900, emails: [],
  fetchedAt: NOW.toISOString(),
}
const verdict: ProspectAiVerdict = {
  hasWebsite: true, websiteQuality: 55, websiteReasons: [], socialPresence: 10,
  onlineBooking: false, weaknesses: [], summary: '',
}
const gradedResult = gradeOnlinePresence({
  enteredUrl: 'https://smilebright.com', signals, verdict, place: null, placesChecked: true, now: NOW,
})

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pgrd_1',
    token: 'a'.repeat(32),
    email: 'dr@smilebright.com',
    practiceName: 'Smile Bright Dental',
    result: gradedResult,
    prospectId: 'pros_1',
    createdAt: daysAgo(4),
    ...over,
  }
}

describe('the pure half', () => {
  it('window math: due at min, stale at max', () => {
    expect(inNurtureWindow(daysAgo(NURTURE_REPORT_DAYS), NOW, NURTURE_REPORT_DAYS, NURTURE_REPORT_MAX_DAYS)).toBe(true)
    expect(inNurtureWindow(daysAgo(NURTURE_REPORT_DAYS - 1), NOW, NURTURE_REPORT_DAYS, NURTURE_REPORT_MAX_DAYS)).toBe(false)
    expect(inNurtureWindow(daysAgo(NURTURE_REPORT_MAX_DAYS), NOW, NURTURE_REPORT_DAYS, NURTURE_REPORT_MAX_DAYS)).toBe(false)
  })

  it('topFixFor picks a remedied finding from the worst axis; a clean report yields null', () => {
    const fix = topFixFor(gradedResult)
    expect(fix).not.toBeNull()
    expect(fix!.after.length).toBeGreaterThan(10)
    const clean = { ...gradedResult, axes: { ...gradedResult.axes, website: { score: 95, findings: [], wins: [] }, listing: { score: null, findings: [], wins: [] }, reviews: { score: null, findings: [], wins: [] }, search: { score: null, findings: [], wins: [] } } }
    expect(topFixFor(clean)).toBeNull()
  })
})

describe('runGraderNurture', () => {
  it('sends the day-3 one-fix nudge with the report link and a working unsubscribe', async () => {
    state.selectQueue.push([row()]) // touch-1 batch
    state.selectQueue.push([], [], []) // not suppressed, no account, no newer
    state.selectQueue.push([]) // touch-2 batch
    const run = await runGraderNurture(NOW)
    expect(run.reportSent).toBe(1)
    expect(run.errors).toBe(0)
    const mail = deliverMock.mock.calls[0][0] as { to: string; subject: string; html: string }
    expect(mail.to).toBe('dr@smilebright.com')
    expect(mail.html).toContain('/g/' + 'a'.repeat(32))
    expect(mail.html).toContain('utm_campaign=nurture-report')
    expect(mail.html).toContain('/api/unsub/')
    expect(state.updates).toHaveLength(1) // stamped
  })

  it('suppression wins, signup wins, a newer run wins — all stamped as handled, none emailed', async () => {
    state.selectQueue.push([
      row({ id: 'pgrd_a', email: 'suppressed@x.com' }),
      row({ id: 'pgrd_b', email: 'customer@x.com' }),
      row({ id: 'pgrd_c', email: 'returned@x.com' }),
    ])
    state.selectQueue.push([{ id: 'psup_1' }]) // a: suppressed (short-circuits)
    state.selectQueue.push([], [{ id: 'user_1' }]) // b: not suppressed, has account
    state.selectQueue.push([], [], [{ id: 'pgrd_newer' }]) // c: newer run exists
    state.selectQueue.push([]) // touch-2 batch
    const run = await runGraderNurture(NOW)
    expect(run.reportSent).toBe(0)
    expect(run.skipped).toBe(3)
    expect(deliverMock).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(3)
  })

  it('a row with NO prospectId is never emailed — no working unsubscribe target, no send', async () => {
    state.selectQueue.push([row({ prospectId: null })])
    state.selectQueue.push([])
    const run = await runGraderNurture(NOW)
    expect(run.reportSent).toBe(0)
    expect(run.skipped).toBe(1)
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('the day-14 touch invites the re-grade with the delta pitch', async () => {
    state.selectQueue.push([]) // touch-1 batch empty
    state.selectQueue.push([row({ id: 'pgrd_old', createdAt: daysAgo(NURTURE_REGRADE_DAYS + 1) })])
    state.selectQueue.push([], [], []) // clean guards
    const run = await runGraderNurture(NOW)
    expect(run.regradeSent).toBe(1)
    const mail = deliverMock.mock.calls[0][0] as { html: string }
    expect(mail.html).toContain('utm_campaign=nurture-regrade')
    expect(mail.html).toContain('since your last grade')
  })

  it('a deliver failure counts as an error and does NOT stamp — the daily cron retries', async () => {
    state.selectQueue.push([row()])
    state.selectQueue.push([], [], [])
    state.selectQueue.push([])
    deliverMock.mockRejectedValueOnce(new Error('smtp down'))
    const run = await runGraderNurture(NOW)
    expect(run.errors).toBe(1)
    expect(state.updates).toHaveLength(0)
  })
})
