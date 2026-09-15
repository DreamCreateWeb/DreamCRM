import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * THE RETIRED HUES STAY RETIRED.
 *
 * v3 kept six semantic tones (warn amber · ok emerald · info violet · urgent
 * rose · special fuchsia · neutral gray) and dropped `sky` and `stone`. They
 * were cleaned out module by module, and each pass left a handful behind —
 * which is exactly how a design system dies: not by a decision, by attrition.
 *
 * The last of them were an "In the waiting room" status, two order/invoice
 * identifiers, a kanban column, the approval card's photo link and its
 * earned-trust nudge, a plan-mix bar that should have been on the chart
 * tokens, an integration accent (Stripe, whose real brand is violet anyway),
 * and every neutral in the three shared editor primitives.
 *
 * SCOPE: the authenticated app, the shared components, and the two shared
 * REGISTRIES that hand colours to everything else — `lib/ui/encodings.ts`
 * (which was itself painting the "quiet" aging tier in stone) and
 * `lib/types/patient-tags.ts` (which offered sky as a pickable tag colour).
 * A registry on a retired ramp re-seeds it everywhere it is read, so those
 * two matter more than any one screen. The public clinic sites and the
 * patient portal own their own palettes and are out of scope.
 */

const ROOTS = ['app/(default)', 'app/(double-sidebar)', 'components', 'lib/ui', 'lib/types']

/** Own their own palettes, and say so in the scope note above. */
const SKIP_DIRS = ['components/clinic-site', 'components/patient-portal', 'components/marketing']

/** Deliberate uses, each with the reason it is not a stray tone. */
const ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'app/(default)/website/pages/seo-meta-form.tsx',
    why: 'imitates a Google search result, so it borrows Google’s own link blue',
  },
]

/**
 * A retired ramp, in EITHER spelling this repo uses for a colour.
 *
 * The second alternative is the one that was missing (DREAMCRM-50): an
 * arbitrary value reaches the palette as `theme(colors.sky.500/40%)` rather
 * than as a `bg-sky-500` utility, and the repo writes it that way for inset
 * rings and shadows — `clinic-thread-list.tsx` and `search-input.tsx` both do,
 * in teal. Matching only the utility form meant a retired hue could come back
 * through the door the codebase actually uses for shadow colours, and the
 * mutation pass confirmed the guard stayed green with it live.
 *
 * No `\b` before `theme`: Tailwind spells spaces in an arbitrary value as `_`,
 * which is a word character, so `1px_theme(` has no word boundary in front of
 * it. That detail alone cost the first draft of this rule its principal case.
 */
const RETIRED =
  /\b(?:bg|text|border|ring|from|to|via|placeholder|divide|shadow)-(sky|stone)-\d{2,3}\b|theme\(colors\.(sky|stone)\.\d{2,3}/g

const BACKSLASH = String.fromCharCode(92)

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (SKIP_DIRS.some((d) => full.split(BACKSLASH).join('/').endsWith(d))) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('retired v2 tones', () => {
  const root = process.cwd()
  const files = ROOTS.flatMap((d) => walk(resolve(root, d)))

  it('no sky-* or stone-* utility classes survive in the app', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.slice(root.length + 1)
      if (ALLOWED.some((a) => a.file === rel)) continue
      const text = readFileSync(file, 'utf8')
      for (const m of Array.from(text.matchAll(RETIRED))) {
        offenders.push(`${rel}: ${m[0]}`)
      }
    }
    expect(
      offenders,
      `v3 retired sky and stone. Use a semantic tone (warn amber · ok emerald ·\n` +
        `info violet · urgent rose · special fuchsia · neutral gray), the brand\n` +
        `teal for actions and identity, or a chart token for a series:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('catches a retired ramp in BOTH spellings, and leaves the live ones alone', () => {
    // The utility form was always caught; the theme() form was the hole.
    for (const banned of [
      'bg-sky-500',
      'text-stone-400',
      'shadow-[inset_0_0_0_1px_theme(colors.sky.500/40%)]',
      'ring-[color:theme(colors.stone.200)]',
    ]) {
      expect(Array.from(banned.matchAll(RETIRED)), `${banned} should be caught`).not.toEqual([])
    }
    for (const allowed of [
      'bg-teal-500',
      'text-emerald-800',
      'shadow-[inset_0_0_0_1px_theme(colors.teal.500/50%)]',
      'skyline-400', // not a ramp
    ]) {
      expect(Array.from(allowed.matchAll(RETIRED)), `${allowed} should be allowed`).toEqual([])
    }
  })

  it('reads the shared components, not just components/ui', () => {
    // The scope this guard shipped with named `components/ui`, which left the
    // onboarding, tags, demo and social-posts trees unswept — and a live
    // `bg-sky-500` in the welcome modal every new clinic sees.
    const rels = files.map((f) => f.slice(root.length + 1).split(BACKSLASH).join('/'))
    expect(rels).toContain('components/onboarding/welcome-modal.tsx')
    expect(rels).toContain('components/search-modal.tsx')
    // The portal and the public sites own their own palettes — still out.
    expect(rels.some((f) => f.startsWith('components/patient-portal/'))).toBe(false)
    expect(rels.some((f) => f.startsWith('components/clinic-site/'))).toBe(false)
  })

  it('the one exception still is what its reason says', () => {
    // An allowlist nobody re-reads becomes a place to hide things, so the
    // entry has to keep earning its exemption. The avatar rotations were
    // considered for one and did not need it: identity hues can be blue.
    expect(readFileSync(resolve(root, ALLOWED[0].file), 'utf8')).toContain('#1a0dab')
    expect(ALLOWED).toHaveLength(1)
  })
})
