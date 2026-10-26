import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * A CLIENT COMPONENT NEVER BARE-AWAITS A SERVER ACTION (the 2026-10-23
 * convention, from 1,624 refusals in 14 days of prod logs). A server action
 * is addressed by a per-BUILD id and every merge to `main` is a new build,
 * so a tab opened before a deploy has its next submit REFUSED by Next with a
 * thrown Error. Unhandled, the throw leaves the visitor on a form that
 * silently does nothing — on `/grade`, the paid-ad landing page, exactly
 * the tab that sits open.
 *
 * The Studio has `runAction`; the sign-in, sign-up, reset and onboarding
 * forms classify `isDeploymentSkewError` and reload. This guard holds the
 * PUBLIC forms to the same rule by source: every `await <name>Action(` in a
 * marketing form or an auth screen must sit inside a `try` block.
 *
 * The brace tracker is deliberately simple (comments and string bodies are
 * blanked first); the files it grades are small forms, and a false positive
 * names the file and line so it is a two-minute conversation, not a mystery.
 */

const ROOT = resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/** Blank comments and the insides of string/template literals, keeping
 *  newlines so reported line numbers stay true. */
function blank(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length))
    .replace(/`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, (m) =>
      m[0] + m.slice(1, -1).replace(/[^\n]/g, ' ') + m[0],
    )
}

/** Every `await xAction(` that is not inside a `try { … }` block. */
export function bareActionAwaits(src: string): number[] {
  const text = blank(src)
  const hits: number[] = []
  const stack: Array<'try' | 'other'> = []
  const re = /\btry\s*\{|\{|\}|\bawait\s+\w+Action\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const tok = m[0]
    if (tok === '}') {
      stack.pop()
    } else if (tok === '{') {
      stack.push('other')
    } else if (tok.startsWith('try')) {
      stack.push('try')
    } else if (!stack.includes('try')) {
      hits.push(text.slice(0, m.index).split('\n').length)
    }
  }
  return hits
}

describe('bareActionAwaits — the tracker itself', () => {
  it('flags an await outside try and passes one inside', () => {
    expect(bareActionAwaits('async function f() { const r = await saveAction(x); return r }')).toEqual([1])
    expect(bareActionAwaits('async function f() {\n  try {\n    await saveAction(x)\n  } catch {}\n}')).toEqual([])
  })

  it('ignores awaits in comments and strings', () => {
    expect(bareActionAwaits('// await saveAction(x)\nconst s = "await saveAction(x)"')).toEqual([])
  })

  it('does not let a try block cover an await after it closed', () => {
    expect(bareActionAwaits('try { a() } catch {}\nawait saveAction(x)')).toEqual([2])
  })
})

describe('public forms never bare-await a server action', () => {
  const files = [
    ...walk(join(ROOT, 'app/(marketing)')).filter((f) => /form[^/]*\.tsx$/i.test(f)),
    ...walk(join(ROOT, 'app/(auth)')),
  ]

  it('is looking at the forms it exists for', () => {
    const rel = files.map((f) => relative(ROOT, f))
    expect(rel).toContain('app/(marketing)/grade/grade-form.tsx')
    expect(rel).toContain('app/(marketing)/partner-program/apply-form.tsx')
    expect(rel.some((f) => f.startsWith('app/(auth)/signin/'))).toBe(true)
  })

  it('every await of a server action sits inside a try block', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const line of bareActionAwaits(readFileSync(f, 'utf8'))) {
        offenders.push(`${relative(ROOT, f)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the grader form classifies a redeploy and refreshes', () => {
  const src = readFileSync(join(ROOT, 'app/(marketing)/grade/grade-form.tsx'), 'utf8')

  it('imports the shared classifier and reloads on skew', () => {
    expect(src).toMatch(/isDeploymentSkewError/)
    expect(src).toMatch(/window\.location\.reload\(\)/)
  })

  it('offers the honest retry line for any other throw', () => {
    expect(src).toMatch(/GRADE_FAILED_MESSAGE/)
  })
})
