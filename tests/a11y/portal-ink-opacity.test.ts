import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * THE PORTAL NEVER DIMS ITS OWN INK.
 *
 * `PORTAL_MUTED` is already the quiet step — #6B635A clears 5.52:1 on the
 * warm ground and 5.90:1 on a white card. Putting an `opacity-*` on top of it
 * is a SECOND quietening that nothing grades, and the composite is what a
 * patient actually reads. Three live instances, all found the same way:
 *
 *   · `app/(portal)/layout.tsx` — "Powered by DreamCreate" at 12px under
 *     `opacity-70` composited to `#968f88 on #faf7f2` = **2.98:1**. The footer
 *     is in the portal LAYOUT, so this was one defect rendering on every
 *     portal page, and it is exactly the "remaining 1 per portal stop is NOT
 *     the brand — a separate pair, still to be identified" that batch 54 left
 *     open in `e2e/axe-baseline.ts`. Nine stops carried a ceiling of 1 for it.
 *   · `app/(portal)/patient/messages/messages-view.tsx` — a message subject at
 *     `opacity-80`. On a patient's OWN message the bubble is a brand fill
 *     under `text-white`, so 80% white composites to **3.79–4.42** depending
 *     on the clinic's brand. `portal: messages` is not a stop the browser
 *     suite walks, so nothing had ever measured it.
 *   · `components/patient-portal/slot-picker.tsx` — the day strip's weekday
 *     and month labels at `opacity: 0.85`. This one PASSED (10.98:1 — it dims
 *     `PORTAL_INK`, not the muted tone), and it is fixed anyway: a rule that
 *     holds at zero cannot have a legal-looking instance of the shape sitting
 *     in the tree for the next author to copy.
 *
 * WHY A SOURCE RULE WHEN AXE ALREADY MEASURES CONTRAST. axe caught the first
 * one and then carried it: an opacity-dimmed line that renders on every page
 * of a surface shows up as one violation per stop, which reads like nine
 * small unrelated debts rather than one shared component, and it sat behind
 * nine ceilings of 1 for four batches. The second one axe never saw at all,
 * because the browser suite only measures the pages it stops at. Naming the
 * SHAPE rather than counting the pixels is what makes both the same defect.
 *
 * IT HOLDS AT ZERO AND CARRIES NO CEILING, deliberately — same reasoning as
 * `tests/a11y/dark-mode-parity.test.ts`. A numeric allowance keyed by source
 * location would be a second inventory of contrast debt that can disagree
 * with `e2e/axe-baseline.ts`, and the first time they disagreed about whether
 * something was fixed, neither would be believed. If a dimmed ink is ever
 * genuinely right, say so in `DIMMED_INK_EXEMPTIONS` with the reason.
 *
 * WHAT IT DOES NOT SEE — every one of these is a false NEGATIVE by design:
 *   · Scope is the PORTAL only (`app/(portal)`, `components/patient-portal`).
 *     The rest of the product uses `opacity-*` in hundreds of places, mostly
 *     on non-text chrome, and grading that is its own batch.
 *   · Variant-prefixed opacities (`disabled:`, `hover:`, `active:`, `group-`)
 *     are allowed. A disabled control is exempt from 1.4.3, and hover/active
 *     are momentary states, not the settled colour a person reads.
 *   · `opacity-0` / `opacity-100` are animation endpoints (the `BusyLabel`
 *     width-holder recipe), not dimming.
 *   · An opacity applied by a CLASS the portal does not spell — a shared
 *     component's own className, or a rule in `app/css/style.css` — is
 *     invisible here. So is one built from a variable.
 *   · It grades the SHAPE, not the ratio. It does not compute a composite; it
 *     refuses the technique. That is why the passing slot-picker instance is
 *     an offender too.
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['app/(portal)', 'components/patient-portal']

/**
 * Dimmed ink that is genuinely correct, keyed `file|snippet` with a reason.
 *
 * EMPTY, and that is the honest state: the only decorative dimming in the
 * portal today sits on `aria-hidden` nodes, which the rule already skips
 * structurally rather than by name. Kept (with the stale check below) so the
 * first real exception has somewhere to go that costs a sentence.
 */
const DIMMED_INK_EXEMPTIONS: Record<string, string> = {}

/** Blanks comments while preserving offsets, so reported lines stay true.
 *  This file and the fixed call sites both SPELL the defect in prose to
 *  explain it; a guard that fires on its own explanation is one people
 *  delete. (Same device as `tests/clinic-site/brand-wash.test.ts`.) */
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
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** The Tailwind utility, only when NOTHING prefixes it — `disabled:opacity-50`
 *  and `group-hover:opacity-40` are states, not the settled colour. */
