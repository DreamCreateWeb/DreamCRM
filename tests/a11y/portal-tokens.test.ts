import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

/**
 * Portal semantic-token guard — "what error/warning/success looks like" is
 * decided ONCE in components/patient-portal/ui.tsx. Any raw use of those
 * meaning-hexes elsewhere in the portal fails here with the file, so the
 * consolidation can't silently erode. New meaning-colors: add the token to
 * ui.tsx first, then list its hex here.
 */

const ROOT = resolve(__dirname, '../..')
/**
 * Every surface that paints portal chrome at a patient. The five token landing
 * pages were missing (DREAMCRM-50) — `portal-brand.test.ts` already lists them
 * as patient surfaces and derives the clinic brand for each, so a raw meaning
 * hex could sit on a page that arrives by text or email while this guard
 * reported the portal clean. Keep the two lists in step.
 */
const SCAN_DIRS = [
  'app/(portal)',
  'components/patient-portal',
  'app/b/[token]',
  'app/c/[token]',
  'app/i/[token]',
  'app/n/[token]',
  'app/r/[token]',
]
const TOKEN_HOME = 'components/patient-portal/ui.tsx'

/**
 * The review landing is the one token page painted in the CLINIC-SITE palette
 * rather than the portal's — it reads `var(--c-ink-muted, …)` and friends. The
 * fallback inside that var happens to be the same hex `PORTAL_MUTED` owns, so
 * scanning it here reports a portal-token violation on a page that is not a
 * portal surface. Its local consts are a `site-tokens` concern.
 *
 * The test below re-checks that claim, so if this page ever moves onto the
 * portal palette the exemption fails rather than quietly covering it.
 */
const SITE_PALETTE_PAGES = ['app/r/[token]']

// hex → the token that owns it.
const OWNED_HEXES: Record<string, string> = {
  // The quiet step for secondary copy. Added 2026-09-14 with batch 62: it was
  // spelled raw in the layout, the chrome and the message list, which is why
  // "one tone in patient-portal/ui.tsx" was not true of the one tone the axe
  // baseline had been carrying a ceiling for on nine portal stops.
  '#6B635A': 'PORTAL_MUTED',
  // The inset well — the skeleton's pulse and a taken time sit in it. Added
  // 2026-09-15 with batch 64: a SURFACE is half of a contrast pair, and while
  // it was spelled raw in the slot picker the label on it was never graded
  // against anything. It was 1.85:1.
  '#F3EEE7': 'PORTAL_WASH',
  '#B4231F': 'PORTAL_ERROR',
  '#FBF3E4': 'PORTAL_WARN_BG',
  '#8A6116': 'PORTAL_WARN_INK',
  '#E5EFE6': 'PORTAL_SUCCESS_BG',
  '#2F6B3C': 'PORTAL_SUCCESS_INK',
  '#F7E9E6': 'PORTAL_DANGER_BG',
  '#9B4434': 'PORTAL_DANGER_INK',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('portal semantic tokens (single source of truth)', () => {
  it('meaning-hexes appear ONLY in the token module', () => {
    const hits: string[] = []
    for (const base of SCAN_DIRS) {
      for (const file of walk(join(ROOT, base))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/')
        if (rel === TOKEN_HOME) continue
        if (SITE_PALETTE_PAGES.some((p) => rel.startsWith(`${p}/`))) continue
        const src = readFileSync(file, 'utf8')
        for (const [hex, token] of Object.entries(OWNED_HEXES)) {
          if (src.toLowerCase().includes(hex.toLowerCase())) {
            hits.push(`${rel}: raw ${hex} — use ${token} from patient-portal/ui`)
          }
        }
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('the site-palette exemption is still a site-palette page', () => {
    // `app/r/[token]` is skipped because it paints the clinic-site palette, and
    // `var(--c-ink-muted, #6B635A)` carries the same hex PORTAL_MUTED owns. If
    // it ever moves onto the portal palette that reason evaporates, so check it
    // rather than trusting the comment.
    for (const page of SITE_PALETTE_PAGES) {
      const src = walk(join(ROOT, page))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n')
      expect(src, `${page} no longer paints the clinic-site palette`).toContain('var(--c-')
      expect(src, `${page} now imports portal tokens — drop its exemption`).not.toContain(
        'patient-portal/ui',
      )
    }
  })

  it('sweeps every patient surface, token landing pages included', () => {
    // The scope this guard shipped with was the portal tree only, so the five
    // pages that arrive by text or email were unswept — and three of them were
    // painting the error hex raw. portal-brand.test.ts already treats these as
    // patient surfaces; the two lists have to stay in step.
    const swept = SCAN_DIRS.flatMap((base) =>
      walk(join(ROOT, base)).map((f) => relative(ROOT, f).replace(/\\/g, '/')),
    )
    for (const page of [
      'app/b/[token]/pay-form.tsx',
      'app/c/[token]/confirm-form.tsx',
      'app/i/[token]/page.tsx',
      'app/n/[token]/survey-form.tsx',
      'app/r/[token]/page.tsx',
    ]) {
      expect(swept, `${page} must be swept`).toContain(page)
    }
  })

  it('the token module actually defines every owned hex (no orphan bans)', () => {
    const src = readFileSync(join(ROOT, TOKEN_HOME), 'utf8')
    for (const [hex, token] of Object.entries(OWNED_HEXES)) {
      expect(src, `${token} should define ${hex}`).toContain(hex)
      expect(src).toContain(`export const ${token}`)
    }
  })
})
