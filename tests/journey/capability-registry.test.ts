import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CAPABILITIES,
  GRANTABLE_CAPABILITIES,
  BOOKING_BUTTON_CAPABILITIES,
  SETUP_CAPABILITIES,
  PREVIEW_CAPABILITIES,
  isGrantable,
} from '@/lib/autonomy'
import {
  SPECIALISTS,
  SPECIALIST_NEEDS,
  specialistBlocker,
  CAPABILITY_ICON,
} from '@/lib/types/dream-team'
import { STANDUP_NOUNS } from '@/lib/standup-nouns'
import { resolveReadiness, type ReadinessFact, type ReadinessInput } from '@/lib/readiness'

/**
 * THE CAPABILITY REGISTRY's parity guard (ML-11 — the registry PR for the
 * whole generator lane). Every list that names a capability is a lens over
 * lib/autonomy's CAPABILITIES, and every lens drifts the moment a key is
 * added to one home and not the others. This pins them together: the
 * roster seats, the specialists' needs, grantability's coupling to the
 * executor switch, the preview list's coupling to the driver list, and
 * the artifact union's coupling to its renderers.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const REGISTERED = new Set(CAPABILITIES.map((c) => c.key))

/** The deliberate absences from the roster: how work reaches the clinic /
 *  the watcher's own voice, and the one-time setup asks (first-week
 *  questions, not standing jobs on anyone's desk — the roster suite's rule). */
const META = new Set(['guardian_note', 'proposal_engine', 'staff_alert', 'inbox_sync', 'metric_snapshot', ...SETUP_CAPABILITIES])

const keysOf = (list: readonly string[]) => Array.from(new Set(list))

describe('the registry ↔ the roster', () => {
  it('every registered capability that is not meta or a setup ask sits on exactly one specialist', () => {
    const seats = new Map<string, string[]>()
    for (const s of SPECIALISTS) {
      for (const c of s.capabilities) seats.set(c, [...(seats.get(c) ?? []), s.id])
    }
    for (const c of CAPABILITIES) {
      const on = seats.get(c.key) ?? []
      if (META.has(c.key)) {
        expect(on, `${c.key} is meta — keep it off the roster`).toEqual([])
      } else {
        expect(on, `${c.key} must sit on exactly one specialist`).toHaveLength(1)
      }
    }
  })

  it('every specialist capability is registered', () => {
    for (const s of SPECIALISTS) {
      for (const c of s.capabilities) expect(REGISTERED.has(c), `${s.id} lists unknown ${c}`).toBe(true)
    }
  })

  it('every SPECIALISTS id has a needs entry, and the needs name no stranger', () => {
    const ids = SPECIALISTS.map((s) => s.id)
    for (const id of ids) expect(SPECIALIST_NEEDS, `${id} has no SPECIALIST_NEEDS entry`).toHaveProperty(id)
    for (const id of Object.keys(SPECIALIST_NEEDS)) expect(ids, `${id} is not a specialist`).toContain(id)
  })

  it('every needed fact id is one the readiness resolver grades for a day-0 practice', () => {
    // A practice with nothing connected: every door the specialists can
    // need must be a fact in its report, or the "Needs X →" line could
    // never render for the clinic it exists for.
    const dayZero: ReadinessInput = {
      personalizationNeeded: true,
      logoUrl: null,
      heroImageUrl: null,
      siteTeamCount: 0,
      hours: { present: true, source: 'seeded', looksSeeded: true },
      selfBookingEnabled: true,
      siteLive: false,
      domainState: null,
      gsc: { platformConnected: false, customDomain: false },
      gbp: { connected: false, errored: false, websiteButton: null },
      socialCount: 0,
      pms: null,
      hasPatients: false,
      inbox: { connected: false, errored: false },
      stripeStatus: 'none',
      smsState: null,
      reviewsConfigured: false,
      portalCustomized: false,
      memberCount: 1,
      hasShopProduct: false,
    }
    const graded = new Set(resolveReadiness(dayZero).facts.map((f) => f.id))
    for (const [id, needs] of Object.entries(SPECIALIST_NEEDS)) {
      for (const need of needs) expect(graded.has(need), `${id} needs '${need}', which the resolver never grades`).toBe(true)
    }
    // The brief's seating, pinned: who waits on what.
    expect(SPECIALIST_NEEDS).toEqual({
      front_desk: [],
      scheduling: ['patients'],
      reputation: ['gbp'],
      content: ['social'],
      outreach: ['patients'],
      back_office: ['pms'],
    })
  })
})

