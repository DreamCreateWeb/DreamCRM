/**
 * READING A SOURCE FILE AS TEXT, FOR THE MARKETING GUARDS THAT DO IT.
 *
 * `tests/marketing/type-floor.test.ts` and
 * `tests/marketing/product-mocks.test.tsx` both scan `.tsx` sources for a
 * pattern and both have to ignore comments. They shipped a copy of the
 * stripper each (DREAMCRM-87), which is the "two guards grading one string"
 * shape this repo keeps paying for one level down — a defect fixed in one copy
 * and not the other is a guard that disagrees with its sibling about what the
 * tree says. One home, imported twice.
 *
 * Found by Sentinel's review of #642: the first version treated an opening
 * comment marker **inside a string literal** as a real one and would blank
 * everything forward to the next closing marker, which can swallow real code.
 * Latent rather than live — no
 * such string exists in either marketing tree — but latent in two places at
 * once, which is the argument for this file rather than for two patches.
 */

/**
 * Blank every comment in a source, PRESERVING offsets and line breaks.
 *
 * Offsets have to survive because both callers attribute a hit to a component
 * by its position and report it by its line.
 *
 * STRING-AWARE, and that is the whole reason this is not four lines. A scanner
 * that only looks for an opening comment marker cannot tell a comment from a
 * comment-shaped substring inside a quoted run, and would blank forward from
 * there to the next closing marker — silently
 * deleting real code from the scanner's view, which is the false-NEGATIVE
 * direction and the one that reports CLEAN forever. So quoted runs are skipped
 * whole: `'`, `"` and backtick, with `\` escapes honoured.
 *
 * WHAT IT DELIBERATELY DOES NOT SEE, because a stripper that tries to be a
 * parser is worse than one that says where it stops:
 *
 *   - **A comment inside a template literal's `${…}`.** The backtick run is
 *     skipped whole, so a comment in an interpolation is left alone rather
 *     than blanked. That is the safe direction — the scanner reads slightly
 *     MORE than it should, so a pattern hiding there is found rather than
 *     missed, and both callers' subjects (a Tailwind class literal, a JSX
 *     attribute) would be a real hit anyway.
 *   - **A regex literal containing a quote** — `/['"]/` — whose quote would
 *     open a run this skips to the next matching one. No such regex exists in
 *     either marketing tree; if one lands, the failure is a scanner that reads
 *     less than it should, so it is worth knowing rather than assuming.
 */
export function stripComments(src: string): string {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    const c = src[i]

    // A quoted run is skipped WHOLE — see the note above. `\` escapes the next
    // character, so `'it\'s'` does not end at the apostrophe.
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < src.length) {
        if (src[i] === '\\') {
          i += 2
          continue
        }
        if (src[i] === c) {
          i++
          break
        }
        i++
      }
      continue
    }

    if (c === '/' && src[i + 1] === '*') {
      let end = src.indexOf('*/', i + 2)
      end = end === -1 ? src.length : end + 2
      for (let k = i; k < end; k++) if (out[k] !== '\n') out[k] = ' '
      i = end
      continue
    }

    // `://` is a URL, not a comment. The quote-skipping above already covers
    // the common case (a URL lives in a string), so this is the belt to that
    // brace for a bare one in JSX text.
    if (c === '/' && src[i + 1] === '/' && src[i - 1] !== ':') {
      let end = src.indexOf('\n', i)
      end = end === -1 ? src.length : end
      for (let k = i; k < end; k++) out[k] = ' '
      i = end
      continue
    }

    i++
  }
  return out.join('')
}
