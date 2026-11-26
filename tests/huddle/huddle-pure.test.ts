import { describe, it, expect } from 'vitest'
import {
  agoLabel,
  buildHeadsUp,
  buildRecapLines,
  flagTone,
  namesList,
  needsPrepCount,
  shortPatientName,
  sourceLine,
  tallyDay,
  toFlagView,
  todaySummary,
  visitState,
  visitTypeLabel,
  type HuddleFlagKey,
  type HuddleVisitView,
  type RecapFacts,
} from '@/lib/huddle'
import type { AuditFlag } from '@/lib/services/patient-audit'

/**
 * THE HUDDLE's pure half (docs/daily-tools.md, slice H1). Every sentence on
 * the page is built here, so this is where its three laws are held: rules
 * and never the AI (there is nothing to mock), say where it came from, and
 * no rankings. Plus the one promise "Hide details" makes — that nothing
 * private survives it.
 */

const ALL_KEYS: HuddleFlagKey[] = [
  'unconfirmed',
  'no_intake',
  'balance',
  'unreachable',
  'new_patient',
  'lapsed_returning',
  'deposit_pending',
  'birthday',
  'insurance_stale',
  'medical_alert',
]

function visit(over: Partial<HuddleVisitView> = {}): HuddleVisitView {
  return {
    id: 'a1',
    patientId: 'p1',
    name: 'Maria Ramirez',
    shortName: 'Maria R.',
    time: '9:00 AM',
    type: 'Cleaning',
    provider: 'Dr. Lee',
    state: 'ahead',
    flags: [],
    ...over,
  }
}

const flag = (key: HuddleFlagKey, label = key) => toFlagView({ key, label })

describe('the Huddle’s flags', () => {
  it('covers every flag the audit can raise — the two lists cannot drift', () => {
    // A compile-time hold as much as a runtime one: if the audit gains a
    // key, this assignment stops type-checking until the Huddle tones it.
    const fromAudit: AuditFlag['key'][] = ALL_KEYS
    const toHuddle: HuddleFlagKey[] = fromAudit
    for (const key of toHuddle) expect(['warn', 'special'], key).toContain(flagTone(key))
  })

  it('tones a celebration as special and prep as warn — never the brand hue, never a status it does not mean', () => {
    for (const k of ['new_patient', 'lapsed_returning', 'birthday'] as const) expect(flagTone(k)).toBe('special')
    for (const k of ['medical_alert', 'unconfirmed', 'no_intake', 'insurance_stale', 'balance', 'deposit_pending', 'unreachable'] as const) {
      expect(flagTone(k)).toBe('warn')
    }
  })

  it('“Hide details” drops the dollar amount and the medical detail, and leaves the rest alone', () => {
    const balance = toFlagView({ key: 'balance', label: 'Owes $350 — worth settling at the visit' })
    expect(balance.quiet).not.toMatch(/\$|350/)
    const alert = toFlagView({ key: 'medical_alert', label: 'Heads-up from their intake: penicillin allergy · warfarin', href: '/intake-forms/submissions/s1' })
    expect(alert.quiet).not.toMatch(/penicillin|warfarin/)
    expect(alert.href).toBe('/intake-forms/submissions/s1')
    const deposit = toFlagView({ key: 'deposit_pending', label: '$50 booking deposit not completed' })
    expect(deposit.quiet).not.toMatch(/\$|50/)
    // Nothing private in these, so they read the same either way.
    for (const key of ['unconfirmed', 'no_intake', 'new_patient', 'birthday', 'insurance_stale', 'unreachable', 'lapsed_returning'] as const) {
      const f = toFlagView({ key, label: `label for ${key}` })
      expect(f.quiet).toBe(f.label)
    }
  })
})

