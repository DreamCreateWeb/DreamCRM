import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { officeOneLine, siteOffices } from '@/lib/site-offices'
import { MapLink } from './map-block'

/**
 * The OTHER offices — a practice with a second location shows it everywhere
 * the first one's address appears (the template already prints the first).
 * Each: name, one-line address, a tappable phone, a directions link. Renders
 * nothing for a one-office practice. Colour is inherited from the host band so
 * every template keeps its own palette; no local colours here.
 */
export default function LocationsList({
  data,
  heading = 'Our other offices',
  className,
  headingClassName,
}: {
  data: Pick<ClinicSiteData, 'profile' | 'primaryLocation' | 'locations'>
  heading?: string
  className?: string
  headingClassName?: string
}) {
  const others = siteOffices(data).filter((o) => !o.isPrimary)
  if (others.length === 0) return null
  return (
    <div className={className} data-locations-list="">
      <h3 className={headingClassName ?? 'text-sm font-bold uppercase tracking-wide mb-3'}>
        {others.length === 1 ? 'Our other office' : heading}
      </h3>
      <ul className="space-y-4 text-sm">
        {others.map((o) => (
          <li key={o.key} data-location={o.name ?? ''}>
            {o.name && <p className="font-semibold">{o.name}</p>}
            <p className="leading-relaxed">{officeOneLine(o)}</p>
            {o.phone && (
              <a href={`tel:${o.phone}`} className="block underline-offset-4 hover:underline">
                {o.phone}
              </a>
            )}
            <MapLink office={o} className="inline-block mt-1 underline underline-offset-4" />
          </li>
        ))}
      </ul>
    </div>
  )
}