describe('specialistBlocker', () => {
  const fact = (id: ReadinessFact['id'], grade: ReadinessFact['grade']): ReadinessFact => ({
    id,
    label: `label ${id}`,
    grade,
    summary: '',
    href: `/door/${id}`,
    optional: false,
  })

  it('names the first todo or attention fact the specialist needs — never a ready, na or waiting one', () => {
    expect(specialistBlocker('reputation', [fact('gbp', 'todo')])?.id).toBe('gbp')
    expect(specialistBlocker('reputation', [fact('gbp', 'attention')])?.id).toBe('gbp')
    expect(specialistBlocker('reputation', [fact('gbp', 'ready')])).toBeNull()
    expect(specialistBlocker('reputation', [fact('gbp', 'na')])).toBeNull()
    // Waiting is an external queue the practice already did its part for.
    expect(specialistBlocker('back_office', [fact('pms', 'waiting')])).toBeNull()
    expect(specialistBlocker('back_office', [fact('pms', 'todo')])?.href).toBe('/door/pms')
  })

  it('the front desk needs nothing, an unknown specialist nothing, and an unreadable report blocks no one', () => {
    expect(specialistBlocker('front_desk', [fact('gbp', 'todo'), fact('patients', 'todo')])).toBeNull()
    expect(specialistBlocker('nobody', [fact('gbp', 'todo')])).toBeNull()
    expect(specialistBlocker('reputation', null)).toBeNull()
    expect(specialistBlocker('reputation', undefined)).toBeNull()
    expect(specialistBlocker('reputation', [])).toBeNull()
  })
})

describe('grantability', () => {
  it('GRANTABLE ⊆ registered', () => {
    for (const c of GRANTABLE_CAPABILITIES) expect(REGISTERED.has(c), `'${c}' is not registered`).toBe(true)
  })

  it('GRANTABLE ⊆ executable — a grant runs through executeProposal, whose default branch refuses the rest', () => {
    const src = read('lib/services/proposals.ts')
    for (const c of GRANTABLE_CAPABILITIES) {
      expect(src, `'${c}' is grantable but executeProposal has no case for it`).toContain(`case '${c}':`)
    }
  })

  it('the generator lane’s four intended grants become grantable in the slice that ships their executor — not before, not after', () => {
    const src = read('lib/services/proposals.ts')
    for (const c of ['inquiry_followup', 'postop_checkin', 'rebook_nudge', 'referral_ask']) {
      const hasCase = src.includes(`case '${c}':`)
      expect(isGrantable(c), `'${c}': grantable=${isGrantable(c)} but executor case=${hasCase} — they land together`).toBe(hasCase)
    }
  })

  it('the never-grantable lanes stay off the ladder', () => {
    for (const c of [
      'patient_reply',
      'feedback_reply',
      'newsletter',
      'post_visit_care',
      'membership_rescue',
      'order_update',
      'consent',
      'listing_watch',
      'setup_team_photo',
      'setup_closures',
      'custom_domain',
    ]) {
      expect(REGISTERED.has(c), `'${c}' is not registered`).toBe(true)
      expect(isGrantable(c), `'${c}' must not be grantable`).toBe(false)
    }
  })
})

