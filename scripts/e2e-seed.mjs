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
  ],
  tokens: ['appt_e2e_confirm', 'nps_e2e_1'],
  portal: ['appt_e2e_portal'],
  'staff-day': ['appt_e2e_staff_confirm', 'appt_e2e_staff_cancel', 'appt_e2e_staff_complete'],
  'portal-reschedule': ['appt_e2e_move', 'appt_e2e_cancelme', 'appt_e2e_soon'],
  'sign-here': ['lead_e2e_inquiry', 'prop_e2e_inquiry'],
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
