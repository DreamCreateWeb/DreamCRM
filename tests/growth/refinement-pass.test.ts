/**
 * The Growth-system refinement pass (2026-07-26) — source-level guards for the
 * seams it closed. Source scans (not renders) because each claim is about a
 * pattern that must (or must not) exist in the file:
 *
 *  1. CLINIC-TZ LAW — the recall dashboard, reviews pages, and received page
 *     are SERVER components; every date/time they render must go through the
 *     clinic-tz helpers or carry an explicit timeZone. The dashboard's old
 *     `fmtTime` rendered scheduled-send times in UTC (1 PM Central showed as
 *     6 PM).
 *  2. SINGLE-PLAN COPY — no Growth surface may advertise the dead Basic/Pro
 *     tiers ("Upgrade to post", "on Pro & Premium"); the social add-on is the
 *     only entitlement left.
 *  3. ATTENTION-FIRST reviews — /growth/reviews/received sorts unreplied
 *     (low-star first) ahead of replied.
 *  4. The demo seeds a 1–2★ unreplied review so the escalation surfaces
 *     (hub urgent card, lowStarNeedsReply, the sort) all showcase.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('clinic-tz law on the Growth server components', () => {
  it('the recall dashboard formats through the clinic-tz helpers (no naive fmtTime)', () => {
    const src = read('app/(default)/marketing/clinic-recall-dashboard.tsx')
    expect(src).toContain('getClinicTimeZone')
    expect(src).toContain('formatClinicDayTime')
    expect(src).toContain('formatClinicDayHeader')
    // The old UTC-rendering helpers must stay gone.
    expect(src).not.toMatch(/function fmtTime\(/)
    expect(src).not.toMatch(/function fmtDate\(/)
    // Its relative-date fallback carries the tz.
    expect(src).toMatch(/fmtRelative\(d: Date, tz: string\)/)
  })

  it('the reviews pages render dates with an explicit clinic timeZone', () => {
    for (const p of [
      'app/(default)/growth/reviews/page.tsx',
      'app/(default)/growth/reviews/received/page.tsx',
    ]) {
      const src = read(p)
      expect(src, p).toContain('getClinicTimeZone')
      // Any toLocaleDateString in these server files must pass a timeZone.
      for (const m of src.matchAll(/toLocaleDateString\('en-US', \{([^}]*)\}/g)) {
        expect(m[1], `${p}: ${m[0]}`).toContain('timeZone')
      }
    }
  })
})

describe('single-plan copy — no dead tiers advertised in Growth', () => {
  it('never tells a clinic to upgrade to plans that no longer exist', () => {
    for (const p of [
      'app/(default)/growth/social/connect-channels.tsx',
      'app/(default)/growth/social/page.tsx',
      'app/(default)/growth/analytics/page.tsx',
      'app/(default)/growth/campaigns/[id]/campaign-editor.tsx',
    ]) {
      const src = read(p)
      expect(src, p).not.toContain('Upgrade to post')
      expect(src, p).not.toContain('Pro & Premium')
      expect(src, p).not.toContain('Pro &amp; Premium')
      expect(src, p).not.toContain('Basic plan')
    }
  })

  it('the analytics eyebrow no longer wears a plan pill', () => {
    const src = read('app/(default)/growth/analytics/page.tsx')
    expect(src).not.toContain('label="Premium"')
  })
})

describe('orientation — every Growth sub-page walks back to its hub', () => {
  it('queue → Recall & Outreach; received → Reviews (link eyebrows, not plain text)', () => {
    expect(read('app/(default)/growth/outreach/queue/page.tsx')).toMatch(
      /href="\/growth\/outreach"[^>]*>\s*‹ Recall/,
    )
    expect(read('app/(default)/growth/reviews/received/page.tsx')).toMatch(
      /href="\/growth\/reviews"[^>]*>\s*‹ Reviews/,
    )
  })
})

describe('attention-first reviews received', () => {
  it('sorts unreplied (low-star first) ahead of replied before rows reach the client', () => {
    const src = read('app/(default)/growth/reviews/received/page.tsx')
    expect(src).toContain('attentionRank')
    // Low-star fires outrank plain unreplied, which outrank replied.
    expect(src).toMatch(/starRating != null && g\.starRating <= 2\) return 0/)
    expect(src).toMatch(/if \(g\.replyComment\) return 2/)
  })

  it('the section header surfaces the waiting count', () => {
    const src = read('app/(default)/growth/reviews/received/google-reviews-section.tsx')
    expect(src).toContain('waiting on a reply')
  })
})

describe('the demo covers the escalation state', () => {
  it('seeds exactly one unreplied 1–2★ Google review (the hub urgent card demoes)', () => {
    const src = read('lib/services/google-reviews.ts')
    const seeds = src.slice(src.indexOf('DEMO_GOOGLE_REVIEWS'), src.indexOf('seedDemoGoogleReviews'))
    const lowStar = Array.from(seeds.matchAll(/starRating: (\d)/g)).filter((m) => Number(m[1]) <= 2)
    expect(lowStar.length).toBe(1)
    // ...and it must be unreplied, or lowStarNeedsReply stays 0 in the demo.
    const rob = seeds.slice(seeds.indexOf('demo_gr_7'))
    expect(rob).toMatch(/replyComment: null/)
  })
})
