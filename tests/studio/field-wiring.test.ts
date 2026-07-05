import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Adversarial wiring guard for the Website Studio.
 *
 * The #1 class of editor bug is a dead affordance: the public template tags a
 * region with `data-edit-field`/`data-edit-kind`, the EditBridge faithfully
 * postMessages the intent to the Studio — and the Studio has no handler for it,
 * so clicking it either silently fails or opens a broken modal. This test reads
 * the ACTUAL source and cross-references every editable region the template
 * emits against the Studio's handler registries, so any new tag without a
 * matching handler (or vice versa) trips the build.
 *
 * Reading source text (not importing the React tree) keeps the guard cheap and
 * lets it see the raw `data-edit-*` attributes the way a browser would.
 */

const ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

// Every clinic-site file that can mount an editable region in edit mode — the
// shared chrome/template components AND every public subpage that instruments
// its own sections (the canvas spans Home → About → Insurance → … in edit
// mode, so a tag on any of them postMessages the same intents to the Studio).
const TEMPLATE_FILES = [
  'components/clinic-site/modern-template.tsx',
  'components/clinic-site/site-header.tsx',
  'components/clinic-site/site-footer.tsx',
  'components/clinic-site/numbered-steps.tsx',
  'components/clinic-site/closing-cta.tsx',
  'app/site/[slug]/about/page.tsx',
  'app/site/[slug]/faq/page.tsx',
  'app/site/[slug]/insurance/page.tsx',
  'app/site/[slug]/new-patients/page.tsx',
  'app/site/[slug]/payment-financing/page.tsx',
  'app/site/[slug]/team/page.tsx',
  'app/site/[slug]/team/[staffSlug]/page.tsx',
  'app/site/[slug]/services/page.tsx',
  'app/site/[slug]/services/[serviceSlug]/page.tsx',
  'app/site/[slug]/careers/page.tsx',
  'app/site/[slug]/careers/[jobSlug]/page.tsx',
  'app/site/[slug]/dental-plans/page.tsx',
  'app/site/[slug]/blog/page.tsx',
  'app/site/[slug]/blog/[postSlug]/page.tsx',
  'app/site/[slug]/book/page.tsx',
]

const studioSrc = read('app/(default)/website/website-studio.tsx')
const actionsSrc = read('app/(default)/website/website-actions.ts')

/**
 * Pull (field, kind) pairs out of a source file. Handles both emission styles:
 *  - direct JSX attrs:        data-edit-field="x" data-edit-kind="text"
 *  - object-spread props:     'data-edit-field': 'x', 'data-edit-kind': 'modal'
 * Template-literal fields (e.g. `copy:home.callout.${i}.title`) are normalised
 * to a `copy:*` marker since the dynamic suffix is just an index.
 */
function extractTags(src: string): { field: string; kind: string }[] {
  const out: { field: string; kind: string }[] = []
  // Direct attribute style — field then (within a small window) kind.
  const directField =
    /data-edit-field=(?:"([^"]+)"|\{`([^`]+)`\})/g
  let m: RegExpExecArray | null
  while ((m = directField.exec(src))) {
    const raw = m[1] ?? m[2] ?? ''
    const after = src.slice(m.index, m.index + 220)
    const kindM = after.match(/data-edit-kind=(?:"([^"]+)"|'([^']+)')/)
    const kind = kindM?.[1] ?? kindM?.[2] ?? 'text'
    out.push({ field: normalise(raw), kind })
  }
  // Object-spread style — 'data-edit-field': 'x' (+ nearby 'data-edit-kind').
  const spreadField = /'data-edit-field':\s*'([^']+)'/g
  while ((m = spreadField.exec(src))) {
    const after = src.slice(m.index, m.index + 220)
    const kindM = after.match(/'data-edit-kind':\s*'([^']+)'/)
    out.push({ field: normalise(m[1]), kind: kindM?.[1] ?? 'text' })
  }
  // Component-prop style — <OvalPortrait editField="heroImageUrl" editKind=…>:
  // the wrapper forwards editField→data-edit-field, defaulting editKind to
  // "image" (OvalPortrait's default). Capturing these makes the image-field
  // assertions actually validate the hero photos (which are tagged via props,
  // not literal data-edit-* attributes).
  const propField = /editField="([^"]+)"/g
  while ((m = propField.exec(src))) {
    const after = src.slice(m.index, m.index + 220)
    const kindM = after.match(/editKind="([^"]+)"/)
    out.push({ field: normalise(m[1]), kind: kindM?.[1] ?? 'image' })
  }
  return out
}

// `${...}` interpolation → `*` so `copy:home.callout.${i}.title` collapses to a
// stable marker; bare copy keys keep their literal value.
function normalise(field: string): string {
  if (field.includes('${')) return field.replace(/\$\{[^}]+\}/g, '*')
  return field
}

