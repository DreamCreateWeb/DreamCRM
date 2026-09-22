/**
 * THE ONE PLACE THIS REPO READS A COLOUR PAIR OUT OF A `className`.
 *
 * Seven source rules grade those pairs, and they share this scanner rather
 * than carrying one each: `dark-mode-parity.test.ts` (rule 1, the unpaired
 * `dark:` override), `token-contrast.test.ts` four times over — white on the
 * shallow end of the brand ramp as a solid fill (rule 2), white on a GRADIENT
 * that runs through it (rule 3), a background that IS the ink rather than the
 * fill (rule 4), and a solid tone fill that is not the registry's (rule 5) —
 * `quiet-ink.test.ts` (rule 6, a neutral ink declared for both themes with no
 * surface of its own), and `one-string-pairs.test.ts` (rule 7, the pair rule 1
 * hands back). A second copy of "which utility is the ink, which is the
 * surface, and is either one a wash" is how two guards start disagreeing about
 * the same line — the same reason `./palette` is the one place the ratios are
 * computed.
 *
 * RULES 1 AND 7 PARTITION ONE POPULATION between them rather than each
 * describing it, which is why `isParitySubject` is exported and read by both:
 * rule 1 has the chunk when exactly one half carries the override and every
 * participating utility is opaque, rule 7 has every other ink-and-surface
 * string. Rule 7 arrived last because rule 1's header argued the remainder was
 * somebody else's, and batch 64 measured 29 places where it was nobody's.
 *
 * Rules 3 and 4 are the two axe structurally cannot report, and they are the
 * same background read from opposite ends: rule 3 grades it as the SURFACE
 * under white text, rule 4 grades it as the INK when `bg-clip-text` makes it
 * the letterforms. Each one's trigger is the other's blind spot, which is why
 * rule 3 shipped with the homepage headline's 2.42 still live — and why rule 4
 * shipped one batch later seeing only the GRADIENT spelling of its own shape,
 * which DREAMCRM-63 closed by giving it the solid one.
 *
 * ── RULE 1: THE DARK-MODE PARITY SCANNER — the pair nobody measured.
 *
 * THE DEFECT SHAPE, from the run that found it. UI batch 58 fixed 44 places
 * painting white on `teal-500` (3.81:1). Three of them were ALSO failing in
 * dark mode and nobody had noticed: they carried `dark:text-gray-900` with no
 * `dark:bg-*` beside it, so the ink flipped to near-black while the fill
 * stayed teal-500, landing at 4.01. Fixing only the light side would have
 * driven those three DOWN to 3.01 — the fix and the invisible defect pointed
 * in opposite directions.
 *
 * That is the whole shape: **an element whose light and dark modes disagree
 * about which half of the pair gets overridden**. Override the ink and leave
 * the surface, or override the surface and leave the ink, and the dark
 * rendering pairs a colour somebody chose with a colour they were not looking
 * at. Nobody picked that combination; it fell out of the cascade.
 *
 * WHY THIS IS A SOURCE RULE AND NOT AN AXE STOP. axe measures what is on
 * screen, and the E2E suite walks one theme. Every dark-mode pairing in the
 * product is invisible to it — 44 instances of one of these lived on `main`
 * for months with a runtime contrast gate running over them nightly.
 * `token-contrast.test.ts` cannot see it either, and deliberately: it grades
 * the pairs the design system DECLARES (a semantic ink on a semantic surface,
 * a tone on its own wash), and it scopes to the unprefixed light spelling.
 * These pairs are declared nowhere — they are assembled in a `className`
 * string in a component.
 *
 * WHY IT MEASURES RATHER THAN JUST FLAGGING THE SHAPE. The structural rule on
 * its own matches 208 places in this repo and is wrong about nearly all of
 * them, because the commonest unpaired override is CORRECT: a tone wash
 * (`bg-amber-500/15 text-amber-800 dark:text-amber-300`) is alpha over
 * whatever surface the element landed on, so the surface is already
 * theme-aware and a `dark:bg-*` would be the mistake. A guard that fires on
 * 208 sites to catch 8 is a guard people switch off. So this one resolves both
 * renderings through `./palette` and reports only the pairs that actually miss
 * WCAG AA — the same numbers `token-contrast.test.ts` grades the design
 * system's own pairs with, out of the same module, so the two can never
 * disagree about a ratio.
 *
 * WHAT IT CAN SEE, stated so nobody mistakes it for a full contrast gate:
 *
 *   - OPAQUE Tailwind palette words only, on both halves — `bg-gray-100`,
 *     `text-white`. An alpha suffix in either spelling (`/15`, `/[0.08]`) is
 *     skipped: the real background is a composite over an ancestor this
 *     scanner cannot resolve from source, and it is also the shape that is
 *     usually right.
 *   - The BASE variant only. `hover:bg-*`, `dark:hover:bg-*`, `group-*` and
 *     the rest are states, not the resting pairing, and each would need its
 *     own ancestor context to grade honestly.
 *   - One quoted string at a time. That is the unit an element's classes are
 *     usually written in, INCLUDING each branch of a ternary — the conditional
 *     form is not a special case here, it is two chunks. Classes split across
 *     a template literal's static prefix and an interpolated branch are NOT
 *     joined, because the branches are mutually exclusive and joining them
 *     would invent pairings that never render together. That is a false
 *     NEGATIVE, which is the safe direction for a guard whose whole value is
 *     that a red run means something.
 *
 * Runtime axe stays the backstop for composition. This is the guard for the
 * one thing a single-theme browser suite structurally cannot look at.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  AA,
  contrast,
  DARK,
  LIGHT,
  luminance,
  ROOT,
  SURFACES,
  token,
  utilityColor,
  type Theme,
} from './palette'
import { TONE_FILL } from '@/lib/ui/encodings'

/** Where product UI lives. `lib/` is in because `lib/ui/encodings.ts` and the
 *  portal-brand helpers hand out class strings that render as UI. */
export const UI_ROOTS = ['app', 'components', 'lib']

/**
 * ONE spelling of each regex fragment, shared by every rule below.
 *
 * `BOUNDARY` is the load-bearing one: a `:` or `-` immediately before the
 * utility is not a boundary character, which is what keeps `hover:bg-gray-300`
 * and `dark:hover:bg-gray-700` out of rule 1, `group-hover:from-teal-400` out
 * of rule 3, and — the one that would be a silent false negative — stops
 * `bg-gradient-to-br` from being read as a `to-<colour>` stop. Both alpha
 * spellings Tailwind accepts are captured (`/15` and the arbitrary `/[0.08]`),
 * because both mean "this is a wash, not a surface".
 *
 * Single-homed rather than rebuilt per rule for the ordinary reason, and one
 * specific one: a second copy is where the double-backslash escaping goes
 * wrong, and a regex that has quietly stopped matching anything reports a
 * clean tree. Rule 3's first draft did exactly that.
 */
const BOUNDARY = '(?:^|[\\s\'"`{])'
const COLOUR_WORD = '([a-z]+-\\d{2,3}|white|black)'
const ALPHA = '(\\/(?:\\d+|\\[[^\\]]*\\]))?'
const NOT_IN_WORD = '(?![\\w-])'

/** A `text-…` / `bg-…` utility in its base or bare-`dark:` variant, capturing
 *  which spelling it is, the colour word, and any alpha suffix. */
function utility(prop: 'text' | 'bg'): RegExp {
  return new RegExp(`${BOUNDARY}(dark:)?${prop}-${COLOUR_WORD}${ALPHA}${NOT_IN_WORD}`, 'g')
}

type Utility = { dark: boolean; word: string; alpha: boolean; raw: string }

function utilities(chunk: string, prop: 'text' | 'bg'): Utility[] {
  const re = utility(prop)
  const out: Utility[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(chunk)) !== null) {
    out.push({
      dark: !!m[1],
      word: m[2],
      alpha: !!m[3],
      raw: `${m[1] ?? ''}${prop}-${m[2]}${m[3] ?? ''}`,
    })
  }
  return out
}

export type Pairing = {
  /** Which rendering this is. Rule 3 also grades the `hover:` renderings,
   *  because a gradient stop IS the surface under the ink — no ancestor
   *  needed to resolve it — and a hover that lightens back under the floor is
   *  exactly the shape this repo shipped. */
  theme: 'light' | 'dark' | 'light:hover' | 'dark:hover'
  ink: string
  surface: string
  ratio: number
}

export type ParityFinding = {
  /** Repo-relative path, forward slashes. */
  file: string
  /** 1-based. */
  line: number
  /** Which half carries the lone `dark:` override — `null` for rules 2 and 3,
   *  where the defect is the pairing itself rather than a disagreement about
   *  it. */
  overridden: 'ink' | 'surface' | null
  /** The participating classes, as written. */
  classes: string
  /** Only the renderings that MISS AA — one or both. */
  failures: Pairing[]
  /** What the rule that produced this finding calls the defect. */
  note?: string
}

function grade(
  theme: Theme,
  name: Pairing['theme'],
  ink: string,
  surface: string,
): Pairing | null {
  const fg = utilityColor(theme, ink)
  const bg = utilityColor(theme, surface)
  // A word this repo's palette does not define — an arbitrary value, or a ramp
  // step that does not exist. Not gradeable, so not graded.
  if (!fg || !bg) return null
  return { theme: name, ink, surface, ratio: contrast(fg, bg) }
}

