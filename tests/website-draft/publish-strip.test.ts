import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Publish state must travel with EVERY editing surface — a real SaaS never
 * hides "you have unpublished changes" behind one page. Source-guard: each
 * Website-workspace editing sub-page loads the draft status and mounts the
 * shared PublishCard (the hub + the Studio's publish bar are covered by
 * their own tests).
 */
const ROOT = resolve(__dirname, '../..')
const EDITING_PAGES = [
  'app/(default)/website/content/page.tsx',
  'app/(default)/website/design/page.tsx',
  'app/(default)/website/templates/page.tsx',
  'app/(default)/website/forms/page.tsx',
  'app/(default)/website/pages/page.tsx',
]

describe('publish state on every editing surface', () => {
  for (const rel of EDITING_PAGES) {
    it(`${rel} loads the draft status and mounts PublishCard`, () => {
      const src = readFileSync(resolve(ROOT, rel), 'utf8')
      expect(src).toMatch(/getWebsiteDraftStatus\(/)
      expect(src).toMatch(/<PublishCard /)
    })
  }
})
