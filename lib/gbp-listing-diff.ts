import type { GbpListingSnapshot, GbpSnapshotPeriod } from '@/lib/gbp-listing'

/**
 * THE LISTING DIFF (ML-35 — the listing watch).
 *
 * Pure + client-safe: what did Google change on the practice's listing
 * between the last sync's snapshot and this one?
 *
 * Rules (each one is a way a watch cries wolf, so each is pinned):
 *  - NOISE IS NOT A CHANGE: `fetchedAt` never counts; category ORDER among
 *    the additional ones never counts; phone punctuation never counts
 *    ("(512) 555-0100" vs "512-555-0100"); hours compare per day, not per
 *    array position; address compares case/space-insensitively.
 *  - UNKNOWN IS NOT GONE: a null/empty value NOW is "the payload did not say"
 *    (the same honest-null law as the listing-truth reader) — it never
 *    reports "your hours were removed". Removal is only ever reported by a
 *    value Google actually stated.
 *  - NO PRIOR, NO DIFF: a missing snapshot, or one from before the widened
 *    keys existed, has nothing to compare against — the first widened
 *    snapshot is a baseline, not an announcement.
 *
 * `was` is null when the prior snapshot had no value ("nothing there").
 */

export type ListingField = 'hours' | 'phone' | 'categories' | 'name' | 'address' | 'website'

export interface ListingChange {
  field: ListingField
  was: string | null
  now: string
}

/** Fields the practice can fix from inside DreamCRM (hours / phone / website
 *  live on the Business profile and the Google workspace). */
export const LISTING_FIXABLE_FIELDS: readonly ListingField[] = ['hours', 'phone', 'website']

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABEL: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

/** "08:00" -> "8", "17:30" -> "5:30" (12-hour, no am/pm: "8–5" reads as a
 *  dental day). Unparseable -> the raw text. */
function clock(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h24 = Number(m[1])
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return m[2] === '00' ? String(h) : `${h}:${m[2]}`
}

function dayWindows(periods: GbpSnapshotPeriod[] | null): Map<string, string> {
  const byDay = new Map<string, string[]>()
  for (const p of periods ?? []) {
    const arr = byDay.get(p.day) ?? []
    arr.push(`${clock(p.open)}–${clock(p.close)}`)
    byDay.set(p.day, arr)
  }
  const out = new Map<string, string>()
  for (const [d, w] of Array.from(byDay)) out.set(d, w.sort().join(' & '))
  return out
}

function digits(s: string | null): string {
  return (s ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
}

function squash(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function allCategories(s: GbpListingSnapshot): string[] {
  return [s.primaryCategory, ...(s.additionalCategories ?? [])].filter((c): c is string => !!c)
}

export function diffListing(prev: GbpListingSnapshot | null, next: GbpListingSnapshot): ListingChange[] {
  if (!prev || !prev.watched || !next.watched) return []
  const out: ListingChange[] = []

  // Hours — per day; a day Google stopped stating is unknown, not closed.
  const was = dayWindows(prev.hours)
  const now = dayWindows(next.hours)
  if (now.size > 0) {
    const days = DAY_ORDER.filter((d) => now.has(d) && was.get(d) !== now.get(d))
    if (days.length > 0) {
      const hadBefore = days.filter((d) => was.has(d))
      out.push({
        field: 'hours',
        was: hadBefore.length ? hadBefore.map((d) => `${DAY_LABEL[d]} ${was.get(d)}`).join(', ') : null,
        now: days.map((d) => `${DAY_LABEL[d]} ${now.get(d)}`).join(', '),
      })
    }
  }

  if (next.phone && digits(prev.phone) !== digits(next.phone)) {
    out.push({ field: 'phone', was: prev.phone, now: next.phone })
  }

  const catsNow = allCategories(next)
  if (catsNow.length > 0) {
    const catsWas = allCategories(prev)
    const sameSet =
      squash(prev.primaryCategory) === squash(next.primaryCategory) &&
      catsWas.map(squash).sort().join('|') === catsNow.map(squash).sort().join('|')
    if (!sameSet) {
      out.push({ field: 'categories', was: catsWas.length ? catsWas.join(', ') : null, now: catsNow.join(', ') })
    }
  }

  if (next.title && squash(prev.title) !== squash(next.title)) {
    out.push({ field: 'name', was: prev.title, now: next.title })
  }
  if (next.storefrontAddress && squash(prev.storefrontAddress) !== squash(next.storefrontAddress)) {
    out.push({ field: 'address', was: prev.storefrontAddress, now: next.storefrontAddress })
  }
  if (next.websiteUri && prev.websiteUri !== next.websiteUri) {
    out.push({ field: 'website', was: prev.websiteUri, now: next.websiteUri })
  }
  return out
}

/** The reader-facing noun for a field ("Google changed your listing's hours"). */
export const LISTING_FIELD_NOUN: Record<ListingField, string> = {
  hours: 'hours',
  phone: 'phone number',
  categories: 'categories',
  name: 'business name',
  address: 'address',
  website: 'website link',
}
