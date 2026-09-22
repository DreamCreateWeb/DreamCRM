import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'

/**
 * NOTHING A SERVER COMPONENT CAN REACH MAY CALL THE STRICT INVALIDATOR.
 *
 * Next refuses `revalidateTag` during a render and throws (E7, pinned against
 * the real module in `next-cache-contract.test.ts`). The cache module's
 * `invalidateTag` deliberately RETHROWS everything except "no request scope",
 * so a render-reachable call site does not quietly fail — it throws, in the
 * middle of whatever function it was called from.
 *
 * That is not a hypothetical. PR #654 shipped exactly this and Sentinel caught
 * it before merge:
 *
 *     app/(default)/settings/billing/page.tsx   (Server Component BODY)
 *       -> syncCheckoutSuccess
 *       -> syncSubscriptionFromStripe
 *       -> invalidateClinicSiteForOrg -> revalidateTag -> THROW
 *
 * The missed invalidation was the least of it. The throw landed between the
 * profile write and `enforceSocialConnectionCap`, so a clinic moving off the
 * full-Premium trial onto a smaller plan KEPT social connections the platform
 * pays for — and `syncCheckoutSuccess` logged a successful activation as a
 * failure. A cache line in the wrong place stopped money-path code running.
 *
 * WHY A SOURCE-TEXT TEST WAS NOT ENOUGH, which is the lesson worth keeping.
 * The suite already "covered" that invalidation — by grepping `billing.ts` for
 * the string `invalidateClinicSiteForOrg`. The string was present. It threw.
 * A test that asks whether a name appears cannot see the phase the call runs
 * in, so this guard asks a structural question instead: which modules can a
 * render REACH?
 */

/** Every file under a directory matching a predicate, as repo-relative paths. */
function walk(dir: string, pred: (name: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(full, pred, out)
    else if (pred(entry.name)) out.push(full)
  }
  return out
}

/**
 * Comments blanked, so the scan reads code rather than prose. Every file this
 * rule is about EXPLAINS the rule at length, and a raw scan reads the
 * explanation as the offence. `[^\n]*` rather than `.*$` so a CRLF checkout
 * behaves like an LF one — `.` does not match `\r`, and the line-comment arm
 * is silently dead without it (the same bug `site-load-dedupe.test.ts`
 * documents finding).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Resolve an import specifier to a repo-relative source file, or null. */
function resolveImport(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('.')) {
    const dir = from.split('/').slice(0, -1).join('/')
    base = new URL(spec, `file:///${dir}/`).pathname.slice(1)
  } else return null // a package — not our code
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const IMPORT =
  /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