// ── Studio handler registries, parsed from the source so the test follows the
//    real code (not a hand-copied list that could rot). We isolate the literal
//    body, then read only TOP-LEVEL keys (brace-depth 0), so nested objects
//    (e.g. LINK_OUTS' `{ href, cta, desc }`) don't leak their inner keys.
function literalBody(src: string, label: string): string {
  const start = src.search(new RegExp(`const ${label}\\b`))
  if (start < 0) return ''
  const openIdx = src.indexOf('=', start)
  // Find the first { or [ after the '='.
  let i = openIdx
  while (i < src.length && src[i] !== '{' && src[i] !== '[') i++
  const open = src[i]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  const from = i
  for (; i < src.length; i++) {
    if (src[i] === open) depth++
    else if (src[i] === close) {
      depth--
      if (depth === 0) return src.slice(from + 1, i)
    }
  }
  return ''
}

function parseSetMembers(src: string, label: string): Set<string> {
  const set = new Set<string>()
  const body = literalBody(src, label)
  if (!body) return set
  // Walk only top-level (depth-0) keys: `key:` / `'key':` / `"key":` openers,
  // plus quoted entries for `new Set([...])` of plain strings.
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '{' || c === '[' || c === '(') depth++
    else if (c === '}' || c === ']' || c === ')') depth--
    else if (depth === 0) {
      const slice = body.slice(i)
      const keyM = slice.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w]*)):/)
      if (keyM) {
        set.add(keyM[1] ?? keyM[2] ?? keyM[3])
        i += (keyM[0].length - 1)
        continue
      }
      // Quoted set entry — trailing comma optional (last element has none).
      const strM = slice.match(/^\s*'([^']+)'\s*,?/)
      if (strM && strM[1]) {
        set.add(strM[1])
        i += (strM[0].length - 1)
      }
    }
  }
  return set
}

const SECTION_TITLES = parseSetMembers(studioSrc, 'SECTION_TITLES')
const FORM_SECTION_SAVES = parseSetMembers(studioSrc, 'FORM_SECTION_SAVES')
const IMAGE_FIELDS = parseSetMembers(studioSrc, 'IMAGE_FIELDS')
const LINK_OUTS = parseSetMembers(studioSrc, 'LINK_OUTS')
const INLINE_TEXT_FIELDS = parseSetMembers(actionsSrc, 'INLINE_TEXT_FIELDS')
const INLINE_IMAGE_FIELDS = parseSetMembers(actionsSrc, 'INLINE_IMAGE_FIELDS')

const allTags = TEMPLATE_FILES.flatMap((f) => extractTags(read(f)))
const fieldsByKind = (kind: string) => allTags.filter((t) => t.kind === kind).map((t) => t.field)

describe('Website Studio field wiring (template ↔ studio handlers)', () => {
  it('parsed sane registries + tags from source (sanity)', () => {
    expect(SECTION_TITLES.size).toBeGreaterThan(5)
    expect(IMAGE_FIELDS.has('heroImageUrl')).toBe(true)
    expect(allTags.length).toBeGreaterThan(20)
  })

  it('every kind="modal" field has a Studio modal handler (no dead affordance)', () => {
    const modalFields = Array.from(new Set(fieldsByKind('modal')))
    const orphans = modalFields.filter(
      (f) => !(SECTION_TITLES.has(f) || FORM_SECTION_SAVES.has(f) || LINK_OUTS.has(f)),
    )
    expect(orphans, `modal tags with no Studio handler: ${orphans.join(', ')}`).toEqual([])
  })

  it('every kind="image" field is in IMAGE_FIELDS (modal would render broken otherwise)', () => {
    const imageFields = Array.from(new Set(fieldsByKind('image')))
    const orphans = imageFields.filter((f) => !IMAGE_FIELDS.has(f))
    expect(orphans, `image tags missing from IMAGE_FIELDS: ${orphans.join(', ')}`).toEqual([])
  })

  it('every kind="image" field is also on the inline image whitelist (saveImageField gate)', () => {
    const imageFields = Array.from(new Set(fieldsByKind('image')))
    const orphans = imageFields.filter((f) => !INLINE_IMAGE_FIELDS.has(f))
    expect(orphans, `image tags not whitelisted in saveImageField: ${orphans.join(', ')}`).toEqual([])
  })

  it('every non-copy kind="text" field is on the inline text whitelist', () => {
    const textFields = Array.from(new Set(fieldsByKind('text'))).filter((f) => !f.startsWith('copy:'))
    const orphans = textFields.filter((f) => !INLINE_TEXT_FIELDS.has(f))
    expect(orphans, `plain text tags not whitelisted in saveInlineField: ${orphans.join(', ')}`).toEqual([])
  })

  it('copy: text fields are handled generically (saveInlineField has a copy: branch)', () => {
    const copyFields = Array.from(new Set(fieldsByKind('text'))).filter((f) => f.startsWith('copy:'))
    expect(copyFields.length).toBeGreaterThan(0)
    // The branch that handles ANY copy:<key> — its presence is what makes every
    // copy tag (incl. ones the AI list doesn't know) editable.
    expect(actionsSrc).toMatch(/field\.startsWith\('copy:'\)/)
  })

  it('every FORM_SECTION_SAVES key also has a SECTION_TITLES entry (modal opens with a title)', () => {
    const missing = Array.from(FORM_SECTION_SAVES).filter((k) => !SECTION_TITLES.has(k))
    expect(missing, `form-save sections with no title: ${missing.join(', ')}`).toEqual([])
  })

  it('every LINK_OUTS key also has a SECTION_TITLES entry', () => {
    const missing = Array.from(LINK_OUTS).filter((k) => !SECTION_TITLES.has(k))
    expect(missing, `link-out sections with no title: ${missing.join(', ')}`).toEqual([])
  })
})