/**
 * The four utilities a colour pair can be written with, pulled out of one
 * chunk. Single-homed because rules 1 and 7 partition the same four values
 * between them, and a second copy of "which one is the ink" is how a partition
 * turns into an overlap on one side and a gap on the other.
 */
type PairParts = {
  lightInk?: Utility
  darkInk?: Utility
  lightSurface?: Utility
  darkSurface?: Utility
}

function pairParts(classes: string): PairParts {
  const inks = utilities(classes, 'text')
  const surfaces = utilities(classes, 'bg')
  return {
    lightInk: inks.find((u) => !u.dark),
    darkInk: inks.find((u) => u.dark),
    lightSurface: surfaces.find((u) => !u.dark),
    darkSurface: surfaces.find((u) => u.dark),
  }
}

/**
 * Does rule 1 GRADE this chunk — exactly one half carrying the `dark:`
 * override, and every participating utility present and opaque?
 *
 * Exported because rule 7 is defined as the complement of it, and the two must
 * partition the population rather than each describing it. Read it as "rule 1
 * has this one"; everything else with an ink and a surface in the same string
 * is rule 7's. Note this says nothing about whether rule 1 REPORTS the chunk —
 * a graded pair that clears AA is silent, and correctly so.
 */
export function isParitySubject(classes: string): boolean {
  const { lightInk, darkInk, lightSurface, darkSurface } = pairParts(classes)
  if (!!darkInk === !!darkSurface) return false
  const parts = [lightInk, darkInk ?? lightInk, lightSurface, darkSurface ?? lightSurface]
  return parts.every((p) => !!p && !p.alpha)
}

/**
 * Grade one quoted class string. Returns a finding only when the chunk carries
 * an UNPAIRED `dark:` override across an opaque ink/surface pair AND at least
 * one of its two renderings misses AA.
 *
 * Exported so the guard's red run can feed it planted defects directly: an
 * absence assertion over a clean tree is indistinguishable from a scanner that
 * has quietly stopped looking, which is the lesson `e2e/axe-selftest.spec.ts`
 * exists to teach.
 */
export function gradeClasses(classes: string): Omit<ParityFinding, 'file' | 'line'> | null {
  const { lightInk, darkInk, lightSurface, darkSurface } = pairParts(classes)

  // Exactly one half overridden, every participating utility opaque. BOTH
  // overridden and NEITHER overridden are RULE 7's — this comment used to say
  // they were a pair somebody chose and a pair `token-contrast` already
  // covered, and batch 64 measured 29 places where both halves of that were
  // false. So is the alpha bail below: an override this rule declines to grade
  // is not thereby graded by nothing. See rule 7's header.
  if (!isParitySubject(classes)) return null

  const overridden: 'ink' | 'surface' = darkInk ? 'ink' : 'surface'

  // What each theme actually renders: the override where there is one, and the
  // unprefixed class — unchanged, which is the whole point — where there is not.
  const inkDark = darkInk ?? lightInk
  const surfaceDark = darkSurface ?? lightSurface

  const failures = [
    grade(LIGHT, 'light', lightInk!.word, lightSurface!.word),
    grade(DARK, 'dark', inkDark!.word, surfaceDark!.word),
  ].filter((p): p is Pairing => p !== null && p.ratio < AA)

  if (failures.length === 0) return null

  return {
    overridden,
    classes: [lightInk, darkInk, lightSurface, darkSurface]
      .filter((u): u is Utility => !!u)
      .map((u) => u.raw)
      .join(' '),
    failures,
  }
}

/** Every quoted string on a line — the unit an element's classes are written in. */
function quotedChunks(line: string): string[] {
  return line.match(/(["'`])[^"'`]*\1/g) ?? []
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

/**
 * Visit every quoted string in the product source. The one tree walk both
 * rules below share, so they can never end up looking at different files.
 */
export function eachClassString(
  roots: string[],
  visit: (file: string, line: number, chunk: string) => void,
): void {
  for (const root of roots) {
    for (const path of walk(join(ROOT, root))) {
      const file = relative(ROOT, path).replace(/\\/g, '/')
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const chunk of quotedChunks(line)) visit(file, i + 1, chunk)
        })
    }
  }
}

/** Every unpaired-override pairing in the product source that misses AA. */
export function scanForParityFailures(roots: string[] = UI_ROOTS): ParityFinding[] {
  const found: ParityFinding[] = []
  eachClassString(roots, (file, line, chunk) => {
    const graded = gradeClasses(chunk)
    if (graded) found.push({ file, line, ...graded })
  })
  return found
}

/** One finding as a line a person reading a red CI log can act on. */
export function describeFinding(f: ParityFinding): string {
  const where = f.failures
    .map((p) => `${p.theme}: ${p.ink} on ${p.surface} = ${p.ratio.toFixed(2)}`)
    .join('; ')
  const why =
    f.note ??
    (f.overridden ? `only the ${f.overridden} carries a dark: override` : 'white on a shallow brand fill')
  return `${f.file}:${f.line} — ${why} (${f.classes}) — ${where}`
}

/* ── RULE 2: white on the shallow end of the brand ramp ──────────────────── */

/**
 * The steps of the brand ramp that are NOT white-text fills.
 *
 * Derived, never transcribed: `token-contrast.test.ts` asserts that these two
 * really do sit below AA and that teal-600 and deeper clear it, so the cutoff
 * comes out of the palette rather than out of somebody's memory of it.
 */
export const SHALLOW_BRAND_FILLS = ['teal-400', 'teal-500']

export type BrandFillExemption = { file: string; classes: string; why: string }

/**
 * The one place white-on-shallow-brand is allowed, and the reason.
 *
 * A LIST OF EXACT CLASS STRINGS rather than a file or a rule switch, for the
 * same reason `DECORATIVE_MOCKS` in `e2e/axe.ts` pairs a structural hook with
 * `aria-hidden` instead of exempting every hidden node: an exemption should
 * name WHAT is exempt, so it stops describing anything the moment the thing it
 * describes changes. `deadBrandFillExemptions` below is the detector, and
 * `token-contrast.test.ts` asserts on it — an exemption outliving its subject
 * is how a narrow allowance becomes a blanket pardon.
 *
 * AND ITS PREMISE IS ASSERTED SEPARATELY (DREAMCRM-63), because the detector
 * only asks whether the entry still MATCHES. The `why` below rests on two
 * facts — the mock marks itself `aria-hidden`, and those bars are a designed
 * teal-200/300/400/600 progression — and either can stop being true while the
 * class string carries on matching. "The exempted bar is still an aria-hidden
 * picture, inside its progression" in `token-contrast.test.ts` grades both.
 */
export const BRAND_FILL_EXEMPTIONS: BrandFillExemption[] = [
  {
    file: 'components/marketing/ui.tsx',
    classes: 'bg-teal-400 text-white',
    why:
      'RecallFunnelMock is an aria-hidden decorative illustration whose ' +
      'teal-200/300/400/600 bars are a designed progression, not a control. ' +
      'WCAG 1.4.3 exempts text that is part of a picture; restyling one bar to ' +
      'reach 4.5:1 would break the progression and help nobody. Left ' +
      'deliberately by UI batch 58 and recorded in docs/UI-BEST-VERSION.md.',
  },
]

function isExempt(file: string, chunk: string): boolean {
  return BRAND_FILL_EXEMPTIONS.some((e) => e.file === file && chunk.includes(e.classes))
}

/** Which exemptions no longer match anything — i.e. describe a site that has gone. */
export function deadBrandFillExemptions(roots: string[] = UI_ROOTS): BrandFillExemption[] {
  const alive = new Set<BrandFillExemption>()
  eachClassString(roots, (file, _line, chunk) => {
    for (const e of BRAND_FILL_EXEMPTIONS) {
      if (e.file === file && chunk.includes(e.classes)) alive.add(e)
    }
  })
  return BRAND_FILL_EXEMPTIONS.filter((e) => !alive.has(e))
}

/**
 * Every place painting white text on `teal-400`/`teal-500`, in EITHER theme.
 *
 * WHY THIS ARRIVED LATE. UI batch 58 fixed 44 of these, and its write-up said
 * this guard shipped alongside the fix — in `e2e/axe-baseline.ts`, in
 * `docs/UI-BEST-VERSION.md`, and in the punch-list entry that struck the item.
 * It did not. `token-contrast.test.ts` gained only the POSITIVE assertion that
 * teal-600 and deeper are safe, which grades the palette and can never fail on
 * a call site. The product fix was real and is complete — this scanner finds
 * zero — but the repo spent four days believing a rule defended it that was
 * not there, which is worse than knowing the ground is open. Same class of
 * miss as batch 57's red run that passed. (DREAMCRM-34.)
 *
 * Why the rule is worth having at all: `--color-teal-500` was labelled
 * "primary fill (light)" in the stylesheet AND in DESIGN-SYSTEM.md, so 44
 * places did exactly what the label said. Both labels are corrected now — but
 * a label is a thing a person reads, and a guard is not.
 */
export function scanForWhiteOnShallowBrand(roots: string[] = UI_ROOTS): ParityFinding[] {
  const found: ParityFinding[] = []
  eachClassString(roots, (file, line, chunk) => {
    const inks = utilities(chunk, 'text')
    const surfaces = utilities(chunk, 'bg')
    const lightInk = inks.find((u) => !u.dark)
    const lightSurface = surfaces.find((u) => !u.dark)

    const themes: ['light' | 'dark', Utility | undefined, Utility | undefined][] = [
      ['light', lightInk, lightSurface],
      ['dark', inks.find((u) => u.dark) ?? lightInk, surfaces.find((u) => u.dark) ?? lightSurface],
    ]

    for (const [theme, ink, surface] of themes) {
      if (!ink || !surface || ink.alpha || surface.alpha) continue
      if (ink.word !== 'white' || !SHALLOW_BRAND_FILLS.includes(surface.word)) continue
      if (isExempt(file, chunk)) continue
      const graded = grade(theme === 'light' ? LIGHT : DARK, theme, ink.word, surface.word)
      if (!graded) continue
      found.push({
        file,
        line,
        overridden: null,
        classes: `${ink.raw} ${surface.raw}`,
        failures: [graded],
      })
    }
  })
  return found
}

/* ── RULE 3: white on a gradient that runs through the shallow brand ramp ─── */

/**
 * THE ONE CONTRAST DEFECT NO GATE IN THIS REPO COULD SEE.
 *
 * axe reports a gradient fill as **incomplete**, not as a violation — it will
 * not guess which pixel-column to measure — so `e2e/axe-baseline.ts` has never
 * carried a gradient and never will. Rule 2 above cannot see one either: it
 * reads `bg-<ramp>-<step>`, and a gradient names its fill with
 * `from-`/`via-`/`to-`. The product's single most prominent element sat in that
 * gap for the whole program. `ActionButton`'s primary was
 * `from-teal-400 to-teal-600` under white text — 2.42 at the light end, 3.46 at
 * the midpoint, 4.19 at 75%, and only the last pixel-column clearing at 5.09 —
 * measured by hand on DREAMCRM-28 because nothing automated was looking.
 *
 * The rule: **if white rides a gradient, every stop it names must be a
 * white-text fill.** Grading the stops rather than the span is the honest
 * simplification — the ramp is monotonic in lightness, so a span between two
 * legal stops is legal throughout, and a span that touches an illegal stop
 * fails somewhere regardless of where exactly.
 *
 * WHAT IT SEES that rule 1 deliberately does not: the `hover:` renderings.
 * A gradient stop is the surface directly under the ink, so no ancestor has to
 * be resolved to grade it — and the defect this rule was written for HAD a
 * hover half (`hover:from-teal-500`, 3.82) that deepening the resting state
 * alone would have left behind. `dark:` and `dark:hover:` resolve per position
 * over the base stops, the way the cascade does.
 *
 * WHAT IT DOES NOT SEE, so a green run is not mistaken for proof:
 *
 *   - Alpha stops (`from-teal-500/65`). Composited over an ancestor this
 *     scanner cannot resolve — the same exclusion rule 1 makes, for the same
 *     reason.
 *   - Variants other than `dark:` / `hover:` / `dark:hover:` — `group-hover:`
 *     and friends depend on an ancestor's state, and the only ones in the tree
 *     are alpha chart bars with no text on them.
 *   - A gradient and its ink in DIFFERENT quoted strings. `call-session.tsx`
 *     puts the gradient on the `<a>` and `text-white` on a child `<span>`; its
 *     hover was lightening to teal-500 and this rule would not have caught it
 *     (batch 61 fixed it by hand). A false negative, which is the safe
 *     direction for a guard whose value is that red means something.
 *   - Any chunk carrying a `hover:text-*`, whose hover ink this scanner does
 *     not resolve. The hover renderings are skipped there rather than graded
 *     against the resting ink.
 */
const GRADIENT_VARIANTS = ['', 'dark:', 'hover:', 'dark:hover:'] as const
type GradientVariant = (typeof GRADIENT_VARIANTS)[number]
type Position = 'from' | 'via' | 'to'

type Stop = { variant: GradientVariant; position: Position; word: string; alpha: boolean; raw: string }

/**
 * A gradient-stop utility in the four variants above.
 *
 * The leading boundary is doing real work here: `bg-gradient-to-br` and
 * `bg-linear-to-r` both contain `to-br`/`to-r`, and a `-` immediately before
 * `to-` is not a boundary character, so the direction keyword cannot be read as
 * a stop. It is also what keeps `group-hover:from-teal-500` out — there is no
 * whitespace or quote inside that token for a match to start at.
 */
function gradientStops(chunk: string): Stop[] {
  const re = new RegExp(
    `${BOUNDARY}((?:dark:)?(?:hover:)?)(from|via|to)-${COLOUR_WORD}${ALPHA}${NOT_IN_WORD}`,
    'g',
  )
  const out: Stop[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(chunk)) !== null) {
    out.push({
      variant: m[1] as GradientVariant,
      position: m[2] as Position,
      word: m[3],
      alpha: !!m[4],
      raw: `${m[1]}${m[2]}-${m[3]}${m[4] ?? ''}`,
    })
  }
  return out
}

