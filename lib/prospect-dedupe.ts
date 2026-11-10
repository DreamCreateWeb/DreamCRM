/**
 * THE DUPLICATE MATCHER — pure (P-03).
 *
 * `prospect.dedupe_hash` (phone + street + ZIP) catches an exact
 * re-discovery and nothing else: the same front desk under two NPIs with
 * the registry spelling the suite differently, the Google listing a hand-
 * added row shares with a discovered one, "Smile Dental PC" and "Smile
 * Dental, P.C." at the same ZIP — all of those were two rows, two scores,
 * two outreach threads to one practice.
 *
 * Three keys, each enough on its own to call two rows the same practice:
 *
 *   phone      the same ten digits (the strongest — one desk, one number)
 *   place      the same Google place id (Google already decided)
 *   name_zip   the same normalized practice name at the same five-digit ZIP
 *
 * The keys chain: A~B by phone and B~C by place id is ONE group of three.
 * The SWEEP merges only EXACT pairs on its own (same place id, or same
 * phone AND same name); the rest wait for a human on the drawer.
 *
 * The survivor is the row with the best quality score, then the most
 * recent verification, then the oldest record (the one with the history).
 */

import { nanpDigits } from './phone-nanp'

export interface DedupeRow {
  id: string
  name: string
  phone: string | null
  googlePlaceId: string | null
  postalCode: string | null
  qualityScore: number | null
  verifiedAt: Date | string | null
  createdAt: Date | string
}

export type DedupeKey = 'phone' | 'place' | 'name_zip'

export const DEDUPE_KEY_LABELS: Record<DedupeKey, string> = {
  phone: 'same phone',
  place: 'same Google listing',
  name_zip: 'same name and ZIP',
}

/** Legal suffixes, articles and credentials — the words that vary between
 *  two spellings of ONE practice. "dental" / "family" stay: they tell two
 *  practices apart. */
const NAME_NOISE = new Set([
  'pc', 'pa', 'llc', 'inc', 'pllc', 'llp', 'ltd', 'co', 'corp', 'corporation',
  'the', 'of', 'and', 'a', 'an', 'dr', 'doctor', 'dds', 'dmd', 'md', 'ms', 'phd',
])

/** "Smile Dental, P.C." → "smile dental"; "Dr. Jane Roe, DDS" → "jane roe".
 *  Single LETTERS go too — "P.C." splits into two of them, and an initial
 *  never told two practices apart; a lone digit stays ("Smile Dental 2" is
 *  the second office). */
export function normalizePracticeName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => (t.length > 1 || /\d/.test(t)) && !NAME_NOISE.has(t))
    .join(' ')
}

/** Ten bare digits or null — the key is the NUMBER, never its formatting. */
export function phoneKey(phone: string | null | undefined): string | null {
  const d = nanpDigits(phone)
  return d.length === 10 ? d : null
}

function zip5(postalCode: string | null | undefined): string | null {
  const m = (postalCode ?? '').match(/\d{5}/)
  return m ? m[0] : null
}

export interface DedupeKeys {
  phone: string | null
  place: string | null
  nameZip: string | null
}

export function dedupeKeys(row: Pick<DedupeRow, 'name' | 'phone' | 'googlePlaceId' | 'postalCode'>): DedupeKeys {
  const name = normalizePracticeName(row.name)
  const zip = zip5(row.postalCode)
  const place = row.googlePlaceId?.trim() || null
  return {
    phone: phoneKey(row.phone),
    place,
    nameZip: name && zip ? `${name}|${zip}` : null,
  }
}

/** Which keys two rows share — empty when they are not the same practice. */
export function sharedKeys(a: DedupeRow, b: DedupeRow): DedupeKey[] {
  const ka = dedupeKeys(a)
  const kb = dedupeKeys(b)
  const out: DedupeKey[] = []
  if (ka.phone && ka.phone === kb.phone) out.push('phone')
  if (ka.place && ka.place === kb.place) out.push('place')
  if (ka.nameZip && ka.nameZip === kb.nameZip) out.push('name_zip')
  return out
}

/** The sweep's bar: the same listing, or the same phone AND the same name
 *  (ZIP not required — the registry and Google often disagree on it). A
 *  shared phone with two different names is a duplicate for a HUMAN to
 *  confirm (a landlord's desk, a dental building), never an auto-merge. */
