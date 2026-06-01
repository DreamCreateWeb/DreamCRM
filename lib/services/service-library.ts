import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { serviceLibrary } from '@/lib/db/schema/platform'
import { newId, slugify } from '@/lib/utils'
import type {
  ClinicService,
  ServiceCategory,
  ServiceFaqItem,
  ServiceLibraryEntry,
  ServiceProcessStep,
} from '@/lib/types/clinic-content'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'

// ─────────────────────────────────────────────────────────────────────────────
// Service library — the shared, platform-owned canonical service catalog.
//
// Content is written ONCE (service-library-seed.ts) and customized per-clinic
// at render. Checkpoint 1A: simple `{clinic}` / `{city}` token substitution.
// Checkpoint 1B: AI rewrites layered on the same shape.
//
// A clinic's `clinic_profile.services` jsonb (`ClinicService[]`) links to these
// entries by `librarySlug`. `resolveClinicServices` merges the library content
// (token-substituted) with per-clinic overrides (photo / offer / category) into
// the `EnrichedService` shape the detail page + /services index consume.
// ─────────────────────────────────────────────────────────────────────────────

/** Context for per-clinic token substitution. `{clinic}` → clinicName,
 *  `{city}` → city (or 'our area' when the clinic has no city set). */
export interface TokenizeContext {
  clinicName: string
  city?: string | null
}

/**
 * Replace `{clinic}` / `{city}` tokens in canonical library copy with the
 * clinic's real values. Pure + deterministic — unit-tested directly. `{city}`
 * falls back to "our area" so a city-less clinic still reads naturally
 * ("families in our area" rather than "families in {city}"). Case-insensitive
 * on the token name; tolerates `{ clinic }` whitespace.
 */
export function tokenize(text: string, ctx: TokenizeContext): string {
  const city = ctx.city?.trim() || 'our area'
  return text
    .replace(/\{\s*clinic\s*\}/gi, ctx.clinicName)
    .replace(/\{\s*city\s*\}/gi, city)
}

function tokenizeStep(step: ServiceProcessStep, ctx: TokenizeContext): ServiceProcessStep {
  return { title: tokenize(step.title, ctx), body: tokenize(step.body, ctx) }
}

function tokenizeFaq(item: ServiceFaqItem, ctx: TokenizeContext): ServiceFaqItem {
  return { question: tokenize(item.question, ctx), answer: tokenize(item.answer, ctx) }
}

/**
 * A clinic service resolved for rendering — the union of the clinic's chosen
 * service row and (when linked) its canonical library content, all token-
 * substituted. `routingSlug` is the stable URL segment the detail page lives
 * at: the library slug when linked, else a kebab of the service name.
 *
 * `hasLibraryContent` lets the detail page branch between the full Tend-style
 * skeleton (library-linked) and the minimal hero-only render (free-text). The
 * rich fields (heroBullets / body / processSteps / faq / relatedSlugs) are
 * empty/undefined for free-text services.
 */
export interface EnrichedService {
  /** The clinic-service row id (stable per clinic). */
  id: string
  /** Stable routing segment — library slug or kebab(name). */
  routingSlug: string
  name: string
  category: ServiceCategory
  icon?: string | null
  /** Card one-liner — library shortDescription, else the clinic description. */
  shortDescription?: string | null
  /** Free-text description from the clinic row (kept for back-compat cards). */
  description?: string | null
  /** True when this service is backed by a canonical library entry. */
  hasLibraryContent: boolean
  heroBullets: string[]
  body?: string | null
  processSteps: ServiceProcessStep[]
  faq: ServiceFaqItem[]
  relatedSlugs: string[]
  /** Per-clinic hero photo override (detail page). */
  photoUrl?: string | null
  /** Per-clinic promo-ribbon text. */
  offer?: string | null
  /** The library slug this links to, when any. */
  librarySlug?: string | null
}

// ── DB row ↔ entry mapping ───────────────────────────────────────────────────

function rowToEntry(row: typeof serviceLibrary.$inferSelect): ServiceLibraryEntry {
  return {
    slug: row.slug,
    name: row.name,
    category: (row.category === 'special' ? 'special' : 'core') as ServiceCategory,
    icon: row.icon,
    shortDescription: row.shortDescription ?? '',
    heroBullets: Array.isArray(row.heroBullets) ? (row.heroBullets as string[]) : [],
    body: row.body ?? '',
    processSteps: Array.isArray(row.processSteps)
      ? (row.processSteps as ServiceProcessStep[])
      : [],
    faq: Array.isArray(row.faq) ? (row.faq as ServiceFaqItem[]) : [],
    relatedSlugs: Array.isArray(row.relatedSlugs) ? (row.relatedSlugs as string[]) : [],
  }
}

/**
 * Read every active library entry. Falls back to the in-code
 * `SERVICE_LIBRARY_SEED` when the table is empty (so detail pages + the index
 * work on a fresh DB before `seedServiceLibrary` has run, e.g. local dev or a
 * just-migrated prod). Read failures (table not migrated yet) also fall back.
 */
export async function getServiceLibrary(): Promise<ServiceLibraryEntry[]> {
  try {
    const rows = await db
      .select()
      .from(serviceLibrary)
      .where(eq(serviceLibrary.status, 'active'))
    if (rows.length === 0) return SERVICE_LIBRARY_SEED
    return rows.map(rowToEntry)
  } catch {
    return SERVICE_LIBRARY_SEED
  }
}

