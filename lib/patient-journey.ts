/**
 * THE JOURNEY-STAGE RESOLVER (Transformation Phase 1 — see DESIGN.md "The
 * North Star"). One derived answer to "where is this person in their
 * journey?", consumed by every tool and metric. Pure + client-safe.
 *
 * The platform is one journey: Find new patients → Book appointments → Keep
 * existing patients. A person moves through stages, and the stage is DERIVED
 * from facts — appointments and completed visits — never hand-stamped. The
 * old `patient.lifecycle` column is written at creation and never moved by
 * reality (the booking flow mints 'new' before anyone is seen); read paths
 * migrate to THIS resolver instead.
 *
 *   inquiry  — asked a question; nothing live on the schedule (never booked,
 *              or every booking was cancelled — they need re-conversion)
 *   booked   — a live (non-cancelled) appointment; never completed a visit
 *   patient  — ≥ 1 completed visit (the ONLY stage that counts as a
 *              "new patient" anywhere: seated, not promised)
 *   archived — staff-archived; excluded from every journey metric
 *
 * The keep-side sub-states (active / at-risk / lapsed) remain the recall
 * system's derivations layered on top of stage 'patient' — this resolver
 * deliberately stops at the three journey stages plus archived.
 */

export type JourneyStage = 'inquiry' | 'booked' | 'patient' | 'archived'

export interface JourneyFacts {
  /** Has a LIVE appointment on the books — cancelled-everything people are
   *  inquiries again (the service excludes status='cancelled'); a no-show
   *  still counts (they're in the show-up war, not gone). */
  hasAppointment: boolean
  /** Ever completed a visit (appointment.status = 'completed'). */
  hasCompletedVisit: boolean
  /** Staff-archived (patient.lifecycle = 'archived' — the one stored state
   *  that stays authoritative; archiving is a human decision, not activity). */
  archived: boolean
}

export function resolveJourneyStage(facts: JourneyFacts): JourneyStage {
  if (facts.archived) return 'archived'
  if (facts.hasCompletedVisit) return 'patient'
  if (facts.hasAppointment) return 'booked'
  return 'inquiry'
}

/** Reader-facing label per stage — the vocabulary the whole app uses. */
export const JOURNEY_STAGE_LABEL: Record<JourneyStage, string> = {
  inquiry: 'Inquiry',
  booked: 'Booked',
  patient: 'Patient',
  archived: 'Archived',
}

/**
 * The stage-transition timestamps every funnel metric anchors on. Null means
 * the transition hasn't happened. `firstSeatedAt` is THE "new patient"
 * moment — "new patients this month" means firstSeatedAt in the month.
 */
export interface JourneyTimestamps {
  /** Record minted (patient.firstSeenAt) — the inquiry/creation moment. */
  firstSeenAt: Date | null
  /** First appointment ever created for them. */
  firstBookedAt: Date | null
  /** First completed visit — the moment they became a patient. */
  firstSeatedAt: Date | null
}