/** The stops a given rendering actually paints — later variants override the
 *  base per position, exactly as the cascade resolves them. */
function stopsFor(stops: Stop[], layers: GradientVariant[]): Stop[] {
  const byPosition = new Map<Position, Stop>()
  for (const layer of layers) {
    for (const s of stops.filter((s) => s.variant === layer)) byPosition.set(s.position, s)
  }
  return Array.from(byPosition.values())
}

const HOVER_INK = /hover:text-(?:[a-z]+-\d{2,3}|white|black)(?![\w-])/

/**
 * Grade one quoted class string against rule 3.
 *
 * Exported for the same reason `gradeClasses` is: an absence assertion over a
 * clean tree cannot tell a guard that is looking from one that has quietly
 * stopped, so the test feeds this planted defects in every shape it claims to
 * catch — `via`, the `dark:` override, the `hover:` half, the alpha skip.
 */
export function gradeGradientClasses(
  classes: string,
): Omit<ParityFinding, 'file' | 'line'> | null {
  const stops = gradientStops(classes)
  if (stops.length === 0) return null

  const inks = utilities(classes, 'text')
  const lightInk = inks.find((u) => !u.dark)
  const darkInk = inks.find((u) => u.dark)

  const renderings: [Pairing['theme'], Utility | undefined, GradientVariant[]][] = [
    ['light', lightInk, ['']],
    ['dark', darkInk ?? lightInk, ['', 'dark:']],
    ['light:hover', lightInk, ['', 'hover:']],
    ['dark:hover', darkInk ?? lightInk, ['', 'dark:', 'hover:', 'dark:hover:']],
  ]

  const failures: Pairing[] = []
  const participating = new Set<string>()
  for (const [name, ink, layers] of renderings) {
    if (!ink || ink.alpha || ink.word !== 'white') continue
    if (name.endsWith('hover') && HOVER_INK.test(classes)) continue
    for (const stop of stopsFor(stops, layers)) {
      if (stop.alpha || !SHALLOW_BRAND_FILLS.includes(stop.word)) continue
      const graded = grade(name.startsWith('dark') ? DARK : LIGHT, name, ink.word, stop.word)
      if (!graded) continue
      failures.push(graded)
      participating.add(stop.raw)
      participating.add(ink.raw)
    }
  }
  if (failures.length === 0) return null

  return {
    overridden: null,
    classes: Array.from(participating).join(' '),
    failures,
    note: 'white text rides a gradient through the shallow brand ramp',
  }
}

/**
 * Every place in the product painting white text on a gradient that names
 * `teal-400` or `teal-500`.
 *
 * Holds at ZERO with no ceiling and no exemption, deliberately — the same
 * reason rule 1 does. A number here would be room for the next one to hide in,
 * and this is the one defect class where nothing else in the repo is looking.
 * Batch 61 moved five call sites (the primary button and its breath skin, the
 * active sidebar pill, the prospecting hero band, the Studio AI send button)
 * onto `teal-600` and deeper, which is where a white label has always belonged.
 */
export function scanForWhiteOnShallowBrandGradient(roots: string[] = UI_ROOTS): ParityFinding[] {
  const found: ParityFinding[] = []
  eachClassString(roots, (file, line, chunk) => {
    const graded = gradeGradientClasses(chunk)
    if (graded) found.push({ file, line, ...graded })
  })
  return found
}

/* ── RULE 4: CLIPPED TEXT, where the background IS the ink ──────────────── */

