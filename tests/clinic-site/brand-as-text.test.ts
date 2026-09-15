import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { buildClinicPalette, contrastRatio, parseHex, readableInk } from '@/lib/clinic-site-theme'

/**
 * THE CLINIC'S BRAND IS NEVER RAW INK ON TEXT.
 *
 * `brandFill()` and `tests/clinic-site/brand-fill.test.ts` own the other half
 * of this — the brand as a SURFACE with white text on it. This is the mirror:
 * the brand as the TEXT ITSELF, on the light ground.
 *
 * WHY IT IS A DEFECT AT ALL, given the brand is the clinic's own colour. It is
 * TENANT DATA. A practice picks it in a colour well, and nothing stops them
 * picking pale sage `#9CAF9F` (2.17:1 on the warm ground) or a pale pink
 * (1.75:1). A clinic whose brand happens to be dark hides the whole class —
 * their site reads fine and nobody files anything — which is exactly why this
 * has to be graded against the DERIVATION rather than against one tenant's
 * value. `readableInk(brand, ground)` is the answer the theme already ships:
 * it returns the brand untouched when it clears the floor and darkens along
 * the brand's own hue when it does not, so a dark brand is unchanged and a
 * pale one becomes legible without becoming a different colour.
 *
 * WHAT THE SWEEP FOUND (UI batch 65, DREAMCRM-62 part 2). 32 sites spelled
 * `color: brand` across `app/site` and `components/clinic-site`, and they were
 * two populations wearing one spelling:
 *
 *   · **REAL COPY — 8 sites, all fixed.** The intake form's progress label and
 *     its per-section eyebrow, the shop's "continue shopping" and "back to
 *     shop" links, the Cart button's own word, and `numbered-steps`' eyebrow,
 *     its `<h2>` SECTION HEADING and its step numerals. The heading is the one
 *     that stings: a 44px brand-coloured `<h2>` is the most prominent text on
 *     the section, and on a pale brand it was the least readable.
 *   · **DECORATIVE GRAPHICS — the rest, deliberately left.** An `<svg>` tick
 *     beside a line of body copy, a placeholder page-glyph where a post has no
 *     cover image, a perk icon sitting above its own `<h3>`. WCAG 1.4.3 grades
 *     TEXT; a graphic that repeats what the text beside it already says is not
 *     text, and darkening every one of them to 4.5:1 would flatten the brand
 *     accent off the whole site to fix nothing. (1.4.11 asks 3:1 of a
 *     MEANINGFUL graphic, which is a different rule with a different floor —
 *     the icon-only controls that owed it are in the fixed list above.)
 *
 * THE RULE BELOW IS STRUCTURAL, and that is what makes it cheap to obey. After
 * the sweep, every surviving raw-brand ink is either ON an `<svg>` or on an
 * element marked `aria-hidden`. Both say "this is a picture, not a sentence" in
 * the markup rather than in a reviewer's head, so the rule needs no exemption
 * list at all: to keep a brand-coloured graphic, say it is a graphic.
 *
 * WHAT IT DOES NOT SEE, named so a green run is not over-read:
 *   · `var(--c-brand)` reached through CSS rather than a `style` prop.
 *   · The brand arriving under another name (`fill`, `borderColor`,
 *     `stroke`) — those are non-text colours and 1.4.11's business.
 *   · Whether an `aria-hidden` graphic is honestly decorative. That is a
 *     judgement the markup asserts and this rule takes at its word.
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['app/site', 'components/clinic-site']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/** The raw brand used as an ink — `color: brand` in a style object, in the
 *  spellings this repo writes it (bare, or beside other style keys). */
const RAW_BRAND_INK = /\bcolor:\s*brand\b/g

type Site = { file: string; line: number; tag: string; attrs: string }

/**
 * The JSX element a match sits inside — its tag name and its attribute text.
 *
 * Scans BACK to the nearest `<tag` that opens an element and FORWARD from
 * there to the end of the opening tag, so an `<svg>` whose attributes run over
 * six lines is read as one element. A line-based rule cannot do this, and
 * getting it wrong is the difference between "11 svgs" and "4 unexplained
 * wrappers" — the first draft of this scan was line-based and reported both
 * populations as the same thing.
 */