/** Any call to one of the four strict invalidators. */
const STRICT_INVALIDATOR = /\binvalidateClinicSite(?:BySlug|Everywhere|ForOrg)?\s*\(/

/**
 * THE TWO BOUNDARIES THE WALK STOPS AT, and why each is sound rather than
 * convenient:
 *
 *  - `'use server'` — the module's exports are Server ACTIONS. A Server
 *    Component may import one to hand to a form, but importing it does not
 *    run its bodies during the render, and an action body is a legal place to
 *    invalidate. Four of this repo's five strict call sites are here, and
 *    they KEEP the strict invalidator, which is what stops this guard from
 *    quietly making the strict/tolerant distinction meaningless.
 *  - `'use client'` — a client component's code does not execute in the
 *    server render at all.
 */
const PHASE_BOUNDARY = /^\s*['"]use (server|client)['"]/

describe('no render-reachable module calls the strict invalidator', () => {
  /** Server Components: the roots of the render phase. */
  const roots = walk(
    'app',
    (n) => n === 'page.tsx' || n === 'layout.tsx' || n === 'template.tsx',
  )

  /** Transitive closure over our own source, stopping at phase boundaries. */
  function renderReachable(): { modules: Set<string>; chainTo: Map<string, string> } {
    const seen = new Set<string>(roots)
    const chainTo = new Map<string, string>()
    const stack = [...roots]
    while (stack.length) {
      const file = stack.pop()!
      let src: string
      try {
        src = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      // A root is a Server Component by definition; only its DEPENDENCIES can
      // opt out of the render phase.
      if (!roots.includes(file) && PHASE_BOUNDARY.test(src.slice(0, 400))) continue
      const code = stripComments(src)
      IMPORT.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = IMPORT.exec(code))) {
        const target = resolveImport(m[1] ?? m[2]!, file)
        if (target && !seen.has(target)) {
          seen.add(target)
          chainTo.set(target, file)
          stack.push(target)
        }
      }
    }
    return { modules: seen, chainTo }
  }

  it('the derivation still finds a render phase at all', () => {
    // A walk that comes back empty passes forever. Three separate things have
    // to still be true, and each fails here rather than by silently shrinking
    // the set to nothing.
    expect(roots.length, 'no Server Components found under app/').toBeGreaterThan(50)

    const { modules } = renderReachable()
    expect(
      modules.size,
      'the import walk resolved almost nothing — the specifier resolution has\n' +
        'gone stale and this guard is scanning a handful of files',
    ).toBeGreaterThan(200)
    // A module that is unambiguously render-reachable: every public clinic
    // page's layout loads it.
    expect(
      Array.from(modules),
      'the walk lost the public clinic-site loader — it reaches it through\n' +
        'app/site/[slug]/layout.tsx, so the traversal is broken',
    ).toContain('lib/services/clinic-site.ts')
  })

  it('the offence predicate still recognises a real call', () => {
    // The other half of a stale-derivation failure: a walk that finds every
    // file but a regex that matches nothing. Graded against a file that is
    // SUPPOSED to call the strict invalidator — a 'use server' action module,
    // outside the render phase and correctly not in the set below.
    const src = stripComments(readFileSync('app/(default)/website/go-live-actions.ts', 'utf8'))
    expect(
      STRICT_INVALIDATOR.test(src),
      'the go-live lever no longer calls a strict invalidator — either it was\n' +
        'renamed (fix the pattern) or the lever stopped invalidating (a bug)',
    ).toBe(true)
  })

  it('every render-reachable module uses the render-tolerant invalidator', () => {
    const { modules, chainTo } = renderReachable()

    const offenders: string[] = []
    for (const file of Array.from(modules)) {
      if (roots.includes(file)) continue
      const src = readFileSync(file, 'utf8')
      const code = stripComments(src)
      // DERIVED FROM CONTENT, NOT FROM A PATH: the module that DEFINES these
      // functions necessarily contains their names followed by a paren, and
      // it is the one place the strict version is supposed to exist. Keyed on
      // the export, so moving or renaming the file changes nothing.
      if (/export\s+(?:async\s+)?function\s+invalidateClinicSite/.test(code)) continue
      if (!STRICT_INVALIDATOR.test(code)) continue

      const chain: string[] = []
      let p = chainTo.get(file)
      while (p) {
        chain.push(p)
        p = chainTo.get(p)
      }
      offenders.push(`${file}\n      reached from: ${chain.join(' <- ')}`)
    }

    expect(
      offenders,
      `These modules are reachable from a Server Component render, and Next\n` +
        `THROWS on revalidateTag during render. The cache module rethrows that\n` +
        `(only "no request scope" is swallowed), so the throw does not skip the\n` +
        `invalidation — it truncates the function it was called from, and\n` +
        `whatever ran after the invalidation silently stops happening. On\n` +
        `#654 that was the code which disconnects social channels the platform\n` +
        `is billed for.\n\n` +
        `Use invalidateClinicSiteForOrgUnlessRendering instead. It gives up\n` +
        `nothing on an action or webhook path (a render refusal cannot arise\n` +
        `there) and on a render path it lets the webhook and the TTL do the\n` +
        `job. If a call genuinely cannot tolerate a missed invalidation, move\n` +
        `it out of the render-reachable module instead of widening this list:\n` +
        `${offenders.join('\n')}`,
    ).toEqual([])
  })

  it("leaves the action modules' strict calls alone", () => {
    // THE NEGATIVE CONTROL. This rule is about the render PHASE, not about
    // invalidating — if it ever swept up the 'use server' writers, the
    // strict/tolerant distinction would be dead and every call site would
    // quietly tolerate a refusal it should be shouting about.
    const { modules } = renderReachable()
    for (const action of [
      'app/(default)/website/go-live-actions.ts',
      'app/(default)/settings/clinic/actions.ts',
      'app/(default)/website/design/actions.ts',
      'app/(default)/website/forms/actions.ts',
    ]) {
      const src = stripComments(readFileSync(action, 'utf8'))
      expect(STRICT_INVALIDATOR.test(src), `${action} stopped invalidating`).toBe(true)
      expect(
        Array.from(modules),
        `${action} is a 'use server' module — its bodies do not run in the\n` +
          `render phase, so it must stay OUT of the derived set. If it is in,\n` +
          `the boundary check has broken and this guard is about to demand the\n` +
          `tolerant invalidator everywhere.`,
      ).not.toContain(action)
    }
  })
})
