// E2E fixture seed. Creates the minimum a browser journey needs, directly in
// SQL so the fixture cannot drift with service-layer refactors and so it stays
// readable as a description of the world under test.
//
// Two clinics on purpose:
//   e2e-dental       — LIVE site (site_live_at set): the normal public journey
//   e2e-prelive      — site_live_at NULL: a practice that is operating but has
//                      not published its marketing site. Its public pages must
//                      show "coming soon" while its PORTAL DOOR stays open —
//                      the R2 slice-4 fix, verified here in a real browser.
//
// Idempotent: safe to re-run against the same database.
//
// --- SCOPES (DREAMCRM-19) --------------------------------------------------
//
// The seed is split into named scopes so a single spec's rows can be restored
// WITHOUT touching another spec's. That split is what makes a Playwright retry
// meaningful: the harness seeds once per RUN, so a spec that CONSUMES its
// fixture (portal-reschedule cancels a visit, sign-here approves a proposal)
// used to fail its retry at the first assertion, burying the real error under
// an artifact of the retry. `e2e/reseed.ts` now restores the owning spec's
// scope before every attempt.
//
//   node scripts/e2e-seed.mjs                    # everything (the harness)
//   node scripts/e2e-seed.mjs sign-here          # just that spec's rows
//
// Two kinds of scope, and the distinction is the whole design:
//
//   `base` is STRUCTURE — clinics, patients, auth users, sessions. No spec
//   consumes any of it, so it is seeded once per run and never re-run.
//
//   Every other scope is one spec file's CONSUMABLE rows, and the scopes are
//   row-DISJOINT (docs/E2E.md, "Row ownership matters"). That disjointness is
//   load-bearing: spec files run in parallel workers, so worker 2 restoring
//   `sign-here` mid-run must not reset the visit worker 1 is halfway through
//   confirming. Adding a journey means adding a scope, not widening one.
import pg from 'pg'
import { pathToFileURL } from 'node:url'

// Three-letter keys — the shape lib/clinic-timezone.ts DAY_KEYS expects.
// (Full day names silently read as "closed", which is exactly the kind of
// fixture bug an E2E suite is supposed to surface loudly rather than hide.)
const HOURS = {
  mon: { open: '09:00', close: '17:00' },
  tue: { open: '09:00', close: '17:00' },
  wed: { open: '09:00', close: '17:00' },
  thu: { open: '09:00', close: '17:00' },
  fri: { open: '09:00', close: '17:00' },
  sat: { closed: true },
  sun: { closed: true },
}

const CLINICS = [
  { id: 'org_e2e_live', slug: 'e2e-dental', name: 'E2E Dental', display: 'E2E Dental Studio', live: true },
  { id: 'org_e2e_prelive', slug: 'e2e-prelive', name: 'E2E Prelive', display: 'E2E Prelive Dental', live: false },
]

// Next Wednesday 15:00 UTC (11am ET) — always in the future, always a weekday.
// The anchor several scopes hang their visits off, recomputed on every call
// rather than frozen at import: a scope restored an hour into the run must put
// its visits in the future RELATIVE TO NOW, not relative to when the harness
// started. It is stable across a full seed (all of it runs in under a second)
// and self-correcting across a retry, which is exactly the property wanted.
function nextWednesday() {
  const start = new Date()
  start.setUTCDate(start.getUTCDate() + ((3 - start.getUTCDay() + 7) % 7 || 7))
  start.setUTCHours(15, 0, 0, 0)
  return start
}

