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
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

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

const pool = new pg.Pool({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
})

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

// --- Token-IS-auth journey fixtures (all on the live clinic) ---------------
// These power e2e/token-journeys.spec.ts: the /c one-click confirm and the
// /n post-visit survey — the two patient touches that need no login and no
// Stripe, but ARE real DB writes. Each re-seed RESETS the answered state so
// the journey can be driven again ("scheduled", score null): an E2E fixture
// that can only be consumed once is a fixture that flakes on the second run.

await pool.query(
  `insert into patient (id, organization_id, first_name, last_name, email, phone)
   values ('pat_e2e_confirm', 'org_e2e_live', 'Casey', 'Confirmable', 'casey.confirmable@example.com', '+15550100001')
   on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name`,
)

// Next Wednesday 15:00 UTC (11am ET) — always in the future, always a weekday.
const start = new Date()
start.setUTCDate(start.getUTCDate() + ((3 - start.getUTCDay() + 7) % 7 || 7))
start.setUTCHours(15, 0, 0, 0)

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

// --- The signed-in patient (portal journeys) --------------------------------
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
// The PORTAL's own visit (a cleaning, two Wednesdays out) — deliberately a
// different row from appt_e2e_confirm: the /c token spec and the portal spec
// run in parallel workers, and sharing one appointment would make each flaky
// in the other's shadow. Reset to unconfirmed on every seed.
const portalStart = new Date(start)
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
console.log('seeded signed-in patient session + portal visit')

// --- The signed-in staff member (staff-day + sign-here journeys) -----------
// An owner of the live clinic with a live session row, so e2e/staff-day.spec.ts
// and e2e/sign-here.spec.ts can mint the signed session cookie exactly the way
// the patient specs do. requireClinicTenant only checks tenantType, but owner
// matches every other clinic fixture. trial_ends_at stays NULL (never on a
// trial) so no TrialEndedWall replaces the dashboard.
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
console.log('seeded staff session')

// --- Staff-day fixtures (e2e/staff-day.spec.ts owns every row here) --------
// One patient, three visits, one per drawer action — confirm/complete/cancel
// each end in a terminal or guarded state, so a single row cannot be walked
// through all three. Types differ (checkup/consultation/cleaning) because the
// agenda row's aria-label is "Open {name}'s visit" for all of them and the
// TYPE text is how a spec tells the rows apart. Reset to 'scheduled' on every
// seed so the journeys can be driven again.
await pool.query(
  `insert into patient (id, organization_id, first_name, last_name, email, phone)
   values ('pat_e2e_staff', 'org_e2e_live', 'Riley', 'Staffday', 'riley.staffday@example.com', '+15550100003')
   on conflict (id) do update set first_name = excluded.first_name, last_name = excluded.last_name`,
)
// Future rows ride the agenda's default next-14-days window: the day after
// the /c fixture's "next Wednesday" is always 2–8 days out. The complete row
// must be PAST (the drawer only offers "Mark completed" once startTime < now)
// — yesterday 15:00 UTC, reachable via the "Past 30 days" window chip.
const staffFuture = new Date(start)
staffFuture.setUTCDate(staffFuture.getUTCDate() + 1)
const staffPast = new Date()
staffPast.setUTCDate(staffPast.getUTCDate() - 1)
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

// --- Portal reschedule/cancel fixtures (e2e/portal-reschedule.spec.ts) -----
// A SECOND portal patient with their own session so the journeys can't shadow
// e2e/portal.spec.ts (which owns Casey's rows) in a parallel worker. Types are
// distinct (consultation/filling/extraction) because the visit card renders no
// title — PORTAL_VISIT_LABELS[type] is how the spec addresses each card.
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
// Reschedule + cancel targets sit three Wednesdays out — comfortably OUTSIDE
// the default 24h notice window whenever the harness runs. The reschedule
// consumes its row (a new appointment is minted, the original cancelled), so
// the seed also sweeps any prior run's minted copies before resetting.
await pool.query(
  `delete from appointment
    where organization_id = 'org_e2e_live'
      and patient_id = 'pat_e2e_move'
      and rescheduled_from_appointment_id is not null`,
)
const moveStart = new Date(start)
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

// --- Sign-here fixtures (e2e/sign-here.spec.ts) ----------------------------
// An inquiry_response proposal is the one capability whose executor completes
// with no vendor keys: deliver() silently succeeds for @example.com
// recipients (lib/email.ts isReservedUndeliverableAddress) BEFORE it looks
// for RESEND_API_KEY. The lead must be status 'new' with an email or the
// executor retires the card; source_key must be inquiry_response:<leadId> or
// the lead drawer's "What we sent" block never finds the sent reply. Reset
// both on every seed — the approve consumes them.
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

await pool.end()
console.log('e2e seed complete')