export function isExactDuplicate(a: DedupeRow, b: DedupeRow): boolean {
  const ka = dedupeKeys(a)
  const kb = dedupeKeys(b)
  if (ka.place && ka.place === kb.place) return true
  if (ka.phone && ka.phone === kb.phone) {
    const na = normalizePracticeName(a.name)
    const nb = normalizePracticeName(b.name)
    return na.length > 0 && na === nb
  }
  return false
}

export interface DuplicateGroup<T extends DedupeRow> {
  members: T[]
  /** Every key that bound at least one pair in the group. */
  keys: DedupeKey[]
}

/**
 * Union-find over the three keys. Each returned group has ≥2 members;
 * singletons are not duplicates of anything. Order inside a group is the
 * input order (so `pickSurvivor` is the only thing that ranks).
 */
export function findDuplicateGroups<T extends DedupeRow>(rows: T[]): Array<DuplicateGroup<T>> {
  const parent = rows.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  const keysUsed = new Map<number, Set<DedupeKey>>()
  const bind = (index: Map<string, number>, key: string | null, i: number, which: DedupeKey) => {
    if (!key) return
    const first = index.get(key)
    if (first === undefined) {
      index.set(key, i)
      return
    }
    union(first, i)
    const root = find(first)
    const set = keysUsed.get(root) ?? new Set<DedupeKey>()
    set.add(which)
    keysUsed.set(root, set)
  }
  const byPhone = new Map<string, number>()
  const byPlace = new Map<string, number>()
  const byNameZip = new Map<string, number>()
  rows.forEach((row, i) => {
    const k = dedupeKeys(row)
    bind(byPhone, k.phone, i, 'phone')
    bind(byPlace, k.place, i, 'place')
    bind(byNameZip, k.nameZip, i, 'name_zip')
  })
  // Unions can move a key set under a new root — re-collect by final root.
  const members = new Map<number, T[]>()
  const keys = new Map<number, Set<DedupeKey>>()
  rows.forEach((row, i) => {
    const root = find(i)
    members.set(root, [...(members.get(root) ?? []), row])
  })
  keysUsed.forEach((set, root) => {
    const r = find(root)
    const merged = keys.get(r) ?? new Set<DedupeKey>()
    set.forEach((k) => merged.add(k))
    keys.set(r, merged)
  })
  const out: Array<DuplicateGroup<T>> = []
  members.forEach((list, root) => {
    if (list.length < 2) return
    const order: DedupeKey[] = ['phone', 'place', 'name_zip']
    const used = keys.get(root) ?? new Set<DedupeKey>()
    out.push({ members: list, keys: order.filter((k) => used.has(k)) })
  })
  return out
}

/** Every pair the sweep may merge without asking, across the given rows. */
export function exactDuplicatePairs<T extends DedupeRow>(rows: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = []
  for (const group of findDuplicateGroups(rows)) {
    const m = group.members
    for (let i = 0; i < m.length; i++) {
      for (let j = i + 1; j < m.length; j++) {
        if (isExactDuplicate(m[i], m[j])) out.push([m[i], m[j]])
      }
    }
  }
  return out
}

function ms(v: Date | string | null | undefined): number | null {
  if (!v) return null
  const t = typeof v === 'string' ? new Date(v).getTime() : v.getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * THE SURVIVOR RULE: the best quality score (an unverified null loses to
 * any number), then the most recent `verifiedAt` (never verified loses),
 * then the OLDEST `createdAt` — the row that has been in the pipeline
 * longest carries the history. Ties break on id so a merge is repeatable.
 */
export function pickSurvivor<T extends DedupeRow>(rows: T[]): T {
  if (rows.length === 0) throw new Error('pickSurvivor: no rows')
  return [...rows].sort((a, b) => {
    const qa = a.qualityScore ?? -1
    const qb = b.qualityScore ?? -1
    if (qa !== qb) return qb - qa
    const va = ms(a.verifiedAt) ?? -1
    const vb = ms(b.verifiedAt) ?? -1
    if (va !== vb) return vb - va
    const ca = ms(a.createdAt) ?? Number.MAX_SAFE_INTEGER
    const cb = ms(b.createdAt) ?? Number.MAX_SAFE_INTEGER
    if (ca !== cb) return ca - cb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })[0]
}

/** Plain words for the drawer: "same phone · same name and ZIP". */
export function duplicateReasons(a: DedupeRow, b: DedupeRow): string[] {
  return sharedKeys(a, b).map((k) => DEDUPE_KEY_LABELS[k])
}
