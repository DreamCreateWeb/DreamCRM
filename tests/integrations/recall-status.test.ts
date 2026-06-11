import { describe, it, expect } from 'vitest'
import { derivePatientRecallStatus } from '@/lib/services/recall-status'

const now = new Date('2026-06-01T12:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)

describe('derivePatientRecallStatus', () => {
  it("returns 'scheduled' when the patient has an upcoming appt (highest precedence)", () => {
    expect(
      derivePatientRecallStatus({
        pmsRecallDueAt: days(-90), // would otherwise be 'overdue'
        hasUpcomingAppt: true,
        hasAnyFutureAppt: true,
        lastVisitAt: days(-365),
        now,
      }),
    ).toBe('scheduled')
  })

  describe('PMS recall path (prefers the synced due date)', () => {
    it("returns 'overdue' when more than 30 days past due", () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: days(-45),
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: null,
          now,
        }),
      ).toBe('overdue')
    })
    it("returns 'due' within ±30 days of the due date", () => {
      for (const offset of [5, -10, 25]) {
        expect(
          derivePatientRecallStatus({
            pmsRecallDueAt: days(offset),
            hasUpcomingAppt: false,
            hasAnyFutureAppt: false,
            lastVisitAt: null,
            now,
          }),
        ).toBe('due')
      }
    })
    it("returns 'na' for dates more than 30 days in the future", () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: days(60),
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: null,
          now,
        }),
      ).toBe('na')
    })
  })

  describe('fallback (no PMS recall) — preserves the original heuristic', () => {
    it("returns 'na' when there's no last visit", () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: null,
          now,
        }),
      ).toBe('na')
    })
    it("a future appointment suppresses 'due'/'overdue'", () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: true,
          lastVisitAt: days(-365), // would otherwise be overdue
          now,
        }),
      ).toBe('na')
    })
    it("returns 'overdue' when last visit > 9mo + no future appt", () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-280),
          now,
        }),
      ).toBe('overdue')
    })
    it("returns 'due' between 6 and 9 months", () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-210),
          now,
        }),
      ).toBe('due')
    })
    it("returns 'na' for a recent visit", () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-30),
          now,
        }),
      ).toBe('na')
    })
  })

  describe('configurable interval (per-patient → clinic default → fallback)', () => {
    it('a 3-month interval marks a 4-month-old visit as overdue (interval + 3 grace = 6mo cutoff for overdue, 3mo for due)', () => {
      // 3-month interval → due at 90d, overdue at (3+3)=180d.
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-120), // 4 months → past 3mo due, before 6mo overdue
          now,
          intervalMonths: 3,
        }),
      ).toBe('due')
    })

    it('a 3-month interval marks a 7-month-old visit as overdue', () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-210), // 7 months → past (3+3)=6mo overdue cutoff
          now,
          intervalMonths: 3,
        }),
      ).toBe('overdue')
    })

    it('a 12-month interval keeps a 7-month-old visit at na (not yet due)', () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-210), // 7 months, interval is 12mo → na
          now,
          intervalMonths: 12,
        }),
      ).toBe('na')
    })

    it('omitting intervalMonths falls back to the legacy 6/9-month behavior', () => {
      // 7 months old, no interval → 'due' under the 6mo default (overdue at 9mo).
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-210),
          now,
        }),
      ).toBe('due')
    })

    it('an explicit raw dueMs/lapsedMs still wins over intervalMonths', () => {
      // Raw windows say overdue at 30d / due at 10d; intervalMonths would say na.
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: null,
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-40),
          now,
          intervalMonths: 12,
          dueMs: 10 * 86_400_000,
          lapsedMs: 30 * 86_400_000,
        }),
      ).toBe('overdue')
    })

    it('a PMS recall date still takes precedence over intervalMonths', () => {
      expect(
        derivePatientRecallStatus({
          pmsRecallDueAt: days(60), // far future → na from PMS
          hasUpcomingAppt: false,
          hasAnyFutureAppt: false,
          lastVisitAt: days(-365),
          now,
          intervalMonths: 3, // would say overdue, but PMS wins
        }),
      ).toBe('na')
    })
  })
})
