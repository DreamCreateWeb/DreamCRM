import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DOCS } from '@/lib/marketing/docs'
import { settingsNavGroups } from '@/app/(default)/settings/settings-nav'

/**
 * EVERY "A → B" IN THE HELP DOCS IS A REAL TURN. The Getting-started docs
 * sent a first-week owner to "Settings → Clinic profile" (renamed Business
 * profile), "Settings → Plan" (a redirect stub), "Business → Shop →
 * Memberships" (moved to Payments) and told them to reach Support to connect
 * a PMS (the one form lives on Business → Integrations → Practice
 * management). Four wrong turns in week one is the moment ACTIVATION.md
 * says a clinic gets lost.
 *
 * So every nav phrase in the docs is resolved hop by hop against a small
 * registry of the hubs' real children — Settings from the live settings
 * registry, the rest spelled out beside the route directory that must
 * exist — and a renamed or moved surface fails CI naming the doc and the
 * phrase. The same shape as `tests/activation/no-coming-soon.test.ts`:
 * grade the vocabulary, not the files a fix touched.
 */

const ROOT = resolve(__dirname, '../..')
const APP = join(ROOT, 'app/(default)')

/** label → route directory under app/(default) (null = a hub whose children
 *  are listed in the registry under its own name). */
type Children = Record<string, string>

const SETTINGS: Children = Object.fromEntries(
  settingsNavGroups('clinic').flatMap((g) => g.items.map((i) => [i.label, i.href.replace(/^\//, '')])),
)

const SURFACES: Record<string, Children> = {
  Daily: {
    Overview: 'dashboard',
    'Dream Team': 'dream-team',
    'My Day': 'my-day',
    Appointments: 'appointments',
    Patients: 'patients',
    'Follow-ups': 'followups',
    Inquiries: 'leads',
    'Intake Forms': 'intake-forms',
    Insurance: 'insurance',
  },
  Website: {
    Editor: 'website/editor',
    Content: 'website/content',
    Design: 'website/design',
    Pages: 'website/pages',
    Forms: 'website/forms',
    Blog: 'website/blog',
    SEO: 'website/seo',
    Careers: 'website/careers',
    Domain: 'website/domain',
    Share: 'website/share',
  },
  Growth: {
    Outreach: 'growth/outreach',
    Audiences: 'growth/audiences',
    Reviews: 'growth/reviews',
    Social: 'growth/social',
    Analytics: 'growth/analytics',
  },
  Business: {
    Payments: 'payments',
    Shop: 'shop',
    Integrations: 'integrations',
  },
  Payments: {
    'Online payments': 'payments/online',
    Collections: 'payments/collections',
    Memberships: 'payments/memberships',
  },
  Shop: {
    Orders: 'shop/orders',
    Coupons: 'shop/coupons',
    Products: 'shop/products',
  },
  Integrations: {
    'Practice management': 'integrations/pms',
    'Your practice software': 'integrations/pms',
  },
  Settings: SETTINGS,
}

const ROOTS = Object.keys(SURFACES)

/** "Skim Settings → Patient portal and click" → ['Settings', 'Patient portal and click'] */
const PHRASE = /([A-Z][A-Za-z’' -]{0,40}(?: → [^.,;)…”"\n]{1,60})+)/g

function resolvePhrase(phrase: string): string | null {
  const segs = phrase.split(' → ').map((s) => s.trim())
  const root = ROOTS.find((r) => new RegExp(`(^|\\s)${r}$`).test(segs[0]))
  if (!root) return null // a funnel ("Sent → Opened"), a shortcut, prose — not a nav phrase
  let node: Children | undefined = SURFACES[root]
  for (const seg of segs.slice(1)) {
    if (!node) return null // past a leaf: the rest is prose ("hover the hero photo spot")
    const keys = Object.keys(node).sort((a, b) => b.length - a.length)
    const key = keys.find((k) => seg === k || seg.startsWith(`${k} `) || seg.startsWith(`${k}’`) || seg.startsWith(`${k},`))
    if (!key) return `"${phrase}" — "${seg}" is not a child of ${root === segs[0] ? root : segs[0]} (known: ${keys.join(', ')})`
    const dir = node[key]
    if (!existsSync(join(APP, dir))) return `"${phrase}" — ${key} points at app/(default)/${dir}, which does not exist`
    node = SURFACES[key]
  }
  return null
}

describe('every nav phrase in the help docs resolves to a real surface', () => {
  const prose = DOCS.flatMap((d) => [
    d.summary,
    ...d.sections.flatMap((s) => [s.heading ?? '', ...(s.paragraphs ?? []), ...(s.steps ?? [])]),
  ])

  it('finds the phrases it exists for', () => {
    const all = prose.flatMap((p) => Array.from(p.matchAll(PHRASE), (m) => m[1]))
    expect(all.length).toBeGreaterThan(15)
    expect(all.some((p) => /Settings → Business profile/.test(p))).toBe(true)
    expect(all.some((p) => /Business → Integrations → Practice management/.test(p))).toBe(true)
  })

  for (const doc of DOCS) {
    it(`${doc.slug}: every "A → B" is a turn a practice can take`, () => {
      const text = [doc.summary, ...doc.sections.flatMap((s) => [s.heading ?? '', ...(s.paragraphs ?? []), ...(s.steps ?? [])])]
      const problems = text
        .flatMap((p) => Array.from(p.matchAll(PHRASE), (m) => m[1]))
        .map(resolvePhrase)
        .filter((x): x is string => x !== null)
      expect(problems).toEqual([])
    })
  }

  it('the registry itself names surfaces that exist', () => {
    for (const [hub, children] of Object.entries(SURFACES)) {
      for (const [label, dir] of Object.entries(children)) {
        expect(existsSync(join(APP, dir)), `${hub} → ${label} → app/(default)/${dir}`).toBe(true)
      }
    }
  })

  it('the retired turns are gone from the docs', () => {
    const all = prose.join('\n')
    expect(all).not.toMatch(/Clinic profile/)
    expect(all).not.toMatch(/Settings → Plan\b(?! & billing)/)
    expect(all).not.toMatch(/Business → Shop → (Memberships|Collections)/)
    expect(all).not.toMatch(/Settings → Feedback/)
    expect(all).not.toMatch(/Notify me when/)
  })
})
