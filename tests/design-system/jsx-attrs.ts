/**
 * A JSX opening-tag reader for the source-scanning design-system guards.
 *
 * WHY THIS EXISTS. The obvious regex for an opening tag — `<Tag[^>]*>` —
 * stops at the first `>` in the source, and `=>` contains one. So for
 *
 *     <ActionButton onClick={() => save()} pending={pending}>
 *
 * it matches only `<ActionButton onClick={() =`, and every attribute written
 * AFTER an arrow handler is invisible. That is where `pending=` usually sits,
 * which is how the first version of the shared-pending scan reported a clean
 * tree with two dozen offenders in it.
 *
 * The mirror mistake is over-reaching: once braces are balanced properly, a
 * tag like
 *
 *     <SettingsTabs tabs={[{ content: <ActionButton pending={pending} /> }]} />
 *
 * legitimately spans its whole nested subtree, and a naive `pending=` search
 * inside it picks up a CHILD's prop and reports its parent. `ownAttrs` reads
 * only names at brace depth 0, so a nested element's props stay its own.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const BACKSLASH = String.fromCharCode(92)

/** Every `.tsx` under the given roots, relative paths, `/`-separated. */
export function tsxFiles(roots: string[], root = process.cwd()): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (full.endsWith('.tsx')) out.push(full)
    }
  }
  for (const r of roots) walk(resolve(root, r))
  return out.map((f) => f.slice(root.length + 1).split(BACKSLASH).join('/'))
}

export function read(rel: string, root = process.cwd()): string {
  return readFileSync(resolve(root, rel), 'utf8')
}

/**
 * The opening tag that starts at `at` (which must be the `<`), brace- and
 * quote-balanced, or null if it never closes. `=>` is not a close.
 */
export function openingTag(src: string, at: number): string | null {
  let depth = 0
  let quote: string | null = null
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === BACKSLASH) i++
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0 && src[i - 1] !== '=') return src.slice(at, i + 1)
  }
  return null
}

/** The tag's OWN attributes (depth 0 only) as name → source expression. */
export function ownAttrs(tag: string): Map<string, string> {
  const out = new Map<string, string>()
  let i = 1
  while (i < tag.length && /[A-Za-z0-9_.]/.test(tag[i])) i++
  while (i < tag.length) {
    if (tag[i] === '>' || (tag[i] === '/' && tag[i + 1] === '>')) break
    const head = tag.slice(i).match(/^\s*([A-Za-z_$][\w$:-]*)\s*=\s*/)
    if (!head) {
      i++
      continue
    }
    let j = i + head[0].length
    if (tag[j] === '{') {
      const start = j
      let depth = 0
      let quote: string | null = null
      for (; j < tag.length; j++) {
        const c = tag[j]
        if (quote) {
          if (c === quote) quote = null
          else if (c === BACKSLASH) j++
        } else if (c === '"' || c === "'" || c === '`') quote = c
        else if (c === '{') depth++
        else if (c === '}') {
          depth--
          if (depth === 0) {
            out.set(head[1], tag.slice(start + 1, j).trim())
            j++
            break
          }
        }
      }
    } else if (tag[j] === '"' || tag[j] === "'") {
      const q = tag[j]
      const start = ++j
      while (j < tag.length && tag[j] !== q) j++
      out.set(head[1], tag.slice(start, j))
      j++
    }
    i = j
  }
  return out
}

const TOP_LEVEL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm

export interface Scope {
  /** Offset of the declaration — the grouping key. */
  at: number
  /** Its NAME, so a guard's exemption list can read `file|Component|flag`
   *  rather than `file|4713|flag`, which any edit above it invalidates. */
  name: string
}

/**
 * The top-level declaration a position sits inside. Two components in one
 * file each own their own `pending`: a `useTransition` in one and a PROP of
 * the same name in the other are two different flags that happen to share a
 * spelling, and grouping them together reports a defect in neither.
 */
export function topLevelScope(src: string, at: number): Scope {
  TOP_LEVEL.lastIndex = 0
  let best: Scope = { at: 0, name: '<module>' }
  let m: RegExpExecArray | null
  while ((m = TOP_LEVEL.exec(src)) && m.index < at) best = { at: m.index, name: m[1] }
  return best
}

function nextScopeStart(src: string, from: number): number {
  TOP_LEVEL.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOP_LEVEL.exec(src))) if (m.index > from) return m.index
  return src.length
}

/**
 * Is this position inside a `.map(` callback — i.e. rendered once per ROW?
 *
 * This is the half a sibling-based scan structurally cannot see. One
 * `<ActionButton pending={flag}>` written inside `rows.map(…)` is ONE source
 * site and N buttons on screen, so it never has a sibling to group with — and
 * "acting on one row spins every row" is the commonest form of the defect.
 *
 * It asks about EVERY enclosing unclosed `(`, not just the nearest one, and
 * the first version of this got that wrong in a way its red run could not
 * show: a JSX ternary wraps its arms in parens, so the nearest unclosed `(`
 * above a per-row button is `) : (` and the `.map(` two levels out was never
 * consulted. The rule reported clean with the defect live on the very site
 * it was written for. Stop at the component boundary — JSX is always inside
 * one, and an unbounded scan re-reads the file for every tag.
 */
export function insideMapCallback(src: string, at: number, from = 0): boolean {
  let depth = 0
  for (let i = at - 1; i >= from; i--) {
    const c = src[i]
    if (c === ')') depth++
    else if (c === '(') {
      if (depth === 0) {
        if (/\.\s*(?:map|flatMap)\s*$/.test(src.slice(Math.max(from, i - 24), i))) return true
        // Not this one — keep walking OUT through the enclosing parens.
      } else depth--
    }
  }
  return false
}

