import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { siteOffices } from '@/lib/site-offices'
import { clinicLocalNow } from '@/lib/site-hours'
import { upcomingClosureLine } from '@/lib/closures'
import SiteOpenNow from './open-now'
import { MapLink } from './map-block'
import LocationsList from './locations-list'

/**
 * The three answers a patient on a phone wants — "is anyone there?", "where do
 * I drive?", "which office?" — as ONE block every template's footer drops in
 * beside its address, so no template phrases or hand-rolls them. Colour is
 * inherited from the host band.
 */
export default function VisitExtras({
  data,
  className,
}: {
  data: Pick<ClinicSiteData, 'profile' | 'primaryLocation' | 'locations'> & { closures?: ClinicSiteData['closures'] }
  className?: string
}) {
  const offices = siteOffices(data)
  const primary = offices[0]
  const closureLine = data.closures?.length
    ? upcomingClosureLine(data.closures, clinicLocalNow(new Date(), data.profile.timezone).date, 14)
    : null
  return (
    <div className={className ?? 'mt-3 space-y-3'} data-visit-extras="">
      <SiteOpenNow data={data} />
      {closureLine && (
        <p data-closure-line="" className="text-sm">
          {closureLine}
        </p>
      )}
      {primary && <MapLink office={primary} />}
      <LocationsList data={data} className="pt-3" />
    </div>
  )
}