// --- base: structure no spec consumes --------------------------------------
// Clinics, patients, auth users, sessions. Seeded once per run; deliberately
// NOT re-runnable per attempt, because nothing here is ever spent.
async function seedBase(pool) {
  const start = nextWednesday()

  for (const c of CLINICS) {
    await pool.query(
      `insert into organization (id, name, slug, type, is_demo)
       values ($1, $2, $3, 'clinic', false)
       on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
      [c.id, c.name, c.slug],
    )
    await pool.query(
      `insert into clinic_profile (organization_id, display_name, timezone, hours, chair_count, site_live_at)
       values ($1, $2, 'America/New_York', $3, 2, $4)
       on conflict (organization_id) do update set
         display_name = excluded.display_name,
         timezone = excluded.timezone,
         hours = excluded.hours,
         chair_count = excluded.chair_count,
         site_live_at = excluded.site_live_at`,
      [c.id, c.display, JSON.stringify(HOURS), c.live ? new Date() : null],
    )
    console.log(`seeded ${c.slug} (${c.live ? 'live' : 'pre-live'})`)
  }

  // Casey — the patient behind BOTH the token journeys (/c, /n) and the
  // signed-in portal. The patient row itself is never consumed; the visits
  // hanging off it are, and they live in their own scopes below.
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone)
     values ('pat_e2e_confirm', 'org_e2e_live', 'Casey', 'Confirmable', 'casey.confirmable@example.com', '+15550100001')
     on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name`,
  )

  // Casey gets a linked auth user + a live session row, so e2e/portal.spec.ts
  // can mint the signed session cookie (it knows BETTER_AUTH_SECRET) and walk
  // the portal as a real signed-in patient — no magic-link email round-trip.
  // The session expires far in the future; the DB is rebuilt every run anyway.
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_patient', 'Casey Confirmable', 'casey.confirmable@example.com', true)
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into member (id, organization_id, user_id, role)
     values ('mem_e2e_patient', 'org_e2e_live', 'user_e2e_patient', 'patient')
     on conflict (id) do nothing`,
  )
  await pool.query(`update patient set user_id = 'user_e2e_patient' where id = 'pat_e2e_confirm'`)
  await pool.query(
    `insert into session (id, token, user_id, active_organization_id, expires_at)
     values ('sess_e2e_patient', 'e2e-patient-session-token', 'user_e2e_patient', 'org_e2e_live', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )

  // The signed-in staff member (staff-day + sign-here journeys). An owner of
  // the live clinic with a live session row, so e2e/staff-day.spec.ts and
  // e2e/sign-here.spec.ts can mint the signed session cookie exactly the way
  // the patient specs do. requireClinicTenant only checks tenantType, but owner
  // matches every other clinic fixture. trial_ends_at stays NULL (never on a
  // trial) so no TrialEndedWall replaces the dashboard.
  //
  // SHARED by two spec files on purpose, and the reason it lives in `base`: a
  // session is never spent, so neither spec has to own it and neither can
  // clobber the other by restoring its own scope.
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_staff', 'Dana Frontdesk', 'dana.frontdesk@example.com', true)
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into member (id, organization_id, user_id, role)
     values ('mem_e2e_staff', 'org_e2e_live', 'user_e2e_staff', 'owner')
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into session (id, token, user_id, active_organization_id, expires_at)
     values ('sess_e2e_staff', 'e2e-staff-session-token', 'user_e2e_staff', 'org_e2e_live', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone)
     values ('pat_e2e_staff', 'org_e2e_live', 'Riley', 'Staffday', 'riley.staffday@example.com', '+15550100003')
     on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name`,
  )

  // Morgan — a SECOND portal patient with their own session so the reschedule
  // journeys can't shadow e2e/portal.spec.ts (which owns Casey's rows) in a
  // parallel worker.
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_move', 'Morgan Moveable', 'morgan.moveable@example.com', true)
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into member (id, organization_id, user_id, role)
     values ('mem_e2e_move', 'org_e2e_live', 'user_e2e_move', 'patient')
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone, user_id)
     values ('pat_e2e_move', 'org_e2e_live', 'Morgan', 'Moveable', 'morgan.moveable@example.com', '+15550100004', 'user_e2e_move')
     on conflict (id) do update set user_id = 'user_e2e_move'`,
  )
  await pool.query(
    `insert into session (id, token, user_id, active_organization_id, expires_at)
     values ('sess_e2e_move', 'e2e-move-session-token', 'user_e2e_move', 'org_e2e_live', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )
  // --- the two sides of the tenant boundary (e2e/tenant-boundary.spec.ts) ---
  //
  // One patient and one visit in EACH clinic, plus a signed-in owner for the
  // SECOND clinic. Dana already owns e2e-dental; Avery owns e2e-prelive, so
  // the spec can drive the boundary from both directions and show it is a
  // property of the code rather than a fact about one privileged fixture org.
  //
  // These live in `base` because the boundary spec never writes: every one of
  // its assertions is a 404, an absence, or a control read. Nothing here is
  // spent, so nothing needs restoring — and a read-only spec cannot race the
  // workers that ARE spending their own scopes.
  //
  // The names are deliberately unlike every other fixture name, because half
  // the spec asserts a string is ABSENT from a page. "Rivalclinic" appearing
  // anywhere in e2e-dental's HTML is unambiguous; "Casey" would not be.
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_rival', 'Avery Rivaldesk', 'avery.rivaldesk@example.com', true)
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into member (id, organization_id, user_id, role)
     values ('mem_e2e_rival', 'org_e2e_prelive', 'user_e2e_rival', 'owner')
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into session (id, token, user_id, active_organization_id, expires_at)
     values ('sess_e2e_rival', 'e2e-rival-session-token', 'user_e2e_rival', 'org_e2e_prelive', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone)
     values ('pat_e2e_rival', 'org_e2e_prelive', 'Jamie', 'Rivalclinic', 'jamie.rivalclinic@example.com', '+15550100006')
     on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name`,
  )
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone)
     values ('pat_e2e_ours', 'org_e2e_live', 'Sam', 'Ourpatient', 'sam.ourpatient@example.com', '+15550100007')
     on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name`,
  )
  // One visit each, so the spec can ask /api/appointments/[id] for a row in
  // the OTHER clinic and get a 404 rather than somebody else's patient.
  const boundaryStart = new Date(start)
  boundaryStart.setUTCDate(boundaryStart.getUTCDate() + 1)
  boundaryStart.setUTCHours(18, 0, 0, 0)
  await pool.query(
    `insert into appointment (id, organization_id, patient_id, title, start_time, type, status)
     values ('appt_e2e_ours', 'org_e2e_live', 'pat_e2e_ours', 'checkup — Sam', $1, 'checkup', 'scheduled')
     on conflict (id) do update set start_time = excluded.start_time`,
    [boundaryStart],
  )
  await pool.query(
    `insert into appointment (id, organization_id, patient_id, title, start_time, type, status)
     values ('appt_e2e_rival', 'org_e2e_prelive', 'pat_e2e_rival', 'checkup — Jamie', $1, 'checkup', 'scheduled')
     on conflict (id) do update set start_time = excluded.start_time`,
    [boundaryStart],
  )

  console.log(`seeded patients + sessions (visit anchor ${start.toISOString()})`)
}

// --- tokens: e2e/token-journeys.spec.ts ------------------------------------
// The /c one-click confirm and the /n post-visit survey — the two patient
// touches that need no login and no Stripe, but ARE real DB writes. Both are
// consumed by their spec, so restoring this scope resets the answered state
// ("scheduled", score null) and the journey can be driven again.
async function seedTokens(pool) {
  const start = nextWednesday()
  await pool.query(
    `insert into appointment (id, organization_id, patient_id, title, start_time, type, status, confirm_token)
     values ('appt_e2e_confirm', 'org_e2e_live', 'pat_e2e_confirm', 'Checkup — Casey', $1, 'checkup', 'scheduled', 'e2e-confirm-token')
     on conflict (id) do update set
       start_time = excluded.start_time,
       status = 'scheduled',
       confirmed_at = null,
       confirmed_via = null`,
    [start],
  )
  console.log(`seeded confirmable visit at ${start.toISOString()}`)

  await pool.query(
    `insert into nps_response (id, organization_id, patient_id, appointment_id, token)
     values ('nps_e2e_1', 'org_e2e_live', 'pat_e2e_confirm', 'appt_e2e_confirm', 'e2e-nps-token')
     on conflict (id) do update set score = null, comment = null, responded_at = null`,
  )
  console.log('seeded unanswered survey')
}

// --- portal: e2e/portal.spec.ts --------------------------------------------
// The PORTAL's own visit (a cleaning, two Wednesdays out) — deliberately a
// different row from appt_e2e_confirm: the /c token spec and the portal spec
// run in parallel workers, and sharing one appointment would make each flaky
// in the other's shadow. The spec confirms it, so restoring resets it to
// unconfirmed.
async function seedPortal(pool) {
  const portalStart = nextWednesday()
  portalStart.setUTCDate(portalStart.getUTCDate() + 7)
  await pool.query(
    `insert into appointment (id, organization_id, patient_id, title, start_time, type, status)
     values ('appt_e2e_portal', 'org_e2e_live', 'pat_e2e_confirm', 'Cleaning — Casey', $1, 'cleaning', 'scheduled')
     on conflict (id) do update set
       start_time = excluded.start_time,
       status = 'scheduled',
       confirmed_at = null,
       confirmed_via = null`,
    [portalStart],
  )
  console.log('seeded portal visit')
}

// --- staff-day: e2e/staff-day.spec.ts --------------------------------------
// One patient, three visits, one per drawer action — confirm/complete/cancel
// each end in a terminal or guarded state, so a single row cannot be walked
// through all three. Types differ (checkup/consultation/cleaning) because the
// agenda row's aria-label is "Open {name}'s visit" for all of them and the
// TYPE text is how a spec tells the rows apart. Reset to 'scheduled' on every
// restore so the journeys can be driven again.
async function seedStaffDay(pool) {
  // Future rows ride the agenda's default next-14-days window: the day after
  // the /c fixture's "next Wednesday" is always 2–8 days out. The complete row
  // must be PAST (the drawer only offers "Mark completed" once startTime < now)
  // AND inside the "Past 30 days" window chip the spec navigates to.
  //
  // Those are two different bars, and the second one is why this is TWO days
  // back rather than one. `past_30d` ends at the CLINIC-LOCAL day start
  // (lib/services/appointments.ts — `to: clinicDayStart(now, timeZone)`), and
  // these clinics are America/New_York. So for the four hours between UTC
  // midnight and 04:00 UTC, "yesterday 15:00 UTC" is TODAY in New York, the
  // chip's window excludes it, and the visit is in the past but not on the
  // page — a spec that goes red every night on the clock alone.
  //
  // Two days back at 15:00 UTC clears the bound at every hour: the window's
  // upper edge is never earlier than 04:00 UTC of the previous UTC day, and
  // day−2 15:00 is always before that, in EDT and EST alike.
  const staffFuture = nextWednesday()
  staffFuture.setUTCDate(staffFuture.getUTCDate() + 1)
  const staffPast = new Date()
  staffPast.setUTCDate(staffPast.getUTCDate() - 2)
  staffPast.setUTCHours(15, 0, 0, 0)
  const STAFF_VISITS = [
    { id: 'appt_e2e_staff_confirm', type: 'checkup', start: staffFuture, hour: 15 },
    { id: 'appt_e2e_staff_cancel', type: 'consultation', start: staffFuture, hour: 16 },
    { id: 'appt_e2e_staff_complete', type: 'cleaning', start: staffPast, hour: 15 },
  ]
  for (const v of STAFF_VISITS) {
    const startAt = new Date(v.start)
    startAt.setUTCHours(v.hour, 0, 0, 0)
    await pool.query(
      `insert into appointment (id, organization_id, patient_id, title, start_time, type, status)
       values ($1, 'org_e2e_live', 'pat_e2e_staff', $2, $3, $4, 'scheduled')
       on conflict (id) do update set
         start_time = excluded.start_time,
         status = 'scheduled',
         confirmed_at = null,
         confirmed_via = null,
         cancelled_at = null,
         cancelled_via = null,
         cancelled_by_user_id = null,
         completed_at = null`,
      [v.id, `${v.type} — Riley`, startAt, v.type],
    )
  }
  console.log('seeded staff-day visits')
}

// --- portal-reschedule: e2e/portal-reschedule.spec.ts ----------------------
// Types are distinct (consultation/filling/extraction) because the visit card
// renders no title — PORTAL_VISIT_LABELS[type] is how the spec addresses each
// card.
async function seedPortalReschedule(pool) {
  // Reschedule + cancel targets sit three Wednesdays out — comfortably OUTSIDE
  // the default 24h notice window whenever the harness runs. The reschedule
  // consumes its row (a new appointment is minted, the original cancelled), so
  // restoring also sweeps any prior attempt's minted copies before resetting.
  await pool.query(
    `delete from appointment
      where organization_id = 'org_e2e_live'
        and patient_id = 'pat_e2e_move'
        and rescheduled_from_appointment_id is not null`,
  )
  const moveStart = nextWednesday()
  moveStart.setUTCDate(moveStart.getUTCDate() + 14)
  const MOVE_VISITS = [
    { id: 'appt_e2e_move', type: 'consultation', hour: 15 },
    { id: 'appt_e2e_cancelme', type: 'filling', hour: 16 },
  ]
  for (const v of MOVE_VISITS) {
    const startAt = new Date(moveStart)
    startAt.setUTCHours(v.hour, 0, 0, 0)
    await pool.query(
      `insert into appointment (id, organization_id, patient_id, title, start_time, type, status)
       values ($1, 'org_e2e_live', 'pat_e2e_move', $2, $3, $4, 'scheduled')
       on conflict (id) do update set
         start_time = excluded.start_time,
         status = 'scheduled',
         confirmed_at = null,
         confirmed_via = null,
         cancelled_at = null,
         cancelled_via = null,
         cancelled_by_user_id = null`,
      [v.id, `${v.type} — Morgan`, startAt, v.type],
    )
  }
  // The INSIDE-the-window case: ~20 hours out (< the 24h default), so the card
  // must hide Reschedule/Cancel and offer the "Need to change it?" fallback.
  // Recomputed from `now` on every restore, which is the point — a retry ten
  // minutes later still needs a visit that is 20 hours out, not 19h50m frozen
  // at the run's start.
  const soonStart = new Date(Date.now() + 20 * 60 * 60 * 1000)
  await pool.query(
    `insert into appointment (id, organization_id, patient_id, title, start_time, type, status)
     values ('appt_e2e_soon', 'org_e2e_live', 'pat_e2e_move', 'extraction — Morgan', $1, 'extraction', 'scheduled')
     on conflict (id) do update set
       start_time = excluded.start_time,
       status = 'scheduled',
       cancelled_at = null,
       cancelled_via = null`,
    [soonStart],
  )
  console.log('seeded portal reschedule/cancel visits')
}

// --- sign-here: e2e/sign-here.spec.ts --------------------------------------
// An inquiry_response proposal is the one capability whose executor completes
// with no vendor keys: deliver() silently succeeds for @example.com
// recipients (lib/email.ts isReservedUndeliverableAddress) BEFORE it looks
// for RESEND_API_KEY. The lead must be status 'new' with an email or the
// executor retires the card; source_key must be inquiry_response:<leadId> or
// the lead drawer's "What we sent" block never finds the sent reply. Reset
// both on every restore — the approve consumes them.
async function seedSignHere(pool) {
  await pool.query(
    `insert into lead (id, organization_id, name, phone, email, message, status)
     values ('lead_e2e_inquiry', 'org_e2e_live', 'Robin Inquirer', '+15550100005',
             'robin.inquirer@example.com',
             'Do you take my insurance, and can I get in next week?', 'new')
     on conflict (id) do update set
       status = 'new', contacted_at = null, email = excluded.email`,
  )
  await pool.query(
    `insert into proposal (
       id, organization_id, capability, source_key, title, body, payload,
       status, expires_at, is_demo, created_at, updated_at
     ) values (
       'prop_e2e_inquiry', 'org_e2e_live', 'inquiry_response',
       'inquiry_response:lead_e2e_inquiry',
       'Answer Robin''s website inquiry',
       E'Hi Robin — thanks for writing in!\n\nWe work with most major plans, and a team member will confirm your specific coverage before your visit. We have room next week and would love to get you in.',
       jsonb_build_object(
         'leadId', 'lead_e2e_inquiry',
         'subject', 'Your question for E2E Dental Studio',
         'context', jsonb_build_object(
           'kind', 'inquiry',
           'author', 'Robin Inquirer',
           'text', 'Do you take my insurance, and can I get in next week?',
           'preferredDate', null
         )
       ),
       'open', now() + interval '7 days', 0, now(), now()
     )
     on conflict (id) do update set
       status = 'open', decided_at = null, decided_by_user_id = null,
       executed_at = null, original_body = null,
       payload = excluded.payload,
       expires_at = excluded.expires_at`,
  )
  console.log('seeded sign-here inquiry proposal')
}

// --- go-live: e2e/go-live.spec.ts ------------------------------------------
// A THIRD clinic, and it exists because the lever spec SPENDS the thing that
// makes a clinic pre-live. `e2e-prelive` could not be reused: e2e/clinic-site
// .spec.ts asserts that clinic serves coming-soon, and the two files run in
// parallel workers, so a lever pulled over here would turn that spec red over
// there. Row ownership is not a formality — this is what it is protecting.
//
// The whole clinic sits in this scope rather than in `base`, which is the one
// place the base/consumable split bends. `site_live_at` is the consumable, and
// it lives on the clinic_profile row; putting the profile in `base` and the
// nulling in `go-live` would leave the spec's fixture half-owned by a scope
// that never re-runs. Nothing else reads this clinic, so the whole world it
// needs — org, profile, owner, session — is restored together.
async function seedGoLive(pool) {
  await pool.query(
    `insert into organization (id, name, slug, type, is_demo)
     values ('org_e2e_golive', 'E2E Golive', 'e2e-golive', 'clinic', false)
     on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
  )
  // site_live_at NULL on every restore — that IS the reset. A retry (or this
  // file's second test) must start with the lever un-pulled or the card the
  // spec clicks is not on the page at all.
  await pool.query(
    `insert into clinic_profile (organization_id, display_name, timezone, hours, chair_count, site_live_at)
     values ('org_e2e_golive', 'E2E Golive Dental', 'America/New_York', $1, 2, null)
     on conflict (organization_id) do update set
       display_name = excluded.display_name,
       timezone = excluded.timezone,
       hours = excluded.hours,
       chair_count = excluded.chair_count,
       site_live_at = null`,
    [JSON.stringify(HOURS)],
  )
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_golive', 'Nico Golive', 'nico.golive@example.com', true)
     on conflict (id) do nothing`,
  )
  // Owner, because the lever's gate is owner/admin only (go-live-actions.ts).
  await pool.query(
    `insert into member (id, organization_id, user_id, role)
     values ('mem_e2e_golive', 'org_e2e_golive', 'user_e2e_golive', 'owner')
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into session (id, token, user_id, active_organization_id, expires_at)
     values ('sess_e2e_golive', 'e2e-golive-session-token', 'user_e2e_golive', 'org_e2e_golive', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )
  console.log('seeded the go-live clinic (pre-live)')
}

