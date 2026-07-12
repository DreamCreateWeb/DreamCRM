// Client-safe types + resolver for per-page SEO title/description overrides.
//
// Stored as a single jsonb column `clinic_profile.seo_meta`; null = no
// overrides (every public page's generateMetadata falls back to its derived
// title/description). Same merge-tolerant pattern as resolvePortalSettings /
// resolveReminderSettings — a partial / legacy / junk blob is sanitized on
// read, so a malformed payload can never poison the column and adding a new
// page key never needs a backfill.
//
// Why per-page: before this, every public page derived metadata from a
// hardcoded template ("About — {clinic}", etc.). Only blog POSTS carried
// real seoTitle/seoDescription. This lets a clinic own the search snippet for
// each of its top pages (the Settings → Search appearance panel).

/** The set of public pages a clinic can override SEO copy for. Each maps to a
 *  page under app/site/[slug] whose generateMetadata threads resolveSeoMeta.
 *  Adding a key cascades into the Settings → Search appearance editor
 *  (seo-meta-form.tsx: a `Record<SeoPageKey, …>` PAGE_PATH + a `derivedFor`
 *  arm — both TS-enforced) and the target page's generateMetadata. */
export const SEO_PAGE_KEYS = [
  'home',
  'about',
  'new-patients',
  'book',
  'services',
  'team',
  'insurance',
  'payment-financing',
  'dental-plans',
  'faq',
  'careers',
  'blog-index',
] as const

export type SeoPageKey = (typeof SEO_PAGE_KEYS)[number]

/** Site-relative path per SEO page key ('' = home) — the one path truth the
 *  meta editor, the Pages index, and the preview snippets all share. */
export const SEO_PAGE_PATHS: Record<SeoPageKey, string> = {
  home: '',
  about: '/about',
  'new-patients': '/new-patients',
  book: '/book',
  services: '/services',
  team: '/team',
  insurance: '/insurance',
  'payment-financing': '/payment-financing',
  'dental-plans': '/dental-plans',
  faq: '/faq',
  careers: '/careers',
  'blog-index': '/blog',
}

/** Per-page override. Either field may be set independently; an unset field
 *  falls back to the page's derived value. */
export interface PageSeoOverride {
  title?: string
  description?: string
}

/** The full resolved map — every key present (possibly empty) so callers can
 *  index without optional-chaining. */
export type PageSeoMeta = Record<SeoPageKey, PageSeoOverride>

// Human-friendly labels + recommended lengths for the Settings editor. Google
// truncates titles ~60 chars + descriptions ~155–160 chars; these are the
// hints shown next to each input (not hard limits — we clamp generously).
export const SEO_PAGE_LABELS: Record<SeoPageKey, string> = {
  home: 'Home',
  about: 'About',
  'new-patients': 'New Patients',
  book: 'Book a Visit',
  services: 'Services',
  team: 'Our Team',
  insurance: 'Insurance',
  'payment-financing': 'Payment & Financing',
  'dental-plans': 'Dental Plans',
  faq: 'FAQ',
  careers: 'Careers',
  'blog-index': 'Blog',
}

/** Recommended max lengths (the search-snippet sweet spot). The resolver clamps
 *  to the HARD caps below — these drive the "N / 60" character hints. */
export const SEO_TITLE_RECOMMENDED = 60
export const SEO_DESCRIPTION_RECOMMENDED = 160

// Hard caps so a hostile / fat-fingered paste can't bloat the column or the
// <head>. Generous — well past the recommended snippet window.
const TITLE_HARD_CAP = 120
const DESCRIPTION_HARD_CAP = 320

function cleanField(v: unknown, cap: number): string | undefined {
  if (typeof v !== 'string') return undefined
  // Collapse internal whitespace + trim — meta strings are single-line.
  const s = v.replace(/\s+/g, ' ').trim()
  if (!s) return undefined
  return s.slice(0, cap)
}

function emptyMeta(): PageSeoMeta {
  return SEO_PAGE_KEYS.reduce((acc, k) => {
    acc[k] = {}
    return acc
  }, {} as PageSeoMeta)
}

/**
 * Sanitize a stored (possibly partial / legacy / junk) jsonb value into a full
 * PageSeoMeta. Unknown keys are dropped; blank / non-string fields become
 * undefined; over-long fields are clamped. Always returns every page key (with
 * `{}` when unset) so callers can read `meta.about.title` without guards.
 */
export function resolveSeoMeta(stored: unknown): PageSeoMeta {
  const out = emptyMeta()
  if (!stored || typeof stored !== 'object') return out
  const s = stored as Record<string, unknown>

  for (const key of SEO_PAGE_KEYS) {
    const raw = s[key]
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const title = cleanField(r.title, TITLE_HARD_CAP)
    const description = cleanField(r.description, DESCRIPTION_HARD_CAP)
    const entry: PageSeoOverride = {}
    if (title) entry.title = title
    if (description) entry.description = description
    out[key] = entry
  }
  return out
}

/**
 * Collapse a full resolved map back to a sparse object suitable for storage —
 * only keys with at least one set field. Returns null when nothing is set, so
 * the column goes back to null rather than storing an all-empty blob. Used by
 * the settings save action.
 */
export function compactSeoMeta(meta: PageSeoMeta): Record<string, PageSeoOverride> | null {
  const out: Record<string, PageSeoOverride> = {}
  for (const key of SEO_PAGE_KEYS) {
    const e = meta[key]
    if (e && (e.title || e.description)) {
      out[key] = {}
      if (e.title) out[key].title = e.title
      if (e.description) out[key].description = e.description
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Apply a per-page override on top of derived title/description. The override
 * wins when set; otherwise the derived value stands. Pure — used by every
 * public page's generateMetadata.
 */
export function applySeoOverride(
  override: PageSeoOverride | undefined,
  derived: { title: string; description: string },
): { title: string; description: string } {
  return {
    title: override?.title?.trim() || derived.title,
    description: override?.description?.trim() || derived.description,
  }
}
