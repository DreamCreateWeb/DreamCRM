/**
 * Regression guard: native browser dialogs (alert / window.alert /
 * window.confirm) are banned in app/ + components/. They're off-brand, blocking,
 * and inaccessible — use useToast() for feedback and useConfirm() for
 * confirmation instead. This is the enforced replacement for an ESLint rule
 * (the repo has no eslint config; tests run on every deploy).
 *
 * Allowlist: the confirm-dialog's useConfirmSafe() intentionally falls back to
 * window.confirm for shared components that can render outside the provider.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app', 'components']
const ALLOWLIST = new Set<string>([
  // useConfirmSafe()'s deliberate native fallback + the doc comment.
  'components/ui/confirm-dialog.tsx',
  // The provider whose whole job is to replace alert(); its doc comment names it.
  'components/ui/toast.tsx',
])

// window.alert(/window.confirm( anywhere, or a bare alert( call (not a method
// like foo.alert() and not the useConfirm hook). Matched against comment-stripped
// source so prose like "silence every alert" or a "// window.confirm()" note
// doesn't false-positive.
const NATIVE = /window\.(?:alert|confirm)\s*\(|(?<![.\w])alert\(/

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block + JSX {/* */} comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (but not the // in https://)
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('no native browser dialogs', () => {
  it('app/ + components/ use useToast()/useConfirm(), not alert()/window.confirm()', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWLIST.has(file)) continue
        const src = stripComments(readFileSync(file, 'utf8'))
        if (NATIVE.test(src)) {
          const line = src.split('\n').findIndex((l) => NATIVE.test(l)) + 1
          offenders.push(`${file}:${line}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
