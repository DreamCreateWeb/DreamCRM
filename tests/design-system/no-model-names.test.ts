import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * No model identifiers in RENDERED dashboard copy. The Connected-accounts
 * page's AI row named model families in its description; the standing
 * ruling is that no model identifier lives in a repo artifact, and a
 * practice reading "Powers inbox triage (…)" learns nothing from a family
 * name it cannot act on. Comments are stripped; code that names a model to
 * CALL it (lib/ai*.ts, the mailbox service) is not rendered copy and is
 * outside the scan.
 */
const ROOTS = ['app/(default)', 'app/(double-sidebar)', 'app/(onboarding)', 'components']

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

describe('no model identifiers in rendered dashboard copy', () => {
  it('holds model family names and model ids at zero across the dashboard trees', () => {
    const files: string[] = []
    for (const root of ROOTS) walk(join(process.cwd(), root), files)
    const offenders: string[] = []
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'))
      if (/\b(Haiku|Sonnet|Opus)\b|claude-[a-z0-9-]+/.test(code)) offenders.push(relative(process.cwd(), file))
    }
    expect(offenders, 'rendered copy names a model — say what the feature does, not which model does it').toEqual([])
  })
})
