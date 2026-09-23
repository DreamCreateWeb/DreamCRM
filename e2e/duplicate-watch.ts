import type { BrowserContext, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * CATCH A DUPLICATE THAT ONLY EXISTS FOR HALF A SECOND (DREAMCRM-105).
 *
 * THE PROBLEM THIS SOLVES. `e2e/portal-billing.spec.ts` has failed twice with
 * `strict mode violation: resolved to 2 elements` on
 * `getByLabel('Payment amount in dollars')` — 2026-09-15 and 2026-09-22, both
 * on diffs the browser suite never loads, both green on a plain re-run at the
 * same SHA. Everything known about it is written in that spec, and the part
 * that matters here is the measurement: both attempts died in **525ms and
 * 738ms** against a 30-second timeout, which means the second form is gone
 * again almost immediately.
 *
 * So the failure tells you the duplicate EXISTED and nothing about what it
 * WAS. A strict-mode violation throws on the spot and names two element
 * handles; by the time any post-hoc `page.evaluate` runs, the page has healed
 * and reports exactly one form. Two occurrences produced two dead ends and one
 * confidently-wrong diagnosis (see the spec's own history).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT DO.
 *
 * `watchForDuplicates` installs a `MutationObserver` through
 * `context.addInitScript`, so it is running before any page script on every
 * navigation — including during the HTML parse, which is when this thing
 * appears. Every time the count of matching elements rises above one it
 * records a snapshot: the count, the timestamp, the ancestor chain of each
 * match, and whether any of them is inside a `[hidden]` container.
 *
 * **IT DOES NOT WEAKEN THE ASSERTION, AND THAT IS THE WHOLE POINT.** The
 * obvious fix here is `.first()`, and the issue that commissioned this work
 * says in as many words why it is wrong: two live payment forms on a patient's
 * billing page is a possible money defect, and `.first()` would retire the only
 * instrument reporting it. `soleAmountField` below still uses the STRICT
 * locator and still fails on two elements. What changes is that the failure
 * arrives carrying the evidence instead of a shrug.
 *
 * It also does not RETRY the count. `expect(x).toHaveCount(1)` would poll until
 * the page healed and report green, which is `.first()` wearing a different
 * hat.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE SNAPSHOT WILL SETTLE, because a diagnostic nobody can act on is not
 * a diagnostic. The two candidates neither previous investigation named, both
 * of which the ancestor chain distinguishes on sight:
 *
 *   1. **A STREAMING ARTEFACT.** `app/(portal)/loading.tsx` exists, so the
 *      whole portal segment is wrapped in a Suspense boundary and its content
 *      arrives out of order: React appends it in a `<div hidden>` at the end of
 *      `<body>` and an inline script moves it into place. If the second match's
 *      chain ends in a `div[hidden]`, that is this — and the fix is about the
 *      boundary, not the fixture.
 *   2. **A SECOND LAYOUT RENDER.** `PortalLiveRefresh` calls `router.refresh()`
 *      on realtime events, and the portal chrome is server-rendered. If the
 *      snapshot shows TWO `#portal-main` elements, the duplicate is the whole
 *      page rather than the form, and the question moves out of this spec
 *      entirely.
 *
 * And it still settles the reading both earlier notes started from: a second
 * unpaid balance row cannot produce this, because `PayBalanceForm` is rendered
 * in exactly one place and the label occurs once in the product tree. If the
 * two matches share an ancestor chain down to a common parent, that is a repeat
 * of one render and not two invoices.
 */

/** The shape the in-page observer records. */
export interface DuplicateSnapshot {
  /** Milliseconds since navigation start, so a 525ms failure can be lined up. */
  at: number
  /** How many elements matched at that moment. */
  count: number
  /** Ancestor chain per match, outward from the element. */
  chains: string[]
  /** How many `#portal-main` elements existed — two means the whole page doubled. */
  portalMains: number
}

export interface DuplicateReport {
  selector: string
  /** The highest count ever seen. 1 means this never fired. */
  max: number
  snapshots: DuplicateSnapshot[]
}

const WATCH_KEY = '__dcDuplicateWatch'

/**
 * Start recording duplicates of `selector` for every page in this context.
 *
 * Call it on the CONTEXT before the first `goto` — `addInitScript` on a page
 * that has already navigated misses the render being investigated, which is
 * the only one that matters.
 */
export async function watchForDuplicates(context: BrowserContext, selector: string) {
  await context.addInitScript(installDuplicateWatch, [WATCH_KEY, selector] as [string, string])
}

/**
 * The observer itself, as a self-contained function.
 *
 * SEPARATE AND EXPORTED ON PURPOSE. `addInitScript` serializes this and runs it
 * in the page, so it may close over nothing outside its own arguments — which
 * also makes it something `tests/guards/e2e-duplicate-watch.test.ts` can call
 * directly under happy-dom and drive with a real DOM mutation. Without that,
 * the one thing this whole file is for would be the one thing nobody had
 * watched work: §2d's rule, and a fair description of how the last two
 * investigations of this flake went.
 */
export function installDuplicateWatch([key, sel]: [string, string]) {
  const store = { selector: sel, max: 0, snapshots: [] as unknown[] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any)[key] = store

  const chainOf = (el: Element) => {
    const parts: string[] = []
    let cursor: Element | null = el
    // Twelve levels is well past `#portal-main`, and past the `<div hidden>`
    // React parks out-of-order Suspense content in.
    while (cursor && parts.length < 12) {
      parts.push(
        cursor.tagName.toLowerCase() +
          (cursor.id ? `#${cursor.id}` : '') +
          (cursor.hasAttribute('hidden') ? '[hidden]' : ''),
      )
      cursor = cursor.parentElement
    }
    return parts.join(' < ')
  }

  const check = () => {
    const found = document.querySelectorAll(sel)
    if (found.length <= store.max) return
    store.max = found.length
    if (found.length > 1) {
      store.snapshots.push({
        at: Math.round(typeof performance === 'undefined' ? 0 : performance.now()),
        count: found.length,
        chains: Array.prototype.map.call(found, chainOf) as string[],
        portalMains: document.querySelectorAll('#portal-main').length,
      })
    }
  }

  try {
    new MutationObserver(check).observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  } catch {
    // A context where the observer cannot attach must not break the run. The
    // spec's own assertion is unaffected; only the diagnostic is.
  }
  // Called once immediately as well: a duplicate that is already in the
  // parsed HTML produces no mutation to observe.
  check()
}

/** Read whatever the observer recorded. Safe on a page that never ran it. */
export async function duplicateReport(page: Page): Promise<DuplicateReport | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await page.evaluate((key) => (window as any)[key] ?? null, WATCH_KEY)
  } catch {
    // A closed or navigating page must never turn a real failure into a
    // different one. The original assertion error is what the reader needs.
    return null
  }
}

