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
})