describe('names and visit types', () => {
  it('shortens a name to first name + last initial', () => {
    expect(shortPatientName('Maria Ramirez')).toBe('Maria R.')
    expect(shortPatientName('  Mary Ann  de la Cruz ')).toBe('Mary C.')
    expect(shortPatientName('Cher')).toBe('Cher')
    expect(shortPatientName('')).toBe('')
  })

  it('reads a visit-type id as words', () => {
    expect(visitTypeLabel('new_patient_exam')).toBe('New patient exam')
    expect(visitTypeLabel('checkup')).toBe('Checkup')
    expect(visitTypeLabel('')).toBe('Visit')
  })

  it('maps a visit’s status to where it stands for the team', () => {
    expect(visitState('scheduled')).toBe('ahead')
    expect(visitState('confirmed')).toBe('ahead')
    expect(visitState('completed')).toBe('done')
    expect(visitState('no_show')).toBe('no_show')
  })

  it('never prints a wall of names', () => {
    expect(namesList([])).toBe('')
    expect(namesList(['A'])).toBe('A')
    expect(namesList(['A', 'B'])).toBe('A and B')
    expect(namesList(['A', 'B', 'C'])).toBe('A, B and C')
    expect(namesList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more')
  })
})

describe('the day’s tally', () => {
  it('counts VISITS per flag, in the order a team would say them, with honest plurals', () => {
    const visits = [
      visit({ id: '1', flags: [flag('new_patient'), flag('no_intake')] }),
      visit({ id: '2', flags: [flag('unconfirmed'), flag('no_intake')] }),
      visit({ id: '3', flags: [flag('birthday')] }),
      visit({ id: '4', flags: [] }),
    ]
    expect(tallyDay(visits).map((t) => t.text)).toEqual(['1 first visit', '1 birthday this week', '1 not confirmed', '2 without forms'])
    expect(tallyDay(visits).map((t) => t.tone)).toEqual(['special', 'special', 'warn', 'warn'])
    expect(tallyDay([visit()])).toEqual([])
  })

  it('“needs prep” means a warn flag on a visit still ahead — a birthday is not prep, a done visit is not ahead', () => {
    const visits = [
      visit({ id: '1', flags: [flag('birthday')] }),
      visit({ id: '2', flags: [flag('unconfirmed')] }),
      visit({ id: '3', state: 'done', flags: [flag('balance')] }),
    ]
    expect(needsPrepCount(visits)).toBe(1)
  })

  it('reads today in one line, for the header and the morning email — counts only', () => {
    expect(todaySummary({ visits: [] })).toBe('Nothing on the books today.')
    expect(todaySummary({ visits: [visit()] })).toBe('1 visit today — everyone is ready.')
    const two = [visit({ id: '1', flags: [flag('no_intake')] }), visit({ id: '2' })]
    expect(todaySummary({ visits: two })).toBe('2 visits today — 1 needs a little prep.')
    const three = [visit({ id: '1', flags: [flag('no_intake')] }), visit({ id: '2', flags: [flag('balance')] }), visit({ id: '3' })]
    expect(todaySummary({ visits: three })).toBe('3 visits today — 2 need a little prep.')
    // The email line must never carry a name.
    expect(todaySummary({ visits: three })).not.toMatch(/Maria/)
  })
})

describe('the recap of the last working day', () => {
  const base: RecapFacts = { held: 0, completed: 0, noShows: [], cancelled: 0, unmarked: 0, firstVisits: [], bookedOnline: 0, work: {} }

  it('says a clean day plainly, and celebrates a first visit by name', () => {
    const lines = buildRecapLines({ ...base, held: 12, completed: 12, firstVisits: ['Maria Ramirez', 'Sam Tran'] })
    expect(lines.map((l) => l.key)).toEqual(['happened', 'first_visits'])
    expect(lines[0]).toMatchObject({ tone: 'ok', text: 'All 12 visits happened.' })
    expect(lines[1].tone).toBe('special')
    expect(lines[1].text).toMatch(/^Maria Ramirez and Sam Tran had first visits/)
    // …and with details hidden the names are gone, the news is not.
    expect(lines[1].quiet).toBe('2 first visits seated — new patients in the practice.')
    expect(lines[1].quiet).not.toMatch(/Maria|Sam/)
  })

  it('names who to call back without shame, and gives the door', () => {
    const lines = buildRecapLines({ ...base, held: 10, completed: 8, noShows: ['Jordan Park'], unmarked: 1, cancelled: 2 })
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l]))
    expect(byKey.happened.text).toBe('8 of 10 visits happened.')
    expect(byKey.no_shows.text).toBe('Jordan Park didn’t make it — worth a call to rebook.')
    expect(byKey.no_shows.quiet).toBe('1 patient didn’t make it — worth a call to rebook.')
    expect(byKey.no_shows.href).toMatch(/^\/appointments/)
    expect(byKey.unmarked.text).toBe('1 visit still says scheduled — did it happen?')
    expect(byKey.unmarked.href).toBe('/appointments?window=past_30d&attention=unmarked')
    expect(byKey.cancelled.text).toBe('2 visits were cancelled.')
    for (const l of lines) expect(l.text).not.toMatch(/fail|missed|problem|only/i)
  })

  it('reports what came in and what the Dream Team handled, and says nothing when there is nothing', () => {
    const lines = buildRecapLines({ ...base, held: 3, completed: 3, bookedOnline: 2, work: { reminder: 12 } })
    expect(lines.find((l) => l.key === 'booked_online')?.text).toBe('2 visits were booked online since.')
    expect(lines.find((l) => l.key === 'work')?.text).toMatch(/^Since then the Dream Team handled: 12 /)
    expect(buildRecapLines(base)).toEqual([])
  })

  it('NO RANKINGS: no line compares a person, a provider or a day with another', () => {
    const lines = buildRecapLines({ ...base, held: 9, completed: 7, noShows: ['A B', 'C D'], firstVisits: ['E F'], bookedOnline: 4, work: { reminder: 3 } })
    for (const l of lines) expect(`${l.text} ${l.quiet ?? ''}`).not.toMatch(/\b(best|worst|top|rank|beat|more than|less than|vs\.?|goal|target|production)\b/i)
  })
})