/** The evidence, rendered for a failure message. */
export function describeReport(report: DuplicateReport | null): string {
  if (!report) {
    return 'The duplicate watcher recorded nothing — it was not installed on this context, or the page could not be read at failure time.'
  }
  if (report.max <= 1) {
    return (
      `The duplicate watcher saw at most ${report.max} element matching \`${report.selector}\` at ` +
      'any point, which means this failure is NOT the two-forms flake. Read the assertion error ' +
      'above on its own terms.'
    )
  }
  const lines = [
    `The duplicate watcher saw ${report.max} elements matching \`${report.selector}\`.`,
    '',
  ]
  for (const snap of report.snapshots) {
    lines.push(
      `  at ${snap.at}ms — ${snap.count} matches, ${snap.portalMains} \`#portal-main\` element(s)`,
    )
    for (const chain of snap.chains) lines.push(`    ${chain}`)
  }
  lines.push(
    '',
    'READ IT LIKE THIS (see this file\'s header):',
    '  * a chain ending in `div[hidden]` → React streaming: the portal segment has a',
    '    loading.tsx, so its content arrives out of order in a hidden container.',
    '  * two `#portal-main` elements → the whole LAYOUT rendered twice, not the form.',
    '    PortalLiveRefresh calls router.refresh(); start there.',
    '  * two chains identical to a common parent → one render repeated, which rules out',
    '    the "a second unpaid balance" reading for the third time.',
  )
  return lines.join('\n')
}

/**
 * Wait for the single element `selector` should resolve to, and fail LOUDLY —
 * with the recording — if there is more than one.
 *
 * The locator stays STRICT. This is not `.first()`: two payment forms still
 * fail this spec, because two payment forms on a patient's billing page is a
 * possible money defect and the only instrument reporting it is this failure.
 */
export async function expectSole(page: Page, locator: Locator, timeout = 30_000) {
  try {
    await expect(locator).toBeVisible({ timeout })
  } catch (err) {
    const report = await duplicateReport(page)
    throw new Error(
      `${err instanceof Error ? err.message : String(err)}\n\n` +
        `────────────── duplicate watcher (DREAMCRM-105) ──────────────\n` +
        `${describeReport(report)}\n`,
    )
  }
  return locator
}
