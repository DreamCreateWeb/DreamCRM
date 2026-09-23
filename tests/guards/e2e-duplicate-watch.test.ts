import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeReport, installDuplicateWatch } from '../../e2e/duplicate-watch'

/**
 * THE DIAGNOSTIC THAT HAS TO SURVIVE BEING USEFUL ONCE A MONTH.
 *
 * `e2e/duplicate-watch.ts` exists because the portal-billing duplicate lives
 * for about 500ms: a strict-mode violation throws on the spot, and by the time
 * any `page.evaluate` runs the page has healed. Two occurrences produced two
 * dead ends and one confidently-wrong diagnosis.
 *
 * It fires roughly never, which is exactly the shape of instrument that rots
 * unnoticed — the `e2e/axe-headroom.ts` lesson (a reporter that quietly stops
 * being registered goes on looking like a run with nothing to report). So the
 * renderer is graded here, in the `test` check, where it runs every time.
 *
 * TWO PROPERTIES, and the second is the one worth writing down:
 *
 *   1. IT RENDERS THE EVIDENCE. A recording that produced an empty or
 *      shape-only message would leave the next reader exactly where the last
 *      two were.
 *   2. IT DOES NOT WEAKEN THE ASSERTION. The spec must keep the STRICT
 *      locator. `.first()` would hide two live payment forms on a patient's
 *      billing page behind a green tick, and `toHaveCount(1)` would poll until
 *      the page healed — which is `.first()` wearing a different hat. Both are
 *      refused by reading the spec, because this is the one temptation the
 *      issue that commissioned the file names by name.
 */

const SPEC = join(process.cwd(), 'e2e/portal-billing.spec.ts')
const specSource = readFileSync(SPEC, 'utf8')

/**
 * The spec with its comment LINES dropped.
 *
 * Needed because the first version of the counting rule below reported an
 * offender on its very first run, and the offender was a sentence: this spec's
 * flake history quotes `getByLabel('Payment amount in dollars')` in prose four
 * times while explaining what went wrong. A rule about what the spec DOES must
 * not read what the spec SAYS — the same false positive the plan-price guard
 * had to learn (`§2d`: narrow the predicate, never register the file), and the
 * same reason `pricing-price-source` ignores a price written in a comment.
 *
 * Whole comment lines only. Stripping inline `//` would eat the `//` in
 * `http://127.0.0.1:3100` three lines up, and every prose mention here is on a
 * line of its own.
 */
const withoutCommentLines = (src: string) =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')

const specCode = withoutCommentLines(specSource)

describe('the observer actually observes — the ringer, under happy-dom', () => {
  // THE HALF THAT WOULD OTHERWISE BE UNTESTED, and it is the half the whole
  // file is for. `installDuplicateWatch` runs inside the browser, so nothing
  // in this repo would ever have executed it before the night it was needed —
  // which is exactly how the last two investigations of this flake went.
  const KEY = '__dcDuplicateWatch'
  const SEL = 'input[aria-label="Payment amount in dollars"]'

  const store = () => (globalThis as unknown as Record<string, DuplicateReportish>)[KEY]

  interface DuplicateReportish {
    selector: string
    max: number
    snapshots: Array<{ at: number; count: number; chains: string[]; portalMains: number }>
  }

  /** MutationObserver callbacks are microtask-scheduled; let them land. */
  const settle = () => new Promise((r) => setTimeout(r, 0))

  const field = (hidden = false) => {
    const wrap = document.createElement('div')
    if (hidden) wrap.setAttribute('hidden', '')
    wrap.innerHTML = '<input aria-label="Payment amount in dollars" />'
    return wrap
  }

  it('records nothing while there is one of them', async () => {
    document.body.innerHTML = '<div id="portal-main"></div>'
    installDuplicateWatch([KEY, SEL])
    document.querySelector('#portal-main')!.appendChild(field())
    await settle()

    expect(store().max, 'one field is the healthy page and must produce no snapshot').toBe(1)
    expect(store().snapshots).toEqual([])
  })

  it('catches a SECOND one the instant it appears, and says where it is', async () => {
    // THE ACTUAL FLAKE'S SHAPE: a second copy arrives in a `<div hidden>` —
    // which is where React parks out-of-order Suspense content — and is gone
    // again before anything could go looking for it.
    document.body.innerHTML = '<div id="portal-main"></div>'
    installDuplicateWatch([KEY, SEL])
    const main = document.querySelector('#portal-main')!
    main.appendChild(field())
    await settle()

    const ghost = field(true)
    document.body.appendChild(ghost)
    await settle()
    ghost.remove() // …and it heals, exactly as the real one does
    await settle()

    expect(store().max).toBe(2)
    expect(store().snapshots).toHaveLength(1)
    const snap = store().snapshots[0]
    expect(snap.count).toBe(2)
    expect(snap.portalMains).toBe(1)
    expect(
      snap.chains.join('\n'),
      'the chain is the whole diagnostic — without `div[hidden]` in it the next reader is back ' +
        'where the last two were',
    ).toContain('div[hidden]')
    expect(snap.chains.join('\n')).toContain('div#portal-main')
  })

  it('catches a duplicate that was in the parsed HTML before it started', async () => {
    // No mutation to observe, so the immediate `check()` is the only thing
    // that can see this. Dropping that call is a one-line edit that leaves
    // every other assertion here green.
    document.body.innerHTML = '<div id="portal-main"></div>'
    document.querySelector('#portal-main')!.appendChild(field())
    document.body.appendChild(field(true))
    installDuplicateWatch([KEY, SEL])
    await settle()

    expect(store().max).toBe(2)
    expect(store().snapshots).toHaveLength(1)
  })

  it('counts the layout too, so a doubled page reads differently from a doubled form', async () => {
    // The second candidate: `PortalLiveRefresh` calls `router.refresh()`. Two
    // `#portal-main` elements means the question leaves the spec entirely.
    document.body.innerHTML = '<div id="portal-main"></div>'
    installDuplicateWatch([KEY, SEL])
    document.querySelector('#portal-main')!.appendChild(field())
    await settle()

    const secondMain = document.createElement('div')
    secondMain.id = 'portal-main'
    secondMain.appendChild(field())
    document.body.appendChild(secondMain)
    await settle()

    expect(store().snapshots[0].portalMains).toBe(2)
  })
})

