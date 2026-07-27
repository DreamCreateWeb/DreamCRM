/**
 * TRANSFORMATION PHASE 1 — the spine (DESIGN.md "The North Star").
 * Pins the three primitives shipped inert under everything:
 *
 *  1. The journey-stage resolver — stage is DERIVED from facts, never
 *     hand-stamped; "patient" means SEATED (a completed visit), not booked.
 *  2. The autonomy ladder — every capability's default encodes exactly
 *     today's shipped behavior (introducing the ladder changed nothing),
 *     unknown capabilities floor at 'ask', stored grants override.
 *  3. The doctrine itself — DESIGN.md carries the North Star and CLAUDE.md
 *     carries the convention, so no future session ships a dashboard where
 *     an employee behavior belongs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { resolveJourneyStage, JOURNEY_STAGE_LABEL } from '@/lib/patient-journey'
import { CAPABILITIES, getCapability, resolveTrust } from '@/lib/autonomy'

const ROOT_DIR = resolve(__dirname, '../..')

/** Source text from the start of `name`'s declaration to the next exported
 *  declaration (or EOF) — so SQL-law greps pin WHERE a predicate lives, not
 *  merely that it exists somewhere in the file. */
function sliceFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}`)
  expect(start, `function ${name} exists`).toBeGreaterThan(-1)
  const rest = src.slice(start + 1)
  const next = rest.search(/\nexport (async )?(function|interface|const)/)
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next)
}

describe('the journey-stage resolver', () => {
  it('inquiry: asked a question, never on the schedule', () => {
    expect(
      resolveJourneyStage({ hasAppointment: false, hasCompletedVisit: false, archived: false }),
    ).toBe('inquiry')
  })

  it('booked: on the schedule, never seated — NOT a patient yet', () => {
    expect(
      resolveJourneyStage({ hasAppointment: true, hasCompletedVisit: false, archived: false }),
    ).toBe('booked')
  })

  it('patient: seated — the only stage "new patients" may ever count', () => {
    expect(
      resolveJourneyStage({ hasAppointment: true, hasCompletedVisit: true, archived: false }),
    ).toBe('patient')
  })

  it('a completed visit wins even with inconsistent facts (data heals forward)', () => {
    // PMS-synced rows can carry a completed visit with no other appointments
    // visible to us — seated is seated.
    expect(
      resolveJourneyStage({ hasAppointment: false, hasCompletedVisit: true, archived: false }),
    ).toBe('patient')
  })

  it('cancelled-only people are INQUIRIES again (the service feeds hasAppointment=false)', () => {
    // The stage asks "are they on the schedule?" — someone whose every
    // booking was cancelled needs re-conversion, not a spot in the booked
    // column. The service encodes this by excluding cancelled from the
    // hasAppointment fact (pinned on the source below); the resolver then
    // lands them back at inquiry. A no-show still counts as booked — they
    // are in the show-up war, not gone.
    expect(
      resolveJourneyStage({ hasAppointment: false, hasCompletedVisit: false, archived: false }),
    ).toBe('inquiry')
    // Pin the predicate in EACH function that derives hasAppointment — a
    // single whole-file match let one of the two sites drop it unnoticed
    // (round-2 audit: placement, not presence).
    const src = readFileSync(join(ROOT_DIR, 'lib/services/patient-journey.ts'), 'utf8')
    for (const fn of ['getJourneyForPatients', 'getJourneyStageCounts']) {
      expect(sliceFunction(src, fn), fn).toMatch(/bool_or\(.*status.*<> 'cancelled'\)/)
    }
  })

  it('archived beats everything — a human decision the resolver honors', () => {
    expect(
      resolveJourneyStage({ hasAppointment: true, hasCompletedVisit: true, archived: true }),
    ).toBe('archived')
  })

  it('every stage has a reader-facing label', () => {
    for (const stage of ['inquiry', 'booked', 'patient', 'archived'] as const) {
      expect(JOURNEY_STAGE_LABEL[stage]).toBeTruthy()
    }
  })
})

describe('the autonomy ladder', () => {
  it('defaults encode exactly today: sends are auto, drafts ask first', () => {
    // Autonomous today (they already send on their own):
    for (const key of [
      'appointment_reminder',
      'review_request',
      'campaign_send',
      'retention_automation',
      'followup_rule',
      'balance_nudge',
      'auto_reply',
      'forms_reminder',
      'nps_survey',
      'noshow_rebook',
      'waitlist_offer',
      'payment_autocharge',
      'service_copywriting',
      'scheduled_message',
      'blog_publish',
      'scheduled_social',
      'domain_autorenew',
      'listing_sync',
    ]) {
      expect(getCapability(key)?.defaultTrust, key).toBe('auto')
    }
    // Ask-first today (drafts that wait for a human yes):
    for (const key of ['review_reply', 'social_post', 'inquiry_response', 'outreach_campaign']) {
      expect(getCapability(key)?.defaultTrust, key).toBe('ask')
    }
  })

  it('missing overrides fall back to the default; grants override; junk is ignored', () => {
    expect(resolveTrust(null, 'appointment_reminder')).toBe('auto')
    expect(resolveTrust({}, 'review_reply')).toBe('ask')
    // The clinic tapped "always do this for me":
    expect(resolveTrust({ review_reply: 'auto' }, 'review_reply')).toBe('auto')
    // ...and can dial one back down:
    expect(resolveTrust({ campaign_send: 'ask' }, 'campaign_send')).toBe('ask')
    // Corrupt values never grant autonomy:
    expect(resolveTrust({ review_reply: 'yolo' }, 'review_reply')).toBe('ask')
  })

  it("unknown capabilities DEFAULT to 'ask'; an explicit stored human grant is honored even pre-registration (by design)", () => {
    // The floor is a default, not a hard invariant: nothing grants ITSELF
    // autonomy, but a human's stored "always do this for me" survives the
    // capability-registration lag (round-1 triage confirmed this by design;
    // round 2 fixed the docs that claimed otherwise).
    expect(resolveTrust(null, 'brand_new_capability')).toBe('ask')
    expect(resolveTrust({ brand_new_capability: 'auto' }, 'brand_new_capability')).toBe('auto')
  })

  it('every capability label is narrator-voiced (no machine keys leaking)', () => {
    for (const c of CAPABILITIES) {
      expect(c.label).not.toMatch(/_/)
      expect(c.label.length).toBeGreaterThan(8)
    }
  })
})

describe('the action ledger has no blind spots', () => {
  const ROOT = resolve(__dirname, '../..')

  function walkServices(): string {
    const dir = join(ROOT, 'lib/services')
    return readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
  }

  it("every 'auto' capability has a recordAction writer — the standup must not under-report the machine", () => {
    // The key just has to appear in a service file (direct `capability: 'x'`
    // or a branch like `isFormsNudge ? 'forms_reminder' : ...`) — the
    // executed writer tests pin the exact wiring per capability.
    const services = walkServices()
    const missing = CAPABILITIES.filter(
      (c) => c.defaultTrust === 'auto' && !services.includes(`'${c.key}'`),
    ).map((c) => c.key)
    expect(missing).toEqual([])
  })

  it('every capability literal a writer records is REGISTERED — a typo mints an orphan stream (reverse guard)', () => {
    // Walk lib/services recursively; every quoted string in a `capability:`
    // expression must be a registered key. (Dynamic keys are backstopped by
    // recordAction's dev warn.)
    const registered = new Set(CAPABILITIES.map((c) => c.key))
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) walk(p)
        else if (entry.name.endsWith('.ts')) {
          const src = readFileSync(p, 'utf8')
          for (const m of Array.from(src.matchAll(/capability:\s*([^,\n]+)/g))) {
            for (const lit of Array.from(m[1].matchAll(/'([a-z0-9_]+)'/g))) {
              if (!registered.has(lit[1])) offenders.push(`${entry.name}: '${lit[1]}'`)
            }
          }
        }
      }
    }
    walk(join(ROOT, 'lib/services'))
    expect(offenders).toEqual([])
  })
})

describe('the doctrine is law', () => {
  const ROOT = resolve(__dirname, '../..')

  it('DESIGN.md carries the North Star with the design test + success law', () => {
    const src = readFileSync(join(ROOT, 'DESIGN.md'), 'utf8')
    expect(src).toContain('The North Star')
    expect(src).toContain('the employee, not the tool')
    expect(src).toContain('does it do the job')
    expect(src).toContain('Minutes-in-app goes DOWN while patients go UP')
    expect(src).toContain('Action Ledger')
    expect(src).toContain('Autonomy Ladder')
  })

  it('CLAUDE.md carries the convention + the transformation as open item 0', () => {
    const src = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
    expect(src).toContain('The North Star is a convention')
    expect(src).toContain('THE TRANSFORMATION')
  })
})