describe('every list names only registered capabilities', () => {
  it('the booking-button, setup, preview and patient-inbox lists', async () => {
    const { PATIENT_INBOX_CAPABILITIES } = await import('@/lib/services/proposal-generators')
    for (const [name, list] of [
      ['BOOKING_BUTTON_CAPABILITIES', BOOKING_BUTTON_CAPABILITIES],
      ['SETUP_CAPABILITIES', SETUP_CAPABILITIES],
      ['PREVIEW_CAPABILITIES', PREVIEW_CAPABILITIES],
      ['PATIENT_INBOX_CAPABILITIES', PATIENT_INBOX_CAPABILITIES],
    ] as const) {
      for (const c of list) expect(REGISTERED.has(c), `${name} names unregistered '${c}'`).toBe(true)
      expect(keysOf(list), `${name} repeats a key`).toHaveLength(list.length)
    }
    // The lane's machine-initiated patient mail, and the two replies that
    // answer a person the way inquiry_response does, all wait for daylight.
    for (const c of ['inquiry_followup', 'postop_checkin', 'rebook_nudge', 'referral_ask', 'newsletter', 'patient_reply', 'feedback_reply']) {
      expect(PATIENT_INBOX_CAPABILITIES, `'${c}' reaches a patient's inbox`).toContain(c)
    }
    for (const c of ['inquiry_followup', 'rebook_nudge']) {
      expect(BOOKING_BUTTON_CAPABILITIES, `'${c}' exists to get a time booked`).toContain(c)
    }
    for (const c of ['setup_team_photo', 'setup_closures']) {
      expect(SETUP_CAPABILITIES, `'${c}' is a first-week question`).toContain(c)
    }
  })

  it('the icon map and the standup nouns', () => {
    for (const c of Object.keys(CAPABILITY_ICON)) expect(REGISTERED.has(c), `CAPABILITY_ICON names unregistered '${c}'`).toBe(true)
    for (const c of Object.keys(STANDUP_NOUNS)) expect(REGISTERED.has(c), `STANDUP_NOUNS names unregistered '${c}'`).toBe(true)
    // Every lane the generator lane will narrate already has its words.
    for (const c of PREVIEW_CAPABILITIES) {
      expect(STANDUP_NOUNS, `'${c}' has no standup noun`).toHaveProperty(c)
      expect(CAPABILITY_ICON, `'${c}' has no card icon`).toHaveProperty(c)
    }
  })
})

describe('the preview list is the generator lane’s release lever', () => {
  it('a preview capability is never auto — nothing acts yet, so nothing may claim to act on its own', () => {
    // tests/journey/spine.test.ts holds every 'auto' capability to a ledger
    // writer; the lanes meant to run on their own (post_visit_care,
    // membership_rescue, order_update, consent, listing_watch) flip to
    // 'auto' in the slice that ships the writer and leaves preview.
    for (const c of PREVIEW_CAPABILITIES) {
      expect(CAPABILITIES.find((d) => d.key === c)?.defaultTrust, `'${c}' is in preview but defaults to auto`).toBe('ask')
    }
  })

  it('a preview capability sits on the roster (hiding it is the point) and has no generator in the driver list yet', () => {
    const seated = new Set(SPECIALISTS.flatMap((s) => s.capabilities))
    const driver = read('lib/services/proposal-generators.ts')
    for (const c of PREVIEW_CAPABILITIES) {
      expect(seated.has(c), `'${c}' is in preview but on no specialist — preview hides roster lanes`).toBe(true)
      // The driver list names each step by its capability (['review_reply', …]);
      // the slice that adds a step deletes the key here in the same change.
      expect(driver, `'${c}' has a generator step — delete it from PREVIEW_CAPABILITIES`).not.toContain(`['${c}',`)
    }
  })
})

describe('every artifact kind has a renderer', () => {
  it('each kind in the ProposalArtifact union has an inbox branch', () => {
    const artifacts = read('app/(default)/dashboard/proposal-artifacts.tsx')
    const unionSrc = artifacts.slice(artifacts.indexOf('export type ProposalArtifact ='))
    const kinds = Array.from(unionSrc.matchAll(/\|\s*\{\s*kind:\s*'(\w+)'/g), (m) => m[1])
    expect(kinds).toEqual(expect.arrayContaining(['social', 'email', 'plan', 'gbp', 'thread', 'precheck', 'listing']))
    const inbox = read('app/(default)/dashboard/approval-inbox.tsx')
    for (const k of kinds) {
      expect(inbox, `artifact kind '${k}' has no branch in the Approval Inbox card`).toContain(`artifact?.kind === '${k}'`)
    }
    // …and each new renderer is a real export the inbox imports.
    for (const name of ['ThreadArtifact', 'PrecheckArtifact', 'ListingArtifact']) {
      expect(artifacts).toContain(`export function ${name}(`)
      expect(inbox).toContain(`<${name} `)
    }
  })
})