/**
 * THE FOURTH BLIND SPOT IN THE SAME FAMILY, and the one rule 3 walks straight
 * past on purpose.
 *
 * `bg-clip-text text-transparent` inverts the relationship every rule above
 * assumes. There is no `text-<colour>` to read — the ink is deliberately
 * transparent — and the BACKGROUND, which rule 3 grades as the SURFACE under
 * white text, is painting the letterforms themselves. That background is
 * either a gradient (`from-`/`via-`/`to-`) or a solid `bg-<colour>`; both
 * spell the same defect, and since DREAMCRM-63 rule 4 grades both. So:
 *
 *   - axe reports a gradient as `incomplete` and never grades it, exactly as
 *     for rule 3. `marketing: home` holds ZERO in `e2e/axe-baseline.ts` with
 *     this defect live on it, which is what "incomplete is not fine" looks
 *     like from the other end.
 *   - Rule 2 reads `bg-<ramp>-<step>` paired with `text-white`, and the ink
 *     here is `text-transparent`. It misses the solid spelling as squarely as
 *     the gradient one — which is why the solid spelling needed rule 4 rather
 *     than a widening of rule 2.
 *   - Rule 3 requires `text-white` to anchor on, and there is none — its own
 *     "stays quiet" test pins clipped text as returning null. That was
 *     correct for rule 3 and it was also the hole: nothing else was looking.
 *
 * THE DEFECT, from the run that found it (DREAMCRM-44). The homepage headline's
 * second line — "One calm system." — ran `from-teal-600 to-teal-400` as gradient
 * text on the marketing layout's hard-coded white ground. The `from-` end reads
 * at 5.09; the `to-` end is 2.42, so the last words of the product's most-read
 * headline faded into the page. It is now `from-teal-700 to-teal-600`.
 *
 * THE RULE: **every colour a clipped-text chunk paints its letterforms with
 * must read as INK on the light ground** — each stop of a gradient, or the one
 * solid fill. Graded stop-by-stop for the same reason rule 3 grades stops:
 * the ramp is monotonic in lightness, so a span between two legal stops is
 * legal throughout, and a span touching an illegal stop fails somewhere no
 * matter where exactly the failure lands. Every ratio is measured through
 * `./palette` — nothing here is transcribed, and the symmetry of the WCAG
 * formula means the legal ink steps on white come out identical to rule 2's
 * legal white-text fills without either list being copied.
 *
 * WHAT IT GRADES AGAINST: `surface-1` (#F8FAFF) — **changed from plain
 * `white` on DREAMCRM-87**, and the paragraph this replaces asked to be come
 * back to rather than raised around, so here is the coming back.
 *
 * THE ORIGINAL ARGUMENT, and which half of it survived. It graded against
 * white for two reasons: white is the ground actually under the one clipped
 * site in the tree, and it kept rule 4's cutoff identical to rule 2's rather
 * than opening a third opinion about which teal step is legal. The second was
 * the one that decided it, and the stated cost was a bounded gap — "gradient
 * text on `canvas` (4.74 at teal-600) or `surface-sunk` (4.45) is graded a
 * little more kindly than it deserves. No such site exists; if one lands, this
 * is the paragraph to come back to."
 *
 * WHAT CAME BACK WAS NOT A SITE BUT A STOP (Forge's #611 intake, carried on
 * `docs/UI-BEST-VERSION.md` since). **`fuchsia-600` is 4.66 on white and 4.46
 * on `surface-1`.** It PASSES this rule and fails the page — and it is not a
 * hypothetical colour: it is one step off the terminal stop of the signature
 * gradient, the treatment that runs as clipped text in the homepage headline
 * and as a rule under every `PageHero` on the site. `app/(marketing)/page.tsx`
 * carries a comment naming it "the trap" and saying it is NOT used, which is
 * a person holding a line a rule should hold. That is `BRAND.md` Part 7's
 * "4.18 reads as nearly fine" wearing a light-ground costume.
 *
 * WHY `surface-1` AND NOT `surface-sunk`. The old objection to grading against
 * the worst light surface was exactly right and still is: `teal-600` is 4.45
 * on `surface-sunk`, so that version would outlaw the step DESIGN-SYSTEM.md
 * calls the shallowest legal one. `surface-1` is a different number and it is
 * the marketing site's SECOND ground — 13 sites spell `bg-[#F8FAFF]` under
 * `app/(marketing)` and `components/marketing` — so it is a ground clipped
 * text can actually land on, not a worst case borrowed from a dashboard well.
 *
 * AND THE BRAND-RAMP CUTOFF DOES NOT MOVE, which is what keeps "one number,
 * three rules" true where that phrase was load-bearing. `teal-600` is 5.09 on
 * white and **4.88** on `surface-1` — legal on both; `teal-500` is 3.82 and
 * 3.66 — illegal on both. Across this repo's whole resolved palette exactly
 * **four** words change verdict between the two grounds, and not one is on the
 * brand ramp: `fuchsia-600` (4.66 → 4.46), `indigo-500` (4.58 → 4.38),
 * `pink-600` (4.54 → 4.35), `rose-600` (4.53 → 4.34). `token-contrast.test.ts`
 * re-derives that list from the palette and asserts the ramp's invariance,
 * rather than either being trusted from this comment.
 *
 * The residual gap is now `surface-sunk` (4.45 at teal-600) and it is smaller
 * and named the same way. Nothing in the tree paints clipped text there; if
 * something does, this is still the paragraph rather than a ceiling.
 *
 * WHAT IT DOES NOT SEE, so a green run is not mistaken for proof:
 *
 *   - **The dark rendering.** In dark mode the grounds invert and so does the
 *     legal end of the ramp, and a base stop with no `dark:` override renders
 *     over a deep navy. Every `bg-clip-text` in this tree is in the marketing
 *     layout, which hard-codes `bg-white text-gray-950` and has no `.dark`
 *     scope at all, so grading a dark rendering here would report a defect
 *     that cannot render. A clipped-text site that IS theme-aware needs this
 *     rule widened, not exempted.
 *   - `hover:` stops, for the same reason — no resting ground to resolve them
 *     against that is any more knowable than the base one.
 *   - Alpha backgrounds, and colour words this palette does not define — the
 *     same exclusions rules 1 and 3 make. An arbitrary hex (`bg-[#6C9CFF]`)
 *     falls out here too: `COLOUR_WORD` reads Tailwind palette words, so a
 *     clipped headline painted with a raw hex is invisible to this rule. That
 *     is the shape to widen for if one ever lands, not a ceiling to raise.
 *   - A background and its `bg-clip-text` in DIFFERENT quoted strings. One
 *     quoted string is the unit, as everywhere else in this file.
 *
 * WHAT IT DOES SEE THAT IT DID NOT, and the reason this section was rewritten
 * (DREAMCRM-63). Rule 4 shipped requiring a base-variant `from-`/`via-`/`to-`
 * stop, so `bg-teal-400 bg-clip-text text-transparent` was graded by NOTHING:
 * rule 4 wanted a gradient, rule 2 wants `ink.word === 'white'` and the ink
 * here is `transparent`, rule 3 wants a `text-white` to anchor on, and axe
 * cannot see a clipped background at all. That chunk paints teal-400
 * letterforms on white at 2.42 — the same number that started DREAMCRM-44 —
 * and it is rule 4's now, through `clippedInks` below. Zero instances existed
 * when it was closed, which is the cheapest this was ever going to be, and it
 * is rule 4's own lesson finally applied to rule 4: when you write a rule for
 * a shape, write down what the shape's inverse would do to it — then close it
 * rather than filing it.
 *
 * A site genuinely riding a DARK band — the marketing footer is the shape that
 * exists — would fail this rule correctly-in-form and wrongly-in-fact. That is
 * what `CLIPPED_TEXT_EXEMPTIONS` is for.
 *
 * **IT IS EMPTY AGAIN, AND THAT IS THE INTERESTING PART** (DREAMCRM-69,
 * 2026-09-15). It carried exactly one entry for one day: the homepage hero was
 * the night band of `BRAND.md`'s Night Dream direction (`bg-gray-950`,
 * #10182e) and its headline accent ran `from-teal-300 to-violet-300`, which
 * this rule grades on WHITE at 1.88 and 2.03 and which measured 9.36 and 8.69
 * on the ground they actually painted on. The owner then reversed the dark
 * hero (DREAMCRM-67) and the ground under those stops became white for real.
 *
 * **The exemption was DELETED rather than re-pointed, and rule 4 was not
 * touched.** On white, 1.88 and 2.03 are not a grading error, they are the
 * page; weakening rule 4 to keep a green run would have re-opened the 2.42
 * headline DREAMCRM-44 closed. The replacement headline runs
 * `from-teal-600 via-violet-700 to-fuchsia-700` — 5.09, 6.14 and 6.27 as ink
 * on white — so it is graded by this rule and PASSES it, which is the state
 * an exemption is supposed to be a detour from.
 *
 * The removal was not noticed by reading the diff. Both halves of the guard in
 * `token-contrast.test.ts` went red naming the entry the moment the hero
 * turned white — the dead-exemption detector because the class string stopped
 * matching, and the PREMISE assertion because no `<section>` in that file
 * carried the night ground any more. `BRAND.md` Part 7 predicted that red run
 * in writing before it happened. The discipline for a future entry is
 * unchanged and written on the list itself.
 */
const CLIP_TEXT = /bg-clip-text(?![\w-])/
const TRANSPARENT_INK = new RegExp(`${BOUNDARY}text-transparent${NOT_IN_WORD}`)

/**
 * The ground rule 4 grades clipped letterforms against — the marketing site's
 * raised panel, not plain white. Exported so the test grades the same token
 * this rule does rather than a copy of it; the header above carries the
 * measurement and the four palette words it moves.
 */
export const CLIPPED_TEXT_GROUND = 'surface-1'

export type ClippedTextExemption = { file: string; classes: string; why: string }

