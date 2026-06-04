'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { requireTenant, type TenantContext } from '@/lib/auth/context'
import {
  parseStaff,
  parseStats,
  parseTestimonials,
  parseOfficePhotos,
  parseFaq,
  parseStringList,
  parseFinancingPartners,
  parseHours,
  clean,
} from '@/lib/clinic-content-parse'

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
    return { ok: false, error: 'Only clinic tenants can edit the website' }
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can edit the website' }
  }
  return { ok: true, ctx }
}

/** Scoped column write + revalidate the editor and the whole public-site subtree. */
async function writeSection(
  ctx: TenantContext,
  set: Partial<typeof clinicProfile.$inferInsert>,
) {
  await db
    .update(clinicProfile)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
  revalidatePath('/website')
  // 'layout' revalidates the entire /site/[slug] subtree (home + /faq +
  // /insurance + /team + /payment-financing + …) in one call.
  revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
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
    })
  })
}

// ── Office hours ────────────────────────────────────────────────────────────
export async function saveHours(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, { hours: parseHours(formData) })
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

// ── Testimonials ────────────────────────────────────────────────────────────
export async function saveTestimonials(formData: FormData): Promise<SectionResult> {
  return runSection(async (ctx) => {
    await writeSection(ctx, {
      testimonials: parseTestimonials(formData.get('testimonials')?.toString()),
    })
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
const INLINE_TEXT_FIELDS = new Set([
  'tagline', 'about', 'displayName', 'legalName', 'phone', 'email', 'differenceVideoUrl',
])
const INLINE_IMAGE_FIELDS = new Set(['logoUrl', 'heroImageUrl', 'heroImageUrl2'])

export type InlineField =
  | 'tagline' | 'about' | 'displayName' | 'legalName' | 'phone' | 'email'
  | 'logoUrl' | 'heroImageUrl' | 'heroImageUrl2' | 'differenceVideoUrl'

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
    await writeSection(ctx, { [field]: v } as Partial<typeof clinicProfile.$inferInsert>)
    // Keep the org name in sync with the public display name.
    if (field === 'displayName' && v) {
      await db
        .update(organization)
        .set({ name: v })
        .where(eq(organization.id, ctx.organizationId))
    }
  })
}