describe('the heads-up', () => {
  const none = { closures: [], followupsDue: 0, unreadMessages: 0, newInquiries: 0, openProposals: 0 }

  it('is empty when nothing is waiting', () => {
    expect(buildHeadsUp(none)).toEqual([])
  })

  it('gives every line a door', () => {
    const lines = buildHeadsUp({
      closures: [{ startsOn: '2026-11-26', endsOn: '2026-11-27', label: 'Thanksgiving' }],
      followupsDue: 3,
      unreadMessages: 1,
      newInquiries: 2,
      openProposals: 1,
    })
    expect(lines.map((l) => l.key)).toEqual(['closure_2026-11-26', 'followups', 'messages', 'inquiries', 'proposals'])
    for (const l of lines) {
      expect(l.href, l.key).toMatch(/^\//)
      expect(l.cta, l.key).toBeTruthy()
    }
    expect(lines[0].text).toBe('Closed Nov 26–27 — Thanksgiving.')
    expect(lines[1].text).toBe('3 follow-ups are due.')
    expect(lines[2].text).toBe('1 patient conversation is waiting on a reply.')
    expect(lines[3].text).toBe('2 new inquiries haven’t been answered.')
    expect(lines[4].text).toBe('The Dream Team has 1 thing ready for a yes.')
  })

  it('never nags about a module the practice has not opened (null = the door is closed)', () => {
    const lines = buildHeadsUp({ ...none, followupsDue: null, newInquiries: null })
    expect(lines).toEqual([])
  })
})

describe('where it came from (law 2)', () => {
  const NOW = new Date('2026-11-26T13:42:00Z')

  it('names the practice software and the age of the sync', () => {
    const s = sourceLine({ kind: 'connected', vendorLabel: 'Open Dental' }, new Date('2026-11-26T13:30:00Z'), NOW)
    expect(s.text).toBe('The schedule and balances come from Open Dental, last synced 12 minutes ago.')
    expect(s.href).toBeUndefined()
    expect(sourceLine({ kind: 'connected' }, null, NOW).text).toMatch(/your practice software\. The first sync has not finished yet\./)
  })

  it('never passes a thin list off as the whole day when nothing is connected', () => {
    const none = sourceLine({ kind: 'none' }, null, NOW)
    expect(none.text).toMatch(/only the visits booked through your website and front desk/)
    expect(none.href).toBe('/integrations/pms')
    expect(none.cta).toBe('Connect it')
    const pending = sourceLine({ kind: 'pending', vendorLabel: 'Dentrix', pill: 'Requested', sentence: 'x' }, null, NOW)
    expect(pending.text).toMatch(/^We’re connecting Dentrix\./)
    expect(pending.href).toBe('/integrations/pms')
  })

  it('says how long ago in plain words', () => {
    const at = (mins: number) => new Date(NOW.getTime() - mins * 60_000)
    expect(agoLabel(at(0), NOW)).toBe('just now')
    expect(agoLabel(at(1), NOW)).toBe('1 minute ago')
    expect(agoLabel(at(45), NOW)).toBe('45 minutes ago')
    expect(agoLabel(at(60), NOW)).toBe('1 hour ago')
    expect(agoLabel(at(60 * 26), NOW)).toBe('1 day ago')
    // A clock skew never prints a negative age.
    expect(agoLabel(new Date(NOW.getTime() + 5_000), NOW)).toBe('just now')
  })
})
