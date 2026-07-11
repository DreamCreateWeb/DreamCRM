'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { clinicLocation } from '@/lib/db/schema/platform'
import { requireTenant, type TenantContext } from '@/lib/auth/context'
import type { LeadFormField } from '@/lib/types/lead-forms'
import { isValidVideoUrl } from '@/lib/website-url'
import {
  parseStaff,
  parseStats,
  parseOfficePhotos,
  parseFaq,
  parseStringList,
  parseFinancingPartners,
  parseHours,
  clean,
} from '@/lib/clinic-content-parse'
import { recordWebsiteEdit, undoLastWebsiteEdit } from '@/lib/services/website-history'
import { cookies } from 'next/headers'
import { isSiteTemplateId } from '@/lib/site-templates/catalog'
import { TEMPLATE_PREVIEW_COOKIE } from '@/lib/site-templates/resolve'

/**
 * Per-section server actions for the Website Editor (app/(default)/website).
 *
 * Each action scopes its write to just the columns that section owns — unlike
 * the legacy settings/clinic mega-form, which read the WHOLE profile from one
 * FormData (so a partial submit would null out absent fields). Saving one
 * section here never touches another. Mirrors the discriminated-result +
 * revalidate-the-site-subtree pattern already established in
 * settings/clinic/services-actions.ts.
 *
 * Services are intentionally NOT here — they're managed by the dedicated
 * picker actions in settings/clinic/services-actions.ts, which the editor
 * reuses directly.
 */

export type SectionResult = { ok: true } | { ok: false; error: string }

async function gate(): Promise<
  { ok: true; ctx: TenantContext } | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, error: 'Only clinics can edit the website' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can edit the website' }
  }
  return { ok: true, ctx }
}

// Owner-readable labels for the undo history ("Undo: About your practice").
// Single-column saves get their column's label; multi-column saves join them.
const COLUMN_LABELS: Record<string, string> = {
  about: 'About your practice',
  stats: 'Trust stats',
  staff: 'Meet the team',
  officePhotos: 'Office photos',
  faq: 'FAQ',
  acceptedInsuranceCarriers: 'Insurance carriers',
  paymentMethods: 'Payment methods',
  financingPartners: 'Financing partners',
  cancellationPolicy: 'Cancellation policy',
  differenceChips: '“Why us” highlights',
  leadForms: 'Form fields',
  hours: 'Office hours',
  differenceVideoUrl: 'Intro video',
  heroImageUrl: 'Hero image',
  heroImageUrl2: 'Second hero image',
  logoUrl: 'Logo',
  brandColor: 'Brand color',
  tagline: 'Hero tagline',
  copyOverrides: 'Text edit',
  imagePositions: 'Photo focus point',
  template: 'Site design',
  addressLine1: 'Address',
  addressLine2: 'Address',
  city: 'Address',
  state: 'Address',
  postalCode: 'Address',
}

function editLabel(set: Partial<typeof clinicProfile.$inferInsert>): string {
  const labels = Object.keys(set).map((k) => COLUMN_LABELS[k] ?? k)
  return Array.from(new Set(labels)).slice(0, 3).join(' + ') || 'Website edit'
}

/** Scoped column write + revalidate the editor and the whole public-site
 *  subtree. Records the overwritten values in the undo history first —
 *  best-effort: a history hiccup must never block a save. */
async function writeSection(
  ctx: TenantContext,
  set: Partial<typeof clinicProfile.$inferInsert>,
) {
  try {
    const [current] = await db
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
    if (current) {
      const previous: Record<string, unknown> = {}
      for (const key of Object.keys(set)) {
        previous[key] = (current as Record<string, unknown>)[key] ?? null
      }
      await recordWebsiteEdit(ctx.organizationId, editLabel(set), previous)
    }
  } catch {
    /* history is a safety net, not a gate */
  }
  await db
    .update(clinicProfile)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
  revalidatePath('/website')
  // 'layout' revalidates the entire /site/[slug] subtree (home + /faq +
  // /insurance + /team + /payment-financing + …) in one call.
  revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
}

/**
 * Save the clinic's street address (footer "Visit" block + every JSON-LD /
 * contact surface). Writes the profile columns via writeSection (so it rides
 * the undo history) and mirrors to the primary clinic_location row when one
 * exists — the public site prefers that row over the profile columns, so
 * skipping the mirror would make the edit silently invisible.
 */
