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
// The bare forms matter as much as the `window.`-prefixed ones: `alert` and
// `confirm` are both globals, so `confirm('Delete this patient?')` is the
// spelling somebody actually reaches for. The rule used to catch bare `alert(`
// and NOT bare `confirm(` — an asymmetry, not a decision, and a mutation pass
// (DREAMCRM-50) confirmed the guard stayed green with that call live.
//
// Bare `confirm(` needs one extra discriminator that bare `alert(` does not.
// The sanctioned replacement is bound as `const confirm = useConfirm()` at 42
// call sites, so matching the bare name alone reports every correct use in the
// repo as a violation. The two are told apart by their ARGUMENT: the native
// dialog takes a string (or nothing), the hook takes an options object. So
// `confirm('…')` is the ban and `await confirm({ title: … })` is the fix.
// The no-arg form `confirm()` is deliberately NOT matched: it would show an
// empty dialog and nobody writes it, while `function confirm() {` — a local
// helper of that name — appears three times in the tree.
const NATIVE =
  /window\.(?:alert|confirm)\s*\(|(?<![.\w])alert\s*\(|(?<![.\w])confirm\s*\(\s*['"`]/

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
  it('tells the native dialog apart from the useConfirm() hook', () => {
    // Both directions, because each has already been wrong once: the rule was
    // blind to the native call, and the obvious widening flagged all 42 correct
    // uses of the hook. A rule that matches nothing, and a rule that matches
    // everything, are the same kind of useless.
    for (const banned of [
      "alert('Saved')",
      "window.alert('Saved')",
      "window.confirm('Delete?')",
      "confirm('Delete this patient?')",
      'confirm("Delete this patient?")',
      'confirm(`Delete ${name}?`)',
    ]) {
      expect(NATIVE.test(banned), `${banned} should be banned`).toBe(true)
    }
    for (const allowed of [
      'await confirm({ title: 4 })',
      'const ok = await confirm({\n  title: 1,\n})',
      'useConfirm()',
      'useConfirmSafe()',
      'toast.alert({ title: 1 })',
      'setConfirm(true)',
      'function confirm() {',
      'const ok = confirm()',
    ]) {
      expect(NATIVE.test(allowed), `${allowed} should be allowed`).toBe(false)
    }
  })

  it('app/ + components/ use useToast()/useConfirm(), not alert()/window.confirm()', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWLIST.has(file.replace(/\\/g, '/'))) continue
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