function enclosingElement(src: string, at: number): { tag: string; attrs: string } | null {
  const open = src.lastIndexOf('<', at)
  if (open < 0) return null
  const m = /^<([A-Za-z][\w.]*)/.exec(src.slice(open, open + 40))
  if (!m) return null
  // The opening tag ends at the first `>` that is not inside a brace or quote.
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return { tag: m[1], attrs: src.slice(open, i) }
  }
  return null
}

function rawBrandInkSites(): Site[] {
  const found: Site[] = []
  for (const base of SCAN_DIRS) {
    for (const file of walk(join(ROOT, base))) {
      const src = readFileSync(file, 'utf8')
      for (const m of Array.from(src.matchAll(RAW_BRAND_INK))) {
        const el = enclosingElement(src, m.index!)
        found.push({
          file: relative(ROOT, file).replace(/\\/g, '/'),
          line: src.slice(0, m.index).split('\n').length,
          tag: el?.tag ?? '?',
          attrs: el?.attrs ?? '',
        })
      }
    }
  }
  return found
}

const isGraphic = (s: Site) => s.tag === 'svg' || /aria-hidden/.test(s.attrs)

/* ── the derivation this rule rests on ───────────────────────────────────── */

describe('readableInk is what makes brand-as-text safe', () => {
  // Every brand a clinic can actually pick, including the ones that broke
  // things before — the pale sage the demo seeds, a pale pink, pure yellow,
  // white, black, and junk. The same hostile set brand-fill.test.ts uses,
  // because the two rules answer the same question from opposite sides.
  const BRANDS = ['#1D4ED8', '#9CAF9F', '#FFE900', '#FFFFFF', '#000000', '#7E957F', 'junk', null] as const

  it('clears AA on the ground for every brand, including the hostile ones', () => {
    for (const brand of BRANDS) {
      const { bg } = buildClinicPalette(brand)
      const ink = readableInk(brand, bg, 4.5)
      expect(
        contrastRatio(parseHex(ink)!, parseHex(bg)!),
        `readableInk on the ground @ ${brand}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves a brand that already reads ALONE — it darkens, it does not repaint', () => {
    // The half that keeps this from being "make everything near-black". A
    // brand dark enough to read comes back untouched, so the accent survives.
    const { bg } = buildClinicPalette('#1D4ED8')
    expect(readableInk('#1D4ED8', bg, 4.5).toLowerCase()).toBe('#1d4ed8')
  })

  it('and the NEGATIVE half: the raw pale brands really were unreadable', () => {
    // Derived, not remembered. Without this the rule above would pass on a
    // palette where nothing had ever been broken.
    for (const pale of ['#9CAF9F', '#FFE900']) {
      const { bg } = buildClinicPalette(pale)
      expect(
        contrastRatio(parseHex(pale)!, parseHex(bg)!),
        `${pale} raw on its own ground should be BELOW the floor`,
      ).toBeLessThan(4.5)
    }
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

describe('the brand as ink on the public clinic site', () => {
  it('still has raw-brand inks to look at (the scan is not narrowed to nothing)', () => {
    // A rule that matches nothing reports CLEAN forever. The decorative
    // population is the field of view: every one of these is graded below.
    expect(rawBrandInkSites().length).toBeGreaterThan(5)
  })

  it('reads the whole opening tag, not the line the match sits on', () => {
    // The instrument check. Most of the surviving sites are `<svg>` elements
    // whose `style` prop is six lines below the tag name, so a line-based scan
    // would call them unexplained. If this stops being true the rule has
    // quietly become a different rule.
    const svgs = rawBrandInkSites().filter((s) => s.tag === 'svg')
    expect(svgs.length, 'the scan should still be resolving <svg> ancestors').toBeGreaterThan(5)
  })

  it('is only ever on a GRAPHIC — an <svg>, or an element marked aria-hidden', () => {
    const offenders = rawBrandInkSites()
      .filter((s) => !isGraphic(s))
      .map((s) => `${s.file}:${s.line} — <${s.tag}> carries the raw brand as its ink`)
    expect(
      offenders,
      'The clinic brand is TENANT DATA: a practice can pick a colour that is unreadable on ' +
        'their own ground (pale sage measures 2.17:1, a pale pink 1.75:1). Brand-as-TEXT goes ' +
        'through readableInk(brand, ground), which returns a dark brand untouched and darkens ' +
        'a pale one along its own hue. If this element is a decorative GRAPHIC rather than ' +
        'text, say so in the markup — an <svg> or aria-hidden — and the rule will believe you.',
    ).toEqual([])
  })
})