// --- billing: e2e/portal-billing.spec.ts -----------------------------------
// A FOURTH clinic, for the same reason `go-live` needed a third: this journey
// changes facts that other specs read.
//
// Two of them, specifically. `clinic_profile.portal_settings` is org-level, and
// `features.payments` defaults OFF — turning it on for `org_e2e_live` would
// change what the portal nav and the billing page render for every other portal
// spec sharing that org, mid-run, from a parallel worker. `shop_config` is
// org-level too, and an active connected account is what `canTakeBalancePayments`
// reads. Neither belongs to a spec that does not own the clinic.
//
// So the whole world this journey needs — clinic, profile with payments ON,
// connected account, patient with a real balance, auth user, session — is one
// scope, disjoint from everything else, restored together before each attempt.
//
// WHAT IS ACTUALLY CONSUMED here is small and easy to miss: every attempt to
// start a checkout INSERTS a pending `patient_balance_payment` row before it
// reaches Stripe, and rolls it back when Stripe throws. The rollback is
// best-effort by design (`discardUnstartedBalancePayment` swallows its own
// failures rather than replacing the real error), so a leftover pending row is
// a real possibility — and it would show up in the billing HISTORY list the
// next attempt reads. The restore clears them, which is the difference between
// a retry starting from the seeded world and a retry starting from the last
// attempt's debris.
const BILLING_BALANCE_CENTS = 18_500 // $185.00 — above PLAN_MIN_TOTAL_CENTS, so the split-it offer renders too.

