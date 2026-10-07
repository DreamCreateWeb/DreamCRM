import { describe, it, expect } from 'vitest'
import {
  ACTIVATION_DOORS,
  MORNING_AFTER_DAYS,
  ONE_THING_DAYS,
  SITE_NOT_LIVE_DOOR,
  buildMorningAfter,
  describeWork,
  pickOneThing,
  type MorningAfterInput,
} from '@/lib/morning-after'
import { ACTIVATION_EVENTS } from '@/lib/activation'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** A dashboard route exists when its page file does (every door here lives under app/(default)). */
const routeExists = (path: string) => existsSync(join(process.cwd(), 'app/(default)', path, 'page.tsx'))

/**
 * docs/ACTIVATION.md law 6 — the morning after. The digest's three added
 * sentences: WHAT HAPPENED (the ledger's night in the standup's nouns), ONE
 * THING (a card on a human, then something broken, then the next activation
 * door while the clinic is new), WHAT IT WAITS ON (the doors pending on the
 * platform) — and the rule that a quiet first week is narrated, not skipped.
 */

const NONE = { a1: null, a2: null, a3: null, a4: null, a5: null }

function input(over: Partial<MorningAfterInput> = {}): MorningAfterInput {
  return { day: 1, activation: NONE, work: {}, failures: 0, openCards: [], pendingOnUs: [], attention: [], ...over }
}

describe('describeWork', () => {
  it('names the night in the standup’s nouns, biggest first, five lines then "and N more"', () => {
    expect(describeWork({ appointment_reminder: 12, review_request: 1 })).toBe('12 appointment reminders · 1 review invitation')
    const many = describeWork({ a: 9, b: 8, c: 7, d: 6, e: 5, f: 2, g: 1 })
    expect(many).toMatch(/^9 a · 8 b · 7 c · 6 d · 5 e · and 3 more small things$/)
    expect(describeWork({})).toBeNull()
    expect(describeWork({ review_reply: 0 })).toBeNull()
  })
})

describe('what happened', () => {
  it('says what went out, and that some jobs hit trouble, in one line', () => {
    const m = buildMorningAfter(input({ work: { appointment_reminder: 3 }, failures: 2 }))
    expect(m.happened).toBe("⚙️ Since yesterday I handled: 3 appointment reminders. 2 of my own jobs hit trouble — that's mine to sort out, and I'm on it.")
  })
  it('a night of nothing but failures is not a quiet night', () => {
    const m = buildMorningAfter(input({ failures: 1 }))
    expect(m.happened).toBe("⚙️ Nothing went out since yesterday — 1 of my own job hit trouble — that's mine to sort out, and I'm on it.")
    expect(m.quietLine).toBeNull()
  })
  it('is null when nothing happened and nothing failed', () => {
    expect(buildMorningAfter(input()).happened).toBeNull()
  })
})

