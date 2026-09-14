/**
 * THE ONE PLACE THIS REPO READS A COLOUR PAIR OUT OF A `className`.
 *
 * Three source rules grade those pairs, and they share this scanner rather than
 * carrying one each: `dark-mode-parity.test.ts` (the unpaired `dark:`
 * override), and `token-contrast.test.ts` twice over — white on the shallow end
 * of the brand ramp as a solid fill (rule 2), and white on a GRADIENT that runs
 * through it (rule 3, the one axe structurally cannot report). A second copy of
 * "which utility is the ink, which is the surface, and is either one a wash" is
 * how two guards start disagreeing about the same line — the same reason
 * `./palette` is the one place the ratios are computed.
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
import { AA, contrast, DARK, LIGHT, ROOT, utilityColor, type Theme } from './palette'

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
  const inks = utilities(classes, 'text')
  const surfaces = utilities(classes, 'bg')

  const lightInk = inks.find((u) => !u.dark)
  const darkInk = inks.find((u) => u.dark)
  const lightSurface = surfaces.find((u) => !u.dark)
  const darkSurface = surfaces.find((u) => u.dark)

  // Exactly one half overridden. BOTH overridden is a pair somebody chose;
  // NEITHER is a single pairing that `token-contrast` and axe already cover.
  if (!!darkInk === !!darkSurface) return null

  const overridden: 'ink' | 'surface' = darkInk ? 'ink' : 'surface'

  // What each theme actually renders: the override where there is one, and the
  // unprefixed class — unchanged, which is the whole point — where there is not.
  const inkDark = darkInk ?? lightInk
  const surfaceDark = darkSurface ?? lightSurface

  // Every participating utility must be present and opaque. An alpha ink or an
  // alpha wash composites against something outside this string.
  const parts = [lightInk, inkDark, lightSurface, surfaceDark]
  if (parts.some((p) => !p || p.alpha)) return null

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
