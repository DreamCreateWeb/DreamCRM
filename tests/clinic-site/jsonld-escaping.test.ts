import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { jsonLdHtml } from '@/lib/json-ld'
import { faqPageJsonLd } from '@/lib/clinic-site-jsonld'

/**
 * JSON-LD escaping (audit B5).
 *
 * Every structured-data block on a public clinic site is built from
 * clinic-authored text — FAQ answers, service descriptions, blog excerpts, team
 * bios, job descriptions. Those blocks used to render as `JSON.stringify(ld)`
 * straight into a `<script>`, and the HTML parser closes a `<script>` at the
 * first `</script` in its raw text no matter what quoting the JSON thinks it
 * has. One `</script>` pasted into an FAQ answer therefore ends the tag early
 * and spills the remaining JSON onto the page as visible text.
 *
 * `jsonLdHtml` closes it, and the adoption guard at the bottom keeps it closed:
 * it fails the moment a page hand-rolls a JSON-LD script tag again.
 */

describe('jsonLdHtml', () => {
  it('escapes a </script> hiding inside a clinic-authored FAQ answer', () => {
    const ld = faqPageJsonLd([
      { question: 'Do you take my insurance?', answer: 'We do. </script><img src=x onerror=alert(1)>' },
    ])
    const html = jsonLdHtml(ld)
    expect(html).not.toContain('</script')
    expect(html).not.toContain('<img')
    expect(html).toContain('\\u003c/script\\u003e')
  })

  it('round-trips: the escaped payload parses back to the identical object', () => {
    const ld = faqPageJsonLd([
      { question: 'Hours?', answer: 'Mon–Fri. <b>Closed</b> weekends & holidays.' },
    ])
    expect(JSON.parse(jsonLdHtml(ld))).toEqual(ld)
  })

  it('escapes every markup-significant character, not just the ones in </script>', () => {
    const html = jsonLdHtml({ v: '<>&' })
    expect(html).toBe('{"v":"\\u003c\\u003e\\u0026"}')
    expect(JSON.parse(html)).toEqual({ v: '<>&' })
  })

  it('escapes the JS line terminators JSON.stringify leaves raw', () => {
    const html = jsonLdHtml({ v: 'a\u2028b\u2029c' })
    expect(html).not.toContain('\u2028')
    expect(html).not.toContain('\u2029')
    expect(JSON.parse(html)).toEqual({ v: 'a\u2028b\u2029c' })
  })

  it('leaves ordinary structured data byte-for-byte alone', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'Dentist', name: 'Bright Smiles' }
    expect(jsonLdHtml(ld)).toBe(JSON.stringify(ld))
  })

  it('emits valid JSON rather than crashing when a builder returned undefined', () => {
    expect(jsonLdHtml(undefined)).toBe('null')
  })
})

// ── Adoption guard ───────────────────────────────────────────────────────────

const SHARED = 'components/json-ld.tsx'

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(full)) out.push(full)
    }
  }
  for (const base of ['app', 'components', 'lib']) walk(join(process.cwd(), base))
  return out
}

function repoPath(absolute: string): string {
  return relative(process.cwd(), absolute).split('\\').join('/')
}

/** Files that RENDER a JSON-LD script tag (a `type=` attribute, not a comment). */
function jsonLdRenderers(): string[] {
  return sourceFiles()
    .filter((f) => /type="application\/ld\+json"/.test(readFileSync(f, 'utf8')))
    .map(repoPath)
}

describe('shared JSON-LD renderer adoption', () => {
  it('the scanner still sees the source tree (it did not silently break)', () => {
    expect(sourceFiles().length).toBeGreaterThan(500)
  })

  it('the shared component is the ONLY place a JSON-LD script tag is rendered', () => {
    expect(
      jsonLdRenderers(),
      'These files render a <script type="application/ld+json"> themselves. JSON.stringify ' +
        'does not escape "</script", so clinic-authored content can close the tag early and ' +
        `break the page — render structured data with <JsonLdScript data={...} /> from ${SHARED}.`,
    ).toEqual([SHARED])
  })

  it('the shared component escapes rather than stringifying inline', () => {
    const src = readFileSync(join(process.cwd(), SHARED), 'utf8')
    expect(src).toContain('jsonLdHtml')
    expect(src).not.toMatch(/__html:\s*JSON\.stringify/)
  })

  it('no page reaches structured data into dangerouslySetInnerHTML with a bare stringify', () => {
    const offenders = sourceFiles()
      .filter((f) => /__html:\s*JSON\.stringify\(\s*\w*(?:[Ll]d|[Jj]son)\w*\s*\)/.test(readFileSync(f, 'utf8')))
      .map(repoPath)
    expect(offenders, 'Use jsonLdHtml() — JSON.stringify alone cannot be embedded in a <script>.').toEqual([])
  })
})
