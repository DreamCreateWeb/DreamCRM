import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * THE BUSY STATE LIVES IN THE PRIMITIVE, NOT IN A TERNARY.
 *
 * `ActionButton` takes `pending` and does the whole job: it disables the
 * button, announces `aria-busy`, and overlays a spinner while KEEPING the
 * label in the layout at `opacity-0` so the width never jumps mid-action.
 *
 * A hand-rolled `{pending ? 'Saving…' : 'Save'}` does none of that. It swaps
 * the text, which reflows the button under the cursor, leaves the control
 * clickable unless the author separately remembered `disabled`, and tells a
 * screen reader nothing — the accessible name simply changes, which is not
 * an announcement. Sixty-seven of them were live across `app/` and
 * `components/` when this guard was written, on buttons that in most cases
 * ALREADY passed `pending` — so the ternary was pure duplication that could
 * only drift from the primitive.
 *
 * TWO RULES, DELIBERATELY DIFFERENT IN SHAPE:
 *
 * 1. On `ActionButton` the count is ZERO and stays zero. The primitive is
 *    right there; there is no case for re-implementing it one level up.
 *
 * 2. On raw `<button>` the count is a CEILING that may only fall. Those are
 *    a mixed population — clinic-branded portal and public-site buttons that
 *    paint `style={{ backgroundColor: brand }}` and cannot become the teal
 *    dashboard primitive, menu rows, and dashboard buttons that genuinely
 *    should be `ActionButton`. Converting them is judgement per site, so the
 *    guard ratchets rather than forbids: every batch that converts a few
 *    lowers CEILING, and nobody can add a new one in the meantime.
 *
 * BATCH 53 added rule 1's siblings. `BrandButton`, `GhostButton` and the
 * visit card's `ActionPill` now take `pending` too — the affordance is the
 * shared `BusyLabel` (components/ui/busy-label.tsx), whose spinner rings in
 * `currentColor` so a clinic's own brand tints it and the dashboard's teal
 * never reaches the portal. Those three are held at ZERO for the same reason
 * ActionButton is: the primitive is right there.
 */

const ROOTS = ['app', 'components']

/** `{cond ? 'Saving…' : 'Save'}` — a JSX child whose two arms are string
 *  literals and whose busy arm carries an ellipsis. */
const LABEL_TERNARY = /\{\s*([^{}?]{1,80}?)\s*\?\s*'([^']*)'\s*:\s*'([^']*)'\s*\}/g

/** Raw `<button>` sites still hand-rolling the swap. Only ever lower this.
 *  78 → 71 in batch 53 (the portal's Send / Save changes / Request my records
 *  / Redeem became BrandButton; the four public-site submits kept their own
 *  skins and took the shared BusyLabel). */
const RAW_BUTTON_CEILING = 71

/** The branded primitives that now carry `pending`, held at zero like
 *  ActionButton. `ActionPill` is file-local to visit-card.tsx — it is a
 *  patient-facing pill on the same contract, so it plays by the same rule. */
const BRANDED_PRIMITIVES = ['BrandButton', 'GhostButton', 'ActionPill']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * The name of the element this expression is a child of — walked backwards
 * from the expression, counting closing tags so a preceding sibling's own
 * children are skipped over. Self-closing siblings are not a nesting level.
 */
function enclosingTag(src: string, at: number): string {
  let depth = 0
  let i = at - 1
  while (i >= 0) {
    if (src[i] !== '>') {
      i--
      continue
    }
    let j = i
    while (j >= 0 && src[j] !== '<') j--
    if (j < 0) return '?'
    const tag = src.slice(j, i + 1)
    if (tag.startsWith('</')) depth++
    else if (!tag.endsWith('/>')) {
      if (depth === 0) return (tag.match(/^<([A-Za-z0-9_.]+)/) ?? [, '?'])[1] as string
      depth--
    }
    i = j - 1
  }
  return '?'
}

interface Site {
  rel: string
  line: number
  tag: string
  busyLabel: string
}

function collect(): Site[] {
  const root = process.cwd()
  const sites: Site[] = []
  for (const file of ROOTS.flatMap((d) => walk(resolve(root, d)))) {
    const src = readFileSync(file, 'utf8')
    const rel = file.slice(root.length + 1).split('\\').join('/')
    LABEL_TERNARY.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LABEL_TERNARY.exec(src))) {
      const [, , busyArm] = m
      if (!/…|\.\.\./.test(busyArm)) continue
      sites.push({
        rel,
        line: src.slice(0, m.index).split('\n').length,
        tag: enclosingTag(src, m.index),
        busyLabel: busyArm,
      })
    }
  }
  return sites
}

