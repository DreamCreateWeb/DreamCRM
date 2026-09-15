/**
 * The marketing site's curated animated-emoji set (`BRAND.md` Part 5).
 *
 * SIX GLYPHS, NOT A PACK. A whole pack is weight nobody looks at, and the
 * constraint is what keeps the set feeling like a decision rather than a
 * dependency. Adding a seventh is a brand-book edit, not a one-line change
 * here — `tests/marketing/emoji-assets.test.tsx` holds the registry and
 * `public/images/emoji/` to each other in both directions.
 *
 * Every glyph here was graded against BOTH grounds the marketing site uses —
 * the night band (`#10182E`) and the daylight body (white / `#F8FAFF`) — and
 * across its whole loop, not just its first frame. Several obvious candidates
 * failed that and are listed in `REJECTED` below so the next person does not
 * re-audition them.
 *
 * Licence: CC BY 4.0, Google's Noto Animated Emoji. See
 * `public/images/emoji/LICENSE.md` for provenance and `MarketingFooter` for
 * the required credit.
 */

export type MarketingEmojiName = 'rocket' | 'planet' | 'sparkles' | 'dizzy' | 'popper' | 'star'

export type MarketingEmojiEntry = {
  /** Unicode codepoint of the source glyph, as used by the Noto asset URL. */
  codepoint: string
  /** The plain-text glyph — the alt text to use when the emoji carries meaning. */
  glyph: string
  /** What this one is FOR. Keeps the set from drifting into decoration. */
  use: string
}

export const MARKETING_EMOJI: Record<MarketingEmojiName, MarketingEmojiEntry> = {
  rocket: {
    codepoint: '1f680',
    glyph: '🚀',
    use: 'Something shipped. The newest changelog entry; a launch.',
  },
  planet: {
    codepoint: '1fa90',
    glyph: '🪐',
    use: 'The space register itself — ambient, where a page needs a mark and not a mood.',
  },
  sparkles: {
    codepoint: '2728',
    glyph: '✨',
    use: 'Small delight. Something got better without the visitor asking.',
  },
  dizzy: {
    codepoint: '1f4ab',
    glyph: '💫',
    use: 'Motion and arrival. Stands in for the shooting star, which is not animated.',
  },
  popper: {
    codepoint: '1f389',
    glyph: '🎉',
    use: 'A real win the visitor caused. Never a win we caused for ourselves.',
  },
  star: {
    codepoint: '2b50',
    glyph: '⭐',
    use: 'A result worth keeping. The quiet anchor — it barely moves, on purpose.',
  },
}

export const MARKETING_EMOJI_NAMES = Object.keys(MARKETING_EMOJI) as MarketingEmojiName[]

/**
 * Auditioned and cut. Each line is a measurement, not a preference — re-reading
 * this is cheaper than re-downloading a 1.2 MB file to find out why.
 */
export const REJECTED: { codepoint: string; glyph: string; why: string }[] = [
  { codepoint: '1f52d', glyph: '🔭', why: 'Not animated — 404 in every format.' },
  { codepoint: '1f319', glyph: '🌙', why: 'Not animated — 404 in every format.' },
  { codepoint: '1f320', glyph: '🌠', why: 'Not animated — 404. 💫 stands in for it.' },
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
