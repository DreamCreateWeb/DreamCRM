import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  smsConsentDisclosure,
  smsStopConfirmation,
  smsHelpReply,
  classifyInboundKeyword,
  isConsentSource,
  SMS_CONSENT_LABEL,
} from '@/lib/sms-consent'

/**
 * SMS CONSENT — the words, and what makes them count.
 *
 * Marketing texts need prior express WRITTEN consent: a disclosure the
 * patient actually saw, an affirmative act, and a record of both. These pin
 * the disclosure's load-bearing clauses and the keyword handling a carrier
 * requires be honoured whatever else a message says.
 */

describe('the disclosure', () => {
  const text = smsConsentDisclosure('Dream Dental')

  it('names the sender — consent is given to a specific business', () => {
    expect(text).toContain('Dream Dental')
  })

  it('says consent is NOT a condition of booking — the clause that keeps it optional', () => {
    expect(text.toLowerCase()).toContain('isn’t required to book')
  })

  it('carries the frequency, the rates caveat, and the way out', () => {
    expect(text.toLowerCase()).toContain('a month') // how often
    expect(text.toLowerCase()).toContain('message and data rates may apply')
    expect(text).toContain('STOP')
    expect(text).toContain('HELP')
  })

  it('degrades to a sayable sentence when the clinic has no name yet', () => {
    const anon = smsConsentDisclosure('   ')
    expect(anon).toContain('this practice')
    expect(anon).not.toContain('undefined')
  })

  it('the checkbox label is about the patient’s benefit, not our plumbing', () => {
    expect(SMS_CONSENT_LABEL.toLowerCase()).not.toContain('sms')
    expect(SMS_CONSENT_LABEL.toLowerCase()).not.toContain('opt-in')
  })
})

describe('the replies a carrier requires', () => {
  it('the STOP confirmation says they are out, and how to come back', () => {
    const t = smsStopConfirmation('Dream Dental')
    expect(t).toContain('Dream Dental')
    expect(t.toLowerCase()).toContain('unsubscribed')
    expect(t).toContain('START')
  })

  it('the HELP reply names the practice and the way out', () => {
    const t = smsHelpReply('Dream Dental', '(415) 555-0142')
    expect(t).toContain('Dream Dental')
    expect(t).toContain('(415) 555-0142')
    expect(t).toContain('STOP')
  })

  it('the HELP reply omits the phone clause entirely when there is no number', () => {
    const t = smsHelpReply('Dream Dental', null)
    expect(t).not.toContain('Call us at')
    expect(t).toContain('STOP')
  })
})

describe('classifyInboundKeyword', () => {
  it('honours every STOP synonym a carrier requires, in any case', () => {
    for (const w of ['STOP', 'stop', 'Stop', 'UNSUBSCRIBE', 'cancel', 'END', 'quit', 'optout']) {
      expect(classifyInboundKeyword(w), w).toBe('stop')
    }
  })

  it('honours trailing punctuation and politeness — "stop please" means stop', () => {
    expect(classifyInboundKeyword('STOP.')).toBe('stop')
    expect(classifyInboundKeyword('stop please')).toBe('stop')
    expect(classifyInboundKeyword('  Stop!  ')).toBe('stop')
  })

  it('recognises START and HELP', () => {
    expect(classifyInboundKeyword('START')).toBe('start')
    expect(classifyInboundKeyword('yes')).toBe('start')
    expect(classifyInboundKeyword('HELP')).toBe('help')
    expect(classifyInboundKeyword('info')).toBe('help')
  })

  it('does NOT unsubscribe someone using the word in a sentence', () => {
    // The failure that matters: unsubscribing a patient who said this would
    // silently cut off their appointment reminders, and nobody would know.
    expect(classifyInboundKeyword('I need to stop by after work')).toBeNull()
    expect(classifyInboundKeyword('can I cancel my Tuesday appointment?')).toBeNull()
    expect(classifyInboundKeyword('please help me reschedule')).toBeNull()
  })

  it('an ordinary message is an ordinary message', () => {
    expect(classifyInboundKeyword('running 10 min late')).toBeNull()
    expect(classifyInboundKeyword('')).toBeNull()
    expect(classifyInboundKeyword(null)).toBeNull()
  })
})

