import { describe, it, expect, afterEach, vi } from 'vitest'

/**
 * THE LAUNCH POST'S DEAD PRICE (DREAMCRM-101, `docs/RELEASE.md` Part 5).
 *
 * `/blog/dreamcrm-is-live` opened with *"for $150–500 a month"* — the
 * pre-collapse THREE-TIER RANGE — on a page a prospect reads while a
 * presenter quotes them $200. It had been live since launch.
 *
 * ── THE FIRST FIX MISSED, AND THAT IS THE MOST USEFUL PART OF THIS FILE ──
 *
 * #660 shipped the correction as an exact match on the `$150-500` sentence:
 * the range the ledger recorded, and the range sitting in `LAUNCH_POSTS`.
 * It matched nothing on the deploy, because **the published row said
 * `$99-199`** — a range from a pricing scheme older than the one the ledger
 * named. The ledger entry had been written by reading the source file, whose
 * `:50` it cites; its own repro said *"open `/blog/dreamcrm-is-live` and read
 * the first paragraph"*, and nobody had.
 *
 * So `PUBLISHED_OPENER` below is now the LIVE bytes, fetched from
 * production, and the rule under test is a SHAPE (`DEAD_RANGE`) rather than
 * one spelling. A fixture copied out of the source file is a fixture that
 * agrees with the source file, which is the one thing it must not be trusted
 * to do here.
 *
 * ── WHY THIS FILE EXISTS BESIDE `pricing-price-source.test.tsx` ──────────
 *
 * That guard has two assertions and NEITHER could have found this defect,
 * which is the part worth carrying:
 *
 *  - Assertion 2 scans for a PLAN PRICE spelled as a literal. The drift here
 *    was a RANGE: `$150` is nobody's price and the `500` carries no dollar
 *    sign, so a correct scan correctly reported clean. It protects the
 *    corrected copy going FORWARD (a `$200` typed back in) and is honest
 *    that it could not have caught the original.
 *  - Assertion 1 renders a PAGE. This copy is not on a page — it is a row in
 *    a database, seeded once from a registry, and `/blog/[slug]` renders
 *    whatever that row says.
 *
 * ── AND THE SECOND HALF IS THE HALF THAT ACTUALLY SHIPS THE FIX ──────────
 *
 * `LAUNCH_POSTS` is read only when a post does NOT exist, so editing the
 * sentence there fixes every future install and nothing that is live today.
 * The already-published row is corrected by `correctLaunchPostBody`, and
 * that is what these tests mostly grade — against the verbatim paragraph
 * production carries, not a synthetic one.
 *
 * ── THE RED RUN (§2d), AND WHAT EACH TEST IS ACTUALLY EVIDENCE OF ───────
 *
 * The two load-bearing tests were watched fail against the REAL defect, with
 * the module's exports intact so the PREDICATE failed rather than the import
 * (reverting the whole file only produces `TypeError: … is not a function`,
 * which says nothing about what the assertion can see):
 *
 *   - `seeds copy that FOLLOWS the config` → `AssertionError: expected
 *     '…for $150–500 a month…' to contain 'for $314 a month'`.
 *   - `rewrites the published paragraph` → same shape, on the published
 *     bytes, with the price correction removed from the list.
 *
 * The other three grade the ways this fix could be wrong in the OTHER
 * direction, and they are not equal in strength — say so rather than let a
 * green tick imply otherwise:
 *
 *   - `leaves a hand-edited post alone` — watched fail under a mutation that
 *     falls back to `replace(/for [^<]*?month-to-month\./, …)` when the exact
 *     sentence is gone. That is the tempting "make it more robust" edit, and
 *     it silently overwrites an editor's words on the next deploy.
 *   - `still carries the earlier SMS correction` — watched fail under a
 *     mutation that skips its entry while restructuring the list.
 *   - `is a no-op on a body already corrected` — NO mutation makes this one
 *     red while the design is exact-sentence matching, because `replace` of
 *     an absent needle is already identity. It is a PREMISE test, not a
 *     guard: it pins the property the caller's write-skip depends on, so a
 *     future rewrite to something stateful (a regex, a token) has to keep
 *     it. Read it as documentation with a tick, not as evidence.
 */

/**
 * The opening paragraph AS PUBLISHED — the bytes actually served by
 * `/blog/dreamcrm-is-live`, read off production on 2026-09-22, NOT copied out
 * of `LAUNCH_POSTS`.
 *
 * That distinction is the whole reason the first fix missed. The registry and
 * the published row are free to diverge — the seed only writes a row that does
 * not exist — so a fixture taken from the registry grades the registry, agrees
 * with itself, and says nothing at all about the page a visitor opens.
 *
 * Note the price: `$99–199`, not the `$150–500` the ledger and the registry
 * both carried.
 */
const PUBLISHED_OPENER =
  "<p>Today we're opening DreamCRM to every dental practice. The pitch fits in a sentence: " +
  'the five or six patient-facing subscriptions a typical practice juggles — website agency, ' +
  'booking widget, reminder service, review tool, recall vendor — replaced by one system, ' +
  'for $99–199 a month, month-to-month.</p>'

/** The range the ledger and the registry both believed was live. It is a
 *  dead range too, so the shape rule has to catch it as well — a fix that
 *  only handled the number we were surprised by would be the same mistake
 *  pointed at a different generation of the copy. */
