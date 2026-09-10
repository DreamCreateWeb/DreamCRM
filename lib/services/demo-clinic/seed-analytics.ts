import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

// Site analytics rollups and the notification tray.

// ── Website traffic + Search appearance (Website Presence) ────────────────────
// Seeds ~3 weeks of plausible site_pageview daily rollups (home-heavy, with
// some /book + /services + a sprinkling of other pages) so /analytics +
// /seo show a real "how many people visit my site" number on the demo. Plus a
// couple of seo_meta overrides. Idempotent + safe for both the fresh-seed path
// and the legacy self-heal path:
//  - pageviews: skips entirely if the org already has any site_pageview rows
//    (so re-runs don't double-count);
//  - seo_meta: only writes when the column is null (a hand-edited demo stays
//    untouched).
// Exported for the seeder test (asserts the rollup shape + no-overwrite guard).
export async function seedDemoSiteAnalytics(orgId: string): Promise<void> {
  const dayMs = 24 * 60 * 60 * 1000
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  // Bail on a demo with no patients yet (mid-creation / partial seed) — same
  // guard the other self-heal blocks use, and it keeps the seeder's
  // no-insert-when-org-exists idempotency guarantee intact.
  const anyPatient = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
    .limit(1)
  if (anyPatient.length === 0) return

  // ── Daily pageview rollups (21 days) ──
  const existing = await db
    .select({ id: schema.sitePageview.id })
    .from(schema.sitePageview)
    .where(eq(schema.sitePageview.organizationId, orgId))
    .limit(1)

  if (existing.length === 0) {
    const DAYS = 21
    // Per-day base visitor count with a gentle weekly rhythm (weekdays busier).
    // Distribution across pages is home-heavy — what a real clinic site sees.
    const rows: Array<{ organizationId: string; day: string; path: string; views: number }> = []
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * dayMs)
      const dayKey = d.toISOString().slice(0, 10)
      const dow = d.getUTCDay() // 0 Sun … 6 Sat
      const weekendDip = dow === 0 || dow === 6 ? 0.55 : 1
      // Deterministic-ish wobble so the sparkline isn't flat (no Math.random —
      // keeps the demo stable across resyncs).
      const wobble = 0.8 + ((i * 7) % 5) * 0.1
      const home = Math.max(3, Math.round(14 * weekendDip * wobble))
      const services = Math.max(1, Math.round(home * 0.35))
      const book = Math.max(1, Math.round(home * 0.28))
      const about = Math.max(0, Math.round(home * 0.18))
      const insurance = Math.max(0, Math.round(home * 0.12))
      const team = Math.max(0, Math.round(home * 0.08))
      const pairs: Array<[string, number]> = [
        ['/', home],
        ['/services', services],
        ['/book', book],
        ['/about', about],
        ['/insurance', insurance],
        ['/team', team],
      ]
      for (const [path, views] of pairs) {
        if (views > 0) rows.push({ organizationId: orgId, day: dayKey, path, views })
      }
    }
    // Insert in one shot; the unique (org,day,path) index makes a concurrent
    // re-run safe via onConflictDoNothing.
    if (rows.length > 0) {
      await db.insert(schema.sitePageview).values(rows).onConflictDoNothing()
    }
  }

  // ── A couple of Search-appearance overrides (only when unset) ──
  const [profile] = await db
    .select({ seoMeta: schema.clinicProfile.seoMeta })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (profile && profile.seoMeta == null) {
    await db
      .update(schema.clinicProfile)
      .set({
        seoMeta: {
          home: {
            title: 'Dream Dental — Gentle, judgment-free dentistry in Austin',
            description:
              'Dream Dental is a calm, modern family practice in Austin. Same-week visits, plain-English care, and no judgment about how long it has been. Book online today.',
          },
          book: {
            description:
              'Book your visit at Dream Dental online in under a minute. Same-week appointments for new and returning patients across Austin.',
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.clinicProfile.organizationId, orgId))
  }
}

// ── Demo notifications (per viewing admin) ──────────────────────────────────
// The demo org has no member rows, so live notifyOrgMembers events route to
// platform admins (notifications.ts demo fallback). This seeds a starter set
// for the admin ENTERING demo mode so the header bell shows populated state
// immediately. Idempotent per user+org: skips when they already have any
// notification scoped to the demo org.
export async function seedDemoNotificationsForUser(userId: string, orgId: string): Promise<void> {
  const existing = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(eq(schema.notifications.userId, userId), eq(schema.notifications.organizationId, orgId)),
    )
    .limit(1)
  if (existing.length > 0) return

  const now = Date.now()
  const minutesAgo = (m: number) => new Date(now - m * 60 * 1000)

  // Link the booking bell item to the patient's record — matches the real
  // online-booking notification (a staff email/bell item now opens the patient,
  // not the agenda). Falls back to the agenda if the demo patient isn't seeded.
  const [emma] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, orgId),
        eq(schema.patient.firstName, 'Emma'),
        eq(schema.patient.lastName, 'Lopez'),
      ),
    )
    .limit(1)
  const bookingLinkPath = emma ? `/patients/${emma.id}` : '/appointments'

  await db.insert(schema.notifications).values([
    {
      userId,
      organizationId: orgId,
      bucket: 'comments',
      type: 'booking_created',
      title: 'New online booking — Emma Lopez, tomorrow 10:00 AM',
      body: 'Booked through the website widget (cleaning, 30 min).',
      linkPath: bookingLinkPath,
      createdAt: minutesAgo(35),
    },
    {
      userId,
      organizationId: orgId,
      bucket: 'comments',
      type: 'message_received',
      title: 'New message from Marcus Chen',
      body: '“Quick question about my appointment next week…”',
      linkPath: '/messages',
      createdAt: minutesAgo(120),
    },
    {
      userId,
      organizationId: orgId,
      bucket: 'comments',
      type: 'order_paid',
      title: 'Paid order — 2× Whitening Kit, $89',
      body: 'Pickup order, ready to prepare.',
      linkPath: '/shop/orders',
      createdAt: minutesAgo(300),
    },
  ])
}
