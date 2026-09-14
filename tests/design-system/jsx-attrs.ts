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

const TOP_LEVEL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+[A-Za-z_$][\w$]*/gm

/**
 * Offset of the top-level declaration a position sits inside. Two components
 * in one file each own their own `pending`: a `useTransition` in one and a
 * PROP of the same name in the other are two different flags that happen to
 * share a spelling, and grouping them together reports a defect in neither.
 */
export function topLevelScope(src: string, at: number): number {
  TOP_LEVEL.lastIndex = 0
  let best = 0
  let m: RegExpExecArray | null
  while ((m = TOP_LEVEL.exec(src)) && m.index < at) best = m.index
  return best
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
  scope: number
  name: string
  attrs: Map<string, string>
  children: string
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
      out.push({
        rel,
        line: src.slice(0, m.index).split('\n').length,
        scope: topLevelScope(src, m.index),
        name: m[1],
        attrs: ownAttrs(tag),
        children: wanted.has(m[1]) ? childrenOf(src, m.index, tag, m[1]) : '',
      })
    }
  }
  return out
}