// ── COPY_KEYS coverage (AI bar ↔ template) ────────────────────────────────────
// The Website Studio's AI command bar can only target `copy:` keys that exist in
// COPY_KEYS (lib/services/ai-website-edit.ts). A `copy:` region the templates
// instrument but that's missing from COPY_KEYS = the AI silently drops edits to
// it (the bug PR W1 fixed). This guard extracts every concrete `copy:` key the
// templates render and asserts COPY_KEYS covers each, so the two can't drift.
import { resolveCopyKey } from '@/lib/services/ai-website-edit'

// Two shared components emit `copy:${editKeyPrefix}.*` keys — the concrete keys
// come from each call site's editKeyPrefix. We expand those here.
const NUMBERED_STEPS_FORMS = ['eyebrow', 'heading', '0.title', '0.body']
const CLOSING_CTA_FORMS = ['heading', 'subhead']

/** All concrete `copy:` keys the templates can render (a `${i}` becomes `0`). */
function collectConcreteCopyKeys(): Set<string> {
  const keys = new Set<string>()
  for (const f of TEMPLATE_FILES) {
    const src = read(f)
    // Direct literal copy keys (skip the generic components' own `${prefix}`
    // template literals — those are resolved via call-site prefixes below).
    const isGeneric =
      f.endsWith('numbered-steps.tsx') || f.endsWith('closing-cta.tsx')
    if (!isGeneric) {
      for (const m of Array.from(
        src.matchAll(/data-edit-field=(?:"(copy:[^"]+)"|\{`(copy:[^`]+)`\})/g),
      )) {
        const raw = (m[1] ?? m[2] ?? '').slice('copy:'.length)
        if (raw) keys.add(raw.replace(/\$\{[^}]+\}/g, '0'))
      }
      for (const m of Array.from(
        src.matchAll(/'data-edit-field':\s*(?:'(copy:[^']+)'|`(copy:[^`]+)`)/g),
      )) {
        const raw = (m[1] ?? m[2] ?? '').slice('copy:'.length)
        if (raw) keys.add(raw.replace(/\$\{[^}]+\}/g, '0'))
      }
    }
    // Generic-component call sites: expand editKeyPrefix into the right
    // component's forms. A file may use BOTH components, so associate each
    // prefix with the nearest preceding component tag (the JSX element it's an
    // attribute of), not "any component in the file".
    for (const m of Array.from(src.matchAll(/editKeyPrefix="([^"]+)"/g))) {
      const prefix = m[1]
      const before = src.slice(0, m.index)
      const numAt = before.lastIndexOf('<NumberedSteps')
      const ctaAt = before.lastIndexOf('<ClosingCTA')
      if (numAt > ctaAt) {
        for (const s of NUMBERED_STEPS_FORMS) keys.add(`${prefix}.${s}`)
      } else if (ctaAt > -1) {
        for (const s of CLOSING_CTA_FORMS) keys.add(`${prefix}.${s}`)
      }
    }
  }
  return keys
}

describe('AI bar COPY_KEYS coverage (template ↔ ai-website-edit)', () => {
  const concrete = collectConcreteCopyKeys()

  it('found a meaningful number of copy keys (sanity)', () => {
    expect(concrete.size).toBeGreaterThan(40)
  })

  it('the two explicitly-flagged keys are covered (regression for the W1 bug)', () => {
    expect(resolveCopyKey('home.closerTitle')).toBeTruthy()
    expect(resolveCopyKey('home.contactEyebrow')).toBeTruthy()
  })

  it('every concrete copy: key the templates render is in COPY_KEYS', () => {
    const missing = Array.from(concrete)
      .filter((k) => !resolveCopyKey(k))
      .sort()
    expect(
      missing,
      `copy: keys the AI bar can't target (add to COPY_KEYS): ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('resolveCopyKey rejects a literal wildcard key (model must use a real index)', () => {
    expect(resolveCopyKey('home.callout.*.title')).toBeUndefined()
  })
})