async function seedBilling(pool) {
  await pool.query(
    `insert into organization (id, name, slug, type, is_demo)
     values ('org_e2e_billing', 'E2E Billing', 'e2e-billing', 'clinic', false)
     on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
  )
  // `payments: true` is the whole reason this clinic exists. The stored blob is
  // merged over DEFAULT_PORTAL_SETTINGS on read (lib/services/portal-settings.ts),
  // so naming only what differs is both correct and honest about what is under
  // test — `billing` is already on by default, `payments` is not.
  await pool.query(
    `insert into clinic_profile (organization_id, display_name, timezone, hours, chair_count, site_live_at, phone, portal_settings)
     values ('org_e2e_billing', 'E2E Billing Dental', 'America/New_York', $1, 2, now(), '+15550100900', $2)
     on conflict (organization_id) do update set
       display_name = excluded.display_name,
       timezone = excluded.timezone,
       hours = excluded.hours,
       chair_count = excluded.chair_count,
       site_live_at = excluded.site_live_at,
       phone = excluded.phone,
       portal_settings = excluded.portal_settings`,
    [JSON.stringify(HOURS), JSON.stringify({ features: { payments: true } })],
  )
  // The connected account `canTakeBalancePayments` reads. Nothing here ever
  // reaches Stripe — the harness sets no STRIPE_SECRET_KEY on purpose (see
  // scripts/e2e-harness.sh) — so this account id is a shape, not a credential.
  await pool.query(
    `insert into shop_config (organization_id, stripe_account_id, stripe_account_status, charges_enabled, currency)
     values ('org_e2e_billing', 'acct_e2e_not_a_real_account', 'active', 1, 'usd')
     on conflict (organization_id) do update set
       stripe_account_id = excluded.stripe_account_id,
       stripe_account_status = excluded.stripe_account_status,
       charges_enabled = excluded.charges_enabled`,
  )
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_billing', 'Sam Owing', 'sam.owing@example.com', true)
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into member (id, organization_id, user_id, role)
     values ('mem_e2e_billing', 'org_e2e_billing', 'user_e2e_billing', 'patient')
     on conflict (id) do nothing`,
  )
  // The balance is re-stamped on every restore. It is read from the PMS mirror
  // column and never written by a payment, but a restore that left it alone
  // would be trusting that rather than guaranteeing it.
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone, user_id, pms_balance_cents, pms_balance_updated_at)
     values ('pat_e2e_billing', 'org_e2e_billing', 'Sam', 'Owing', 'sam.owing@example.com', '+15550100005', 'user_e2e_billing', $1, now())
     on conflict (id) do update set
       user_id = 'user_e2e_billing',
       pms_balance_cents = excluded.pms_balance_cents,
       pms_balance_updated_at = excluded.pms_balance_updated_at`,
    [BILLING_BALANCE_CENTS],
  )
  await pool.query(
    `insert into session (id, token, user_id, active_organization_id, expires_at)
     values ('sess_e2e_billing', 'e2e-billing-session-token', 'user_e2e_billing', 'org_e2e_billing', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )
  // The debris sweep described above: any pending row a previous attempt's
  // rollback failed to clear would otherwise appear in this attempt's history.
  await pool.query(
    `delete from patient_balance_payment where patient_id = 'pat_e2e_billing'`,
  )
  console.log('seeded the billing clinic (payments on, $185.00 owed)')
}

// ---------------------------------------------------------------------------
// `webhook` — THE CONNECT WEBHOOK BACKSTOP (DREAMCRM-48)
//
// Its own two clinics, for the same reason `billing` has one: this scope's
// whole subject is org-level facts — a connected account on one clinic and
// deliberately NONE on the other — plus balance-payment rows a webhook either
// may or may not touch. Both are exactly the kind of fact another portal spec
// reads, so neither can live in a shared clinic.
//
// THE TWO CLINICS ARE NOT SYMMETRY, THEY ARE THE TEST.
// `e2e/stripe-webhook-backstop.spec.ts` posts a correctly signed event naming
// `org_e2e_webhook` about a session id that belongs to
// `org_e2e_webhook_rival`. Today `finalizeBalancePaymentFromSession` looks the
// payment up by BOTH org and session, so it matches nothing and the route
// simply acks. Drop the org half of that filter and it would match the
// rival's PENDING row, reach for the connected account of the org named in
// the event — which this clinic has — and call Stripe with the webhook
// server's fake key, which fails and turns the route 500. That difference is
// what the spec's assertion rests on, and it is why the rival owns a pending
// row and no `shop_config` while this clinic owns a paid one and does.
//
// The paid row is the idempotency fixture: a second delivery of an event for
// a payment already marked paid must change nothing a patient can see.
//
// $42.37 and not a whole dollar on purpose — `fmtMoney` drops the cents on a
// round number and the billing spec's first run went red on exactly that.
const WEBHOOK_PAID_CENTS = 4_237