/** Fetch one active library entry by slug, with the same seed fallback. */
export async function getLibraryEntryBySlug(
  slug: string,
): Promise<ServiceLibraryEntry | null> {
  try {
    const [row] = await db
      .select()
      .from(serviceLibrary)
      .where(eq(serviceLibrary.slug, slug))
      .limit(1)
    if (row && row.status !== 'archived') return rowToEntry(row)
    if (row) return null // archived → treat as absent
  } catch {
    // fall through to seed
  }
  return SERVICE_LIBRARY_SEED.find((e) => e.slug === slug) ?? null
}

/**
 * Idempotently upsert the canonical seed catalog into `service_library` by
 * slug. Inserts missing rows, refreshes content on existing platform rows so
 * the canon stays current as we edit the seed. Safe to call anytime — invoked
 * from the demo resync. Best-effort per-row so one bad row doesn't abort the
 * batch.
 */
export async function seedServiceLibrary(): Promise<void> {
  let existingSlugs: Set<string>
  try {
    const existing = await db.select({ slug: serviceLibrary.slug }).from(serviceLibrary)
    existingSlugs = new Set(existing.map((r) => r.slug))
  } catch (err) {
    console.warn('[seedServiceLibrary] read failed', err)
    return
  }

  for (const entry of SERVICE_LIBRARY_SEED) {
    try {
      const values = {
        slug: entry.slug,
        name: entry.name,
        category: entry.category,
        icon: entry.icon ?? null,
        shortDescription: entry.shortDescription,
        heroBullets: entry.heroBullets,
        body: entry.body,
        processSteps: entry.processSteps,
        faq: entry.faq,
        relatedSlugs: entry.relatedSlugs ?? [],
        origin: 'platform' as const,
        status: 'active' as const,
      }
      if (existingSlugs.has(entry.slug)) {
        // Refresh canonical content (keep id + created_at). Only platform-origin
        // rows are touched — clinic-authored rows (1B) keep their content.
        await db
          .update(serviceLibrary)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(serviceLibrary.slug, entry.slug))
      } else {
        await db.insert(serviceLibrary).values({ id: newId('svc'), ...values })
      }
    } catch (err) {
      console.warn('[seedServiceLibrary]', entry.slug, err)
    }
  }
}

// ── Resolution ───────────────────────────────────────────────────────────────

function normalizeCategory(c: unknown): ServiceCategory {
  return c === 'special' ? 'special' : 'core'
}

/**
 * Resolve a clinic's stored `ClinicService[]` into render-ready
 * `EnrichedService[]`. For each service:
 *   • If `librarySlug` matches an active library entry → merge the library's
 *     rich content (token-substituted with clinicName/city) with the clinic's
 *     overrides (photoUrl, offer, and category — clinic-set wins, else library).
 *   • Otherwise → a minimal entry (name + description only, category defaults to
 *     the clinic-set value or 'core', no rich body/process/faq).
 *
 * Pass the resolved `library` (from `getServiceLibrary`) so callers that already
 * loaded it don't re-query; omit it and we fetch.
 */
export async function resolveClinicServices(
  services: ClinicService[],
  ctx: { clinicName: string; city?: string | null },
  library?: ServiceLibraryEntry[],
): Promise<EnrichedService[]> {
  const lib = library ?? (await getServiceLibrary())
  const bySlug = new Map(lib.map((e) => [e.slug, e]))
  const tokCtx: TokenizeContext = { clinicName: ctx.clinicName, city: ctx.city }

  return services.map((s) => {
    const entry = s.librarySlug ? bySlug.get(s.librarySlug) : undefined

    if (entry) {
      return {
        id: s.id,
        routingSlug: entry.slug,
        name: s.name || entry.name,
        // Clinic-set category wins (lets a clinic re-file a service); else library.
        category: s.category ? normalizeCategory(s.category) : entry.category,
        icon: s.icon ?? entry.icon ?? null,
        shortDescription: tokenize(entry.shortDescription, tokCtx),
        description: s.description ?? null,
        hasLibraryContent: true,
        heroBullets: entry.heroBullets.map((b) => tokenize(b, tokCtx)),
        body: tokenize(entry.body, tokCtx),
        processSteps: entry.processSteps.map((step) => tokenizeStep(step, tokCtx)),
        faq: entry.faq.map((item) => tokenizeFaq(item, tokCtx)),
        relatedSlugs: entry.relatedSlugs ?? [],
        photoUrl: s.photoUrl ?? null,
        offer: s.offer ?? null,
        librarySlug: s.librarySlug ?? null,
      }
    }

    // Free-text / unlinked service — minimal enrichment.
    return {
      id: s.id,
      routingSlug: slugify(s.name) || s.id,
      name: s.name,
      category: s.category ? normalizeCategory(s.category) : 'core',
      icon: s.icon ?? null,
      shortDescription: s.description ?? null,
      description: s.description ?? null,
      hasLibraryContent: false,
      heroBullets: [],
      body: null,
      processSteps: [],
      faq: [],
      relatedSlugs: [],
      photoUrl: s.photoUrl ?? null,
      offer: s.offer ?? null,
      librarySlug: null,
    }
  })
}

/** Split resolved services into core + special buckets, preserving order. */
export function groupByCategory(services: EnrichedService[]): {
  core: EnrichedService[]
  special: EnrichedService[]
} {
  const core: EnrichedService[] = []
  const special: EnrichedService[] = []
  for (const s of services) {
    if (s.category === 'special') special.push(s)
    else core.push(s)
  }
  return { core, special }
}