/**
 * Clipped-text sites that deliberately ride something other than a light
 * ground — a dark band inside a light page, say.
 *
 * THE SITE THIS LIST WAS BUILT FOR EXISTED FOR ONE DAY (DREAMCRM-54 →
 * DREAMCRM-69, both 2026-09-15). The paragraph above predicted it in the
 * abstract — "a site genuinely riding a DARK band would fail this rule
 * correctly-in-form and wrongly-in-fact" — the homepage hero became that site
 * when the night band shipped, and stopped being it when the owner reversed
 * the dark hero. The entry was deleted with the band. Its full story is in the
 * rule-4 header above, and it is the one worth reading before writing a new
 * one, because it is the whole lifecycle in a day: predicted, used, retired.
 *
 * READ THIS BEFORE ADDING AN ENTRY. An exemption here is not "this rule is
 * inconvenient", it is "this rule is grading against the wrong ground, and
 * here is the ground it is actually on, measured". The right shape is:
 *
 *   1. Watch the red run FIRST and read the ratios it reports on white.
 *   2. Measure the stops against the ground that is really there.
 *   3. Put BOTH numbers in the `why`, and have a test re-derive the second
 *      set from the palette rather than trusting the comment.
 *   4. ASSERT THE PREMISE, not just the subject. The dead-exemption detector
 *      below only asks whether the class string still matches something; an
 *      exemption that describes the ink but not the GROUND goes on pardoning
 *      a 1.88 headline after the reason for it has gone. The night-band entry
 *      shipped with a structural premise assertion beside it in
 *      `token-contrast.test.ts`, and that assertion is what went red — by
 *      name, on the day the ground changed — rather than leaving a pardon
 *      behind for whatever landed there next. Copy that, not just the row.
 *
 * What would NOT be legitimate: an entry whose `why` says the design is
 * important, or one that names a ground no element actually has. Rule 4 is
 * right about every `bg-clip-text` in the tree today.
 */
export const CLIPPED_TEXT_EXEMPTIONS: ClippedTextExemption[] = []

/** Which clipped-text exemptions no longer match anything. */
export function deadClippedTextExemptions(roots: string[] = UI_ROOTS): ClippedTextExemption[] {
  const alive = new Set<ClippedTextExemption>()
  eachClassString(roots, (file, _line, chunk) => {
    for (const e of CLIPPED_TEXT_EXEMPTIONS) {
      if (e.file === file && chunk.includes(e.classes)) alive.add(e)
    }
  })
  return CLIPPED_TEXT_EXEMPTIONS.filter((e) => !alive.has(e))
}

type ClippedInk = { word: string; alpha: boolean; raw: string }

/**
 * THE PAINT THAT BECOMES THE LETTERFORMS, base rendering only — the gradient's
 * stops when there is a gradient, and the solid `bg-<colour>` when there is
 * not.
 *
 * The `fill` half is what closed this rule's own inverse (DREAMCRM-63). Rule 4
 * shipped requiring a base `from-`/`via-`/`to-` stop, which left
 * `bg-teal-400 bg-clip-text text-transparent` graded by NOTHING — 2.42
 * letterforms on white, the same number that started DREAMCRM-44, past all
 * four gates at once. Everything else about the rule is unchanged: the ground
 * is still white, the cutoff is still rule 2's, and the stops are still graded
 * one at a time.
 *
 * WHY THE GRADIENT WINS WHEN BOTH ARE PRESENT, rather than both being graded.
 * `bg-clip-text` clips every background layer, and a `background-image` paints
 * OVER the `background-color` — so a solid fill sitting under a gradient is a
 * fallback nobody sees, and grading it would fail a call site for a colour
 * that never reaches the screen. The `bg-<colour>` is the ink only when it is
 * the only background there is. Same false-NEGATIVE direction the rest of this
 * file takes when it cannot be sure.
 */
function clippedInks(classes: string): { shape: 'gradient' | 'fill'; inks: ClippedInk[] } {
  const stops = stopsFor(gradientStops(classes), [''])
  if (stops.length > 0) {
    return {
      shape: 'gradient',
      inks: stops.map((s) => ({ word: s.word, alpha: s.alpha, raw: s.raw })),
    }
  }
  // `utilities` reads `bg-<colour-word>`, and neither `bg-clip-text` nor
  // `bg-gradient-to-br` is one: COLOUR_WORD needs digits or the literal
  // white/black, so the two utilities that spell this shape cannot be misread
  // as its fill.
  const fill = utilities(classes, 'bg').find((u) => !u.dark)
  return { shape: 'fill', inks: fill ? [{ word: fill.word, alpha: fill.alpha, raw: fill.raw }] : [] }
}

/** Is this chunk clipped text at all — a background made the ink, gradient or
 *  solid? Exported so the test can assert the rule still points at something —
 *  a rule narrowed until it matches nothing reports CLEAN forever. */
export function isClippedText(classes: string): boolean {
  return (
    CLIP_TEXT.test(classes) && TRANSPARENT_INK.test(classes) && clippedInks(classes).inks.length > 0
  )
}

/**
 * Grade one quoted class string against rule 4.
 *
 * Exported for the same reason `gradeClasses` and `gradeGradientClasses` are:
 * the zero assertion cannot tell a scanner that is looking from one that has
 * quietly stopped, so the test feeds this every shape it claims to catch.
 */
export function gradeClippedTextClasses(
  classes: string,
): Omit<ParityFinding, 'file' | 'line'> | null {
  if (!isClippedText(classes)) return null

  const { shape, inks } = clippedInks(classes)
  const failures: Pairing[] = []
  const participating = new Set<string>()
  for (const ink of inks) {
    if (ink.alpha) continue
    // The background is the INK and the page is the ground — the inverse of
    // every other rule in this file, which is the whole point of rule 4
    // existing. The ground is `surface-1` rather than white since DREAMCRM-87;
    // the header above has the measurement and the four words it moves.
    const graded = grade(LIGHT, 'light', ink.word, CLIPPED_TEXT_GROUND)
    if (!graded || graded.ratio >= AA) continue
    failures.push(graded)
    participating.add(ink.raw)
  }
  if (failures.length === 0) return null

  return {
    overridden: null,
    classes: Array.from(participating).join(' '),
    failures,
    note:
      shape === 'gradient'
        ? 'the gradient IS the ink here (bg-clip-text), and a stop is too pale to read'
        : 'the solid fill IS the ink here (bg-clip-text), and it is too pale to read',
  }
}

/**
 * Every clipped-text site in the product painting its letterforms too pale to
 * read on a light ground.
 *
 * Holds at ZERO with no ceiling, the same as rules 1 and 3 — and for a sharper
 * version of the same reason. This is the one contrast shape where BOTH the
 * browser gate and the three source rules above were structurally blind, so a
 * number here would be room in the only room nothing else can see into.
 */
export function scanForUnreadableClippedText(roots: string[] = UI_ROOTS): ParityFinding[] {
  const found: ParityFinding[] = []
  eachClassString(roots, (file, line, chunk) => {
    if (CLIPPED_TEXT_EXEMPTIONS.some((e) => e.file === file && chunk.includes(e.classes))) return
    const graded = gradeClippedTextClasses(chunk)
    if (graded) found.push({ file, line, ...graded })
  })
  return found
}

/** Every clipped-text site, graded or clean — the instrument's field of view. */
export function clippedTextSites(roots: string[] = UI_ROOTS): { file: string; line: number }[] {
  const found: { file: string; line: number }[] = []
  eachClassString(roots, (file, line, chunk) => {
    if (isClippedText(chunk)) found.push({ file, line })
  })
  return found
}

/* ── RULE 5: a solid tone fill must be the registry's, not a fresh guess ──── */

/**
 * THE RULE THAT GRADES A DECISION RATHER THAN A RATIO.
 *
 * Rules 1–4 all ask the same question — does this pair clear 4.5:1 — and a
 * call site can answer it any number of ways. That is exactly how the product
 * ended up with white on `amber-500` (2.13) in the sidebar count badge, dark
 * ink on `amber-500` (7.18) in the messaging badge four files away, and white
 * on `violet-600` (4.42) on five "let the AI do it" buttons: nobody was wrong
 * on purpose, there was just nowhere to look up the answer. UI batch 59 picked
 * this shape four times and reached two answers. (DREAMCRM-52.)
 *
 * So this rule does not ask whether a solid tone fill CLEARS. It asks whether
 * it is `TONE_FILL` — the registry entry in `lib/ui/encodings.ts` that now
 * single-homes "a solid fill with a label on it", the way `TONE_PILL` homes the
 * wash and `TONE_DOT` homes the swatch. A pairing that clears AA by its own
 * route still fails here, deliberately: a second passing answer is how a single
 * source of truth stops being one. That also makes the rule follow the registry
 * rather than a transcription of it — re-measure a tone, edit `TONE_FILL`, and
 * every call site is re-graded against the new answer on the next run.
 *
 * WHAT COUNTS AS A SOLID TONE FILL, mechanically: an OPAQUE `bg-<ramp>-<step>`
 * on one of the six tone ramps at a FILL step, in a chunk that also carries an
 * opaque `text-*`. Both ends of that are deliberately narrow:
 *
 *   - `FILL_STEPS` is 300–600. The 50/100/200 end is a tone WASH — the opaque
 *     spelling of what `TONE_PILL` does with `bg-<ramp>-500/15` — and eight
 *     live sites pair it with the tone's own deep ink and read fine. The 700+
 *     end is a dark band, whose ink is white for the same reason a footer's is.
 *     Neither is the shape this rule is about, and sweeping them in would fire
 *     on a dozen correct sites to catch nothing — the "208 places to catch 8"
 *     failure rule 1's header describes, which is how a guard gets switched
 *     off.
 *   - `gray` is in, at those steps only. It is both the neutral TONE ramp and
 *     the SURFACE ramp, so `bg-gray-100` and `bg-gray-800` are surfaces and sit
 *     outside the window by the same cut; `bg-gray-400` with a label on it is
 *     `TONE_FILL.neutral` and nothing else.
 *
 * The brand ramp is NOT here. `teal` is identity, never a status, and it has
 * rules 2 and 3 already; grading it twice is how two guards start reporting the
 * same line differently.
 *
 * WHAT IT CANNOT SEE, the same false-negative direction as every rule above: a
 * fill and its ink written in different quoted strings (`call-session.tsx` is
 * that shape for rule 3), a fill assembled through a variable, and the `hover:`
 * fill of an interactive chip — `TONE_FILL_HOVER` is graded in the registry by
 * `token-contrast.test.ts` instead, since a hover class carries no ink of its
 * own to pair with.
 */
