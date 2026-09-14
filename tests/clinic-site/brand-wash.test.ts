import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { buildClinicPalette, brandWash, brandWashInk, contrastRatio, parseHex } from '@/lib/clinic-site-theme'

/**
 * A HEX ALPHA SUFFIX ON A `var()` IS NOT A COLOUR.
 *
 * `brandFill(brand)` followed by a two-digit alpha reads like "the brand fill
 * at 13%", and it is the spelling five confirmation pages reached for. But
 * `brandFill` returns `var(--c-brand-strong, #4C7DF0)`, so the result is that
 * whole `var()` with `22` stuck on the end — which parses as nothing. The
 * browser drops the declaration and the element renders with NO background:
 * silently, on a live page, with no console error and nothing for a contrast
 * checker to measure, because there is no colour there to measure. Three of
 * the five were live in that state.
 *
 * The trap is a one-way door that opens the moment a value becomes
 * template-aware. The raw-hex form works and always did, and `brandFill` is
 * the correct value to move to — so the defect appears at exactly the point
 * somebody does the right thing to a working line.
 *
 * `lib/brand-tint.ts` is the home for a real alpha tint (it returns its input
 * untouched rather than corrupting a non-hex), and `brandWash()` is the home
 * for the pale brand surface these five actually wanted.
 */

const ROOTS = ['app/site', 'components/clinic-site', 'components/patient-portal']

/** Blanks out comments, preserving offsets so reported line numbers stay true.
 *  This file and `success-well.tsx` both SPELL the defect in prose to explain
 *  it, and a guard that fires on its own explanation is one people delete. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\w])\/\/[^\n]*/gm, (m, pre) => pre + ' '.repeat(m.length - pre.length))
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full)
  }
  return out
}

/** `…)` immediately followed by a quoted 2-digit hex — the corrupting concat. */
const SUFFIX_ON_CALL = /\)\s*\+\s*'[0-9a-fA-F]{2}'/g
/** The same thing written into a template literal. */
const SUFFIX_IN_TEMPLATE = /\$\{[^}]*(?:brandFill|brandWash|brandWashInk|readableInk|var\()[^}]*\}[0-9a-fA-F]{2}\b/g

describe('a hex alpha suffix is never concatenated onto a var()', () => {
  const files = ROOTS.flatMap((r) => walk(resolve(process.cwd(), r)))

  it('scans a real tree (the rule is not silently matching nothing)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no public-site style builds a colour by suffixing a function call', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'))
      const rel = file.slice(process.cwd().length + 1).split('\\').join('/')
      for (const re of [SUFFIX_ON_CALL, SUFFIX_IN_TEMPLATE]) {
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) {
          offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length} — ${m[0].trim()}`)
        }
      }
    }
    expect(
      offenders,
      `A hex alpha suffix only works on a hex. These produce an invalid colour, so ` +
        `the browser drops the declaration and the element renders unpainted. Use ` +
        `brandTint(brand, 0.13) for a real tint, or brandWash(brand) for the pale ` +
        `brand surface:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})

describe('brandWash is a usable surface on every brand', () => {
  // Round the hue wheel, plus the two pale brands that made the portal defect
  // real (a sage and a powder pink).
  const BRANDS = ['#9CAF9F', '#F7C7D3', '#4C7DF0', '#111111', '#E8D9A0', '#2F6F62']

  it('its ink clears AA against it', () => {
    for (const brand of BRANDS) {
      const p = buildClinicPalette(brand)
      const ink = parseHex(p.brandSoftInk)
      const wash = parseHex(p.brandSoft)
      expect(ink && wash, `${brand}: the palette produced a non-hex`).toBeTruthy()
      expect(
        contrastRatio(ink!, wash!),
        `${brand}: ${p.brandSoftInk} on ${p.brandSoft}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('reads the template var, with the graded default as the fallback', () => {
    // The point of returning a var() rather than a hex: the ACTIVE template
    // owns the token, and the fallback must still be the graded value rather
    // than the raw brand — falling back to the raw brand is the defect
    // `brandFill` exists to end, and this sibling must not reintroduce it.
    const brand = '#9CAF9F'
    const p = buildClinicPalette(brand)
    expect(brandWash(brand)).toBe(`var(--c-brand-soft, ${p.brandSoft})`)
    expect(brandWashInk(brand)).toBe(`var(--c-brand-soft-ink, ${p.brandSoftInk})`)
    expect(brandWash(brand)).not.toContain(brand)
  })
})
