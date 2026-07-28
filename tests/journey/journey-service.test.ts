/**
 * EXECUTED coverage for the journey service (lib/services/patient-journey.ts).
 * The round-1 audit found its laws were pinned only by source-grep — these
 * run the mapping code against canned aggregate rows:
 *
 *  - stage facts use ALL appointment history (an imported completed visit
 *    still makes someone a patient) while transition TIMESTAMPS exclude
 *    PMS-imported rows (connecting a PMS must never read as a growth spike);
 *  - cancelled-everything people land back at inquiry;
 *  - the funnel skips bulk-backfilled records and windows each transition.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const state = { queue: [] as unknown[][] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'leftJoin', 'groupBy']) obj[m] = () => obj
    obj.then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(state.queue.shift() ?? []).then(res, rej)
    return obj
  }
  return { db: { select: () => chain() } }
})

import {
  getJourneyForPatients,
  getJourneyFunnel,
  getJourneyStageCounts,
  countSeatedBetween,
} from '@/lib/services/patient-journey'

beforeEach(() => {
  state.queue = []
})

describe('getJourneyForPatients — stages from facts, timestamps import-honest', () => {
  it('maps the four stages and keeps import-excluded timestamps null', async () => {
    state.queue = [
      // patients
      [
        { id: 'p_inq', firstSeenAt: new Date('2026-07-01'), lifecycle: 'active' },
        { id: 'p_book', firstSeenAt: new Date('2026-07-02'), lifecycle: 'active' },
        { id: 'p_pat', firstSeenAt: new Date('2026-07-03'), lifecycle: 'active' },
        { id: 'p_arch', firstSeenAt: new Date('2026-07-04'), lifecycle: 'archived' },
        { id: 'p_pms', firstSeenAt: new Date('2026-07-05'), lifecycle: 'active' },
      ],
      // appointment aggregates (p_inq has none)
      [
        {
          patientId: 'p_book',
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: true,
          hasCompletedEver: false,
          firstSeatedAt: null,
        },
        {
          patientId: 'p_pat',
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: new Date('2026-07-12'),
        },
        {
          patientId: 'p_arch',
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: new Date('2026-07-12'),
        },
        // The PMS-import shape: every appointment is imported, so BOTH
        // timestamps come back null from the SQL — but the completed visit
        // still makes them a patient. WHO they are vs WHEN they transitioned.
        {
          patientId: 'p_pms',
          firstBookedAt: null,
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: null,
        },
      ],
    ]
    const map = await getJourneyForPatients('org_1', ['p_inq', 'p_book', 'p_pat', 'p_arch', 'p_pms'])
    expect(map.get('p_inq')?.stage).toBe('inquiry')
    expect(map.get('p_book')?.stage).toBe('booked')
    expect(map.get('p_pat')?.stage).toBe('patient')
    expect(map.get('p_arch')?.stage).toBe('archived')
    expect(map.get('p_pms')?.stage).toBe('patient')
    expect(map.get('p_pms')?.firstBookedAt).toBeNull()
    expect(map.get('p_pms')?.firstSeatedAt).toBeNull()
    expect(map.get('p_pat')?.firstSeatedAt).toEqual(new Date('2026-07-12'))
  })

  it('the INVERSE law: imported history that predates an organic visit suppresses the minted transition', async () => {
    state.queue = [
      [
        { id: 'p_long', firstSeenAt: new Date('2026-07-01'), lifecycle: 'active', source: 'website' },
        { id: 'p_new', firstSeenAt: new Date('2026-07-01'), lifecycle: 'active', source: 'website' },
      ],
      [
        // Contact-linked long-time patient: years of imported completed
        // visits, then one organic visit. WITHOUT suppression they'd mint
        // firstBookedAt/firstSeatedAt now — a fake new patient.
        {
          patientId: 'p_long',
          firstBookedAt: new Date('2026-07-10'),
          firstSeatedAt: new Date('2026-07-12'),
          hasLiveAppointment: true,
          hasCompletedEver: true,
          importedBookedAt: new Date('2021-03-01'),
          importedSeatedAt: new Date('2021-03-01'),
        },
        // Genuinely new person with an imported FUTURE row that does NOT
        // predate the organic transition — no suppression.
        {
          patientId: 'p_new',
          firstBookedAt: new Date('2026-07-10'),
          firstSeatedAt: new Date('2026-07-12'),
          hasLiveAppointment: true,
          hasCompletedEver: true,
          importedBookedAt: new Date('2026-08-01'),
          importedSeatedAt: null,
        },
      ],
    ]
    const map = await getJourneyForPatients('org_1', ['p_long', 'p_new'])
    expect(map.get('p_long')?.stage).toBe('patient') // WHO they are is untouched
    expect(map.get('p_long')?.firstBookedAt).toBeNull()
    expect(map.get('p_long')?.firstSeatedAt).toBeNull()
    expect(map.get('p_new')?.firstBookedAt).toEqual(new Date('2026-07-10'))
    expect(map.get('p_new')?.firstSeatedAt).toEqual(new Date('2026-07-12'))
  })

  it('isBackfilled rides the row so window consumers cannot forget the exclusion', async () => {
    state.queue = [
      [
        { id: 'p_csv', firstSeenAt: new Date('2026-07-15'), lifecycle: 'active', source: 'import' },
        { id: 'p_org', firstSeenAt: new Date('2026-07-15'), lifecycle: 'active', source: 'website' },
      ],
      [],
    ]
    const map = await getJourneyForPatients('org_1', ['p_csv', 'p_org'])
    expect(map.get('p_csv')?.isBackfilled).toBe(true)
    expect(map.get('p_org')?.isBackfilled).toBe(false)
    // The roster fact, EXECUTED (round-4 pin): a CSV-imported person with ZERO
    // appointment rows is a patient of the practice, not an inquiry — while a
    // genuinely organic no-appointment person stays an inquiry.
    expect(map.get('p_csv')?.stage).toBe('patient')
    expect(map.get('p_org')?.stage).toBe('inquiry')
  })

  it('cancelled-everything people are inquiries again (a booked timestamp alone is not a live booking)', async () => {
    state.queue = [
      [{ id: 'p_cx', firstSeenAt: new Date('2026-07-01'), lifecycle: 'active' }],
      [
        {
          patientId: 'p_cx',
          // They DID book once (the timestamp exists) — then cancelled it all.
          firstBookedAt: new Date('2026-07-10'),
          hasLiveAppointment: false,
          hasCompletedEver: false,
          firstSeatedAt: null,
        },
      ],
    ]
    const map = await getJourneyForPatients('org_1', ['p_cx'])
    expect(map.get('p_cx')?.stage).toBe('inquiry')
    expect(map.get('p_cx')?.firstBookedAt).toEqual(new Date('2026-07-10'))
  })

  it('returns an empty map without querying when no ids are asked for', async () => {
    const map = await getJourneyForPatients('org_1', [])
    expect(map.size).toBe(0)
    expect(state.queue).toHaveLength(0)
  })
})

describe('getJourneyFunnel — transitions inside the window, backfill excluded', () => {
  const NOW = new Date('2026-07-27T12:00:00Z') // since = 2026-06-27

  it('counts each transition in-window and skips bulk-backfilled records entirely', async () => {
    state.queue = [
      [
        // Fresh inquiry this month — counts once, as an inquiry.
        { patientId: 'a', source: 'website', firstSeenAt: new Date('2026-07-10'), firstBookedAt: null, firstSeatedAt: null },
        // Long-known person who finally booked this month.
        { patientId: 'b', source: 'website', firstSeenAt: new Date('2026-03-01'), firstBookedAt: new Date('2026-07-05'), firstSeatedAt: null },
        // Seated this month (booked earlier).
        { patientId: 'c', source: 'booking_widget', firstSeenAt: new Date('2026-04-01'), firstBookedAt: new Date('2026-05-01'), firstSeatedAt: new Date('2026-07-20') },
        // PMS backfill with every timestamp "in window" — never counted.
        { patientId: 'd', source: 'pms_import', firstSeenAt: new Date('2026-07-15'), firstBookedAt: new Date('2026-07-15'), firstSeatedAt: new Date('2026-07-15') },
        // CSV backfill — never counted.
        { patientId: 'e', source: 'import', firstSeenAt: new Date('2026-07-15'), firstBookedAt: null, firstSeatedAt: null },
        // Everything before the window — nothing counted.
        { patientId: 'f', source: 'website', firstSeenAt: new Date('2026-01-01'), firstBookedAt: new Date('2026-01-05'), firstSeatedAt: new Date('2026-01-20') },
      ],
    ]
    const funnel = await getJourneyFunnel('org_1', 30, NOW)
    expect(funnel).toEqual({ inquiries: 1, booked: 1, seated: 1 })
  })

  it('a contact-linked long-timer (organic source, imported history) cannot mint in-window transitions', async () => {
    state.queue = [
      [
        // Organic patient.source (so the source skip misses them) + imported
        // completed visits from years back: their "first seated this month"
        // is a lie the suppression must catch.
        {
          patientId: 'linked',
          source: 'website',
          firstSeenAt: new Date('2026-02-01'),
          firstBookedAt: new Date('2026-07-10'),
          firstSeatedAt: new Date('2026-07-20'),
          importedBookedAt: new Date('2020-01-15'),
          importedSeatedAt: new Date('2020-01-15'),
        },
      ],
    ]
    const funnel = await getJourneyFunnel('org_1', 30, NOW)
    expect(funnel).toEqual({ inquiries: 0, booked: 0, seated: 0 })
  })
})

describe('countSeatedBetween — the ONE windowed seated reader (Phase-2 round-1: the standup consumes this, never a local re-derivation)', () => {
  const SINCE = new Date('2026-07-19T05:00:00Z')
  const UNTIL = new Date('2026-07-26T05:00:00Z')

  it('counts first seats inside [since, until) — inclusive start, exclusive end', async () => {
    state.queue = [
      [
        { source: 'website', firstSeatedAt: SINCE, importedSeatedAt: null }, // boundary start: in
        { source: 'booking_widget', firstSeatedAt: new Date('2026-07-22T15:00:00Z'), importedSeatedAt: null }, // in
        { source: 'website', firstSeatedAt: UNTIL, importedSeatedAt: null }, // boundary end: OUT (next week's)
        { source: 'website', firstSeatedAt: new Date('2026-07-01T15:00:00Z'), importedSeatedAt: null }, // before: out
        { source: 'website', firstSeatedAt: null, importedSeatedAt: null }, // never seated
      ],
    ]
    expect(await countSeatedBetween('org_1', SINCE, UNTIL)).toBe(2)
  })

  it('backfill patient sources and imported-earlier suppression both hold — the OD-connect week must not zero or spike the standup', async () => {
    state.queue = [
      [
        // CSV/PMS roster members never count, whatever their timestamps say.
        { source: 'pms_import', firstSeatedAt: new Date('2026-07-22'), importedSeatedAt: null },
        { source: 'import', firstSeatedAt: new Date('2026-07-22'), importedSeatedAt: null },
        // Contact-linked long-timer: organic source, but imported history
        // predates the in-window "first" seat — suppressed.
        { source: 'website', firstSeatedAt: new Date('2026-07-22'), importedSeatedAt: new Date('2021-03-01') },
        // Genuinely new person whose imported row does NOT predate — counts.
        { source: 'website', firstSeatedAt: new Date('2026-07-22'), importedSeatedAt: new Date('2026-08-01') },
      ],
    ]
    expect(await countSeatedBetween('org_1', SINCE, UNTIL)).toBe(1)
  })
})

describe('getJourneyStageCounts — the standing population', () => {
  it('buckets by live-booking + seated facts', async () => {
    state.queue = [
      [
        { patientId: 'a', hasBooked: false, hasSeated: false },
        { patientId: 'b', hasBooked: true, hasSeated: false },
        { patientId: 'c', hasBooked: true, hasSeated: true },
        { patientId: 'd', hasBooked: null, hasSeated: null }, // no appointments at all
        // Imported roster member with no visit rows: counts as a PATIENT —
        // a Dentrix clinic's whole roster must not read as inquiries
        // (round-3 fix, round-4 executed pin).
        { patientId: 'e', source: 'import', hasBooked: null, hasSeated: null },
        { patientId: 'f', source: 'pms_import', hasBooked: true, hasSeated: false },
      ],
    ]
    expect(await getJourneyStageCounts('org_1')).toEqual({ inquiry: 2, booked: 1, patient: 3 })
  })
})

describe('the PMS-import exclusion lives in the SQL, not in hope', () => {
  // Placement-pinned per function (round-2 audit: a global occurrence count
  // let a predicate move between aggregates unnoticed).
  function fnSlice(src: string, name: string): string {
    const start = src.indexOf(`function ${name}`)
    expect(start, `function ${name} exists`).toBeGreaterThan(-1)
    const rest = src.slice(start + 1)
    const next = rest.search(/\nexport (async )?(function|interface|const)/)
    return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next)
  }

  it('every query is org-scoped and the population reads exclude archived (round-3 pin — the canned-row mock cannot see WHERE)', () => {
    const src = readFileSync(resolve(__dirname, '../../lib/services/patient-journey.ts'), 'utf8')
    for (const fn of ['getJourneyForPatients', 'getJourneyStageCounts', 'getJourneyFunnel', 'countSeatedBetween']) {
      const slice = fnSlice(src, fn)
      expect(slice, `${fn} scopes by organizationId`).toMatch(/eq\((schema\.patient|schema\.appointment)\.organizationId, organizationId\)/)
    }
    for (const fn of ['getJourneyStageCounts', 'getJourneyFunnel', 'countSeatedBetween']) {
      const slice = fnSlice(src, fn)
      expect(slice, `${fn} excludes archived from the population`).toMatch(/ne\(schema\.patient\.lifecycle, 'archived'\)/)
    }
  })

  it('each query mints/anchors on the full source law — predicates AND anchor recipes pinned (round-4: recipes too)', () => {
    const src = readFileSync(resolve(__dirname, '../../lib/services/patient-journey.ts'), 'utf8')
    expect(src).toContain("is distinct from 'pms_import'")
    // The law's four source classes, pinned at the definition site:
    expect(src).toMatch(/BOOKED_MINTABLE = sql`.*is distinct from 'pms_import' and .*is distinct from 'pms_live'`/)
    expect(src).toMatch(/IMPORTED_OR_LIVE = sql`\(.*= 'pms_import' or .*= 'pms_live'\)`/)
    for (const fn of ['getJourneyForPatients', 'getJourneyFunnel']) {
      const slice = fnSlice(src, fn)
      // booked mints ONLY from fully-organic rows ('pms_live' createdAt is the connect moment):
      expect(slice, `${fn} firstBookedAt gate`).toMatch(/firstBookedAt: sql[\s\S]*?\$\{BOOKED_MINTABLE\}[\s\S]*?createdAt/)
      // seated mints from non-backfill rows AND anchors on the earlier of completedAt/startTime
      // (late catch-up marking must not shift the seat date — the RECIPE is pinned, not just the gate):
      expect(slice, `${fn} firstSeatedAt gate+recipe`).toMatch(
        /firstSeatedAt: sql[\s\S]*?'completed' and \$\{NOT_IMPORTED\}[\s\S]*?least\(coalesce\([\s\S]*?completedAt\}, [\s\S]*?startTime\}\), [\s\S]*?startTime\}\)/,
      )
      // booked suppression anchors on imported OR live rows, at the earlier of startTime/createdAt:
      expect(slice, `${fn} importedBookedAt anchor+recipe`).toMatch(
        /importedBookedAt: sql[\s\S]*?\$\{IMPORTED_OR_LIVE\}[\s\S]*?least\([\s\S]*?startTime\}, [\s\S]*?createdAt\}\)/,
      )
      expect(slice, `${fn} importedSeatedAt anchor`).toMatch(/importedSeatedAt: sql[\s\S]*?'completed' and \$\{IMPORTED\}[\s\S]*?startTime/)
      expect(slice, `${fn} applies both suppressions`).toMatch(/suppressIfImportedEarlier/)
    }
    // The windowed reader runs the SAME seated recipe + suppression — the
    // Phase-2 standup reads it, so a divergent local recipe here would be
    // the round-1 defect all over again.
    const windowed = fnSlice(src, 'countSeatedBetween')
    expect(windowed, 'countSeatedBetween seated gate+recipe').toMatch(
      /firstSeatedAt: sql[\s\S]*?'completed' and \$\{NOT_IMPORTED\}[\s\S]*?least\(coalesce\([\s\S]*?completedAt\}, [\s\S]*?startTime\}\), [\s\S]*?startTime\}\)/,
    )
    expect(windowed, 'countSeatedBetween suppression').toMatch(/suppressIfImportedEarlier/)
    expect(windowed, 'countSeatedBetween backfill skip').toMatch(/BACKFILL_PATIENT_SOURCES\.has/)
  })
})
