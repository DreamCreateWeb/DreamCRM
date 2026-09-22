import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * THE PUBLIC SITE LAYOUT OWNS NO QUERY OF ITS OWN.
 *
 * A Next layout renders on EVERY page beneath it, so a query written there is
 * not one query — it is one per page view of the whole clinic site, on the
 * slowest and lowest-throughput surface in the product (`docs/LOAD-SANITY.md`:
 * `/site/[slug]` saturates at concurrency 8, and 8 -> 25 buys no throughput).
 *
 * `app/site/[slug]/layout.tsx` did exactly that: it opened its own
 * `clinic_profile` select for eleven chrome columns, three lines below the
 * `getClinicThemeBySlug` call whose whole point was that it is cached. The
 * slice that made the site payload a cache hit left the layout paying the
 * database on every single request, and nothing failed — which is why this
 * file exists.
 *
 * The rule is not "no data in a layout". It is that the layout's data comes
 * through a loader that can be cached, so the cost is bounded by the TTL
 * rather than by traffic. `lib/services/clinic-site-cache.ts` is that loader
 * and `PublishedSiteChrome` is that payload.
 */

/** Every `layout.tsx` beneath a directory, as repo-relative paths. */
function walkLayouts(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) walkLayouts(full, out)
    else if (entry.name === 'layout.tsx') out.push(full)
  }
  return out
}

/**
 * Comments blanked, so the scan reads code rather than prose — the layout
 * EXPLAINS at length why it no longer queries the database, and a raw scan
 * reads the explanation as the offence. Same helper, same reason, as
 * `site-load-dedupe.test.ts`; `[^\n]*` rather than `.*$` so a CRLF checkout
 * behaves like an LF one (`.` does not match `\r`).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** The ways a module reaches the database directly, rather than through a
 *  loader that can hold a cache in front of it. */
const DIRECT_DB: Array<[string, RegExp]> = [
  ['the drizzle client', /from ['"]@\/lib\/db['"]/],
  ['a schema table', /from ['"]@\/lib\/db\/schema/],
]

describe('the public clinic-site layout reads through the cache', () => {
  it('every layout under app/site/ is free of its own database query', () => {
    const layouts = walkLayouts('app/site')

    // A derived set that comes back empty passes forever. The layout this
    // rule is about is named, so a move or a rename fails here rather than
    // silently emptying the scan.
    expect(
      layouts,
      'the walk no longer finds the public clinic-site layout — the rule below\n' +
        'is now scanning nothing at all',
    ).toContain('app/site/[slug]/layout.tsx')

    const offenders: string[] = []
    for (const file of layouts) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const [what, re] of DIRECT_DB) {
        if (re.test(src)) offenders.push(`${file} — reaches for ${what}`)
      }
    }

    expect(
      offenders,
      `A layout renders on EVERY page beneath it, so a query here costs one\n` +
        `database round trip per page view of the whole clinic site — uncached,\n` +
        `on the slowest surface in the product. Read it through\n` +
        `getClinicThemeBySlug instead: the layout already calls that loader for\n` +
        `the palette, and its payload (PublishedSiteChrome) is cached per clinic\n` +
        `with the Draft->Publish invalidation already wired. If a NEW value\n` +
        `genuinely cannot be cached — one chosen by request state rather than by\n` +
        `the clinic, like the template-frame header — say so in the PR and get it\n` +
        `reviewed; do not open a query here quietly:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  /**
   * THE NEGATIVE CONTROL. The rule above must be about LAYOUTS, not about
   * data access — a page that loads its own content is normal and correct,
   * and if this ever fails the predicate has gone broad enough to be about
   * something else.
   */
  it('leaves an ordinary page that loads its own data alone', () => {
    const src = stripComments(readFileSync('app/site/[slug]/page.tsx', 'utf8'))
    expect(
      DIRECT_DB.some(([, re]) => re.test(src)) ||
        /getClinicSiteBySlug/.test(src),
      'the negative control no longer loads anything — pick another page',
    ).toBe(true)
  })

  /**
   * AND THE CHROME IT READS INSTEAD IS ACTUALLY CACHED.
   *
   * The scan above only proves the query is gone. It would pass just as
   * happily if the columns had moved into `lib/services/clinic-site.ts`
   * OUTSIDE the cache boundary — same cost per request, one file further
   * away, and much harder to notice. This pins the other half: the chrome is
   * read by the module that holds the durable cache.
   */
  it('the chrome is read inside the cache boundary, not beside it', () => {
    const cache = stripComments(readFileSync('lib/services/clinic-site-cache.ts', 'utf8'))
    expect(cache).toMatch(/export interface PublishedSiteChrome/)
    // The columns that decide whether the site serves at all — the go-live
    // lever and the shut-down wall — are the ones worth naming here.
    for (const column of [
      'siteLiveAt',
      'trialEndsAt',
      'subscriptionStatus',
      'stripeSubscriptionId',
      'chatWidgetEnabled',
      'hidePoweredBy',
      'announcement',
    ]) {
      expect(
        cache,
        `${column} is not read inside the cache boundary — whoever reads it is\n` +
          `paying the database on every public page again`,
      ).toContain(column)
    }
  })
})