export async function saveAddress(fd: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    const set = {
      addressLine1: clean('addressLine1', fd),
      addressLine2: clean('addressLine2', fd),
      city: clean('city', fd),
      state: clean('state', fd),
      postalCode: clean('postalCode', fd),
    }
    await writeSection(ctx, set)
    try {
      const [primary] = await db
        .select({ id: clinicLocation.id })
        .from(clinicLocation)
        .where(and(eq(clinicLocation.organizationId, ctx.organizationId), eq(clinicLocation.isPrimary, 1)))
        .limit(1)
      const target =
        primary ??
        (
          await db
            .select({ id: clinicLocation.id })
            .from(clinicLocation)
            .where(eq(clinicLocation.organizationId, ctx.organizationId))
            .limit(1)
        )[0]
      if (target) {
        await db.update(clinicLocation).set(set).where(eq(clinicLocation.id, target.id))
      }
    } catch {
      /* profile columns are already saved — the mirror is best-effort */
    }
  })
}

/**
 * Undo the owner's last Studio save — restores the overwritten values and
 * steps the history back one entry. Returns the undone label + whether more
 * history remains (drives the button's enabled state without a refetch).
 */
export async function undoLastEditAction(): Promise<
  { ok: true; undone: string; more: boolean; nextLabel: string | null } | { ok: false; error: string }
> {
  const gated = await gate()
  if (!gated.ok) return gated
  try {
    const res = await undoLastWebsiteEdit(gated.ctx.organizationId)
    if (!res) return { ok: false, error: 'Nothing to undo yet' }
    revalidatePath('/website')
    revalidatePath(`/site/${gated.ctx.organizationSlug}`, 'layout')
    return { ok: true, undone: res.undone, more: !!res.next, nextLabel: res.next?.label ?? null }
  } catch {
    return { ok: false, error: 'Could not undo — try again' }
  }
}

/**
 * Apply a site design (template). Rides writeSection so the change lands in
 * the undo history ("Undo: Site design" restores the previous template —
 * content is universal, so switching is always safe + reversible). Clears any
 * preview cookie so the applied design is what the owner sees immediately.
 */
export async function saveTemplate(templateId: string): Promise<SectionResult> {
  const gated = await gate()
  if (!gated.ok) return gated
  if (!isSiteTemplateId(templateId)) {
    return { ok: false, error: 'Unknown design' }
  }
  try {
    await writeSection(gated.ctx, { template: templateId })
    ;(await cookies()).delete(TEMPLATE_PREVIEW_COOKIE)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not switch designs — try again' }
  }
}

/** Wrap a section body in the owner/admin gate + uniform error handling. */
async function runSection(
  body: (ctx: TenantContext) => Promise<void>,
): Promise<SectionResult> {
  const g = await gate()
  if (!g.ok) return g
  try {
    await body(g.ctx)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save' }
  }
}

// ── Hero (name + tagline) ───────────────────────────────────────────────────
export async function saveHero(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    const displayName = clean('displayName', formData)
    await writeSection(ctx, {
      displayName,
      legalName: clean('legalName', formData),
      tagline: clean('tagline', formData),
    })
    // Keep the org name in sync with the public display name.
    if (displayName) {
      await db
        .update(organization)
        .set({ name: displayName })
        .where(eq(organization.id, ctx.organizationId))
    }
  })
}

// ── About ───────────────────────────────────────────────────────────────────
export async function saveAbout(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, { about: clean('about', formData) })
  })
}

// ── Contact + address ───────────────────────────────────────────────────────
export async function saveContact(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, {
      phone: clean('phone', formData),
      email: clean('email', formData),
      addressLine1: clean('addressLine1', formData),
      addressLine2: clean('addressLine2', formData),
      city: clean('city', formData),
      state: clean('state', formData),
      postalCode: clean('postalCode', formData),
      country: clean('country', formData, 'US'),
      // The clinic deliberately edited address + phone — flag them manual so a
      // later automatic Google sync respects the edit (force sync still wins).
      addressSource: 'manual',
      phoneSource: 'manual',
    } as Partial<typeof clinicProfile.$inferInsert>)
  })
}

// ── Office hours ────────────────────────────────────────────────────────────
export async function saveHours(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    // Editing hours flags them manual so an automatic Google sync won't clobber.
    await writeSection(ctx, {
      hours: parseHours(formData),
      hoursSource: 'manual',
    } as Partial<typeof clinicProfile.$inferInsert>)
  })
}

// ── Branding (color + logo + hero + ambient video) ──────────────────────────
export async function saveBranding(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, {
      brandColor: clean('brandColor', formData),
      logoUrl: clean('logoUrl', formData),
      heroImageUrl: clean('heroImageUrl', formData),
      differenceVideoUrl: clean('differenceVideoUrl', formData),
    })
  })
}