const LEDGERS_OPENER = PUBLISHED_OPENER.replace('$99–199', '$150–500')

/** And the one with a plain hyphen, which no generation of this copy is known
 *  to have used. Which dash a given version reached for is exactly the kind of
 *  detail this correction has already been wrong about once. */
const HYPHEN_OPENER = PUBLISHED_OPENER.replace('$99–199', '$99-199')

/** The other sentence the same row carries, from the earlier correction —
 *  present so a regression that drops it shows up here rather than in
 *  production a deploy later. */
const PUBLISHED_SMS_SENTENCE =
  "<p>We also don't do VoIP phones, and our SMS channel is still in carrier registration; we'd " +
  'rather tell you that on the pricing page than surprise you after the contract.</p>'

/** Numbers no literal in this repo could match by accident — the same trick
 *  `pricing-price-source.test.tsx` uses, and for the same reason: copy that
 *  merely AGREES with today's config passes an equality check. */
async function loadWithPlanPrice(price: number) {
  vi.resetModules()
  vi.doMock('@/lib/stripe-config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/stripe-config')>()
    return { ...actual, getQuotedPlan: () => ({ ...actual.getQuotedPlan(), price }) }
  })
  return import('@/lib/services/marketing-blog')
}

afterEach(() => {
  vi.doUnmock('@/lib/stripe-config')
  vi.resetModules()
})

describe('the launch post quotes the plan config (DREAMCRM-101)', () => {
  it('seeds copy that FOLLOWS the config, and carries no three-tier range', async () => {
    const { LAUNCH_POSTS } = await loadWithPlanPrice(314)
    const live = LAUNCH_POSTS.find((p) => p.slug === 'dreamcrm-is-live')
    expect(live, 'the launch announcement is the post this defect is about').toBeTruthy()

    expect(live!.bodyHtml).toContain('for $314 a month')
    expect(live!.bodyHtml).not.toContain('$150')
    // The dead SECOND number of the range had no dollar sign, so spell the
    // whole thing: a bare `500` also appears in prices elsewhere on the site.
    expect(live!.bodyHtml).not.toContain('–500')
  })

  it('rewrites the LIVE published paragraph to the configured price', async () => {
    const { correctLaunchPostBody } = await loadWithPlanPrice(314)
    const corrected = correctLaunchPostBody(PUBLISHED_OPENER)

    expect(corrected).toContain('for $314 a month, month-to-month.')
    expect(corrected).not.toContain('$99')
    expect(corrected).not.toContain('199')
    // Voice untouched — this is a correction of a number, not a rewrite.
    expect(corrected).toContain('The pitch fits in a sentence')
    expect(corrected).toContain('website agency, booking widget, reminder service')
  })

  it('catches every dead range, not only the one we were surprised by', async () => {
    const { correctLaunchPostBody } = await loadWithPlanPrice(314)
    for (const [name, body] of [
      ['the range the ledger recorded', LEDGERS_OPENER],
      ['a plain hyphen', HYPHEN_OPENER],
    ] as const) {
      const corrected = correctLaunchPostBody(body)
      expect(corrected, name).toContain('for $314 a month, month-to-month.')
      expect(corrected, name).not.toMatch(/for \$\d[\d,]*\s*[‐-―-]/)
    }
  })

  it('still carries the earlier SMS correction', async () => {
    const { correctLaunchPostBody } = await loadWithPlanPrice(314)
    const corrected = correctLaunchPostBody(PUBLISHED_SMS_SENTENCE)
    expect(corrected).toContain('SMS texting is on our roadmap rather than in the product today')
    expect(corrected).not.toContain('carrier registration')
  })

  it('is a no-op on a body already corrected — this runs on EVERY deploy', async () => {
    const { correctLaunchPostBody } = await loadWithPlanPrice(314)
    const once = correctLaunchPostBody(PUBLISHED_OPENER + PUBLISHED_SMS_SENTENCE)
    // Identity, not merely "still correct": the caller skips the write on
    // equality, so anything short of byte-identical is a row rewritten
    // forever, on a table a clinic's editor also writes.
    expect(correctLaunchPostBody(once)).toBe(once)
  })

  it('leaves a hand-edited post alone', async () => {
    const { correctLaunchPostBody } = await loadWithPlanPrice(314)
    // Somebody opened the Posts manager and reworded the sentence. A prose
    // answer is not a RANGE, so there is nothing here to find — and
    // overwriting an editor's words on a deploy is the one thing widening
    // from an exact sentence to a shape could have cost.
    const edited = PUBLISHED_OPENER.replace(
      'for $99–199 a month, month-to-month.',
      'for a flat monthly fee, month-to-month.',
    )
    expect(correctLaunchPostBody(edited)).toBe(edited)
  })

  it('leaves a SINGLE price alone, whoever wrote it', async () => {
    const { correctLaunchPostBody } = await loadWithPlanPrice(314)
    // The rule is about a dead RANGE. One plan means one number, so a single
    // price in this sentence is either already correct or somebody's
    // deliberate edit, and neither is ours to rewrite. This is also what
    // makes the pass a no-op after the first deploy.
    const single = PUBLISHED_OPENER.replace('$99–199', '$275')
    expect(correctLaunchPostBody(single)).toBe(single)
  })
})
