import 'server-only'
import { and, eq, inArray, or } from 'drizzle-orm'
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
import {
  vetAndCleanNewService,
  getCustomizationForClinicService,
} from '@/lib/services/service-library-ai'
import type { CustomizeClinicContext } from '@/lib/services/service-library-ai'

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
  /** True when the rendered content came from the persisted per-clinic AI
   *  customization (1B). False = canonical + token substitution (1A path). */
  isCustomized?: boolean
  /** Echo of the persisted customization metadata, when present — drives the
   *  "Customized ✨" badge + "regenerate" timestamp in the settings UI. */
  customizedAt?: string | null
  customizedModelId?: string | null
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
 * `ServiceLibraryEntry` plus the workflow metadata the picker + admin
 * surfaces care about. `getServiceLibrary` (used by the public site) still
 * returns the lean shape; this richer shape is used by `listLibraryForPicker`
 * + the platform admin review page.
 */
export interface ServiceLibraryEntryWithStatus extends ServiceLibraryEntry {
  origin: 'platform' | 'clinic'
  status: 'active' | 'pending' | 'archived'
  /** Set on `origin='clinic'` entries — the org id of the submitting clinic. */
  submittedByOrgId: string | null
  reviewNotes: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

function rowToEntryWithStatus(
  row: typeof serviceLibrary.$inferSelect,
): ServiceLibraryEntryWithStatus {
  return {
    ...rowToEntry(row),
    origin: row.origin === 'clinic' ? 'clinic' : 'platform',
    status:
      row.status === 'pending' ? 'pending' : row.status === 'archived' ? 'archived' : 'active',
    submittedByOrgId: row.submittedByOrgId ?? null,
    reviewNotes: row.reviewNotes ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
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

/** Fetch one active library entry by slug, with the same seed fallback.
 *  Pending entries are visible only when `viewerOrgId` matches the submitting
 *  org — so a clinic can use the entry on their own site immediately while
 *  the platform admin reviews it, and other clinics can't see it. */
export async function getLibraryEntryBySlug(
  slug: string,
  viewerOrgId?: string | null,
): Promise<ServiceLibraryEntry | null> {
  try {
    const [row] = await db
      .select()
      .from(serviceLibrary)
      .where(eq(serviceLibrary.slug, slug))
      .limit(1)
    if (row) {
      if (row.status === 'active') return rowToEntry(row)
      if (
        row.status === 'pending' &&
        row.submittedByOrgId &&
        viewerOrgId &&
        row.submittedByOrgId === viewerOrgId
      ) {
        return rowToEntry(row)
      }
      return null // archived or pending-by-other-clinic → treat as absent
    }
  } catch {
    // fall through to seed
  }
  return SERVICE_LIBRARY_SEED.find((e) => e.slug === slug) ?? null
}

/**
 * Entries visible to a clinic's picker drawer in `/settings/clinic`:
 * every `status='active'` entry, plus any `status='pending'` entries this
 * clinic submitted (they can keep using their own pending submissions
 * immediately; other clinics don't see them).
 *
 * Sort: active first (group by category then name); own-pending at the bottom
 * so the picker can render a "Pending review" separator. Falls back to the
 * canonical seed on DB error or empty table (mirrors `getServiceLibrary`).
 */
export async function listLibraryForPicker(
  orgId: string,
): Promise<ServiceLibraryEntryWithStatus[]> {
  try {
    const rows = await db
      .select()
      .from(serviceLibrary)
      .where(
        or(
          eq(serviceLibrary.status, 'active'),
          and(
            eq(serviceLibrary.status, 'pending'),
            eq(serviceLibrary.submittedByOrgId, orgId),
          ),
        ),
      )
    if (rows.length === 0) {
      return SERVICE_LIBRARY_SEED.map(seedToWithStatus)
    }
    const entries = rows.map(rowToEntryWithStatus)
    entries.sort((a, b) => {
      // Active first.
      if (a.status !== b.status) {
        if (a.status === 'active') return -1
        if (b.status === 'active') return 1
      }
      // Then core before special.
      if (a.category !== b.category) {
        return a.category === 'core' ? -1 : 1
      }
      // Then alpha.
      return a.name.localeCompare(b.name)
    })
    return entries
  } catch {
    return SERVICE_LIBRARY_SEED.map(seedToWithStatus)
  }
}

function seedToWithStatus(entry: ServiceLibraryEntry): ServiceLibraryEntryWithStatus {
  return {
    ...entry,
    origin: 'platform',
    status: 'active',
    submittedByOrgId: null,
    reviewNotes: null,
    createdAt: null,
    updatedAt: null,
  }
}

/**
 * Every entry, including `pending` and `archived`. Used by the platform
 * admin review surface — gate it there, not here.
 */
export async function listAllLibraryEntriesForAdmin(): Promise<
  ServiceLibraryEntryWithStatus[]
> {
  try {
    const rows = await db.select().from(serviceLibrary)
    if (rows.length === 0) return SERVICE_LIBRARY_SEED.map(seedToWithStatus)
    return rows.map(rowToEntryWithStatus).sort((a, b) => {
      // Pending at the top — that's what admins need to action.
      const order: Record<string, number> = { pending: 0, active: 1, archived: 2 }
      if (a.status !== b.status) return (order[a.status] ?? 9) - (order[b.status] ?? 9)
      return a.name.localeCompare(b.name)
    })
  } catch {
    return SERVICE_LIBRARY_SEED.map(seedToWithStatus)
  }
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
  services: ClinicService[] | null | undefined,
  ctx: { clinicName: string; city?: string | null },
  library?: ServiceLibraryEntry[],
): Promise<EnrichedService[]> {
  // Defensive: a fresh clinic's `services` jsonb is null. Most callers already
  // coalesce, but tolerate a raw null here so a missed `?? []` can't crash a
  // public page.
  if (!Array.isArray(services) || services.length === 0) return []
  const lib = library ?? (await getServiceLibrary())
  const bySlug = new Map(lib.map((e) => [e.slug, e]))
  const tokCtx: TokenizeContext = { clinicName: ctx.clinicName, city: ctx.city }
  const clinicCtx: CustomizeClinicContext = { name: ctx.clinicName, city: ctx.city }

  return services.map((s) => {
    const entry = s.librarySlug ? bySlug.get(s.librarySlug) : undefined

    if (entry) {
      // Checkpoint 1B — prefer the per-clinic AI customization when it's
      // present and points at the currently-linked library entry. The
      // helper returns null when the blob is missing, malformed, or its
      // librarySlug doesn't match — so we fall back cleanly to the 1A
      // token-substitution path.
      const customization = getCustomizationForClinicService(s, entry, clinicCtx)
      if (customization) {
        return {
          id: s.id,
          routingSlug: entry.slug,
          name: s.name || entry.name,
          category: s.category ? normalizeCategory(s.category) : entry.category,
          icon: s.icon ?? entry.icon ?? null,
          // shortDescription stays from the library — the AI blob doesn't
          // own the index-card one-liner; token-substituting it keeps the
          // homepage/strip and the detail-card label consistent across
          // every clinic with the same service.
          shortDescription: tokenize(entry.shortDescription, tokCtx),
          description: s.description ?? null,
          hasLibraryContent: true,
          heroBullets: customization.heroBullets,
          body: customization.body,
          processSteps: customization.processSteps,
          faq: customization.faq,
          relatedSlugs: entry.relatedSlugs ?? [],
          photoUrl: s.photoUrl ?? null,
          offer: s.offer ?? null,
          librarySlug: s.librarySlug ?? null,
          isCustomized: true,
          customizedAt: customization.generatedAt ?? null,
          customizedModelId: customization.modelId ?? null,
        }
      }
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
        isCustomized: false,
        customizedAt: null,
        customizedModelId: null,
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
      isCustomized: false,
      customizedAt: null,
      customizedModelId: null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Submission + admin review (Checkpoint 1B)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated outcome of a clinic submission. `created` lands an entry in
 * the library as `status='pending'` (visible to the submitter immediately,
 * hidden from other clinics until admin approves). `duplicate` did not insert
 * — the picker should steer the clinic to the existing slug. `rejected` did
 * not insert, surface the message.
 */
export type SubmitNewLibraryEntryResult =
  | { ok: true; kind: 'created'; entry: ServiceLibraryEntryWithStatus }
  | { ok: true; kind: 'duplicate'; existingSlug: string; note?: string }
  | { ok: false; error: string }

/**
 * Clinic-side: vet a submitted service via AI; if it's a real-and-new dental
 * service, insert it as `origin='clinic'`, `status='pending'`,
 * `submittedByOrgId=orgId`. The submitting clinic can use it on their own site
 * immediately (the picker + by-slug lookup both honor pending-when-mine).
 */
export async function submitNewLibraryEntry(
  orgId: string,
  submission: { name: string; description?: string },
): Promise<SubmitNewLibraryEntryResult> {
  // Vet against the full live library (active + every clinic's pending).
  // We don't want to insert a "Same-Day Crowns" that duplicates another
  // clinic's already-pending submission, even if the submitter can't see it.
  let existing: ServiceLibraryEntry[]
  try {
    const rows = await db
      .select()
      .from(serviceLibrary)
      .where(inArray(serviceLibrary.status, ['active', 'pending']))
    existing = rows.length > 0 ? rows.map(rowToEntry) : SERVICE_LIBRARY_SEED
  } catch {
    existing = SERVICE_LIBRARY_SEED
  }

  const vet = await vetAndCleanNewService(submission, existing)
  if (!vet.ok) return { ok: false, error: vet.error }
  if (vet.kind === 'duplicate') {
    return { ok: true, kind: 'duplicate', existingSlug: vet.existingSlug, note: vet.note }
  }

  // kind === 'new' — insert as pending under this org.
  const entry = vet.entry
  // Defensive uniqueness — race the AI against another concurrent insert.
  // If the slug already exists, fall back to duplicate (no double-insert).
  try {
    const [existingRow] = await db
      .select({ slug: serviceLibrary.slug })
      .from(serviceLibrary)
      .where(eq(serviceLibrary.slug, entry.slug))
      .limit(1)
    if (existingRow) {
      return {
        ok: true,
        kind: 'duplicate',
        existingSlug: existingRow.slug,
        note: 'A service with this slug already exists',
      }
    }
  } catch {
    // table missing? bail out cleanly.
    return { ok: false, error: 'Library is unavailable — please try again' }
  }

  try {
    const [inserted] = await db
      .insert(serviceLibrary)
      .values({
        id: newId('svc'),
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
        origin: 'clinic',
        status: 'pending',
        submittedByOrgId: orgId,
      })
      .returning()
    return { ok: true, kind: 'created', entry: rowToEntryWithStatus(inserted) }
  } catch (err) {
    console.warn('[submitNewLibraryEntry] insert failed:', (err as Error).message)
    return { ok: false, error: 'Could not save the service — please try again' }
  }
}

/**
 * Platform admin: flip a pending entry to active. Caller is responsible for
 * gating on `tenantType === 'platform' && role in [owner, admin]`.
 */
export async function approveLibraryEntry(
  slug: string,
  reviewNote?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await db
      .update(serviceLibrary)
      .set({
        status: 'active',
        reviewNotes: reviewNote?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(serviceLibrary.slug, slug))
      .returning({ slug: serviceLibrary.slug })
    if (result.length === 0) return { ok: false, error: 'Entry not found' }
    return { ok: true }
  } catch (err) {
    console.warn('[approveLibraryEntry] failed:', (err as Error).message)
    return { ok: false, error: 'Could not approve — please try again' }
  }
}

/**
 * Platform admin: flip an entry to archived. Stores the required review note
 * so the audit trail is honest about why. Gate on platform-admin at the call site.
 */
export async function rejectLibraryEntry(
  slug: string,
  reviewNote: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = reviewNote.trim()
  if (!note) return { ok: false, error: 'Reviewer note is required to reject' }
  try {
    const result = await db
      .update(serviceLibrary)
      .set({
        status: 'archived',
        reviewNotes: note,
        updatedAt: new Date(),
      })
      .where(eq(serviceLibrary.slug, slug))
      .returning({ slug: serviceLibrary.slug })
    if (result.length === 0) return { ok: false, error: 'Entry not found' }
    return { ok: true }
  } catch (err) {
    console.warn('[rejectLibraryEntry] failed:', (err as Error).message)
    return { ok: false, error: 'Could not reject — please try again' }
  }
}
