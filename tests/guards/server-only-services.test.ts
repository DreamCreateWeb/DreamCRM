import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * EVERY SERVICE MODULE DECLARES ITSELF SERVER-ONLY.
 *
 * `import 'server-only'` is not decoration: it is the thing that makes a
 * client component importing a service a BUILD ERROR instead of a bundle
 * that ships database code — and, with it, whatever query strings, table
 * names and env-var reads that code carries — to a browser. The convention
 * holds at 193 of 196 modules today, which is exactly when a convention is
 * worth freezing: the erosion that matters is one new file at a time, and
 * nobody reviewing that file has the other 195 in their head.
 *
 * The three exceptions are all deliberate and all reasoned below. Note what
 * is NOT an exception: a barrel that re-exports server-only modules needs no
 * banner of its own, because importing it pulls those modules in and their
 * banners throw. The protection is transitive; the comment is the only part
 * that has to be written by hand.
 */

const ALLOWED: Array<{ file: string; why: string }> = [
  {
    file: 'lib/services/demo-constants.ts',
    why: 'a pure constant (the demo clinic’s slug) with no database and nothing to leak',
  },
  {
    file: 'lib/services/service-library-seed.ts',
    why: 'pure catalog data, imported by client-renderable demos and tests on purpose — its own header says so',
  },
  {
    file: 'lib/services/pms/index.ts',
    why: 'a barrel; it re-exports modules that carry the banner, so the protection is transitive',
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('lib/services is server-only', () => {
  const root = process.cwd()
  const files = walk(resolve(root, 'lib/services'))

  it('every module carries the banner, or is listed with a reason', () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.slice(root.length + 1)
      if (ALLOWED.some((a) => a.file === rel)) continue
      // Only the TOP of the file counts — a banner buried below an import
      // that already pulled in the database has protected nothing.
      const head = readFileSync(file, 'utf8').slice(0, 400)
      if (/import ['"]server-only['"]/.test(head)) continue
      offenders.push(rel)
    }
    expect(
      offenders,
      `A service module without \`import 'server-only'\` can be imported by a\n` +
        `client component, and the database code ships to the browser instead of\n` +
        `failing the build. Add the banner, or add an ALLOWED entry saying why\n` +
        `this module is genuinely safe on both sides:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the exceptions are still what their reasons claim', () => {
    for (const a of ALLOWED) {
      const text = readFileSync(resolve(root, a.file), 'utf8')
      expect(a.why.length, `${a.file} needs a real reason`).toBeGreaterThan(30)
      // The load-bearing claim shared by all three: no database import. If
      // one of these ever reaches for the db, its exemption is void.
      expect(text, `${a.file} now imports the database — its exemption is void`).not.toMatch(
        /from ['"]@\/lib\/db['"]/,
      )
    }
  })

  it('is actually looking at the service tree', () => {
    // A guard whose walk silently returns nothing passes forever.
    expect(files.length).toBeGreaterThan(150)
  })
})
