import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

/**
 * THE PAGE-FRAME ADOPTION GUARD (ML-54, 2026-11-09).
 *
 * Every `page.tsx` under `app/(default)` and `app/(double-sidebar)` renders its
 * body through `<PageFrame>` (components/ui/page-frame.tsx) — the one home of
 * the gutters, the content width, the `<Group> · <clinic name>` eyebrow and the
 * way back — either directly or through ONE relative import (the page shell
 * that hands data to a client view which owns the frame). Three escapes:
 *
 *  - `app/(default)/settings/**` is ML-55's lane and is not walked here yet;
 *  - a page with NO JSX of its own (a redirect or a re-export) has no frame to
 *    adopt;
 *  - the DATED ALLOWLIST below: pages whose body is a client workspace that
 *    still hand-rolls its frame. It may only SHRINK: adopt the frame -> delete
 *    the line (an entry that now passes fails, so a stale line cannot linger)
 *    and lower ALLOWLIST_CEILING.
 *
 * Blind spots, said rather than guessed: it reads the page and ONE hop of
 * relative imports; a frame two hops away reads as unadopted. It cannot tell a
 * `<PageFrame>` that is rendered conditionally from one that always is.
 */

const ROOTS = ['app/(default)', 'app/(double-sidebar)']

// DATED 2026-11-09 — may only shrink.
const ALLOWLIST: string[] = [
  'app/(default)/ecommerce/customers/[id]/page.tsx',
  'app/(default)/growth/audiences/page.tsx',
  'app/(default)/growth/campaigns/[id]/page.tsx',
  'app/(default)/intake-forms/[id]/page.tsx',
  'app/(default)/intake-forms/submissions/[submissionId]/page.tsx',
  'app/(default)/integrations/sms/page.tsx',
  'app/(default)/patients/[id]/page.tsx',
  'app/(default)/payments/memberships/[id]/page.tsx',
  'app/(default)/payments/memberships/new/page.tsx',
  'app/(default)/payments/memberships/page.tsx',
  'app/(default)/platform/prospecting/settings/page.tsx',
  'app/(default)/shop/coupons/page.tsx',
  'app/(default)/shop/orders/page.tsx',
  'app/(default)/shop/products/[id]/page.tsx',
  'app/(default)/shop/products/new/page.tsx',
  'app/(default)/website/blog/[id]/page.tsx',
  'app/(default)/website/blog/[id]/preview/page.tsx',
  'app/(default)/website/careers/[id]/page.tsx',
  'app/(default)/website/careers/new/page.tsx',
  'app/(default)/website/careers/page.tsx',
  'app/(default)/website/editor/page.tsx',
  'app/(double-sidebar)/inbox/page.tsx',
  'app/(double-sidebar)/inbox/settings/page.tsx',
  'app/(double-sidebar)/messages/page.tsx',
  'app/(double-sidebar)/messages/support/page.tsx',
]
const ALLOWLIST_CEILING = 25

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name).split('\\').join('/')
    if (p === 'app/(default)/settings') continue
    if (statSync(p).isDirectory()) pages(p, out)
    else if (name === 'page.tsx') out.push(p)
  }
  return out.sort()
}

const hasFrame = (src: string) => /<PageFrame[\s>]/.test(src)
const rendersJsx = (src: string) => /return\s*\(?\s*</.test(src) || /=>\s*\(?\s*</.test(src)

function adopts(file: string): boolean {
  const src = readFileSync(file, 'utf8')
  if (hasFrame(src)) return true
  for (const m of Array.from(src.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g))) {
    const base = normalize(join(dirname(file), m[1])).split('\\').join('/')
    for (const c of [`${base}.tsx`, `${base}/index.tsx`]) {
      if (existsSync(c) && hasFrame(readFileSync(c, 'utf8'))) return true
    }
  }
  return false
}

describe('every dashboard page renders through <PageFrame>', () => {
  const all = ROOTS.flatMap((r) => pages(r))

  it('walks a real population', () => {
    expect(all.length).toBeGreaterThan(100)
  })

  it('has no page outside the frame that is not allowlisted', () => {
    const offenders = all.filter(
      (f) => !adopts(f) && rendersJsx(readFileSync(f, 'utf8')) && !ALLOWLIST.includes(f),
    )
    expect(offenders, 'adopt <PageFrame> (components/ui/page-frame.tsx) or justify an allowlist line').toEqual([])
  })

  it('keeps the allowlist honest: every line exists and still lacks the frame', () => {
    for (const f of ALLOWLIST) {
      expect(existsSync(f), `${f} is gone — delete its allowlist line`).toBe(true)
      expect(adopts(f), `${f} adopts the frame now — delete its allowlist line`).toBe(false)
    }
  })

  it('only shrinks', () => {
    expect(ALLOWLIST.length).toBeLessThanOrEqual(ALLOWLIST_CEILING)
  })

  it('adopters are the majority (the frame is the rule, the allowlist the exception)', () => {
    expect(all.filter(adopts).length).toBeGreaterThanOrEqual(55)
  })
})
