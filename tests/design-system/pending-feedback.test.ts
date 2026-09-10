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
 */

const ROOTS = ['app', 'components']

/** `{cond ? 'Saving…' : 'Save'}` — a JSX child whose two arms are string
 *  literals and whose busy arm carries an ellipsis. */
const LABEL_TERNARY = /\{\s*([^{}?]{1,80}?)\s*\?\s*'([^']*)'\s*:\s*'([^']*)'\s*\}/g

/** Raw `<button>` sites still hand-rolling the swap. Only ever lower this. */
const RAW_BUTTON_CEILING = 78

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