const CLASS_OPACITY = /(^|[\s"'`{])opacity-(\d{1,3})\b/g
/** The inline-style property, with everything up to the end of its value —
 *  enough to catch both arms of `opacity: active ? 1 : 0.85`. */
const STYLE_OPACITY = /\bopacity:\s*([^,}\n]+)/g

export type DimmedInk = { line: number; snippet: string }

/**
 * Every place the source dims ink with an opacity, minus the shapes that are
 * not dimming (endpoints, states) and the nodes that are not content.
 *
 * `aria-hidden` is resolved STRUCTURALLY rather than by a named exemption:
 * we walk back to the opening `<` of the tag the match sits in and look for
 * the attribute there. An author marking a node decorative has already made
 * the 1.4.3 claim, and making them repeat it in a list here would be a
 * second place to keep in sync.
 */
export function findDimmedInk(source: string): DimmedInk[] {
  const src = stripComments(source)
  const hits: DimmedInk[] = []

  const push = (index: number, snippet: string) =>
    hits.push({ line: src.slice(0, index).split('\n').length, snippet })

  /** The text of the JSX tag this offset sits inside, for the aria-hidden read. */
  const enclosingTag = (index: number): string => {
    const open = src.lastIndexOf('<', index)
    if (open < 0) return ''
    const close = src.indexOf('>', index)
    return src.slice(open, close < 0 ? index : close)
  }

  CLASS_OPACITY.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CLASS_OPACITY.exec(src))) {
    const pct = Number(m[2])
    if (pct === 0 || pct === 100) continue
    if (enclosingTag(m.index).includes('aria-hidden')) continue
    push(m.index, `opacity-${pct}`)
  }

  STYLE_OPACITY.lastIndex = 0
  while ((m = STYLE_OPACITY.exec(src))) {
    const values = (m[1].match(/(?:^|[^\w.])(\d*\.?\d+)/g) ?? []).map((v) => Number(v.replace(/[^\d.]/g, '')))
    if (!values.some((v) => v > 0 && v < 1)) continue
    if (enclosingTag(m.index).includes('aria-hidden')) continue
    push(m.index, m[0].trim())
  }

  return hits
}

describe('the portal never dims its own ink with an opacity', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))

  it('scans a real tree (the rule is not silently matching nothing)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('finds no dimmed ink in the portal', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.slice(ROOT.length + 1).split('\\').join('/')
      for (const hit of findDimmedInk(readFileSync(file, 'utf8'))) {
        const key = `${rel}|${hit.snippet}`
        if (key in DIMMED_INK_EXEMPTIONS) continue
        offenders.push(`${rel}:${hit.line} — ${hit.snippet}`)
      }
    }
    expect(
      offenders,
      'PORTAL_MUTED is already the quiet step (5.52:1 on the ground, 5.90:1 on a card). ' +
        'An opacity on top of it composites to something nothing grades — that is how a 12px ' +
        'footer line sat at 2.98:1 on every portal page. Step down with a TONE, or mark the ' +
        'node aria-hidden if it is decorative:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })

  it('every exemption still describes something (a pardon cannot outlive its subject)', () => {
    const live = new Set<string>()
    for (const file of files) {
      const rel = file.slice(ROOT.length + 1).split('\\').join('/')
      // Exemptions are read against the UNFILTERED shapes: an entry whose site
      // was fixed must be deleted, not left standing as a blanket pardon.
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const re of [CLASS_OPACITY, STYLE_OPACITY]) {
        re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) live.add(`${rel}|${m[0].trim().replace(/^["'`{\s]+/, '')}`)
      }
    }
    const dead = Object.keys(DIMMED_INK_EXEMPTIONS).filter((k) => !live.has(k))
    expect(dead, `exemptions matching nothing — delete them:\n  ${dead.join('\n  ')}`).toEqual([])
  })
})

/**
 * The instrument check. A source rule that stops matching reports CLEAN
 * forever, so the shapes it must catch — and the ones it must not — are
 * pinned against literals here rather than against today's tree.
 */
describe('the scanner sees the real defect shapes', () => {
  it('catches the three shapes that were live', () => {
    const footer = `<p className="mt-3 text-[0.75rem] opacity-70">Powered by DreamCreate</p>`
    const subject = `<p className="mb-1 text-[0.78rem] font-semibold opacity-80">{m.subject}</p>`
    const strip = `<span className="text-[0.78rem]" style={{ opacity: active ? 1 : 0.85 }}>{month}</span>`
    expect(findDimmedInk(footer).map((h) => h.snippet)).toEqual(['opacity-70'])
    expect(findDimmedInk(subject).map((h) => h.snippet)).toEqual(['opacity-80'])
    expect(findDimmedInk(strip)).toHaveLength(1)
  })

  it('stays quiet on the shapes that are not dimmed ink', () => {
    const quiet = [
      // A disabled control is exempt from 1.4.3.
      `<button className="rounded-full disabled:opacity-50">Save</button>`,
      // Momentary states, not the settled colour.
      `<a className="transition hover:opacity-90 active:opacity-85">Book</a>`,
      `<span className="group-hover:opacity-40" />`,
      // The BusyLabel width-holder: an animation endpoint.
      `<span className="opacity-0" aria-hidden>{children}</span>`,
      `<div className="opacity-100" />`,
      // Decorative by the author's own declaration.
      `<span aria-hidden="true" className="text-[0.85rem] opacity-60">🪪</span>`,
      // The fixed spellings, so the fix cannot silently regress into a pass.
      `<p className="mt-3 text-[0.75rem]">Powered by DreamCreate</p>`,
      `<span style={{ color: active ? undefined : MUTED }}>{month}</span>`,
      // An opaque endpoint written as a style.
      `<div style={{ opacity: 1 }} />`,
    ]
    for (const chunk of quiet) {
      expect(findDimmedInk(chunk), chunk).toEqual([])
    }
  })
})
