import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clinicDayStart } from '@/lib/clinic-timezone'

/**
 * THE E2E "PAST VISIT" FIXTURE HAS TO BE PAST IN THE CLINIC'S CALENDAR, NOT
 * IN UTC.
 *
 * `e2e/staff-day.spec.ts` completes a past visit by navigating to
 * `/appointments?window=past_30d`. That chip's window ends at the CLINIC-LOCAL
 * day start (`lib/services/appointments.ts` — `to: clinicDayStart(now, tz)`),
 * and the E2E clinics are `America/New_York`. The seed used to place the visit
 * one UTC day back, which for the four hours between 00:00 and 04:00 UTC is
 * TODAY in New York: the visit was genuinely in the past, the chip's window
 * genuinely excluded it, and the spec went red on the clock alone. It did,
 * nightly, until the seed moved to two days back.
 *
 * Nobody re-derives that reasoning when they next tidy the seed, so it is
 * pinned here rather than left in a comment. This runs in the normal vitest
 * suite — no database, no browser — because the point is to fail in the two
 * minutes before a merge instead of in the E2E job four hours a night.
 */

const SEED = resolve(process.cwd(), 'scripts/e2e-seed.mjs')
const CLINIC_TZ = 'America/New_York'

/** The offset the seed script actually uses, read from the script itself. */
function seededDaysBack(): number {
  const src = readFileSync(SEED, 'utf8')
  const m = src.match(/staffPast\.setUTCDate\(staffPast\.getUTCDate\(\) - (\d+)\)/)
  expect(m, 'scripts/e2e-seed.mjs no longer sets staffPast by a UTC day offset').toBeTruthy()
  return Number(m![1])
}

function seededHourUtc(): number {
  const src = readFileSync(SEED, 'utf8')
  const m = src.match(/staffPast\.setUTCHours\((\d+), 0, 0, 0\)/)
  expect(m, 'scripts/e2e-seed.mjs no longer pins staffPast to a UTC hour').toBeTruthy()
  return Number(m![1])
}

/** Rebuild the instant the seed would write, for a given "now". */
function seededPastVisit(now: Date, daysBack: number, hourUtc: number): Date {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - daysBack)
  d.setUTCHours(hourUtc, 0, 0, 0)
  return d
}

describe('the E2E past-visit fixture lands inside the Past 30 days window', () => {
  const daysBack = seededDaysBack()
  const hourUtc = seededHourUtc()

  // Every hour of the UTC day, on an EDT date, an EST date, and both sides of
  // each DST transition — the seed is fixed in UTC and the window is not.
  const DATES = [
    '2026-09-09', // EDT (UTC-4) — the date the nightly failure was caught on
    '2026-01-15', // EST (UTC-5)
    '2026-03-08', // spring forward
    '2026-03-09',
    '2026-11-01', // fall back
    '2026-11-02',
  ]

  for (const date of DATES) {
    for (let hour = 0; hour < 24; hour++) {
      const now = new Date(`${date}T${String(hour).padStart(2, '0')}:30:00Z`)

      it(`${date} ${String(hour).padStart(2, '0')}:30 UTC — the visit is in the window`, () => {
        const visit = seededPastVisit(now, daysBack, hourUtc)
        const from = clinicDayStart(now, CLINIC_TZ, -30)
        const to = clinicDayStart(now, CLINIC_TZ)

        // In the past at all, or the drawer never offers "Mark completed".
        expect(visit.getTime(), 'seeded visit is not in the past').toBeLessThan(now.getTime())
        // AND inside the chip the spec navigates to.
        expect(
          visit.getTime(),
          `seeded visit ${visit.toISOString()} is not before the clinic-local day start ${to.toISOString()}`,
        ).toBeLessThan(to.getTime())
        expect(
          visit.getTime(),
          `seeded visit ${visit.toISOString()} fell out the far end of the 30-day window`,
        ).toBeGreaterThanOrEqual(from.getTime())
      })
    }
  }

  it('would have caught the original one-day-back seed', () => {
    // The guard is worth nothing if it passes for the value that was broken.
    const now = new Date('2026-09-10T00:30:00Z')
    const broken = seededPastVisit(now, 1, hourUtc)
    expect(broken.getTime()).toBeLessThan(now.getTime()) // past, as the old comment claimed
    expect(broken.getTime()).toBeGreaterThanOrEqual(clinicDayStart(now, CLINIC_TZ).getTime())
  })
})
