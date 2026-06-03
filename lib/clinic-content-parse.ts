// Shared parsers for clinic-profile content fields.
//
// Extracted from the original settings/clinic mega-form so the new
// section-based Website Editor (app/(default)/website) and the legacy
// settings panel share ONE source of truth for turning form payloads into
// the typed JSON shapes stored on `clinic_profile`. Every parser is pure
// (string / FormData in, typed value out) and returns `null` for "no usable
// value" so the public site falls back to its universal defaults cleanly.
//
// These run server-side (inside server actions) but carry no DB / server-only
// dependency, so they're trivially unit-testable.

import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicTestimonial,
  ClinicOfficePhoto,
  ClinicFinancingPartner,
  ClinicFaqItem,
} from '@/lib/types/clinic-content'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export function parseServices(raw: string | undefined): ClinicService[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: ClinicService[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      if (!name) continue
      // Preserve the library-link + per-clinic-override + customization
      // fields added across Checkpoints 1A/1B so a round-trip through any
      // editor (e.g. saving an unrelated section) never drops them.
      const librarySlug =
        typeof obj.librarySlug === 'string' && obj.librarySlug ? obj.librarySlug : null
      const category =
        obj.category === 'core' || obj.category === 'special' ? obj.category : null
      const photoUrl =
        typeof obj.photoUrl === 'string' && obj.photoUrl.trim() ? obj.photoUrl.trim() : null
      const offer =
        typeof obj.offer === 'string' && obj.offer.trim() ? obj.offer.trim() : null
      const customized =
        obj.customized && typeof obj.customized === 'object'
          ? (obj.customized as ClinicService['customized'])
          : null
      out.push({
        id: typeof obj.id === 'string' ? obj.id : uid(),
        name,
        description: typeof obj.description === 'string' ? obj.description.trim() || null : null,
        icon: typeof obj.icon === 'string' ? obj.icon.trim() || null : null,
        librarySlug,
        category,
        photoUrl,
        offer,
        customized,
      })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

export function parseStaff(raw: string | undefined): ClinicStaff[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: ClinicStaff[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      if (!name) continue
      // Carry the Checkpoint-3 humanizing fields (slug / credentials /
      // specialties / funFact / bookHref) through a save so editing the
      // basic name/title/bio doesn't strip the detail-page extras.
      const slug =
        typeof obj.slug === 'string' && obj.slug.trim() ? obj.slug.trim() : null
      const credentials =
        typeof obj.credentials === 'string' ? obj.credentials.trim() || null : null
      const specialties = Array.isArray(obj.specialties)
        ? (obj.specialties as unknown[])
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
        : null
      const funFact =
        typeof obj.funFact === 'string' ? obj.funFact.trim() || null : null
      const bookHref =
        typeof obj.bookHref === 'string' ? obj.bookHref.trim() || null : null
      out.push({
        id: typeof obj.id === 'string' ? obj.id : uid(),
        name,
        title: typeof obj.title === 'string' ? obj.title.trim() || null : null,
        bio: typeof obj.bio === 'string' ? obj.bio.trim() || null : null,
        photoUrl: typeof obj.photoUrl === 'string' ? obj.photoUrl || null : null,
        slug,
        credentials,
        specialties: specialties && specialties.length ? specialties : null,
        funFact,
        bookHref,
      })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

export function parseStats(raw: string | undefined): ClinicStat[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: ClinicStat[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const value = typeof obj.value === 'string' ? obj.value.trim() : ''
      const label = typeof obj.label === 'string' ? obj.label.trim() : ''
      if (!value && !label) continue
      const dynamic = obj.dynamic === 'review_count' ? 'review_count' : null
      out.push({ id: typeof obj.id === 'string' ? obj.id : uid(), value, label, dynamic })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

export function parseTestimonials(raw: string | undefined): ClinicTestimonial[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: ClinicTestimonial[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const quote = typeof obj.quote === 'string' ? obj.quote.trim() : ''
      const authorName = typeof obj.authorName === 'string' ? obj.authorName.trim() : ''
      if (!quote || !authorName) continue
      out.push({
        id: typeof obj.id === 'string' ? obj.id : uid(),
        quote,
        authorName,
        authorLocation:
          typeof obj.authorLocation === 'string' ? obj.authorLocation.trim() || null : null,
        authorPhotoUrl:
          typeof obj.authorPhotoUrl === 'string' ? obj.authorPhotoUrl || null : null,
        patientId: typeof obj.patientId === 'string' && obj.patientId ? obj.patientId : null,
      })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

export function parseOfficePhotos(raw: string | undefined): ClinicOfficePhoto[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: ClinicOfficePhoto[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const url = typeof obj.url === 'string' ? obj.url.trim() : ''
      if (!url) continue
      out.push({
        id: typeof obj.id === 'string' ? obj.id : uid(),
        url,
        alt: typeof obj.alt === 'string' ? obj.alt.trim() || null : null,
        caption: typeof obj.caption === 'string' ? obj.caption.trim() || null : null,
      })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

/**
 * Clinic-level FAQ entries (`clinic_profile.faq`). The editor emits a JSON
 * array of `{ id, category, question, answer }`. Rows missing a question or
 * answer are dropped; category falls back to a sensible default so a row
 * never lands uncategorised (the public /faq groups by category).
 */
export function parseFaq(raw: string | undefined): ClinicFaqItem[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: ClinicFaqItem[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const question = typeof obj.question === 'string' ? obj.question.trim() : ''
      const answer = typeof obj.answer === 'string' ? obj.answer.trim() : ''
      if (!question || !answer) continue
      const category =
        typeof obj.category === 'string' && obj.category.trim()
          ? obj.category.trim()
          : 'Your Visit'
      out.push({ id: typeof obj.id === 'string' ? obj.id : uid(), category, question, answer })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

/**
 * Newline / comma separated list → trimmed, deduped string[] (insurance
 * carriers, payment methods). Returns null when empty so the public site
 * renders its universal fallback.
 */
export function parseStringList(raw: string | undefined): string[] | null {
  if (!raw) return null
  const parts = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out.length ? out : null
}

export function parseFinancingPartners(
  raw: string | undefined,
): ClinicFinancingPartner[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const out: ClinicFinancingPartner[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      if (!name) continue
      out.push({
        id: typeof obj.id === 'string' ? obj.id : uid(),
        name,
        description: typeof obj.description === 'string' ? obj.description.trim() || null : null,
        applyUrl: typeof obj.applyUrl === 'string' ? obj.applyUrl.trim() || null : null,
        logoUrl: typeof obj.logoUrl === 'string' ? obj.logoUrl.trim() || null : null,
      })
    }
    return out.length ? out : null
  } catch {
    return null
  }
}

export interface HoursEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type Day = (typeof DAYS)[number]
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Parse `hours[mon].open|close|closed` multi-input form fields into a
 * `{ mon: {open, close, closed}, ... }` object. Throws on a malformed time
 * so the caller can surface a validation error.
 */
export function parseHours(formData: FormData): Record<Day, HoursEntry> | null {
  const out: Partial<Record<Day, HoursEntry>> = {}
  let touched = false
  for (const day of DAYS) {
    const closed = formData.get(`hours[${day}].closed`) === 'on'
    const open = formData.get(`hours[${day}].open`)?.toString().trim() ?? ''
    const close = formData.get(`hours[${day}].close`)?.toString().trim() ?? ''
    if (closed) {
      out[day] = { closed: true }
      touched = true
    } else if (open || close) {
      if (open && !HHMM.test(open)) throw new Error(`Invalid open time for ${day}`)
      if (close && !HHMM.test(close)) throw new Error(`Invalid close time for ${day}`)
      out[day] = { open: open || null, close: close || null }
      touched = true
    }
  }
  return touched ? (out as Record<Day, HoursEntry>) : null
}

/** Trimmed string field, or `fallback` when blank/absent. */
export function clean(field: string, formData: FormData, fallback: string | null = null) {
  return formData.get(field)?.toString().trim() || fallback
}