describe('pending feedback comes from the primitive', () => {
  const sites = collect()

  it('finds the ternaries at all (the guard is not silently matching nothing)', () => {
    expect(sites.length).toBeGreaterThan(20)
  })

  it('no ActionButton hand-rolls a pending label — it has a `pending` prop', () => {
    const offenders = sites
      .filter((s) => s.tag === 'ActionButton')
      .map((s) => `${s.rel}:${s.line} → {…? '${s.busyLabel}' : …}`)
    expect(offenders).toEqual([])
  })

  it('no branded primitive hand-rolls a pending label either', () => {
    // The portal and the public site could not adopt ActionButton (its teal
    // gradient would paint over the clinic's own colour), which is exactly
    // why every patient-facing button used to swap its own label. Now that
    // the three branded primitives take `pending`, a ternary on one of them
    // is the same duplication rule 1 forbids on ActionButton.
    const offenders = sites
      .filter((s) => BRANDED_PRIMITIVES.includes(s.tag))
      .map((s) => `${s.rel}:${s.line} <${s.tag}> → {…? '${s.busyLabel}' : …}`)
    expect(
      offenders,
      `Pass pending= instead — a label swap reflows the button under the ` +
        `patient's thumb and announces nothing:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it(`raw <button> pending ternaries only ever go down (ceiling ${RAW_BUTTON_CEILING})`, () => {
    const raw = sites.filter((s) => s.tag === 'button')
    expect(
      raw.length,
      raw.length > RAW_BUTTON_CEILING
        ? `New hand-rolled pending ternary on a raw <button>. Use ActionButton ` +
          `pending= on the dashboard, or add the busy state to the branded ` +
          `primitive on portal/site surfaces.\n` +
          raw.map((s) => `  ${s.rel}:${s.line}`).join('\n')
        : `RAW_BUTTON_CEILING is stale — ${raw.length} left, lower it.`,
    ).toBe(RAW_BUTTON_CEILING)
  })
})

/**
 * THE ESCAPE HATCH IS NEVER THE THING THAT IS BUSY.
 *
 * A spinner is a claim: *this button's work is running*. Putting the shared
 * `pending` flag on Cancel, Back, Keep, or a disclosure toggle makes that
 * claim falsely — and worse, it turns the one control a person reaches for
 * when they want OUT into a second spinner, so the modal reads as though it
 * is saving twice and offering no exit at all.
 *
 * `disabled` is the honest state for these: the exit is unavailable while
 * work runs, and it says so without pretending to be the work.
 *
 * Seventeen of them were live when this guard was written — the punch list
 * had counted six, because it had only looked in modals.
 *
 * The rule is mechanical on purpose, so it cannot be argued with:
 *
 * - An `onClick` that is nothing but a local state setter (`() => setOpen(
 *   false)`, `() => setEditing(true)`) does no work by definition, so it can
 *   never have a busy state.
 * - A button whose whole label is a bare exit word is an escape hatch.
 *   "Cancel appointment", "Cancel scheduled send" and "Cancel add-on" are
 *   real destructive actions and keep their spinner — the exact-match is
 *   what separates them.
 */

const EXIT_LABELS = [
  'Cancel', 'Back', 'Close', 'Keep', 'Dismiss', 'Discard',
  'Never mind', 'Not now', 'Nevermind',
]

/** `<ActionButton …>…</ActionButton>`, non-greedy over a short body. */
const ACTION_BUTTON = /<ActionButton\b[^>]*>[\s\S]{0,160}?<\/ActionButton>/g
/** An onClick that only flips local state — no server action, no handler. */
const PURE_SETSTATE = /onClick=\{\(\)\s*=>\s*\{?\s*set[A-Z][A-Za-z0-9]*\(/
/**
 * `pending={pending && active === 'save'}` — the discriminating shape from
 * `referral-card.tsx`, which names WHICH of several buttons sharing one flag
 * is the one doing the work. A button spelling that has already thought
 * about the question, so it is out of scope here even if its handler happens
 * to be named `setSomething` (several are: a `setFocus` that opens a
 * transition is a handler, not a `useState` setter).
 */
const DISCRIMINATING = /pending=\{[^}]*(?:&&|===)/

function actionButtons(): Array<{ rel: string; line: number; src: string }> {
  const root = process.cwd()
  const out: Array<{ rel: string; line: number; src: string }> = []
  for (const file of ROOTS.flatMap((d) => walk(resolve(root, d)))) {
    const text = readFileSync(file, 'utf8')
    const rel = file.slice(root.length + 1).split('\\').join('/')
    ACTION_BUTTON.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ACTION_BUTTON.exec(text))) {
      out.push({ rel, line: text.slice(0, m.index).split('\n').length, src: m[0] })
    }
  }
  return out
}

describe('escape hatches disable, they do not spin', () => {
  const buttons = actionButtons().filter(
    (b) => /\spending=/.test(b.src) && !DISCRIMINATING.test(b.src),
  )

  it('finds ActionButtons carrying pending at all', () => {
    expect(buttons.length).toBeGreaterThan(20)
  })

  it('a button whose onClick only flips local state never carries `pending`', () => {
    const offenders = buttons
      .filter((b) => PURE_SETSTATE.test(b.src))
      .map((b) => `${b.rel}:${b.line} — ${b.src.replace(/\s+/g, ' ').slice(0, 110)}`)
    expect(offenders).toEqual([])
  })

  it('a bare Cancel/Back/Keep/Close never carries `pending`', () => {
    const offenders = buttons
      .filter((b) => {
        const label = (b.src.match(/>([\s\S]*)<\/ActionButton>$/) ?? [, ''])[1].trim()
        return EXIT_LABELS.includes(label)
      })
      .map((b) => `${b.rel}:${b.line} — ${b.src.replace(/\s+/g, ' ').slice(0, 110)}`)
    expect(offenders).toEqual([])
  })
})
