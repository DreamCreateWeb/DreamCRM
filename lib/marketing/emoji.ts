/**
 * The marketing site's curated animated-emoji set (`BRAND.md` Part 5).
 *
 * THREE GLYPHS, AND SIX IS THE CEILING. The set shipped at six on
 * DREAMCRM-56; three of those six reached 1.0 with no call site anywhere on
 * the site, and on DREAMCRM-118 they were cut rather than carried. Part 5's
 * six is a CEILING, not a quota — the rule was always "a glyph marks a
 * moment", and a registered glyph marking nothing is the decoration the same
 * rule bans. The constraint is what keeps the set reading as a decision
 * rather than a dependency, and a set half of which marks nothing is not a
 * decision.
 *
 * Adding one back, or adding a seventh, is a brand-book edit first — not a
 * one-line change here. `tests/marketing/emoji-assets.test.tsx` holds the
 * registry and `public/images/emoji/` to each other in both directions.
 *
 * Every glyph here was graded against BOTH grounds the marketing site uses —
 * the night band (`#10182E`) and the daylight body (white / `#F8FAFF`) — and
 * across its whole loop, not just its first frame. Two lists below keep the
 * research that is expensive to redo, and they answer DIFFERENT questions:
 * `REJECTED` is "this one failed on the merits, do not re-audition it", and
 * `CUT` is "this one passed and we had nowhere to put it".
 *
 * Licence: CC BY 4.0, Google's Noto Animated Emoji. See
 * `public/images/emoji/LICENSE.md` for provenance and `MarketingFooter` for
 * the required credit.
 */

export type MarketingEmojiName = 'rocket' | 'planet' | 'popper'

export type MarketingEmojiEntry = {
  /** Unicode codepoint of the source glyph, as used by the Noto asset URL. */
  codepoint: string
  /** The plain-text glyph — the alt text to use when the emoji carries meaning. */
  glyph: string
  /** What this one is FOR. Keeps the set from drifting into decoration. */
  use: string
  /** Where it actually marks a moment today. The reason this field exists is
   *  the DREAMCRM-118 cut: "what it is for" is an intention, and three glyphs
   *  held one for a year with nothing behind it. A `where` that goes stale is
   *  the next cut's evidence. */
  where: string
}

export const MARKETING_EMOJI: Record<MarketingEmojiName, MarketingEmojiEntry> = {
  rocket: {
    codepoint: '1f680',
    glyph: '🚀',
    use: 'Something shipped. The newest changelog entry; a launch.',
    where: '`/changelog` — the newest week only, labelled.',
  },
  planet: {
    codepoint: '1fa90',
    glyph: '🪐',
    use: 'The space register itself — ambient, where a page needs a mark and not a mood.',
    where: 'The marketing 404 (`app/(marketing)/not-found.tsx`), decorative.',
  },
  popper: {
    codepoint: '1f389',
    glyph: '🎉',
    use: 'A real win the visitor caused. Never a win we caused for ourselves.',
    where: '`/partner-program` — the application-received state.',
  },
}

export const MARKETING_EMOJI_NAMES = Object.keys(MARKETING_EMOJI) as MarketingEmojiName[]

/**
 * PASSED THE AUDITION, CUT FOR HAVING NOWHERE TO GO (DREAMCRM-118,
 * 2026-09-23).
 *
 * These three shipped in the original six, were self-hosted, re-encoded,
 * licence-attributed — and were referenced by nothing on the site for the
 * whole of the Beta-to-1.0 program. That is not a defect; it is a set that
 * grew from the palette end rather than from the moment end. Cutting is the
 * honest half of "six, not a pack": the alternative was inventing moments to
 * justify assets, which is how a rule against decoration becomes decoration.
 *
 * They are recorded HERE and not in `REJECTED` because the distinction is
 * load-bearing for whoever reads this next: nothing below failed on the
 * merits, so a real moment for one of them is a good reason to bring it back,
 * whereas a `REJECTED` entry is a reason not to try. Restoring one is:
 * re-add its row to `SET` in `scripts/build-emoji.mjs` (the still-frame index
 * and stride are preserved below, and they are the expensive part of the
 * research), run it, add the entry above with a real `where`, add the row to
 * `BRAND.md` Part 5's table and to `public/images/emoji/LICENSE.md`.
 */
