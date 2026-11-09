/**
 * Every office the public site shows, in one pure read — the profile's (or the
 * primary `clinic_location`'s) address first, then each other location row.
 * Footers, the map block, the locations list and the LocalBusiness JSON-LD all
 * start here so they can never disagree about how many offices there are.
 *
 * The map URLs are built from the address alone (no API key, no third-party
 * script); both are fixed https://www.google.com origins, so the dead-link law
 * holds by construction.
 */
import type { ClinicSiteData } from '@/lib/services/clinic-site'

export interface SiteOffice {
  /** Stable React key. */
  key: string
  /** Location name; null for the profile's own address. */
  name: string | null
  line1: string | null
  line2: string | null
  city: string | null
  state: string | null
  postal: string | null
  phone: string | null
  isPrimary: boolean
}

const clean = (v: string | null | undefined): string | null => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t || null
}

export function officeHasAddress(o: Pick<SiteOffice, 'line1' | 'city'>): boolean {
  return Boolean(o.line1 || o.city)
}

/** "123 Main St, Austin, TX 78701" — the one-line spoken address. */
export function officeOneLine(o: SiteOffice): string {
  const cityState = [o.city, o.state].filter(Boolean).join(', ')
  return [o.line1, o.line2, [cityState, o.postal].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

function mapQuery(o: SiteOffice): string {
  return encodeURIComponent([o.line1, o.city, o.state, o.postal].filter(Boolean).join(', '))
}

/** Turn-by-turn deep link (opens the visitor's maps app). */
export function officeDirectionsHref(o: SiteOffice): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${mapQuery(o)}`
}

/** Keyless embed source — `maps?q=…&output=embed` needs no API key. */
export function officeEmbedSrc(o: SiteOffice): string {
  return `https://www.google.com/maps?q=${mapQuery(o)}&output=embed`
}

/** All offices, the first being the one the site already treats as primary.
 *  Offices with no address AND no name are dropped (nothing to show). */
export function siteOffices(data: Pick<ClinicSiteData, 'profile' | 'primaryLocation' | 'locations'>): SiteOffice[] {
  const { profile, primaryLocation: pl, locations } = data
  const first: SiteOffice = {
    key: pl?.id ?? 'profile',
    name: clean(pl?.name) && locations.length > 1 ? clean(pl?.name) : null,
    line1: clean(pl?.addressLine1) ?? clean(profile.addressLine1),
    line2: clean(pl?.addressLine2) ?? clean(profile.addressLine2),
    city: clean(pl?.city) ?? clean(profile.city),
    state: clean(pl?.state) ?? clean(profile.state),
    postal: clean(pl?.postalCode) ?? clean(profile.postalCode),
    phone: clean(pl?.phone) ?? clean(profile.phone),
    isPrimary: true,
  }
  const out: SiteOffice[] = officeHasAddress(first) ? [first] : []
  for (const l of locations) {
    if (pl && l.id === pl.id) continue
    const o: SiteOffice = {
      key: l.id,
      name: clean(l.name),
      line1: clean(l.addressLine1),
      line2: clean(l.addressLine2),
      city: clean(l.city),
      state: clean(l.state),
      postal: clean(l.postalCode),
      phone: clean(l.phone),
      isPrimary: false,
    }
    if (officeHasAddress(o)) out.push(o)
  }
  return out
}