describe('isConsentSource', () => {
  it('accepts the real sources and rejects anything else', () => {
    expect(isConsentSource('booking')).toBe(true)
    expect(isConsentSource('keyword')).toBe(true)
    expect(isConsentSource('guessed')).toBe(false)
    expect(isConsentSource(null)).toBe(false)
  })
})

// ── The service half ────────────────────────────────────────────────────────

const store = vi.hoisted(() => ({
  patients: [] as Array<Record<string, unknown>>,
  failWrites: false,
}))

vi.mock('@/lib/db', () => {
  const col = (n: string) => ({ __col: n })
  const match = (preds: unknown[], r: Record<string, unknown>) =>
    preds.flat().filter(Boolean).every((p) => (p as (x: Record<string, unknown>) => boolean)(r))
  return {
    db: {
      select: (cols?: Record<string, unknown>) => {
        const filters: unknown[] = []
        const api: Record<string, unknown> = {}
        api.from = () => api
        api.where = (p: unknown) => { filters.push(p); return api }
        const rows = () => {
          const out = store.patients.filter((r) => match(filters, r))
          // Map the ALIAS to the underlying column, the way drizzle does. A
          // mock keyed on the alias silently returns undefined for every
          // aliased select, which reads as "no record" and would have let
          // this file pass while the opt-out guard did nothing.
          return cols
            ? out.map((r) =>
                Object.fromEntries(
                  Object.entries(cols).map(([alias, c]) => [alias, r[(c as { __col: string }).__col]]),
                ),
              )
            : out
        }
        api.limit = async () => rows()
        api.then = (res: (v: unknown) => void) => res(rows())
        return api
      },
      update: () => {
        const filters: unknown[] = []
        let patch: Record<string, unknown> = {}
        const api: Record<string, unknown> = {}
        api.set = (p: Record<string, unknown>) => { patch = p; return api }
        api.where = (p: unknown) => {
          filters.push(p)
          if (store.failWrites) return Promise.reject(new Error('db down'))
          for (const r of store.patients) if (match(filters, r)) Object.assign(r, patch)
          return Promise.resolve(undefined)
        }
        return api
      },
    },
    schema: {
      patient: {
        __name: 'patient',
        id: col('id'),
        organizationId: col('organizationId'),
        phone: col('phone'),
        marketingSmsOptIn: col('marketingSmsOptIn'),
        marketingSmsOptInAt: col('marketingSmsOptInAt'),
        marketingSmsOptOutAt: col('marketingSmsOptOutAt'),
        marketingOptInSource: col('marketingOptInSource'),
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  and: (...p: unknown[]) => p.flat().filter(Boolean),
}))

import { recordSmsOptIn, recordSmsOptOut, clearSmsOptOut } from '@/lib/services/sms-consent'

const ORG = 'org_1'
const patient = (over: Record<string, unknown> = {}) => ({
  id: 'pat_1',
  organizationId: ORG,
  phone: '(415) 555-0142',
  marketingSmsOptIn: 0,
  marketingSmsOptInAt: null,
  marketingSmsOptOutAt: null,
  marketingOptInSource: null,
  ...over,
})

beforeEach(() => {
  store.patients = [patient()]
  store.failWrites = false
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordSmsOptIn', () => {
  it('writes all three columns on a ticked box', async () => {
    const r = await recordSmsOptIn(ORG, 'pat_1', { agreed: true, source: 'booking' })
    expect(r.recorded).toBe(true)
    expect(store.patients[0].marketingSmsOptIn).toBe(1)
    expect(store.patients[0].marketingSmsOptInAt).toBeInstanceOf(Date)
    expect(store.patients[0].marketingOptInSource).toBe('booking')
  })

  it('an UNTICKED box records nothing — not ticking is not the same act as replying STOP', async () => {
    const r = await recordSmsOptIn(ORG, 'pat_1', { agreed: false, source: 'booking' })
    expect(r.recorded).toBe(false)
    expect(r.reason).toBe('declined')
    expect(store.patients[0].marketingSmsOptIn).toBe(0)
    expect(store.patients[0].marketingSmsOptOutAt).toBeNull()
  })

  it('REFUSES to overturn a standing opt-out — the fastest way to earn a complaint', async () => {
    store.patients = [patient({ marketingSmsOptOutAt: new Date('2026-06-01') })]
    const r = await recordSmsOptIn(ORG, 'pat_1', { agreed: true, source: 'booking' })
    expect(r.recorded).toBe(false)
    expect(r.reason).toBe('previously_opted_out')
    expect(store.patients[0].marketingSmsOptIn).toBe(0)
  })

  it('records nothing when the number cannot be texted', async () => {
    const r = await recordSmsOptIn(ORG, 'pat_1', {
      agreed: true,
      source: 'booking',
      phone: '0000000000',
    })
    expect(r.recorded).toBe(false)
    expect(r.reason).toBe('no_number')
  })

  it('rejects an unregistered source rather than storing a value nothing can trace', async () => {
    const r = await recordSmsOptIn(ORG, 'pat_1', { agreed: true, source: 'guessed' as never })
    expect(r.recorded).toBe(false)
  })

  it('NEVER throws — a consent write must not fail the booking that captured it', async () => {
    store.failWrites = true
    const r = await recordSmsOptIn(ORG, 'pat_1', { agreed: true, source: 'booking' })
    expect(r.ok).toBe(false)
    expect(r.recorded).toBe(false)
  })
})

describe('recordSmsOptOut', () => {
  it('clears the flag AND stamps when, by patient', async () => {
    store.patients = [patient({ marketingSmsOptIn: 1 })]
    expect(await recordSmsOptOut(ORG, { patientId: 'pat_1' })).toBe(1)
    expect(store.patients[0].marketingSmsOptIn).toBe(0)
    expect(store.patients[0].marketingSmsOptOutAt).toBeInstanceOf(Date)
  })

  it('stops EVERY patient on a shared number — the carrier sees the number, not our chart', async () => {
    // A family sharing one mobile is a shape this codebase already models.
    store.patients = [
      patient({ id: 'pat_1', phone: '(415) 555-0142', marketingSmsOptIn: 1 }),
      patient({ id: 'pat_2', phone: '415-555-0142', marketingSmsOptIn: 1 }),
      patient({ id: 'pat_3', phone: '(415) 555-9999', marketingSmsOptIn: 1 }),
    ]
    expect(await recordSmsOptOut(ORG, { phone: '+14155550142' })).toBe(2)
    expect(store.patients[0].marketingSmsOptIn).toBe(0)
    expect(store.patients[1].marketingSmsOptIn).toBe(0)
    expect(store.patients[2].marketingSmsOptIn).toBe(1)
  })

  it('does nothing for a number it cannot parse rather than guessing who meant it', async () => {
    expect(await recordSmsOptOut(ORG, { phone: 'not a number' })).toBe(0)
  })
})

describe('clearSmsOptOut', () => {
  it('is the ONLY path that undoes a STOP, and it clears the stamp', async () => {
    store.patients = [patient({ marketingSmsOptOutAt: new Date('2026-06-01') })]
    expect(await clearSmsOptOut(ORG, 'pat_1', 'keyword')).toBe(true)
    expect(store.patients[0].marketingSmsOptIn).toBe(1)
    expect(store.patients[0].marketingSmsOptOutAt).toBeNull()
    expect(store.patients[0].marketingOptInSource).toBe('keyword')
  })
})