describe('the duplicate watcher renders what it saw', () => {
  it('names the streaming candidate when a match sits in a hidden container', () => {
    const out = describeReport({
      selector: 'input[aria-label="Payment amount in dollars"]',
      max: 2,
      snapshots: [
        {
          at: 511,
          count: 2,
          chains: [
            'input < div < div#portal-main < body',
            'input < div < div[hidden] < body',
          ],
          portalMains: 1,
        },
      ],
    })
    expect(out).toContain('2 elements')
    expect(out).toContain('511ms')
    expect(out).toContain('div[hidden]')
    // The reading, not just the data — a chain dump with no legend is the same
    // dead end in a longer form.
    expect(out).toMatch(/loading\.tsx|streaming/i)
    expect(out).toMatch(/router\.refresh/)
  })

  it('says plainly when it recorded nothing, rather than implying a clean page', () => {
    // The dangerous direction for a diagnostic: a reader who takes "no
    // duplicates recorded" as "there was no duplicate" when the truth is that
    // the watcher was never installed.
    const out = describeReport(null)
    expect(out).toMatch(/not installed|could not be read/)
  })

  it('says when a failure is NOT this flake', () => {
    const out = describeReport({ selector: 'x', max: 1, snapshots: [] })
    expect(out).toMatch(/NOT the two-forms flake/)
  })
})

describe('the spec keeps the strict locator', () => {
  it('never resolves the amount field with .first()', () => {
    // THE THING THE ISSUE NAMES BY NAME. Two payment forms on a patient's
    // billing page is a possible money defect, and this failure is the only
    // instrument reporting it.
    expect(
      specCode,
      '`.first()` on the amount field would hide two live payment forms behind a green tick. ' +
        'The watcher exists so the failure carries evidence, not so the failure goes away.',
    ).not.toMatch(/getByLabel\('Payment amount in dollars'\)\s*\)?\s*\.first\(\)/)
  })

  it('never polls the count until the page heals', () => {
    // `toHaveCount(1)` retries for the whole timeout, so a duplicate that is
    // gone two seconds later reports green. That is `.first()` with extra
    // steps, and it is the more plausible mistake because it looks like an
    // assertion.
    expect(
      specCode,
      'toHaveCount(1) on the amount field polls until the transient duplicate is gone and then ' +
        'passes. The duplicate is measured at ~500ms against a 30s timeout — it would always heal ' +
        'first.',
    ).not.toMatch(/toHaveCount\(\s*1\s*\)/)
  })

  it('installs the watcher on the context, before any navigation', () => {
    // `addInitScript` on a page that has already navigated misses the first
    // render, which is the only one that matters here.
    expect(specSource).toMatch(/watchForDuplicates\(context,/)
    const install = specSource.indexOf('watchForDuplicates(')
    const firstGoto = specSource.indexOf('page.goto(')
    expect(install).toBeGreaterThan(-1)
    expect(
      install,
      'the watcher must be installed before the first goto in the file, or the render it exists ' +
        'to record has already happened',
    ).toBeLessThan(firstGoto)
  })

  it('is used on every test in the file that reaches the amount field', () => {
    // Including the one that has never flaked. If the duplicate ever shows up
    // in the test that settles first, the settle is not the discriminator —
    // and that is the single most useful thing the next occurrence could say.
    const count = (re: RegExp) => (specCode.match(re) ?? []).length
    const bare = count(/getByLabel\('Payment amount in dollars'\)/g)
    const wrapped = count(/expectSole\(page, page\.getByLabel\('Payment amount in dollars'\)\)/g)
    expect(
      wrapped,
      `${bare - wrapped} use(s) of the amount locator are not wrapped in expectSole, so a ` +
        'duplicate there would fail with a strict-mode violation and no recording — which is ' +
        'exactly the dead end this file exists to end.',
    ).toBe(bare)
  })
})
