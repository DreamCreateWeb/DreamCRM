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
const SCAN_DIRS = ['app/(portal)', 'components/patient-portal']
const TOKEN_HOME = 'components/patient-portal/ui.tsx'

// hex → the token that owns it.
const OWNED_HEXES: Record<string, string> = {
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
        const rel = relative(ROOT, file)
        if (rel === TOKEN_HOME) continue
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

  it('the token module actually defines every owned hex (no orphan bans)', () => {
    const src = readFileSync(join(ROOT, TOKEN_HOME), 'utf8')
    for (const [hex, token] of Object.entries(OWNED_HEXES)) {
      expect(src, `${token} should define ${hex}`).toContain(hex)
      expect(src).toContain(`export const ${token}`)
    }
  })
})
