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

await pool.end()
console.log('e2e seed complete')
