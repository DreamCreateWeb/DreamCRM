/**
 * Patient sources that are a BULK BACKFILL, not a fresh acquisition. Both import
 * paths stamp `firstSeenAt` with the IMPORT time (the PMS adapter doesn't expose
 * a real first-visit date yet), so a clinic that connects its PMS or uploads a
 * CSV would otherwise see "New patients" spike by their whole roster the day
 * they onboard. Acquisition means patients newly WON through your channels, so
 * we exclude these from the new-patient count / source mix / trend. (Deeper fix:
 * read the PMS's real first-visit date — tracked separately.)
 *
 * NOT in this set: 'pms' — a patient first appearing during ONGOING PMS delta
 * sync (after the connect-time backfill) is a genuinely new person booked in
 * the practice system, arriving within one cron cycle of the truth. They
 * COUNT as growth; only the one-time backfill is excluded (round-2 audit —
 * excluding ongoing sync rows blinded the funnel to all OD-side growth).
 *
 * Single home for the constant (pure, import-light) — the patients service,
 * Analytics, and the Overview all share it; `lib/services/analytics.ts`
 * re-exports it for existing importers.
 */
export const BACKFILL_PATIENT_SOURCES: ReadonlySet<string> = new Set(['pms_import', 'import'])