const TONE_FILL_RAMPS = ['emerald', 'amber', 'rose', 'violet', 'fuchsia', 'gray']
const FILL_STEPS = [300, 400, 500, 600]

export type ToneFillExemption = { file: string; classes: string; why: string }

/**
 * Solid tone fills that are deliberately not the registry's, and why.
 *
 * Exact class strings rather than files, for the reason
 * `public-action-tenancy.test.ts` learned the hard way: a file-wide exemption
 * is a door. `deadToneFillExemptions` below is the detector that stops one
 * outliving its subject.
 *
 * AND ITS PREMISE IS ASSERTED SEPARATELY (DREAMCRM-63). Read the `why` below
 * and notice it never claims the string exists somewhere — it claims the
 * pairing is already decided in ONE place, `VARIANT_CLASSES`, and that it
 * clears AA at 4.53. Copy the string onto an ad-hoc element in the same file
 * and the detector stays green while the argument is gone; re-point `rose-600`
 * and the pardon covers a fill under the floor. Both facts are graded in
 * `token-contrast.test.ts`, structurally and numerically.
 */
export const TONE_FILL_EXEMPTIONS: ToneFillExemption[] = [
  {
    file: 'components/ui/action-button.tsx',
    classes: 'bg-rose-600 hover:bg-rose-700 text-white',
    why:
      "ActionButton's `danger` variant. VARIANT_CLASSES is the design system's " +
      'own single home for a BUTTON fill — TONE_FILL homes the tone CHIP — so ' +
      'this pairing is already decided in one place rather than being a fresh ' +
      'guess, which is the thing this rule exists to stop. It clears AA, but ' +
      'only at 4.53 against a 4.5 floor, which is the margin TONE_PILL calls a ' +
      'coincidence rather than a margin; recorded in docs/UI-BEST-VERSION.md so ' +
      'it stays a decision somebody can revisit and not a silent pass.',
  },
]

/** Which tone-fill exemptions no longer match anything. */
export function deadToneFillExemptions(roots: string[] = UI_ROOTS): ToneFillExemption[] {
  const alive = new Set<ToneFillExemption>()
  eachClassString(roots, (file, _line, chunk) => {
    for (const e of TONE_FILL_EXEMPTIONS) {
      if (e.file === file && chunk.includes(e.classes)) alive.add(e)
    }
  })
  return TONE_FILL_EXEMPTIONS.filter((e) => !alive.has(e))
}

/** Every (fill, ink) pairing the registry hands out, as `bg-…|text-…` keys. */
function registryPairings(): Set<string> {
  const keys = new Set<string>()
  for (const recipe of Object.values(TONE_FILL)) {
    const bg = recipe.match(/(?:^|\s)bg-([a-z]+-\d+)(?![\w-])/)
    const ink = recipe.match(/(?:^|\s)text-([a-z]+-\d+|white|black)(?![\w-])/)
    if (bg && ink) keys.add(`${bg[1]}|${ink[1]}`)
  }
  return keys
}

/** Is this word a fill step of a tone ramp — i.e. the window rule 5 looks
 *  through? Exported so the test can pin the window's edges rather than
 *  trusting the two arrays above to say what they mean. */
export function isToneFillSurface(word: string): boolean {
  const m = word.match(/^([a-z]+)-(\d+)$/)
  return !!m && TONE_FILL_RAMPS.includes(m[1]) && FILL_STEPS.includes(Number(m[2]))
}

/**
 * Grade one quoted class string against rule 5.
 *
 * Exported for the reason every other `grade*` here is: an absence assertion
 * over a clean tree cannot tell a working scanner from one that has quietly
 * stopped matching, so the test feeds this the real shapes it claims to catch
 * — including the two the product actually shipped.
 */
export function gradeToneFillClasses(
  classes: string,
): Omit<ParityFinding, 'file' | 'line'> | null {
  const ink = utilities(classes, 'text').find((u) => !u.dark)
  const surface = utilities(classes, 'bg').find((u) => !u.dark)
  if (!ink || !surface || ink.alpha || surface.alpha) return null
  if (!isToneFillSurface(surface.word)) return null
  if (registryPairings().has(`${surface.word}|${ink.word}`)) return null

  // The measured ratio goes in the finding whether or not it clears, because
  // both outcomes are the same defect here — the site answered a question the
  // registry already answers — and a reader fixing it needs to know which of
  // the two they are looking at.
  const graded = grade(LIGHT, 'light', ink.word, surface.word)
  return {
    overridden: null,
    classes: `${ink.raw} ${surface.raw}`,
    failures: graded ? [graded] : [],
    note:
      graded && graded.ratio < AA
        ? 'a solid tone fill that is not TONE_FILL, and does not clear AA'
        : 'a solid tone fill that is not TONE_FILL (it clears AA by its own route, which is the defect)',
  }
}

/**
 * Every solid tone fill in the product that is not the registry's.
 *
 * Holds at ZERO with named exemptions and no ceiling, for the reason
 * `dark-mode-parity` holds at zero: a number here would be a count of places
 * still answering a question that has one answer, and a count is something
 * people manage down rather than a rule that stays true. The sweep that
 * introduced it re-pointed 22 sites across 16 files, so zero is a measured
 * state of the tree rather than an aspiration.
 */
export function scanForOffRegistryToneFills(roots: string[] = UI_ROOTS): ParityFinding[] {
  const found: ParityFinding[] = []
  eachClassString(roots, (file, line, chunk) => {
    if (TONE_FILL_EXEMPTIONS.some((e) => e.file === file && chunk.includes(e.classes))) return
    const graded = gradeToneFillClasses(chunk)
    if (graded) found.push({ file, line, ...graded })
  })
  return found
}

/** Every solid tone fill, on-registry or not — the instrument's field of view.
 *  A rule narrowed until it matches nothing reports CLEAN forever. */
export function toneFillSites(roots: string[] = UI_ROOTS): { file: string; line: number }[] {
  const found: { file: string; line: number }[] = []
  eachClassString(roots, (file, line, chunk) => {
    const ink = utilities(chunk, 'text').find((u) => !u.dark)
    const surface = utilities(chunk, 'bg').find((u) => !u.dark)
    if (!ink || !surface || ink.alpha || surface.alpha) return
    if (isToneFillSurface(surface.word)) found.push({ file, line })
  })
  return found
}

/* ── RULE 6: a neutral ink declared for BOTH themes, with no surface of its
      own — the pair rule 1 structurally cannot see ──────────────────────── */

