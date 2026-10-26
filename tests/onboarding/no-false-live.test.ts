import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * NO FALSE "LIVE". Since the go-live lever (migration 0147) a new clinic's
 * public site serves the coming-soon page to everyone but editors until the
 * Publish card is pulled — yet the step-3 copy, the welcome email's subject
 * and body, the AI interview's reveal screen, the homepage's how-it-works
 * and the help doc all told a new owner the site "is live". The first email
 * an owner ever receives from Dream Create was false on its subject line,
 * and an owner who forwarded that link got a coming-soon page and a confused
 * reply. ACTIVATION law 3: honest while pending.
 *
 * These sources may say the site is READY, DRAFTED, BUILT or WAITING — and
 * that only the owner can see it until they publish — but never that it is
 * live. Comments are stripped first: the onboarding-complete page explains
 * the old trap in a comment, which is the one place the phrase belongs.
 */

const ROOT = resolve(__dirname, '../..')

const SOURCES = [
  'lib/email.ts',
  'app/(onboarding)/welcome/welcome-interview.tsx',
  'app/(onboarding)/onboarding-03/page.tsx',
  'app/(onboarding)/onboarding-complete/page.tsx',
  'lib/marketing/docs.ts',
  'app/(marketing)/page.tsx',
]

const FALSE_LIVE = /\b(site|website)\b[^.\n]{0,40}\b(is|are|already|now|goes|go)\s+live\b/i

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length))
}

describe('the signup journey never tells a new clinic its private site is live', () => {
  it('scans the five surfaces that said it', () => {
    for (const f of SOURCES) expect(() => readFileSync(join(ROOT, f), 'utf8')).not.toThrow()
  })

  for (const f of SOURCES) {
    it(`${f} carries no "site is live" claim`, () => {
      const text = stripComments(readFileSync(join(ROOT, f), 'utf8'))
      const hits: string[] = []
      for (const [i, line] of Array.from(text.split('\n').entries())) {
        if (FALSE_LIVE.test(line)) hits.push(`${f}:${i + 1}  ${line.trim()}`)
      }
      expect(hits).toEqual([])
    })
  }

  it('the welcome email says what is true: drafted, private until published, with the Website hub as its door', () => {
    const email = readFileSync(join(ROOT, 'lib/email.ts'), 'utf8')
    expect(email).toContain("subject: 'Welcome to DreamCRM — your trial is live'")
    expect(email).toMatch(/Your website is drafted and waiting at/)
    expect(email).toMatch(/only you can see it until you publish/)
    expect(email).toMatch(/buttonUrl: data\.websiteHubUrl/)
    const caller = readFileSync(join(ROOT, 'app/(onboarding)/actions.ts'), 'utf8')
    expect(caller).toMatch(/websiteHubUrl: `\$\{base\}\/website`/)
  })
})