async function seedWebhook(pool) {
  await pool.query(
    `insert into organization (id, name, slug, type, is_demo)
     values ('org_e2e_webhook', 'E2E Webhook', 'e2e-webhook', 'clinic', false)
     on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
  )
  await pool.query(
    `insert into clinic_profile (organization_id, display_name, timezone, hours, chair_count, site_live_at, phone, portal_settings)
     values ('org_e2e_webhook', 'E2E Webhook Dental', 'America/New_York', $1, 2, now(), '+15550100901', $2)
     on conflict (organization_id) do update set
       display_name = excluded.display_name,
       timezone = excluded.timezone,
       hours = excluded.hours,
       chair_count = excluded.chair_count,
       site_live_at = excluded.site_live_at,
       phone = excluded.phone,
       portal_settings = excluded.portal_settings`,
    [JSON.stringify(HOURS), JSON.stringify({ features: { payments: true } })],
  )
  // The connected account the finalizer reads before it would reach Stripe. A
  // SHAPE, not a credential — the webhook server carries a fake key precisely
  // so a call that should never happen fails loudly rather than succeeding
  // quietly against the real API.
  await pool.query(
    `insert into shop_config (organization_id, stripe_account_id, stripe_account_status, charges_enabled, currency)
     values ('org_e2e_webhook', 'acct_e2e_webhook_not_a_real_account', 'active', 1, 'usd')
     on conflict (organization_id) do update set
       stripe_account_id = excluded.stripe_account_id,
       stripe_account_status = excluded.stripe_account_status,
       charges_enabled = excluded.charges_enabled`,
  )
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_webhook', 'Pat Settled', 'pat.settled@example.com', true)
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into member (id, organization_id, user_id, role)
     values ('mem_e2e_webhook', 'org_e2e_webhook', 'user_e2e_webhook', 'patient')
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone, user_id)
     values ('pat_e2e_webhook', 'org_e2e_webhook', 'Pat', 'Settled', 'pat.settled@example.com', '+15550100006', 'user_e2e_webhook')
     on conflict (id) do update set user_id = 'user_e2e_webhook'`,
  )
  await pool.query(
    `insert into session (id, token, user_id, active_organization_id, expires_at)
     values ('sess_e2e_webhook', 'e2e-webhook-session-token', 'user_e2e_webhook', 'org_e2e_webhook', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )
  // RE-STAMPED on restore, never `do nothing`. A previous attempt may have
  // moved this row — that is precisely the failure this spec exists to catch
  // — and a restore that trusted it would hand the next attempt the last
  // attempt's damage and call it a fixture.
  await pool.query(
    `insert into patient_balance_payment
       (id, organization_id, patient_id, amount_cents, status, stripe_checkout_session_id, stripe_payment_intent_id, paid_at)
     values ('bp_e2e_webhook_paid', 'org_e2e_webhook', 'pat_e2e_webhook', $1, 'paid', 'cs_e2e_webhook_paid', 'pi_e2e_webhook_paid', now() - interval '2 days')
     on conflict (id) do update set
       status = 'paid',
       amount_cents = excluded.amount_cents,
       stripe_checkout_session_id = excluded.stripe_checkout_session_id,
       stripe_payment_intent_id = excluded.stripe_payment_intent_id,
       refunded_amount_cents = 0,
       refunded_at = null,
       paid_at = excluded.paid_at`,
    [WEBHOOK_PAID_CENTS],
  )
  // Anything else this patient owns is debris from an attempt that DID move
  // something, and it would show up in the history the next attempt reads.
  await pool.query(
    `delete from patient_balance_payment
      where patient_id = 'pat_e2e_webhook' and id <> 'bp_e2e_webhook_paid'`,
  )

  // The rival: a real clinic with a real pending payment and NO connected
  // account, so even a finalizer that lost its org filter could not reach
  // Stripe on this row's own behalf. No profile, user or session — the spec
  // never signs in as it, and a second portal fixture would be a second thing
  // to keep true for no assertion.
  await pool.query(
    `insert into organization (id, name, slug, type, is_demo)
     values ('org_e2e_webhook_rival', 'E2E Webhook Rival', 'e2e-webhook-rival', 'clinic', false)
     on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
  )
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone)
     values ('pat_e2e_webhook_rival', 'org_e2e_webhook_rival', 'Robin', 'Elsewhere', 'robin.elsewhere@example.com', '+15550100007')
     on conflict (id) do nothing`,
  )
  await pool.query(
    `insert into patient_balance_payment
       (id, organization_id, patient_id, amount_cents, status, stripe_checkout_session_id)
     values ('bp_e2e_webhook_rival', 'org_e2e_webhook_rival', 'pat_e2e_webhook_rival', 9900, 'pending', 'cs_e2e_webhook_rival_pending')
     on conflict (id) do update set
       status = 'pending',
       stripe_checkout_session_id = excluded.stripe_checkout_session_id,
       paid_at = null,
       stripe_payment_intent_id = null`,
  )
  console.log('seeded the webhook backstop clinics (one paid payment, one rival pending)')
}

// ---------------------------------------------------------------------------
// `token-pages` — THE PAGES A PATIENT OPENS FROM A TEXT MESSAGE (DREAMCRM-98)
//
// Eight of the ten single-letter link routes had no browser stop at all: /b
// pay your balance, /i your payment plan, /r leave a review, /w an earlier
// opening, /g your practice's online grade, /d book a demo, /e the conference
// floor's capture page, /h the attendee's headshot. Only /c and /n were
// walked (`tokens`).
//
// WHY THESE EIGHT ARE ONE SCOPE rather than eight. They are one POPULATION —
// a page opened from a text or an email, on a phone, by somebody who is not
// signed in and has no account to fall back on — and the spec that walks them
// makes one pass over that population. Splitting them would give eight scopes
// each claimed by the same file, which the disjointness guard forbids for good
// reason: the claim is per FILE.
//
// NOTHING HERE IS SPENT BY THE SPEC. It opens each page and scans it; the one
// write any of them performs on a GET is `recordReviewClick`, which flips the
// review request 'sent' → 'clicked'. That is restored below anyway — a fixture
// that is only nearly idempotent is the kind that fails on the third retry of
// a bad afternoon, months from now, for reasons nobody remembers.
//
// The clinic is its OWN org (not `org_e2e_live`) because /b and /i need a
// CONNECTED Stripe account to render the paying state, and giving the shared
// live clinic one would change what every other spec sees.
const TOKEN_PAGES_BALANCE_CENTS = 24_000 // $240.00 — over $20, so /b offers the Half chip too.

/**
 * /g, /e and /h validate the token against `/^[a-f0-9]{32}$/` BEFORE touching
 * the database, so those three cannot use the readable `e2e-…-token` shape the
 * rest of the seed uses — a spec with a readable token there would 404 with no
 * hint as to why. This keeps them recognisable inside the constraint: a
 * hex-only mnemonic prefix, zero-padded to the 32 characters the route demands.
 */
const hexToken = (prefix) => prefix.padEnd(32, '0')
const GRADE_TOKEN = hexToken('e2e60ade') // "e2e grade"
const EVENT_TOKEN = hexToken('e2ecafe0') // the floor's own device
const CAPTURE_TOKEN = hexToken('e2eface0') // the attendee's headshot

/**
 * A minimal `practice_grade.result` that survives `parsePracticeGradeResult`.
 * All four axes are present with a score, findings and wins, because the
 * report renders a different (and much emptier) page for a missing axis — and
 * an axe stop over the empty page would be a stop over markup no visitor sees.
 */
const GRADE_RESULT = {
  overall: 72,
  headline: 'A solid practice that is hard to find online.',
  computedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
  axes: {
    website: {
      score: 64,
      findings: [{ text: 'No way to book without calling.', after: 'Patients book themselves, day or night.' }],
      wins: ['Loads fast on a phone.'],
    },
    listing: {
      score: 81,
      findings: [{ text: 'Your hours are out of date on Google.', after: 'Hours stay in step with the practice.' }],
      wins: ['Verified listing.'],
    },
    reviews: {
      score: 70,
      findings: [{ text: 'Nobody has asked a happy patient in months.', after: 'Every finished visit gets the ask.' }],
      wins: ['4.8 stars from the reviews you have.'],
    },
    search: {
      score: 58,
      findings: [{ text: 'You are on page two for your own town.', after: null }],
      wins: [],
    },
  },
}

async function seedTokenPages(pool) {
  await pool.query(
    `insert into organization (id, name, slug, type, is_demo)
     values ('org_e2e_tokenpages', 'E2E Token Pages', 'e2e-tokenpages', 'clinic', false)
     on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
  )
  await pool.query(
    `insert into clinic_profile (organization_id, display_name, timezone, hours, chair_count, site_live_at, phone, brand_color)
     values ('org_e2e_tokenpages', 'E2E Token Pages Dental', 'America/New_York', $1, 2, now(), '+15550100700', '#2F6D6A')
     on conflict (organization_id) do update set
       display_name = excluded.display_name,
       timezone = excluded.timezone,
       hours = excluded.hours,
       chair_count = excluded.chair_count,
       site_live_at = excluded.site_live_at,
       phone = excluded.phone,
       brand_color = excluded.brand_color`,
    [JSON.stringify(HOURS)],
  )
  // `canTakeBalancePayments` reads this, and both /b and /i render a
  // "call the office" apology instead of their real UI without it. Nothing
  // reaches Stripe — the harness sets no STRIPE_SECRET_KEY (see
  // scripts/e2e-harness.sh) — so the account id is a shape, not a credential.
  await pool.query(
    `insert into shop_config (organization_id, stripe_account_id, stripe_account_status, charges_enabled, currency)
     values ('org_e2e_tokenpages', 'acct_e2e_not_a_real_account', 'active', 1, 'usd')
     on conflict (organization_id) do update set
       stripe_account_id = excluded.stripe_account_id,
       stripe_account_status = excluded.stripe_account_status,
       charges_enabled = excluded.charges_enabled`,
  )
  // /r branches hard on this row. No google_place_id and the page has no
  // primary action at all; star_gate_enabled and show_private_feedback are
  // what put the 5-star radio group and the private-note path on screen —
  // the custom controls a static a11y gate cannot see.
  await pool.query(
    `insert into clinic_review_config (organization_id, google_place_id, star_gate_enabled, show_private_feedback)
     values ('org_e2e_tokenpages', 'ChIJe2eNotARealPlaceId', 1, 1)
     on conflict (organization_id) do update set
       google_place_id = excluded.google_place_id,
       star_gate_enabled = excluded.star_gate_enabled,
       show_private_feedback = excluded.show_private_feedback`,
  )
  await pool.query(
    `insert into clinic_provider (id, organization_id, display_name, role)
     values ('prv_e2e_tokenpages', 'org_e2e_tokenpages', 'Dr. Reese Okonjo', 'dentist')
     on conflict (id) do update set display_name = excluded.display_name`,
  )
  await pool.query(
    `insert into patient (id, organization_id, first_name, last_name, email, phone, pms_balance_cents, pms_balance_updated_at)
     values ('pat_e2e_tokenpages', 'org_e2e_tokenpages', 'Robin', 'Textbound', 'robin.textbound@example.com', '+15550100701', $1, now())
     on conflict (id) do update set
       pms_balance_cents = excluded.pms_balance_cents,
       pms_balance_updated_at = excluded.pms_balance_updated_at`,
    [TOKEN_PAGES_BALANCE_CENTS],
  )

  // /b — the balance email's landing, in the state that takes money.
  await pool.query(
    `insert into balance_payment_request (id, organization_id, patient_id, token, balance_cents_at_send, status, source)
     values ('bpr_e2e_tokenpages', 'org_e2e_tokenpages', 'pat_e2e_tokenpages', 'e2e-pay-balance-token', $1, 'sent', 'staff')
     on conflict (id) do update set status = 'sent', paid_at = null, payment_id = null`,
    [TOKEN_PAGES_BALANCE_CENTS],
  )

  // /i — a plan still waiting on the patient's yes. 'proposed' is the state
  // with the terms and the Accept button; every later state is a status page.
  await pool.query(
    `insert into payment_plan (id, organization_id, patient_id, token, total_cents, installment_cents, installments, status)
     values ('plan_e2e_tokenpages', 'org_e2e_tokenpages', 'pat_e2e_tokenpages', 'e2e-payment-plan-token', 24000, 6000, 4, 'proposed')
     on conflict (id) do update set
       status = 'proposed',
       installments_paid = 0,
       accepted_at = null,
       next_charge_at = null,
       stripe_customer_id = null,
       stripe_payment_method_id = null,
       stripe_setup_session_id = null`,
  )

  // /r — the review ask, unanswered. Restored to 'sent' because opening the
  // page records a click; see the scope header.
  await pool.query(
    `insert into review_request (id, organization_id, patient_id, channel, status, token, sent_at)
     values ('rev_e2e_tokenpages', 'org_e2e_tokenpages', 'pat_e2e_tokenpages', 'email', 'sent', 'e2e-review-token', now())
     on conflict (id) do update set
       status = 'sent',
       clicked_at = null,
       completed_at = null,
       selected_site = null,
       rating = null,
       review_text = null,
       private_feedback = null`,
  )

  // /w — an earlier opening, still claimable. The slot has to be in the
  // FUTURE on every restore: `getOfferByToken` reads a pending offer whose
  // slot has already started as expired, which would quietly swap the page
  // under the stop for a different one.
  const offerStart = nextWednesday()
  offerStart.setUTCHours(13, 0, 0, 0)
  await pool.query(
    `insert into appointment_waitlist (id, organization_id, patient_id, visit_type, provider_id, status, source)
     values ('wl_e2e_tokenpages', 'org_e2e_tokenpages', 'pat_e2e_tokenpages', 'cleaning', 'prv_e2e_tokenpages', 'active', 'portal')
     on conflict (id) do update set status = 'active', fulfilled_at = null`,
  )
  await pool.query(
    `insert into appointment_waitlist_offer
       (id, organization_id, waitlist_id, patient_id, slot_start, provider_id, visit_type, token, status, sent_at)
     values ('wlo_e2e_tokenpages', 'org_e2e_tokenpages', 'wl_e2e_tokenpages', 'pat_e2e_tokenpages', $1, 'prv_e2e_tokenpages', 'cleaning', 'e2e-fastpass-token', 'pending', now())
     on conflict (id) do update set
       slot_start = excluded.slot_start,
       status = 'pending',
       claimed_at = null,
       claimed_appointment_id = null`,
    [offerStart],
  )

  // --- the platform's own token pages. No clinic org exists for any of
  // these: a prospect, a grader lead and a stranger met on a conference
  // floor are all people Dream Create has not sold anything to yet.

  // /d needs booking TURNED ON, or the page renders a one-line "booking is
  // closed" card instead of the slot picker — which is the control worth
  // scanning.
  //
  // ⚠ THIS IS AN UNOWNED GLOBAL WRITE, AND THE DISJOINTNESS GUARD CANNOT SEE
  // IT (Sentinel, reviewing #669). `prospecting_config` is a platform-global
  // SINGLETON at the literal id `'default'`, and this upsert replaces the whole
  // JSON blob before every test in `e2e/token-landings.spec.ts`, while other
  // workers are running. `tests/guards/e2e-seed-scopes.test.ts` keys its
  // declared-vs-written check on the `<prefix>_e2e_<name>` row shape, so
  // `'default'` is invisible to it — the row has no owner and the guard reports
  // that as fine. It goes QUIET, not red, which is exactly the failure mode
  // that guard's own docblock was written about, one level up: there the hole
  // is a missing prefix, here it is a row id that can never have one, and no
  // amount of growing the prefix list closes it. The next scope that needs a
  // singleton has the same problem.
  //
  // Safe TODAY, which is why it is a comment and not a fix:
  // `lib/services/prospecting.ts` is the only reader, and no other spec walks
  // `/d` or `/platform/prospecting`. It stops being safe the day one does —
  // and the guard will not be the thing that tells you. If you are adding that
  // spec, give this row an owner first.
  await pool.query(
    `insert into prospecting_config (id, config)
     values ('default', $1)
     on conflict (id) do update set config = excluded.config`,
    [JSON.stringify({ booking: { enabled: true } })],
  )
  await pool.query(
    `insert into prospect (id, name, city, state, timezone, status, email)
     values ('pros_e2e_tokenpages', 'Cedar Hollow Family Dental', 'Fayetteville', 'AR', 'America/Chicago', 'interested', 'front.desk@cedarhollow.example.com')
     on conflict (id) do update set name = excluded.name, timezone = excluded.timezone`,
  )
  await pool.query(
    `insert into prospect_meeting (id, prospect_id, token, status, duration_min, host_time_zone)
     values ('pmtg_e2e_tokenpages', 'pros_e2e_tokenpages', 'e2e-demo-booking-token', 'proposed', 30, 'America/New_York')
     on conflict (id) do update set
       status = 'proposed',
       scheduled_at = null,
       booked_at = null,
       canceled_at = null`,
  )

  // /g — the public grade report.
  await pool.query(
    `insert into practice_grade (id, token, email, practice_name, city, state, website_url, result)
     values ('pgrd_e2e_tokenpages', $1, 'front.desk@cedarhollow.example.com', 'Cedar Hollow Family Dental', 'Fayetteville', 'AR', 'https://cedarhollow.example.com', $2)
     on conflict (id) do update set result = excluded.result`,
    [GRADE_TOKEN, JSON.stringify(GRADE_RESULT)],
  )

  // /e (the floor) and /h (the attendee). The capture points at the grade
  // above so /h renders its scan card and the door through to /g.
  await pool.query(
    `insert into marketing_event (id, slug, name, organizer, state, capture_token, active)
     values ('mevt_e2e_tokenpages', 'e2e-state-dental', 'E2E State Dental Meeting', 'E2E State Dental Association', 'AR', $1, 1)
     on conflict (id) do update set active = 1, capture_token = excluded.capture_token`,
    [EVENT_TOKEN],
  )
  await pool.query(
    `insert into event_capture
       (id, event_id, token, first_name, last_name, email, practice_name, role, city, photo_url, photo_release_at, grade_id)
     values ('mcap_e2e_tokenpages', 'mevt_e2e_tokenpages', $1, 'Robin', 'Textbound', 'robin.textbound@example.com', 'Cedar Hollow Family Dental', 'dentist', 'Fayetteville', '/images/user-64-01.jpg', now(), 'pgrd_e2e_tokenpages')
     on conflict (id) do update set photo_url = excluded.photo_url, grade_id = excluded.grade_id`,
    [CAPTURE_TOKEN],
  )
  console.log('seeded the eight text-message landings (/b /i /r /w /g /d /e /h)')
}

