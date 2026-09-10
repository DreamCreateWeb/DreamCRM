/**
 * THE JOURNEY AGGREGATES DECODE THROUGH THEIR COLUMN'S MAPPER (DREAMCRM-13).
 *
 * `lib/services/patient-journey.ts` builds ten `min(case when … end)`
 * aggregates by hand. A `case` is not a column, so the bare `sql` form carried
 * no driver mapper: `start_time` / `created_at` / `completed_at` are
 * `timestamp` WITHOUT a zone, whose mapper reads the driver's text as UTC
 * (`new Date(value + '+0000')`), while the `new Date(...)` that used to consume
 * the unmapped string read the same text in the HOST's zone.
 *
 * TWO THINGS MAKE THIS HARD TO TEST, and both are answered here.
 *
 * 1. The other journey specs mock `@/lib/db` with canned `Date` objects. That
 *    mock sits ABOVE the decoder, so it cannot observe the defect at all — it
 *    would pass identically with every `.mapWith()` deleted. The mock below
 *    captures the `select()` field expressions the service really declares and
 *    pushes the driver's real text shape (`2026-07-10 09:00:00` — no `T`, no
 *    `Z`) through THEIR decoders, exactly as drizzle's `mapResultRow` does.
 *
 * 2. `vitest.config.ts` pins `TZ=UTC`, under which the mapped and unmapped
 *    readings agree — which is the whole reason this survived in `main`. These
 *    tests move the host clock off UTC for the duration, so the two readings
 *    differ and the assertions can tell them apart.
 *
 * The comparison cases are the point rather than the individual values:
 * `suppressIfImportedEarlier` weighs a minted transition against an imported
 * one, so a fix that maps one side and not the other turns "did this patient
 * transition before we imported their history?" into a question asked across
 * two different clocks. Each direction is pinned separately below, because a
 * shift on either side flips the answer only one way.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const state = {
  queue: [] as Array<Record<string, unknown>[]>,
}

vi.mock('@/lib/db', () => {
  /** drizzle's own rule (utils.ts `mapResultRow`): null never reaches a decoder. */
  const decode = (field: unknown, raw: unknown) => {
    if (raw === null || raw === undefined) return null
    // An SQL expression carries its decoder on `.decoder`; a Column IS one.
    const holder = field as {
      decoder?: { mapFromDriverValue?: (v: unknown) => unknown }
      mapFromDriverValue?: (v: unknown) => unknown
    } | null
    const decoder = holder?.decoder ?? holder
    return typeof decoder?.mapFromDriverValue === 'function'
      ? decoder.mapFromDriverValue.call(decoder, raw)
      : raw
  }
  const chain = (fields: Record<string, unknown>) => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'leftJoin', 'groupBy']) obj[m] = () => obj
    obj.then = (res: (v: unknown) => void, rej: (e: unknown) => void) => {
      const rows = state.queue.shift() ?? []
      const decoded = rows.map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, decode(fields[k], v)])),
      )
      return Promise.resolve(decoded).then(res, rej)
    }
    return obj
  }
  return { db: { select: (fields: Record<string, unknown>) => chain(fields) } }
})

import {
  getJourneyForPatients,
  getJourneyFunnel,
  countSeatedBetween,
} from '@/lib/services/patient-journey'

/** UTC-5 in July, so an unmapped read lands five hours late. */
const OFF_UTC = 'America/Chicago'

let originalTz: string | undefined

beforeEach(() => {
  state.queue = []
  originalTz = process.env.TZ
})

afterEach(() => {
  // Restore before the next test in this file — and before the next FILE, since
  // a fork-pool worker is reused. Everything else in the suite assumes UTC.
  process.env.TZ = originalTz ?? 'UTC'
})

describe('the host clock actually moves — the precondition these tests rest on', () => {
  it('a mid-process TZ change changes how zone-less text parses', () => {
    process.env.TZ = 'UTC'
    const asUtc = new Date('2026-07-10 09:00:00').getTime()
    process.env.TZ = OFF_UTC
    const asLocal = new Date('2026-07-10 09:00:00').getTime()
    expect(
      asLocal,
      'this runtime ignores a TZ change, so the tests below prove less than they claim',
    ).not.toBe(asUtc)
    // The exact shift the cases below are built around.
    expect(asLocal - asUtc).toBe(5 * 60 * 60 * 1000)
  })
})