/**
 * THE QUIET INK RULE — "which grey is the quiet one" has a written answer, and
 * 177 places had it upside down.
 *
 * DESIGN-SYSTEM.md §2.2 has said this since v3 shipped, in one binding line:
 * **`gray-500` lightest meaningful on white, `dark:gray-400` lightest on
 * dark** — and `app/css/style.css` labels the step below it `--color-ink-400`
 * with the comment "disabled only". Nothing enforced either.
 *
 * `text-gray-400 dark:text-gray-500` is that line written BACKWARDS, and it
 * fails in BOTH themes at once: #93a0bc on the lightest light surface is
 * **2.63:1** (`surface-2`), and #5c6c89 on the darkest dark surface is
 * **3.51:1** (`surface-sunk`), against a
 * 4.5 floor. Those are BEST CASES — every other surface in either theme is
 * worse. It was live in 177 places across 85 files, and it is where SIX of the
 * eight findings left in `e2e/axe-baseline.ts` came from:
 *
 *   · `staff: the day agenda` — the saved-views bar's "Views:" chip,
 *     `components/saved-views/saved-views-bar.tsx`, measured by axe at
 *     `span.mr-0\.5.text-gray-400.dark\:text-gray-500`: **#93a0bc on #f3f7fe =
 *     2.44:1**, 12px.
 *   · `staff: website hub, site published` ×3 — the "optional" suffix on the
 *     design, domain and blog checklist rows, `app/(default)/website/page.tsx`,
 *     at `a[href$="design"] … .font-normal.text-gray-400.dark\:text-gray-500`:
 *     **#93a0bc on #ffffff = 2.62:1**, 12px. (The not-yet-published state of
 *     the same hub measured ZERO, which is how one shared shape can look like
 *     a defect belonging to the lever rather than to the checklist.)
 *   · `staff: dream team, a proposal waiting on a yes` — an uppercase
 *     tracking-wider field label at
 *     `.dark\:text-gray-500.tracking-wider.text-gray-400`: **#93a0bc on
 *     #ffffff = 2.62:1**, 12px.
 *
 * WHY RULE 1 COULD NOT SEE ANY OF THEM, which is the whole reason this rule
 * exists rather than an extra branch there. Rule 1 needs BOTH halves of a pair
 * on the same element: an ink utility and a `bg-` utility, so it has a surface
 * to measure against. Every instance above is ink ONLY — a label inside a card
 * whose background came from an ancestor. Rule 1's scanner reads one class
 * string at a time and cannot resolve an ancestor, so it correctly declines to
 * grade them, and 177 upside-down pairs sat under a guard built for exactly
 * this family of defect.
 *
 * HOW THIS ONE GRADES WITHOUT AN ANCESTOR: it does not try to find the real
 * surface. It measures against the BEST CASE the theme allows — the lightest
 * declared surface in light mode, the darkest in dark — and reports only what
 * misses AA THERE. An ink that cannot clear the floor on the friendliest
 * surface in its own theme cannot clear it anywhere, whatever it landed on. So
 * a finding here is a fact rather than an estimate, and the rule cannot
 * produce a false positive by guessing a background wrong. Both surfaces are
 * derived by luminance from the palette, never transcribed.
 *
 * ITS SUBJECT IS A PAIR THAT WAS DECLARED TWICE. The element has to name its
 * ink in BOTH themes — a base `text-gray-*` and a base `dark:text-gray-*`.
 * That is a two-sided decision, which is exactly what the design-system line
 * above specifies, and when it is inverted it is wrong twice over.
 *
 * AND ONE HALF HAS TO NAME THE 400 OR THE 500 STEP — the two steps the
 * design-system line is literally about. This is the narrowing that keeps the
 * rule worth having, and it was derived from its own first red run rather than
 * chosen up front: unconstrained, it also reported 15 places spelling
 * `text-gray-300 dark:text-gray-600`, and every one of them was CHROME — a
 * `·` between two metadata fields, the faint `→` a card reveals in teal on
 * hover, a delete glyph that appears at `group-hover`. gray-300 in light mode
 * is below EVERY floor the sheet names, so it cannot be an ink somebody
 * intended as readable text; grading it means firing on decoration to catch
 * body copy, which is rule 1's `208 places to catch 8` all over again.
 *
 * THAT NARROWING NOW HAS A WRITTEN REASON RATHER THAN A PRAGMATIC ONE. When
 * this rule first ran, the design system had no vocabulary for a DECORATIVE
 * neutral, so "is this faint on purpose or by accident" had no answer and this
 * window was quietly acting as one — a guard standing in for a decision, which
 * is the wrong way round. **DESIGN-SYSTEM.md §2.2 names the ornament step now**
 * (`gray-300` / `dark:gray-600`, exempt from the readable-ink floor because it
 * carries no information, and never the sole carrier of a state). So the window
 * below enforces a decision somebody made instead of substituting for one, and
 * the 15 sites are exempt by the sheet rather than by this rule's silence.
 *
 * WHAT IT DELIBERATELY DOES NOT SEE, so nobody reads a green run as more than
 * it is. A BARE `text-gray-400` with no `dark:` half is NOT graded here. When
 * this rule shipped there were about 194 of those, failing the light side on
 * the same 2.63:1 and passing the dark side at 6.19:1 because with no override
 * the theme re-tints the SURFACE underneath them; they were written down as a
 * residual in docs/UI-BEST-VERSION.md rather than folded in here, on the
 * grounds that each needs a per-site look and a rule firing on 194 sites to
 * catch the real text is the guard people switch off.
 *
 * **THAT PASS IS DONE (batch 69) AND IT VINDICATED THE BAIL FOR A REASON THE
 * ENTRY HAD NOT NAMED.** 115 of them were real text or a control's only
 * affordance and are the §2.2 pair now. The 52 left are not a backlog: 22 sit
 * on a DARK panel inside a light page — the Studio chrome, the presenter, the
 * homepage's final CTA band — where `gray-400` measures 4.99 to 6.71 and the
 * "fix" would have driven them to 2.47. The remaining 30 are pictures. So the
 * thing that decides a bare ink is the ANCESTOR'S GROUND, which is exactly
 * what no rule in this file can resolve — this rule grades a two-sided ink
 * against its theme's BEST CASE precisely to avoid guessing one. Widening it
 * to one-sided inks would not be strict, it would be wrong 22 times.
 *
 * AND THE `bg` BAIL IS WIDER THAN "rule 1 has this one" (found in review of
 * #597, and the comment on the bail below used to overstate it). This rule
 * declines ANY chunk carrying a `bg-`, on the reasoning that an element with
 * its own surface is rule 1's. Rule 1 does not claim all of them: it grades a
 * pair only when EXACTLY ONE half carries the `dark:` override, and it skips
 * an alpha surface outright. So two shapes are graded by NEITHER rule —
 *
 *     bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500   (both overridden)
 *     text-gray-400 dark:text-gray-500 bg-white/60                 (alpha surface)
 *
 * — and the honest description of this bail is "rule 1 usually has it", not
 * "rule 1 has it". Scanned at the time: 84,437 class chunks, 1,210 carrying a
 * `bg-`, **zero live instances of either shape** (the scan was self-checked
 * against a planted case first, so zero means the instrument looked). A false
 * negative with no subject is worth writing down rather than closing, because
 * the fix is not free — grading both-overridden pairs here would put two rules
 * on the same line, which is how a repo gets two answers for it.
 *
 * **BOTH SHAPES ARE RULE 7's NOW** (batch 68). They went to the entry this
 * paragraph pointed at rather than into a quiet widening of this rule, which
 * is what it asked for: rule 7 grades every ink-and-surface string rule 1
 * hands back, including the both-overridden pair and the alpha-surface one,
 * and it declines any chunk WITHOUT a `bg-` so it and this rule still cannot
 * both match a line. The bail below is unchanged and now covers the tree with
 * nothing behind it.
 */

/** Neutral ramps — the ones that carry no meaning, and so have no tone
 *  registry to answer for them. `gray` is the ramp the product spells; `ink`
 *  is the semantic twin it is re-tinted to track. */
const NEUTRAL_INK_RAMPS = ['gray', 'ink']

/** The two steps DESIGN-SYSTEM.md §2.2 names — 500 as light mode's lightest
 *  meaningful ink, 400 as dark mode's. A pair that touches neither is not a
 *  body-ink decision; see the header. */
const NAMED_QUIET_STEPS = [400, 500]

/**
 * The friendliest surface a piece of text can land on in each theme, DERIVED
 * by luminance rather than named: light mode's is the lightest of the four
 * declared surfaces, dark mode's is the darkest. Deriving it means a palette
 * edit moves the rule instead of silently invalidating it.
 */
export function bestCaseSurface(theme: Theme, mode: 'light' | 'dark'): string {
  const ranked = [...SURFACES].sort((a, b) => {
    const la = luminance(token(theme, a))
    const lb = luminance(token(theme, b))
    return mode === 'light' ? lb - la : la - lb
  })
  return ranked[0]
}

function isNeutralInk(word: string): boolean {
  const m = word.match(/^([a-z]+)-(\d{2,3})$/)
  return !!m && NEUTRAL_INK_RAMPS.includes(m[1])
}

/** Does this word name one of the two steps the design-system line is about? */
function namesAQuietStep(word: string): boolean {
  const m = word.match(/^[a-z]+-(\d{2,3})$/)
  return !!m && NAMED_QUIET_STEPS.includes(Number(m[1]))
}

/**
 * Grade one quoted class string against rule 6.
 *
 * Exported for the same reason every sibling `grade*` is: a scanner that has
 * quietly stopped matching reports a clean tree, and an absence assertion
 * cannot tell the two apart.
 */
export function gradeQuietInkClasses(
  classes: string,
): Omit<ParityFinding, 'file' | 'line'> | null {
  const inks = utilities(classes, 'text')
  const lightInk = inks.find((u) => !u.dark)
  const darkInk = inks.find((u) => u.dark)
  // Both halves declared, neither a wash, and no surface of its own. With a
  // surface present the element is rule 1's or rule 7's between them, and two
  // rules grading one line is how a repo ends up with two answers for it. The
  // "usually" this comment used to carry is gone: rule 7 closed the two shapes
  // the header names, so the bail hands the chunk to somebody now.
  if (!lightInk || !darkInk || lightInk.alpha || darkInk.alpha) return null
  if (!isNeutralInk(lightInk.word) || !isNeutralInk(darkInk.word)) return null
  if (!namesAQuietStep(lightInk.word) && !namesAQuietStep(darkInk.word)) return null
  if (utilities(classes, 'bg').length > 0) return null

  const failures: Pairing[] = []
  for (const [theme, mode] of [
    [LIGHT, 'light'],
    [DARK, 'dark'],
  ] as const) {
    const ink = mode === 'light' ? lightInk.word : darkInk.word
    const graded = grade(theme, mode, ink, bestCaseSurface(theme, mode))
    if (graded && graded.ratio < AA) failures.push(graded)
  }
  if (failures.length === 0) return null

  return {
    overridden: null,
    classes: `${lightInk.raw} ${darkInk.raw}`,
    failures,
    note:
      'a neutral ink declared for both themes that misses AA on the BEST-CASE ' +
      'surface of its own theme — DESIGN-SYSTEM.md §2.2: gray-500 is the ' +
      'lightest meaningful ink on white, dark:gray-400 the lightest on dark',
  }
}

/** Every two-sided neutral ink in the product that cannot clear AA even on the
 *  friendliest surface its own theme offers. Holds at ZERO with no ceiling —
 *  same reasoning as rules 1 and 5, and it can afford zero because the sweep
 *  that introduced it turned all 177 live instances the right way up. */
export function scanForUnreadableQuietInk(roots: string[] = UI_ROOTS): ParityFinding[] {
  const found: ParityFinding[] = []
  eachClassString(roots, (file, line, chunk) => {
    const graded = gradeQuietInkClasses(chunk)
    if (graded) found.push({ file, line, ...graded })
  })
  return found
}