// ---------------------------------------------------------------------------
// `partner` — THE FOURTH PERSONA, SIGNED IN (DREAMCRM-98)
//
// The public `/partner-program` sales page has been scanned since the first
// batch of stops; the thing a partner actually LOGS INTO had none. This seeds
// a partner with a referred clinic and a commission history, so the portal
// renders its real surface — KPI stats, the referred-clinic table, the payout
// panel — rather than the empty state.
//
// The partner is NOT an org member (`requirePartner` looks the row up by
// `referral_partner.user_id` directly), so there is no `member` row here and
// the session carries no active organization. That is the persona, not an
// omission.
//
// Its clinic is its own org: `clinic_profile.referral_partner_id` is what
// makes a clinic show up on a partner's portal, and stamping that onto
// `org_e2e_live` would put a partner banner into every other spec's world.
async function seedPartner(pool) {
  // EVERY FIELD THE SPEC READS IS RESTORED, not only the ones something is
  // known to mutate today (Sentinel, reviewing #669). Both of these rows used
  // to carry the partner's NAME through an upsert that could not put it back —
  // the user row was `do nothing`, and the partner row's `do update` named
  // status and the Stripe fields only. Nothing mutates either one right now, so
  // it was idempotent in practice; "idempotent in practice" is precisely the
  // fixture that fails on the third retry of a bad afternoon, which is the
  // sentence at the top of this file's scope headers. `partner-portal.spec.ts`
  // asserts "Welcome back, Jules", and `app/(partner)/partner/page.tsx` reads
  // that from `referral_partner.name`.
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ('user_e2e_partner', 'Jules Marchetti', 'jules.marchetti@example.com', true)
     on conflict (id) do update set
       name = excluded.name,
       email = excluded.email,
       email_verified = excluded.email_verified`,
  )
  await pool.query(
    `insert into session (id, token, user_id, expires_at)
     values ('sess_e2e_partner', 'e2e-partner-session-token', 'user_e2e_partner', now() + interval '7 days')
     on conflict (id) do update set expires_at = now() + interval '7 days'`,
  )
  await pool.query(
    `insert into referral_partner (id, name, company, email, status, default_percent_bps, default_term_months, terms_note, user_id)
     values ('rpart_e2e_partner', 'Jules Marchetti', 'Marchetti Dental Consulting', 'jules.marchetti@example.com', 'active', 1500, 24, 'Paid monthly once the balance clears $25.', 'user_e2e_partner')
     on conflict (id) do update set
       name = excluded.name,
       company = excluded.company,
       status = 'active',
       default_percent_bps = excluded.default_percent_bps,
       default_term_months = excluded.default_term_months,
       terms_note = excluded.terms_note,
       user_id = excluded.user_id,
       stripe_connect_account_id = null,
       payouts_enabled = 0`,
  )
  await pool.query(
    `insert into organization (id, name, slug, type, is_demo)
     values ('org_e2e_referred', 'E2E Referred Dental', 'e2e-referred', 'clinic', false)
     on conflict (id) do update set name = excluded.name, slug = excluded.slug`,
  )
  await pool.query(
    `insert into clinic_profile
       (organization_id, display_name, timezone, hours, chair_count, plan_tier, subscription_status, referral_partner_id, referral_started_at)
     values ('org_e2e_referred', 'E2E Referred Dental', 'America/New_York', $1, 3, 'premium', 'active', 'rpart_e2e_partner', now() - interval '120 days')
     on conflict (organization_id) do update set
       plan_tier = excluded.plan_tier,
       subscription_status = excluded.subscription_status,
       referral_partner_id = excluded.referral_partner_id,
       referral_started_at = excluded.referral_started_at`,
    [JSON.stringify(HOURS)],
  )
  // The ledger. Two accrued rows put a real balance on the page (and over the
  // $25 payout floor, which is what makes the payout panel offer anything);
  // one paid row gives the lifetime figure something to say. Both tables key
  // on a serial id, so a restore clears by partner rather than upserting.
  await pool.query(`delete from referral_commission where partner_id = 'rpart_e2e_partner'`)
  await pool.query(`delete from referral_payout where partner_id = 'rpart_e2e_partner'`)
  await pool.query(
    `insert into referral_commission (partner_id, organization_id, stripe_invoice_id, invoice_total_cents, percent_bps, amount_cents, status)
     values
       ('rpart_e2e_partner', 'org_e2e_referred', 'in_e2e_partner_1', 20000, 1500, 3000, 'accrued'),
       ('rpart_e2e_partner', 'org_e2e_referred', 'in_e2e_partner_2', 20000, 1500, 3000, 'accrued'),
       ('rpart_e2e_partner', 'org_e2e_referred', 'in_e2e_partner_3', 20000, 1500, 3000, 'paid')
     on conflict (stripe_invoice_id) do nothing`,
  )
  await pool.query(
    `insert into referral_payout (partner_id, amount_cents, stripe_transfer_id, status, note)
     values ('rpart_e2e_partner', 3000, 'tr_e2e_not_a_real_transfer', 'paid', 'E2E fixture payout')`,
  )
  console.log('seeded the referral partner (one referred clinic, $60 owed)')
}

/**
 * Every scope, in the order a full seed applies them. `base` first because the
 * consumable scopes reference its patients; the rest are row-disjoint and so
 * order-independent among themselves.
 */
export const SCOPES = {
  base: seedBase,
  tokens: seedTokens,
  portal: seedPortal,
  'staff-day': seedStaffDay,
  'portal-reschedule': seedPortalReschedule,
  'sign-here': seedSignHere,
  'go-live': seedGoLive,
  billing: seedBilling,
  webhook: seedWebhook,
  'token-pages': seedTokenPages,
  partner: seedPartner,
}

/** Everything except `base` — the rows a spec can spend and a retry must get back. */
export const CONSUMABLE_SCOPES = Object.keys(SCOPES).filter((s) => s !== 'base')

/**
 * Which rows each scope WRITES. Declared rather than inferred, because the
 * disjointness of the consumable scopes is the property the whole design rests
 * on and it is invisible in the SQL — every scope MENTIONS 'org_e2e_live', but
 * only `base` owns it.
 *
 * `tests/guards/e2e-seed-scopes.test.ts` keeps this honest: it fails if two
 * consumable scopes claim the same row, if a declared id is absent from that
 * scope's own function, or if a scope writes an `*_e2e_*` row nobody declared.
 */
export const SCOPE_ROWS = {
  base: [
    'org_e2e_live',
    'org_e2e_prelive',
    'pat_e2e_confirm',
    'user_e2e_patient',
    'mem_e2e_patient',
    'sess_e2e_patient',
    'user_e2e_staff',
    'mem_e2e_staff',
    'sess_e2e_staff',
    'pat_e2e_staff',
    'user_e2e_move',
    'mem_e2e_move',
    'pat_e2e_move',
    'sess_e2e_move',
    // The tenant boundary's two sides. Read-only for the spec that uses them,
    // which is why they are structure and not a scope of their own.
    'user_e2e_rival',
    'mem_e2e_rival',
    'sess_e2e_rival',
    'pat_e2e_rival',
    'pat_e2e_ours',
    'appt_e2e_ours',
    'appt_e2e_rival',
  ],
  tokens: ['appt_e2e_confirm', 'nps_e2e_1'],
  portal: ['appt_e2e_portal'],
  'staff-day': ['appt_e2e_staff_confirm', 'appt_e2e_staff_cancel', 'appt_e2e_staff_complete'],
  'portal-reschedule': ['appt_e2e_move', 'appt_e2e_cancelme', 'appt_e2e_soon'],
  'sign-here': ['lead_e2e_inquiry', 'prop_e2e_inquiry'],
  'go-live': ['org_e2e_golive', 'user_e2e_golive', 'mem_e2e_golive', 'sess_e2e_golive'],
  billing: [
    'org_e2e_billing',
    'user_e2e_billing',
    'mem_e2e_billing',
    'pat_e2e_billing',
    'sess_e2e_billing',
  ],
  webhook: [
    'org_e2e_webhook',
    'user_e2e_webhook',
    'mem_e2e_webhook',
    'pat_e2e_webhook',
    'sess_e2e_webhook',
    'bp_e2e_webhook_paid',
    // The rival side. Same scope, because the two clinics only mean anything
    // together — splitting them would let one be restored without the other.
    'org_e2e_webhook_rival',
    'pat_e2e_webhook_rival',
    'bp_e2e_webhook_rival',
  ],
  // The eight text-message landings. The clinic half and the platform half
  // (prospect / grade / event) are ONE scope because one spec walks both —
  // see the scope header for why splitting by route would not work.
  'token-pages': [
    'org_e2e_tokenpages',
    'pat_e2e_tokenpages',
    'prv_e2e_tokenpages',
    'bpr_e2e_tokenpages',
    'plan_e2e_tokenpages',
    'rev_e2e_tokenpages',
    'wl_e2e_tokenpages',
    'wlo_e2e_tokenpages',
    'pros_e2e_tokenpages',
    'pmtg_e2e_tokenpages',
    'pgrd_e2e_tokenpages',
    'mevt_e2e_tokenpages',
    'mcap_e2e_tokenpages',
  ],
  partner: [
    'user_e2e_partner',
    'sess_e2e_partner',
    'rpart_e2e_partner',
    // The referred clinic is the partner's, not `base`'s: the referral stamp
    // on its profile is what makes it appear on the portal at all.
    'org_e2e_referred',
  ],
}

export async function seed(names = Object.keys(SCOPES)) {
  const unknown = names.filter((n) => !(n in SCOPES))
  if (unknown.length) {
    throw new Error(
      `unknown seed scope(s): ${unknown.join(', ')} — known scopes: ${Object.keys(SCOPES).join(', ')}`,
    )
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  })
  try {
    // Apply in declaration order, not argument order, so `base` can never run
    // after a scope that needs it.
    for (const name of Object.keys(SCOPES)) {
      if (names.includes(name)) await SCOPES[name](pool)
    }
  } finally {
    await pool.end()
  }
}

// Only seed when RUN as a script. The module also exports SCOPES/seed so a
// caller can read the scope list without a self-executing import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  await seed(requested.length ? requested : Object.keys(SCOPES))
  console.log(requested.length ? `e2e seed complete (${requested.join(', ')})` : 'e2e seed complete')
}