describe('one thing', () => {
  it('a card on a human comes first and names the first card, with the rest counted', () => {
    const one = pickOneThing(input({ openCards: [{ title: 'Reply to Maria’s review' }, { title: 'x' }, { title: 'y' }], attention: [{ label: 'Stripe', summary: 'broken', href: '/payments' }] }))
    expect(one).toEqual({ kind: 'card', text: 'Say yes to “Reply to Maria’s review” on your Dream Team page (and 2 more waiting).', href: '/dream-team' })
    expect(routeExists('/dream-team')).toBe(true)
    expect(pickOneThing(input({ openCards: [{ title: 'One' }] }))?.text).toBe('Say yes to “One” on your Dream Team page.')
  })
  it('"and N more" counts the whole stack, not the short list the digest loaded (audit round 1)', () => {
    const one = pickOneThing(input({ openCards: [{ title: 'One' }, { title: 'Two' }], openCardsTotal: 9 }))
    expect(one?.text).toBe('Say yes to “One” on your Dream Team page (and 8 more waiting).')
    // A total smaller than the list (a stale count) never shrinks the truth.
    expect(pickOneThing(input({ openCards: [{ title: 'One' }, { title: 'Two' }], openCardsTotal: 0 }))?.text).toBe('Say yes to “One” on your Dream Team page (and 1 more waiting).')
  })
  it('then something broken, in the readiness resolver’s own words and door', () => {
    const one = pickOneThing(input({ attention: [{ label: 'Google Business needs attention', summary: 'The listing points at the old site.', href: '/integrations' }] }))
    expect(one).toEqual({ kind: 'attention', text: 'Google Business needs attention — The listing points at the old site.', href: '/integrations' })
  })
  it('then the next activation door, only while the clinic is new', () => {
    expect(pickOneThing(input({ day: 1 }))).toEqual({ kind: 'activation', ...ACTIVATION_DOORS.a1 })
    expect(pickOneThing(input({ day: 1, activation: { ...NONE, a1: new Date() } }))).toEqual({ kind: 'activation', text: ACTIVATION_DOORS.a2.text, href: ACTIVATION_DOORS.a2.href })
    expect(pickOneThing(input({ day: ONE_THING_DAYS }))).toBeNull()
    // The A1 door asks them to bind the PMS; when that bind is ours, the ask
    // would contradict the same email's "still on us" line (audit round 2).
    expect(pickOneThing(input({ day: 2, pendingOnUs: [{ label: 'Connecting Eaglesoft', kind: 'pms' }] }))).toBeNull()
    expect(pickOneThing(input({ day: 2, pendingOnUs: [{ label: 'Texting (carriers)', kind: 'sms' }] }))).toEqual({ kind: 'activation', text: ACTIVATION_DOORS.a1.text, href: ACTIVATION_DOORS.a1.href })
    // The A3 door is the booking page, which only exists once the site is
    // live — a clinic whose site is still private is sent to put it live first.
    const a1a2 = { ...NONE, a1: new Date(), a2: new Date() }
    expect(pickOneThing(input({ day: 2, activation: a1a2, siteLive: false }))).toEqual({ kind: 'activation', ...SITE_NOT_LIVE_DOOR })
    expect(pickOneThing(input({ day: 2, activation: a1a2, siteLive: true }))).toEqual({ kind: 'activation', text: ACTIVATION_DOORS.a3.text, href: ACTIVATION_DOORS.a3.href })
    expect(pickOneThing(input({ day: 2, activation: a1a2 }))).toEqual({ kind: 'activation', text: ACTIVATION_DOORS.a3.text, href: ACTIVATION_DOORS.a3.href })
    expect(routeExists(SITE_NOT_LIVE_DOOR.href)).toBe(true)
    // A door a person closed is never the one thing (verification round).
    const toA5 = { a1: new Date(), a2: new Date(), a3: new Date(), a4: new Date(), a5: null }
    expect(pickOneThing(input({ day: 2, activation: toA5 }))).toEqual({ kind: 'activation', text: ACTIVATION_DOORS.a5.text, href: ACTIVATION_DOORS.a5.href })
    expect(pickOneThing(input({ day: 2, activation: toA5, doorsClosed: ['intake_forms'] }))).toBeNull()
    expect(pickOneThing(input({ day: 2, activation: a1a2, doorsClosed: ['growth'] }))).toEqual({ kind: 'activation', text: ACTIVATION_DOORS.a3.text, href: ACTIVATION_DOORS.a3.href })
    const all = { a1: new Date(), a2: new Date(), a3: new Date(), a4: new Date(), a5: new Date() }
    expect(pickOneThing(input({ day: 1, activation: all }))).toBeNull()
  })
  it('every activation event has a door, and every door is a route that exists', () => {
    for (const e of ACTIVATION_EVENTS) {
      const door = ACTIVATION_DOORS[e.key]
      expect(door.text.length, e.key).toBeGreaterThan(20)
      const path = door.href.split('?')[0]
      expect(routeExists(path), `${e.key} → ${path}`).toBe(true)
    }
  })
})

describe('what it waits on, and the first-week rule', () => {
  it('names the doors on the platform and says there is nothing to do', () => {
    const m = buildMorningAfter(input({ pendingOnUs: [{ label: 'Connecting Open Dental' }, { label: 'Texting (carriers)' }] }))
    expect(m.waitingOn).toBe("⏳ Still on us: Connecting Open Dental · Texting (carriers) — nothing to do on your side; you'll hear from Dream Create.")
  })
  it('a quiet first-week night is narrated — differently before and after the patients are connected', () => {
    const thin = buildMorningAfter(input({ day: 1, activation: NONE, pendingOnUs: [], openCards: [], attention: [] }))
    // Day 1 with no A1: the ladder names A1, so the night is not quiet.
    expect(thin.oneThing?.kind).toBe('activation')
    expect(thin.quietLine).toBeNull()
    const connected = buildMorningAfter(input({ day: 1, activation: { a1: new Date(), a2: new Date(), a3: new Date(), a4: new Date(), a5: new Date() } }))
    expect(connected.oneThing).toBeNull()
    expect(connected.quietLine).toMatch(/quiet night on my side — nothing needed sending/)
    expect(connected.sendsAlone).toBe(true)
  })
  it('after the first week a night with nothing in it does not send on its own', () => {
    const all = { a1: new Date(), a2: new Date(), a3: new Date(), a4: new Date(), a5: new Date() }
    const m = buildMorningAfter(input({ day: MORNING_AFTER_DAYS, activation: all }))
    expect(m.sendsAlone).toBe(false)
    expect(m.quietLine).toBeNull()
    expect(buildMorningAfter(input({ day: MORNING_AFTER_DAYS, activation: all, work: { review_reply: 1 } })).sendsAlone).toBe(true)
    expect(buildMorningAfter(input({ day: MORNING_AFTER_DAYS, activation: all, openCards: [{ title: 'x' }] })).sendsAlone).toBe(true)
  })
})
