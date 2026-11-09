'use client'

import { useEffect, useState } from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { parseGbpListingSnapshot } from '@/lib/gbp-listing'
import { addDaysToKey, expandClosureDays, type ClosureRange } from '@/lib/closures'
import { clinicLocalNow, openNowLabel, resolveSiteWeek, type SiteClosure, type SiteWeek } from '@/lib/site-hours'

/**
 * "Open now · closes 5 PM" — the one shared answer to "will anyone pick up?".
 * The public pages are cached, so the server has no honest "now": the label
 * renders after mount from the clinic's week + IANA zone (`openNowLabel`, the
 * one pure helper) and refreshes each minute. Server-side and with no hours it
 * renders nothing — the hours list beside it is the complete picture.
 */
export function OpenNow({
  week,
  timeZone,
  closures,
  closureRanges,
  className,
  style,
}: {
  week: SiteWeek | null
  timeZone: string | null | undefined
  closures?: SiteClosure[] | null
  /** The stated closures as day ranges; expanded around the visitor's
   *  clinic-local "today" in the browser (this component owns "now"). */
  closureRanges?: ClosureRange[] | null
  className?: string
  style?: React.CSSProperties
}) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      let days = closures ?? null
      if (closureRanges?.length) {
        const today = clinicLocalNow(now, timeZone).date
        days = [...(days ?? []), ...expandClosureDays(closureRanges, addDaysToKey(today, -1), addDaysToKey(today, 60))]
      }
      setLabel(openNowLabel(week, days, now, timeZone))
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [week, closures, closureRanges, timeZone])
  if (!label) return null
  return (
    <p data-open-now="" className={className ?? 'text-sm font-semibold'} style={style} aria-live="polite">
      {label}
    </p>
  )
}

/** The same, fed straight from the page's site data (GBP hours win). */
export default function SiteOpenNow({
  data,
  className,
  style,
}: {
  data: Pick<ClinicSiteData, 'profile'> & { closures?: ClinicSiteData['closures'] }
  className?: string
  style?: React.CSSProperties
}) {
  const week = resolveSiteWeek(data.profile.hours, parseGbpListingSnapshot(data.profile.gbpListing)?.hours)
  return <OpenNow week={week} timeZone={data.profile.timezone} closureRanges={data.closures ?? null} className={className} style={style} />
}