export const CUT: {
  codepoint: string
  glyph: string
  /** What it was registered FOR, kept verbatim so a future moment can be matched against it. */
  use: string
  /** `scripts/build-emoji.mjs` re-encode parameters, preserved so a restore is exact. */
  build: { name: string; stillFrame: number; stride: number }
  why: string
}[] = [
  {
    codepoint: '2728',
    glyph: '✨',
    use: 'Small delight. Something got better without the visitor asking.',
    build: { name: 'sparkles', stillFrame: 0, stride: 2 },
    why: 'No call site. The nearest real moment would be a changelog improvement row, and the rocket already marks the week that contains it — a second mark inside the same block is the wallpaper problem Part 3 rule 3 names.',
  },
  {
    codepoint: '1f4ab',
    glyph: '💫',
    use: 'Motion and arrival. Stands in for the shooting star, which is not animated.',
    build: { name: 'dizzy', stillFrame: 0, stride: 2 },
    why: 'No call site. It was registered as a STAND-IN for a glyph we could not have (🌠), which is a reason to have it in a pack and not a moment on a page — the only register it fits is ambient, and the planet already holds that.',
  },
  {
    codepoint: '2b50',
    glyph: '⭐',
    use: 'A result worth keeping. The quiet anchor — it barely moves, on purpose.',
    build: { name: 'star', stillFrame: 0, stride: 3 },
    why: 'No call site, and the one place it reads as obvious is the one place it must never go: a star beside a rating or a testimonial reads as OUR rating. Part 5 bans emoji on comparisons and grader numbers for the same reason.',
  },
]

/**
 * Auditioned and cut ON THE MERITS. Each line is a measurement, not a
 * preference — re-reading this is cheaper than re-downloading a 1.2 MB file to
 * find out why. Unlike `CUT` above, nothing here should be re-auditioned.
 */
export const REJECTED: { codepoint: string; glyph: string; why: string }[] = [
  { codepoint: '1f52d', glyph: '🔭', why: 'Not animated — 404 in every format.' },
  { codepoint: '1f319', glyph: '🌙', why: 'Not animated — 404 in every format.' },
  { codepoint: '1f320', glyph: '🌠', why: 'Not animated — 404. 💫 stood in for it, and 💫 is cut too.' },
  { codepoint: '1f6f0', glyph: '🛰️', why: 'Not animated — 404 in every format.' },
  { codepoint: '1f31b', glyph: '🌛', why: 'The only animated moon, and it has a FACE. Part 5 rules faces out.' },
  { codepoint: '1f31e', glyph: '🌞', why: 'Face, and the wrong end of the day for the night register.' },
  { codepoint: '1f30c', glyph: '🌌', why: 'A dark-filled SQUARE. Reads as a box, not a glyph, on both grounds.' },
  { codepoint: '1f386', glyph: '🎆', why: 'Its first frame is a near-black square — the reduced-motion still would be a blob.' },
  { codepoint: '2604', glyph: '☄️', why: '840 KB source, and pale-blue-on-white is weak on the daylight body.' },
  { codepoint: '1f31f', glyph: '🌟', why: 'Scales to near-zero at both ends of its loop — reads as a flicker at 40px.' },
  { codepoint: '26a1', glyph: '⚡', why: 'Vanishes entirely mid-loop. A glyph that blinks out is a distraction.' },
  { codepoint: '1f6f8', glyph: '🛸', why: 'Reads fine, but busy — grey hardware next to body copy pulls focus.' },
]