// ── Team / staff ────────────────────────────────────────────────────────────
export async function saveStaff(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, { staff: parseStaff(formData.get('staff')?.toString()) })
  })
}

// ── Stat anchors ────────────────────────────────────────────────────────────
export async function saveStats(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, { stats: parseStats(formData.get('stats')?.toString()) })
  })
}

// ── Office photos ───────────────────────────────────────────────────────────
export async function saveOfficePhotos(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, {
      officePhotos: parseOfficePhotos(formData.get('officePhotos')?.toString()),
    })
  })
}

// ── FAQ ─────────────────────────────────────────────────────────────────────
export async function saveFaq(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, { faq: parseFaq(formData.get('faq')?.toString()) })
  })
}

// ── Insurance carriers ──────────────────────────────────────────────────────
export async function saveInsurance(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, {
      acceptedInsuranceCarriers: parseStringList(
        formData.get('acceptedInsuranceCarriers')?.toString(),
      ),
    })
  })
}

// ── Editable site lead-capture forms (contact / insurance verifier) ─────────
const LEAD_FORM_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'date', 'select'])
export async function saveLeadForm(formData: FormData): Promise<SectionResult> {
  const key = formData.get('formKey')?.toString()
  if (key !== 'contact' && key !== 'insurance_verifier') {
    return { ok: false, error: 'Unknown form' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(formData.get('fields')?.toString() ?? '[]')
  } catch {
    return { ok: false, error: 'Could not read the form fields' }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'Could not read the form fields' }

  const clean: LeadFormField[] = []
  const seen = new Set<string>()
  for (const raw of parsed as Record<string, unknown>[]) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.label !== 'string') continue
    const label = raw.label.trim()
    const type = String(raw.type)
    if (!label || !LEAD_FORM_TYPES.has(type) || seen.has(raw.id)) continue
    seen.add(raw.id)
    const field: LeadFormField = {
      id: raw.id,
      type: type as LeadFormField['type'],
      label,
      required: Boolean(raw.required),
    }
    if (typeof raw.placeholder === 'string' && raw.placeholder.trim()) {
      field.placeholder = raw.placeholder.trim()
    }
    if (raw.systemKey === 'name' || raw.systemKey === 'email' || raw.systemKey === 'phone') {
      field.systemKey = raw.systemKey
    }
    if (raw.dynamicOptions === 'services' || raw.dynamicOptions === 'carriers') {
      field.dynamicOptions = raw.dynamicOptions
    }
    if (field.type === 'select' && !field.dynamicOptions && Array.isArray(raw.options)) {
      field.options = raw.options.map((o) => String(o).trim()).filter(Boolean)
    }
    clean.push(field)
  }

  if (clean.length === 0) return { ok: false, error: 'Add at least one field' }
  const hasContact = clean.some((f) => f.systemKey === 'email' || f.systemKey === 'phone')
  if (!hasContact) {
    return { ok: false, error: 'Keep at least an email or phone field so leads are reachable' }
  }

  return runSection(async (ctx) => {
    const [row] = await db
      .select({ leadForms: clinicProfile.leadForms })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
    const current = (row?.leadForms as Record<string, unknown> | null) ?? {}
    await writeSection(ctx, {
      leadForms: { ...current, [key]: clean },
    } as Partial<typeof clinicProfile.$inferInsert>)
  })
}

// ── "Why us" difference chips (homepage highlight list) ─────────────────────
export async function saveDifferenceChips(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, {
      differenceChips: parseStringList(formData.get('differenceChips')?.toString()),
    })
  })
}

// ── Payment methods + financing + cancellation policy ───────────────────────
export async function savePaymentFinancing(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, {
      paymentMethods: parseStringList(formData.get('paymentMethods')?.toString()),
      financingPartners: parseFinancingPartners(
        formData.get('financingPartners')?.toString(),
      ),
      cancellationPolicy: clean('cancellationPolicy', formData),
    })
  })
}

// ── Inline single-field save (Website Studio) ───────────────────────────────
// Powers click-to-edit text + click-to-replace images on the full-screen
// studio. Whitelisted single-column writes only — never an array/jsonb field
// (those go through their section action via a modal). `value` is trimmed;
// empty → null so the public site falls back to its default.
//
// NOTE: `differenceVideoUrl` is NOT here — it's a `kind="modal"` field (edited
// via the Intro-video modal, never clicked inline on the canvas), so it has its
// own `saveDifferenceVideo` action with URL-shape validation. Keeping it off the
// inline whitelist removes a dead membership that implied it was inline-editable.
const INLINE_TEXT_FIELDS = new Set([
  'tagline', 'about', 'displayName', 'legalName', 'phone', 'email',
])
const INLINE_IMAGE_FIELDS = new Set(['logoUrl', 'heroImageUrl', 'heroImageUrl2'])