/**
 * Is `name` destructured from a `useTransition()` in this scope?
 *
 * A flag that IS the transition means "something in this component is
 * running", which is exactly the claim that goes wrong when it is read once
 * per row. A prop, or a derived `const busy = pendingId === row.id`, has
 * already been narrowed by whoever wrote it — narrowing it again here would
 * report eight correct sites to catch two.
 */
export function isTransitionFlag(src: string, scope: Scope, name: string): boolean {
  const body = src.slice(scope.at, nextScopeStart(src, scope.at))
  return new RegExp(`\\[\\s*${name}\\s*,[^\\]]*\\]\\s*=\\s*useTransition\\(`).test(body)
}

/**
 * The literal children between an opening tag and its matching close, or ''
 * for a self-closing tag. Nested same-named elements are counted, so an
 * ActionButton inside an ActionButton does not end the outer one early.
 */
export function childrenOf(src: string, at: number, tag: string, name: string): string {
  if (tag.endsWith('/>')) return ''
  const start = at + tag.length
  const open = new RegExp(`<${name}\\b`, 'g')
  const close = new RegExp(`</${name}\\s*>`, 'g')
  close.lastIndex = start
  open.lastIndex = start
  let depth = 0
  let c = close.exec(src)
  while (c) {
    let o = open.exec(src)
    while (o && o.index < c.index) {
      depth++
      o = open.exec(src)
    }
    if (depth === 0) return src.slice(start, c.index)
    depth--
    open.lastIndex = c.index
    close.lastIndex = c.index + c[0].length
    c = close.exec(src)
  }
  return ''
}

export interface TagSite {
  rel: string
  line: number
  scope: Scope
  name: string
  attrs: Map<string, string>
  children: string
  /** Rendered once per row — see `insideMapCallback`. */
  readonly inMap: boolean
  /** The file's source, so a caller can ask `isTransitionFlag` about it. */
  src: string
}

/**
 * Every JSX opening tag in the given files, with its own attributes.
 * `children` is only read for the tag names in `childrenFor` — walking to the
 * matching close for all ~60k tags in the tree costs seconds for nothing.
 */
export function tagSites(files: string[], childrenFor: string[] = [], root = process.cwd()): TagSite[] {
  const wanted = new Set(childrenFor)
  const out: TagSite[] = []
  for (const rel of files) {
    const src = read(rel, root)
    const RE = /<([A-Za-z][A-Za-z0-9_.]*)\b/g
    let m: RegExpExecArray | null
    while ((m = RE.exec(src))) {
      const tag = openingTag(src, m.index)
      if (!tag) continue
      const start = m.index
      const scope = topLevelScope(src, start)
      out.push({
        rel,
        line: src.slice(0, start).split('\n').length,
        scope,
        name: m[1],
        attrs: ownAttrs(tag),
        children: wanted.has(m[1]) ? childrenOf(src, start, tag, m[1]) : '',
        // Lazy: the backward scan is only worth paying for on the handful of
        // tags a caller actually asks about, not on all ~60k in the tree.
        get inMap() {
          return insideMapCallback(src, start, scope.at)
        },
        src,
      })
    }
  }
  return out
}

/** From a declaration, the text up to the close of its first `{ … }` block. */
function braceBody(src: string, at: number): string {
  const open = src.indexOf('{', at)
  if (open < 0) return src.slice(at, at + 200)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(at, i + 1)
    }
  }
  return src.slice(at)
}

/**
 * The starter paired with `flag` in this scope's `useTransition()` — the
 * `startTransition` half of `const [pending, startTransition] = …`.
 */
export function transitionStarter(src: string, scope: Scope, flag: string): string | null {
  const body = src.slice(scope.at, nextScopeStart(src, scope.at))
  const m = body.match(new RegExp(`\\[\\s*${flag}\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\]\\s*=\\s*useTransition\\(`))
  return m ? m[1] : null
}

/**
 * Does this `onClick` expression reach `starter(` — i.e. does pressing this
 * button START the transition the flag belongs to?
 *
 * The distinction the converse rule stands on. A button that starts the work
 * owes the person a busy state. A button that is merely UNAVAILABLE while a
 * sibling works, or whose handler hands the transition to a parent, or which
 * only flips local state, owes them nothing but `disabled` — and a rule that
 * cannot tell those apart reports twenty correct sites to catch eleven wrong
 * ones, which is a rule people switch off.
 *
 * Follows one hop: the expression itself, plus the body of any same-scope
 * `function name(…)` / `const name = …` it names.
 */
export function startsTransition(src: string, scope: Scope, onClick: string, starter: string): boolean {
  const body = src.slice(scope.at, nextScopeStart(src, scope.at))
  const call = new RegExp(`\\b${starter}\\s*\\(`)
  if (call.test(onClick)) return true
  for (const id of Array.from(new Set(onClick.match(/[A-Za-z_$][\w$]*/g) ?? []))) {
    if (id === starter) continue
    const decl = body.match(new RegExp(`(?:async\\s+)?function\\s+${id}\\s*\\(|const\\s+${id}\\s*=`))
    if (!decl || decl.index === undefined) continue
    // The handler's OWN body, brace-matched. A fixed character window was the
    // first attempt and it ran straight past the closing brace into the NEXT
    // handler — so `onMarkContacted`, which hands its transition to a parent,
    // read as starting one because `onConvert` sits below it.
    if (call.test(braceBody(body, decl.index))) return true
  }
  return false
}
