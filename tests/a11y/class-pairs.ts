/**
 * THE ONE PLACE THIS REPO READS A COLOUR PAIR OUT OF A `className`.
 *
 * Four source rules grade those pairs, and they share this scanner rather than
 * carrying one each: `dark-mode-parity.test.ts` (the unpaired `dark:`
 * override), and `token-contrast.test.ts` three times over — white on the
 * shallow end of the brand ramp as a solid fill (rule 2), white on a GRADIENT
 * that runs through it (rule 3), and a background that IS the ink rather than
 * the fill (rule 4). A second copy of "which utility is the ink, which is the
 * surface, and is either one a wash" is how two guards start disagreeing about
 * the same line — the same reason `./palette` is the one place the ratios are
 * computed.
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
import { AA, contrast, DARK, LIGHT, ROOT, utilityColor, type Theme } from './palette'
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
 * WHAT IT GRADES AGAINST: plain `white`. Two reasons, and the second is the
 * one that decided it.
 *
 *   1. It is the ground that is actually there. `app/(marketing)/layout.tsx`
 *      hard-codes `bg-white text-gray-950`, and every `bg-clip-text` in `app/`,
 *      `components/` and `lib/` is inside it.
 *   2. **It keeps rule 4's cutoff IDENTICAL to rule 2's, rather than opening a
 *      third opinion about which teal step is legal.** The WCAG ratio is
 *      symmetric, so "white reads on this step" and "this step reads on white"
 *      are the same measurement — `token-contrast.test.ts` asserts that
 *      equality rather than trusting it. Grading against the worst light
 *      surface instead would have been defensible in the abstract and wrong
 *      here: `teal-600` is 5.09 on white and 4.45 on `surface-sunk`, so the
 *      stricter version would outlaw the exact step DESIGN-SYSTEM.md calls the
 *      shallowest legal one, and the repo would carry two cutoffs that
 *      disagree. One number, three rules.
 *
 * The cost is a bounded, named gap: gradient text on `canvas` (4.74 at
 * teal-600) or `surface-sunk` (4.45) is graded a little more kindly than it
 * deserves. No such site exists; if one lands, this is the paragraph to come
 * back to rather than a ceiling to raise.
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
 * **IT IS NO LONGER EMPTY** (DREAMCRM-54, 2026-09-15). The homepage hero is
 * now the night band of `BRAND.md`'s Night Dream direction — `bg-gray-950`,
 * #10182e — and its headline accent runs `from-teal-300 to-violet-300`, which
 * this rule grades on WHITE at 1.88 and 2.03 and which measure 9.36 and 8.69
 * on the ground they actually paint on. That is the predicted case arriving,
 * not a new hole: the rule stayed exactly as it was and the exemption carries
 * the measurement. The discipline for a second entry is written on the list
 * itself.
 */
const CLIP_TEXT = /bg-clip-text(?![\w-])/
const TRANSPARENT_INK = new RegExp(`${BOUNDARY}text-transparent${NOT_IN_WORD}`)

export type ClippedTextExemption = { file: string; classes: string; why: string }

/**
 * Clipped-text sites that deliberately ride something other than a light
 * ground — a dark band inside a light page, say.
 *
 * THE SITE THIS LIST WAS BUILT FOR NOW EXISTS (DREAMCRM-54, 2026-09-15). The
 * paragraph above predicted it in the abstract — "a site genuinely riding a
 * DARK band would fail this rule correctly-in-form and wrongly-in-fact" — and
 * the homepage hero is that site: the night band of `BRAND.md`'s Night Dream
 * direction, `bg-gray-950` (#10182e), owner-approved on DREAMCRM-43.
 *
 * READ THIS BEFORE ADDING A SECOND ENTRY. An exemption here is not "this rule
 * is inconvenient", it is "this rule is grading against the wrong ground, and
 * here is the ground it is actually on, measured". The right shape is:
 *
 *   1. Watch the red run FIRST and read the ratios it reports on white.
 *   2. Measure the stops against the ground that is really there.
 *   3. Put BOTH numbers in the `why`, and have a test re-derive the second
 *      set from the palette rather than trusting the comment — see
 *      `token-contrast.test.ts`, "the night band's stops are legible on the
 *      ground they actually ride".
 *
 * What would NOT be legitimate: an entry whose `why` says the design is
 * important, or one that names a ground no element actually has. Rule 4 is
 * right about every other `bg-clip-text` in the tree.
 */
export const CLIPPED_TEXT_EXEMPTIONS: ClippedTextExemption[] = [
  {
    file: 'app/(marketing)/page.tsx',
    classes: 'from-teal-300 to-violet-300 bg-clip-text text-transparent',
    why:
      "The homepage hero's headline accent line, and it rides the NIGHT BAND " +
      '(BRAND.md Part 8 move 1): the hero section is bg-gray-950 = #10182e, ' +
      'not the white ground this rule grades against. Rule 4 measures these ' +
      'stops on white at teal-300 1.88 and violet-300 2.03 and it is right ' +
      'about white; on the ground they actually paint on they are 9.36 and ' +
      '8.69, both comfortably over AA. The rule grades against white ' +
      'deliberately (see the header above: it was the ground under every ' +
      'bg-clip-text in the tree, and it keeps rule 4 sharing rule 2 cutoff ' +
      'rather than opening a third), so this is the ground being wrong rather ' +
      'than the cutoff — exactly the case this list exists for. The four dark ' +
      'ratios are RE-DERIVED from the palette by token-contrast.test.ts rather ' +
      'than trusted from this text, and the pairs are in BRAND.md Part 7, the ' +
      'hand-graded table the night band depends on because no automated guard ' +
      'in this repo can see a dark band inside a light-mode page.',
  },
]

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
    // The background is the INK and white is the ground — the inverse of every
    // other rule in this file, which is the whole point of rule 4 existing.
    const graded = grade(LIGHT, 'light', ink.word, 'white')
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