export type InlineField =
  | 'tagline' | 'about' | 'displayName' | 'legalName' | 'phone' | 'email'
  | 'logoUrl' | 'heroImageUrl' | 'heroImageUrl2'

// ── Intro ("difference") video — single column, URL-validated ────────────────
// `isValidVideoUrl` is a pure helper, so it lives in lib/website-url.ts (a
// `'use server'` file may only export async functions). Both this action and the
// Studio client import it from there.
export async function saveDifferenceVideo(url: string): Promise<SectionResult> {
  if (!isValidVideoUrl(url)) {
    return { ok: false, error: 'Enter a valid video link (https://…) or upload a file.' }
  }
  return runSection(async (ctx) => {
    const v = typeof url === 'string' && url.trim() ? url.trim() : null
    await writeSection(ctx, { differenceVideoUrl: v } as Partial<typeof clinicProfile.$inferInsert>)
  })
}

// ── Image field + focal point (Website Studio image modal) ──────────────────
// Writes the single-column image URL AND merges this image's focal point into
// the image_positions map (applied as CSS object-position on the public site).
export async function saveImageField(
  field: string,
  url: string,
  position: string | null,
): Promise<SectionResult> {
  if (!INLINE_IMAGE_FIELDS.has(field)) {
    return { ok: false, error: 'That image cannot be edited here' }
  }
  return runSection(async (ctx) => {
    const [row] = await db
      .select({ imagePositions: clinicProfile.imagePositions })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1)
    const current = (row?.imagePositions as Record<string, string> | null) ?? {}
    const next: Record<string, string> = { ...current }
    const v = typeof url === 'string' && url.trim() ? url.trim() : null
    const pos = typeof position === 'string' && position.trim() ? position.trim() : null
    // Only store a non-centred focal point, and only when there's an image.
    if (v && pos && pos !== '50% 50%') next[field] = pos
    else delete next[field]
    await writeSection(ctx, {
      [field]: v,
      imagePositions: Object.keys(next).length > 0 ? next : null,
    } as Partial<typeof clinicProfile.$inferInsert>)
  })
}

/**
 * Save the clinic's ONE brand color — the single lever the whole public-site
 * palette derives from (lib/clinic-site-theme.ts re-derives ground, deep band,
 * inks, and every accent on the next render). Strict #RRGGBB so junk can never
 * poison the palette math.
 */
export async function saveBrandColor(hex: string): Promise<SectionResult> {
  const v = (hex ?? '').trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
    return { ok: false, error: 'Pick a color first — it should look like #2F6D62' }
  }
  return runSection(async (ctx) => {
    await writeSection(ctx, { brandColor: v.toUpperCase() })
  })
}

export async function saveInlineField(field: string, value: string): Promise<SectionResult> {
  // Hardcoded-copy override: field "copy:<key>" merges into the copy_overrides
  // map (the template falls back to its built-in default when a key is unset).
  if (field.startsWith('copy:')) {
    const key = field.slice(5).trim()
    if (!key) return { ok: false, error: 'Invalid copy key' }
    return runSection(async (ctx) => {
      const [row] = await db
        .select({ copyOverrides: clinicProfile.copyOverrides })
        .from(clinicProfile)
        .where(eq(clinicProfile.organizationId, ctx.organizationId))
        .limit(1)
      const current = (row?.copyOverrides as Record<string, string> | null) ?? {}
      const next: Record<string, string> = { ...current }
      const v = typeof value === 'string' ? value.trim() : ''
      if (v) next[key] = v
      else delete next[key]
      await writeSection(ctx, {
        copyOverrides: Object.keys(next).length > 0 ? next : null,
      } as Partial<typeof clinicProfile.$inferInsert>)
    })
  }
  if (!INLINE_TEXT_FIELDS.has(field) && !INLINE_IMAGE_FIELDS.has(field)) {
    return { ok: false, error: 'That field cannot be edited inline' }
  }
  return runSection(async (ctx) => {
    const v = typeof value === 'string' && value.trim() ? value.trim() : null
    const set: Partial<typeof clinicProfile.$inferInsert> = { [field]: v }
    // Editing the phone inline flags it manual so an automatic Google sync
    // respects the deliberate edit (force sync still overrides).
    if (field === 'phone') set.phoneSource = 'manual'
    await writeSection(ctx, set)
    // Keep the org name in sync with the public display name.
    if (field === 'displayName' && v) {
      await db
        .update(organization)
        .set({ name: v })
        .where(eq(organization.id, ctx.organizationId))
    }
  })
}