describe('getJourneyForPatients — driver text decodes to the UTC instant off a UTC host', () => {
  it('every transition timestamp is a Date at the instant the column mapper gives it', async () => {
    process.env.TZ = OFF_UTC
    state.queue = [
      [{ id: 'p1', firstSeenAt: '2026-07-01 08:15:00', lifecycle: 'active', source: 'website' }],
      [
        {
          patientId: 'p1',
          firstBookedAt: '2026-07-10 09:00:00',
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: '2026-07-12 14:30:00',
          importedBookedAt: null,
          importedSeatedAt: null,
        },
      ],
    ]
    const row = (await getJourneyForPatients('org_1', ['p1'])).get('p1')
    expect(row?.firstBookedAt).toBeInstanceOf(Date)
    expect(row?.firstSeatedAt).toBeInstanceOf(Date)
    expect(row?.firstSeenAt).toBeInstanceOf(Date)
    expect(row?.firstBookedAt?.getTime()).toBe(Date.UTC(2026, 6, 10, 9, 0, 0))
    expect(row?.firstSeatedAt?.getTime()).toBe(Date.UTC(2026, 6, 12, 14, 30, 0))
    expect(row?.firstSeenAt?.getTime()).toBe(Date.UTC(2026, 6, 1, 8, 15, 0))
  })

  it('THE COMPARISON: suppression asks both sides on the same clock, in both directions', async () => {
    process.env.TZ = OFF_UTC
    state.queue = [
      [
        { id: 'p_sup', firstSeenAt: null, lifecycle: 'active', source: 'website' },
        { id: 'p_keep', firstSeenAt: null, lifecycle: 'active', source: 'website' },
      ],
      [
        // Imported history is three hours EARLIER than the organic mint, so the
        // mint is suppressed. Lose the mapper on the IMPORTED side only and it
        // reads 08:00Z instead of 03:00Z — later than the mint, no suppression,
        // and a long-time patient is counted as brand new.
        {
          patientId: 'p_sup',
          firstBookedAt: '2026-07-10 06:00:00',
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: '2026-07-10 06:00:00',
          importedBookedAt: '2026-07-10 03:00:00',
          importedSeatedAt: '2026-07-10 03:00:00',
        },
        // The mirror: imported history is three hours LATER, so nothing is
        // suppressed. Lose the mapper on the MINTED side only and it reads
        // 08:00Z — now later than the imported anchor, and a real transition is
        // thrown away. Neither direction is caught by the other.
        {
          patientId: 'p_keep',
          firstBookedAt: '2026-07-10 03:00:00',
          hasLiveAppointment: true,
          hasCompletedEver: true,
          firstSeatedAt: '2026-07-10 03:00:00',
          importedBookedAt: '2026-07-10 06:00:00',
          importedSeatedAt: '2026-07-10 06:00:00',
        },
      ],
    ]
    const map = await getJourneyForPatients('org_1', ['p_sup', 'p_keep'])
    expect(map.get('p_sup')?.firstBookedAt).toBeNull()
    expect(map.get('p_sup')?.firstSeatedAt).toBeNull()
    // WHO they are is untouched by the suppression, as ever.
    expect(map.get('p_sup')?.stage).toBe('patient')
    expect(map.get('p_keep')?.firstBookedAt?.getTime()).toBe(Date.UTC(2026, 6, 10, 3, 0, 0))
    expect(map.get('p_keep')?.firstSeatedAt?.getTime()).toBe(Date.UTC(2026, 6, 10, 3, 0, 0))
  })
})