/** Every two-sided neutral ink, passing or not — the instrument's field of
 *  view. A rule narrowed until it matches nothing reports CLEAN forever. */
export function quietInkSites(roots: string[] = UI_ROOTS): { file: string; line: number }[] {
  const found: { file: string; line: number }[] = []
  eachClassString(roots, (file, line, chunk) => {
    const inks = utilities(chunk, 'text')
    const lightInk = inks.find((u) => !u.dark)
    const darkInk = inks.find((u) => u.dark)
    if (!lightInk || !darkInk || lightInk.alpha || darkInk.alpha) return
    if (!isNeutralInk(lightInk.word) || !isNeutralInk(darkInk.word)) return
    if (!namesAQuietStep(lightInk.word) && !namesAQuietStep(darkInk.word)) return
    if (utilities(chunk, 'bg').length > 0) return
    found.push({ file, line })
  })
  return found
}

/* ── RULE 7: the pair rule 1 hands back — an ink and its surface written in
      ONE class string, graded by nothing ────────────────────────────────── */

/**
 * THE LARGEST MEASURED POPULATION THIS FILE HAD NEVER LOOKED AT.
 *
 * Rule 1 grades a chunk only when EXACTLY ONE half carries the `dark:`
 * override, and only when all four participating utilities are opaque. Its own
 * comment said why it declined the rest — *"BOTH overridden is a pair somebody
 * chose; NEITHER is a single pairing that `token-contrast` and axe already
 * cover"* — and batch 64 went and measured that sentence. Both halves of it
 * are false often enough to matter:
 *
 *   - **A chosen pair can be chosen wrong.** `bg-teal-600 text-white
 *     dark:bg-teal-500 dark:text-gray-900` is both halves overridden, so rule 1
 *     read it as deliberate. It is 4.01 in dark — the batch-58 defect verbatim,
 *     near-black ink on teal-500 — and it was every sign-in, reset-password and
 *     accept-invite button in the product.
 *   - **`token-contrast` grades the pairs the design system DECLARES.** An
 *     off-registry ramp on an off-registry wash (`text-red-600` on `bg-red-50`,
 *     2.94 — and `red` was never a v3 tone) is declared nowhere, so it is
 *     nobody's business. axe could see that one, in the one theme it walks, on
 *     the one stop that renders it; it could not see the dark half of anything.
 *
 * And the alpha bail is the third way through. Rule 1 skips a chunk outright
 * when any participating utility is a wash, which is right for the wash — but
 * `text-rose-600 bg-rose-50 dark:bg-rose-500/10` has a fully determined, fully
 * OPAQUE light rendering at 4.12 that nothing then grades. Rule 6's header
 * names two of these shapes and says they belong to this entry rather than to
 * a quiet widening of rule 6. They do; here they are.
 *
 * THE RULE: **an ink and a surface written in the same class string must clear
 * AA in every theme where both halves of the pair resolve opaque.** No
 * ancestor is needed — the element carries both ends of its own pairing, which
 * is exactly what makes this gradeable from source and what makes a finding a
 * fact rather than an estimate.
 *
 * HOW IT PARTITIONS WITH THE RULES AROUND IT, rather than joining them on a
 * line. Two rules grading one string is how a repo ends up with two answers
 * for it, so each deferral below is to a rule that really does grade the thing
 * deferred, and `one-string-pairs.test.ts` asserts the disjointness over the
 * whole tree rather than trusting this list:
 *
 *   - **Rule 1** owns the whole chunk when `isParitySubject` says so. That
 *     predicate is rule 1's own grading condition, read rather than re-spelled,
 *     so a change to one cannot open a gap under the other.
 *   - **Rule 2** owns white on `teal-400`/`teal-500`, in both themes — it has
 *     the brand-ramp cutoff and the one `BRAND_FILL_EXEMPTIONS` entry (the
 *     `aria-hidden` RecallFunnelMock bar). Grading it here would re-report a
 *     site that is deliberately pardoned one rule over.
 *   - **Rule 5** owns the BASE pairing of a solid tone fill, because that is
 *     the pairing it grades — is this `TONE_FILL`, yes or no. The base pairing
 *     is the light rendering always, and the dark one too when nothing
 *     overrides either half; a tone fill declared only for dark is graded
 *     here, because rule 5 never looks at a `dark:` override and deferring it
 *     would hand the rendering to nobody.
 *   - **Rule 6** needs a chunk with NO `bg-` at all. This rule needs one. They
 *     cannot both match, by construction rather than by agreement.
 *   - **Rule 4** anchors on `text-transparent`, which is not a palette word, so
 *     a clipped-text chunk has no ink here to pair with.
 *
 * WHAT IT DOES NOT SEE, so a green run is not mistaken for proof. The same
 * false-negative direction as every rule in this file:
 *
 *   - An ink and its surface in DIFFERENT quoted strings. One quoted string is
 *     the unit, here as everywhere else.
 *   - A rendering with an alpha half — that half composites against an ancestor
 *     no source scanner can resolve. Note this is now a PER-RENDERING skip
 *     rather than rule 1's per-chunk one, which is the whole of the third gap
 *     above: an alpha `dark:bg-*` no longer takes the opaque light pair down
 *     with it.
 *   - `hover:` and the other state variants, and colour words this palette does
 *     not define (an arbitrary `[#hex]`, a `--c-*` clinic brand var).
 *
 * AND ONE THING IT IS STRICTER ABOUT THAN WCAG, written down rather than
 * exempted. It does not ask whether the element has a text node, so a pair
 * whose only child is an icon would be graded at 4.5 where 1.4.11 asks 3:1.
 * No such site fails in the tree today — `components/dropdown-filter.tsx`'s
 * `fill-current` button, which batch 64 flagged as the case to decide, now
 * reads 5.30 and clears both floors. If one lands, the fix is to give the rule
 * a shape it can actually see, not to exempt the file: a guard that cannot
 * distinguish an icon from a sentence should over-report and be told, rather
 * than acquire a list of pardons keyed on nothing.
 */

/**
 * Grade one quoted class string against rule 7.
 *
 * Exported for the same reason every sibling `grade*` here is: an absence
 * assertion over a clean tree cannot tell a scanner that is looking from one
 * that has quietly stopped, so the test feeds this every shape it claims to
 * catch — including the two the product actually shipped.
 */
export function gradeSameStringPair(
  classes: string,
): Omit<ParityFinding, 'file' | 'line'> | null {
  const { lightInk, darkInk, lightSurface, darkSurface } = pairParts(classes)
  // Both ends of the pairing have to be written here, or there is nothing to
  // grade without an ancestor. A `dark:`-only half with no base spelling is
  // not a pair either — it is half a decision, and the cascade fills the other
  // half from somewhere this scanner cannot read.
  if (!lightInk || !lightSurface) return null
  if (isParitySubject(classes)) return null

  const renderings: [Pairing['theme'], Theme, Utility, Utility][] = [
    ['light', LIGHT, lightInk, lightSurface],
    ['dark', DARK, darkInk ?? lightInk, darkSurface ?? lightSurface],
  ]

  const failures: Pairing[] = []
  const participating = new Set<string>()
  for (const [name, theme, ink, surface] of renderings) {
    if (ink.alpha || surface.alpha) continue
    // Rule 2 has white on the shallow brand ramp, in both themes, with the
    // cutoff and the one exemption.
    if (ink.word === 'white' && SHALLOW_BRAND_FILLS.includes(surface.word)) continue
    // Rule 5 has the BASE pairing of a solid tone fill — which is the light
    // rendering always, and the dark one too when no override moves either
    // half. An overridden dark tone fill is nobody else's, so it is graded.
    if (ink === lightInk && surface === lightSurface && isToneFillSurface(surface.word)) continue
    const graded = grade(theme, name, ink.word, surface.word)
    if (!graded || graded.ratio >= AA) continue
    failures.push(graded)
    participating.add(ink.raw)
    participating.add(surface.raw)
  }
  if (failures.length === 0) return null

  return {
    overridden: null,
    classes: Array.from(participating).join(' '),
    failures,
    note: 'an ink and its surface written in one class string, and the pair does not read',
  }
}

/**
 * Every ink/surface pair written in one class string that misses AA in a theme
 * where both halves resolve opaque.
 *
 * Holds at ZERO with no ceiling and no exemption list, the same as rules 1, 3
 * and 6. It can afford zero because the sweep that introduced it fixed all 29
 * live instances; a number here would be room for the next one, in the gap
 * three rules spent the whole program leaving open. That count is this
 * function's own, replayed against the pre-sweep tree — see the header of
 * `one-string-pairs.test.ts` for why it is derived rather than remembered.
 */
export function scanForUngradedStringPairs(roots: string[] = UI_ROOTS): ParityFinding[] {
  const found: ParityFinding[] = []
  eachClassString(roots, (file, line, chunk) => {
    const graded = gradeSameStringPair(chunk)
    if (graded) found.push({ file, line, ...graded })
  })
  return found
}

/** Every ink/surface pair written in one class string, passing or not — the
 *  instrument's field of view. A rule narrowed until it matches nothing
 *  reports CLEAN forever. */
export function sameStringPairSites(roots: string[] = UI_ROOTS): { file: string; line: number }[] {
  const found: { file: string; line: number }[] = []
  eachClassString(roots, (file, line, chunk) => {
    const { lightInk, lightSurface } = pairParts(chunk)
    if (!lightInk || !lightSurface) return
    if (isParitySubject(chunk)) return
    found.push({ file, line })
  })
  return found
}
