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

/**
 * APPOINTMENT sources that are a BULK BACKFILL of visit history, not a visit
 * the practice booked or the platform watched happen:
 *   - 'pms_import' — the PMS connect-time backfill (lib/services/pms/sync.ts)
 *   - 'csv_import' — the one completed row a CSV roster's "last visit" column
 *     mints per patient (lib/services/patient-import.ts), start = end, so a
 *     no-PMS practice's recall engine has fuel.
 * Both carry an HONEST startTime (the visit date) and a row createdAt that is
 * the import moment, so they count toward WHO a person is (a last visit, a
 * recall due, a lapsed glyph) and never toward WHEN a transition happened
 * (the journey funnel, "new patients"), never render as a chair visit (the
 * agenda, Today's chair) and never trigger a post-visit touch (review asks,
 * surveys, loyalty). `lib/services/patient-journey.ts` names both literally
 * in its SQL constants; `tests/patients/patient-import.test.ts` holds the
 * two homes together.
 */
export const BACKFILL_APPOINTMENT_SOURCES: ReadonlySet<string> = new Set(['pms_import', 'csv_import'])

/** The CSV roster's visit-history source, single-homed. */
export const CSV_IMPORT_APPOINTMENT_SOURCE = 'csv_import'