describe('the windowed readers compare aggregate instants against JS-built bounds', () => {
  it('countSeatedBetween holds its boundary when the host clock is not UTC', async () => {
    process.env.TZ = OFF_UTC
    const SINCE = new Date('2026-07-19T05:00:00Z')
    const UNTIL = new Date('2026-07-26T05:00:00Z')
    state.queue = [
      [
        // Exactly SINCE — in (inclusive start).
        { source: 'website', firstSeatedAt: '2026-07-19 05:00:00', importedSeatedAt: null },
        // One second before SINCE — out. This is the row that fails without the
        // mapper: read in the host's zone it becomes 09:59:59Z, comfortably
        // inside the window, and last week's patient is counted again.
        { source: 'website', firstSeatedAt: '2026-07-19 04:59:59', importedSeatedAt: null },
        // Exactly UNTIL — out (exclusive end).
        { source: 'website', firstSeatedAt: '2026-07-26 05:00:00', importedSeatedAt: null },
        // Suppressed by earlier imported history, driver text on both sides.
        {
          source: 'website',
          firstSeatedAt: '2026-07-22 15:00:00',
          importedSeatedAt: '2021-03-01 09:00:00',
        },
      ],
    ]
    expect(await countSeatedBetween('org_1', SINCE, UNTIL)).toBe(1)
  })

  it('getJourneyFunnel windows each transition on the same clock', async () => {
    process.env.TZ = OFF_UTC
    const NOW = new Date('2026-07-27T12:00:00Z') // since = 2026-06-27T12:00:00Z
    state.queue = [
      [
        // Seated inside the window; booked long before it.
        {
          patientId: 'a',
          source: 'website',
          firstSeenAt: '2026-01-04 10:00:00',
          firstBookedAt: '2026-01-05 10:00:00',
          firstSeatedAt: '2026-07-20 10:00:00',
          importedBookedAt: null,
          importedSeatedAt: null,
        },
        // Booked ten minutes BEFORE the window opens — out. Unmapped it reads
        // five hours later and wrongly lands inside.
        {
          patientId: 'b',
          source: 'website',
          firstSeenAt: '2026-01-04 10:00:00',
          firstBookedAt: '2026-06-27 11:50:00',
          firstSeatedAt: null,
          importedBookedAt: null,
          importedSeatedAt: null,
        },
        // Organic source, imported history from years back: the contact-linked
        // long-timer, suppressed on both legs.
        {
          patientId: 'c',
          source: 'website',
          firstSeenAt: '2026-02-01 10:00:00',
          firstBookedAt: '2026-07-10 10:00:00',
          firstSeatedAt: '2026-07-20 10:00:00',
          importedBookedAt: '2020-01-15 09:00:00',
          importedSeatedAt: '2020-01-15 09:00:00',
        },
      ],
    ]
    expect(await getJourneyFunnel('org_1', 30, NOW)).toEqual({
      inquiries: 0,
      booked: 0,
      seated: 1,
    })
  })
})

describe('each aggregate names its mapper column at the source', () => {
  // The repo-wide guard (tests/guards/timestamp-aggregate-mapping.test.ts) asks
  // only whether SOME `.mapWith` follows. Which column it names is a per-site
  // choice — `least()` mixes two of them — so it is pinned here, where the
  // reason lives. Counted rather than hard-coded: a new aggregate for an
  // existing field has to arrive mapped or this fails.
  const src = readFileSync(resolve(__dirname, '../../lib/services/patient-journey.ts'), 'utf8')

  const EXPECTED: Array<{ field: string; column: string }> = [
    { field: 'firstBookedAt', column: 'createdAt' },
    { field: 'firstSeatedAt', column: 'startTime' },
    { field: 'importedBookedAt', column: 'startTime' },
    { field: 'importedSeatedAt', column: 'startTime' },
  ]

  for (const { field, column } of EXPECTED) {
    it(`${field} maps with appointment.${column}`, () => {
      // `${field}: sql` and not `${field}: sql\`` on purpose: the shape being
      // ruled out is `sql<Date | null>\`…\`` with no .mapWith, and a pattern
      // that required the backtick would stop COUNTING the site the moment it
      // regressed — declared and mapped would both drop to one and agree.
      const declared = src.match(new RegExp(`${field}: sql`, 'g'))?.length ?? 0
      expect(declared, `${field} is declared as an aggregate somewhere`).toBeGreaterThan(0)
      const mapped =
        src.match(
          new RegExp(`${field}: sql\`[\\s\\S]*?\`\\s*\\.mapWith\\(schema\\.appointment\\.${column}\\)`, 'g'),
        )?.length ?? 0
      expect(mapped, `every ${field} aggregate maps with appointment.${column}`).toBe(declared)
    })
  }

  it('no aggregate is left annotated as a bare sql<Date> — the shape that carried the bug', () => {
    expect(src).not.toMatch(/sql<Date/)
  })

  it('the consumers no longer re-parse what the mapper already decoded', () => {
    // A `new Date(...)` over an already-decoded value is the normalize that
    // makes a wrong instant look like it works — the reason this class stayed
    // quiet in marketing.ts and patient-audit.ts too.
    expect(src).not.toMatch(/new Date\(\s*[ar][?.]/)
  })
})
