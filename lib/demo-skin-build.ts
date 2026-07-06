import type { DemoSkin } from '@/lib/types/demo-skin'
import { DEMO_SKIN_MAX_BYTES } from '@/lib/types/demo-skin'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'
import type { DemoTrackId } from '@/lib/types/demo-script'
import { deriveDemoGaps } from '@/lib/demo-gaps'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'

/**
 * Pure demo-skin composition — turns a prospect row's enrichment into the
 * cookie payload that brands a live demo. Client-safe, no DB, unit-tested.
 */

/**
 * Is a captured theme-color actually usable as a demo brand accent? Sites
 * overwhelmingly declare #ffffff/#000000 (browser-chrome tinting, not
 * brand) — near-white and near-black would make an invisible hairline and
 * a muddy palette, so they're rejected. The RAW capture stays honest in
 * enrichment; this is the presentation judgment.
 */
export function usableBrandColor(hex: string | null | undefined): string | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Perceived luminance (ITU-R BT.601) — reject the extremes.
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  if (luma > 232 || luma < 24) return null
  return hex.toLowerCase()
}

/** "DR. MARIA GARZA" / "Dr Maria Garza" → "Maria". */
export function officialFirstName(name: string | null | undefined): string | null {
  if (!name) return null
  const tokens = name.trim().split(/\s+/).filter((t) => !/^dr\.?$/i.test(t))
  const first = tokens[0]
  if (!first) return null
  // Letters (incl. Latin-1 accents), apostrophes, hyphens — TS target
  // predates the /u \p{L} class.
  const clean = first.replace(/[^a-zA-ZÀ-ɏ'-]/g, '')
  if (!clean) return null
  return (clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()).slice(0, 40)
}

export interface BuildDemoSkinInput {
  prospect: {
    id: string
    name: string
    city: string | null
    websiteUrl: string | null
    authorizedOfficialName: string | null
    googleRatingTenths?: number | null
    reviewCount?: number | null
  }
  signals: ProspectCrawlSignals | null
  verdict: ProspectAiVerdict | null
  /** The demo story to lead with — validated upstream (demo-script ids). */
  track?: DemoTrackId
}

/**
 * Compose the skin, then enforce the cookie budget: if the serialized JSON
 * exceeds DEMO_SKIN_MAX_BYTES, drop optional payload in fixed order —
 * weaknesses → logoUrl → websiteUrl — until it fits (name/city/brand always
 * survive; they're tiny and they ARE the demo).
 */
export function buildDemoSkin(input: BuildDemoSkinInput): DemoSkin {
  const { prospect, signals, verdict } = input
  const skin: DemoSkin = {
    prospectId: prospect.id,
    clinicName: prospect.name.trim().slice(0, 80),
  }
  if (prospect.city?.trim()) skin.city = prospect.city.trim().slice(0, 60)

  const brand = usableBrandColor(signals?.themeColor)
  if (brand) skin.brandColor = brand

  if (signals?.iconUrl && /^https:\/\//.test(signals.iconUrl)) {
    skin.logoUrl = signals.iconUrl.slice(0, 300)
  }
  if (prospect.websiteUrl && /^https:\/\//.test(prospect.websiteUrl)) {
    skin.websiteUrl = prospect.websiteUrl.slice(0, 200)
  }

  const gaps = deriveDemoGaps(signals, verdict, {
    ratingTenths: prospect.googleRatingTenths ?? null,
    reviewCount: prospect.reviewCount ?? null,
  })
  if (gaps.length > 0) {
    skin.weaknesses = gaps.slice(0, 4).map((g) => g.label.slice(0, 80))
  }

  const first = officialFirstName(prospect.authorizedOfficialName)
  if (first) skin.officialFirstName = first

  if (input.track) skin.track = input.track

  for (const drop of ['weaknesses', 'logoUrl', 'websiteUrl'] as const) {
    if (JSON.stringify(skin).length <= DEMO_SKIN_MAX_BYTES) break
    delete skin[drop]
  }
  return skin
}

/**
 * Same-origin URL of the demo clinic's public site re-themed in the
 * prospect's brand — the compare view's right iframe. Path-based routing
 * (always live on www) keeps it same-origin with the dashboard, so the
 * global X-Frame-Options: SAMEORIGIN passes without any header exception.
 */
export function buildDemoCompareUrl(brandColor?: string | null): string {
  const base = `/site/${DEMO_CLINIC_SLUG}/demo-brand`
  const brand = brandColor?.match(/^#([0-9a-fA-F]{6})$/)?.[1]
  return brand ? `${base}?brand=${brand.toLowerCase()}` : base
}
