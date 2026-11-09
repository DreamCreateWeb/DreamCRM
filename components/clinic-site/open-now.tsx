'use client'

import { useEffect, useState } from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { parseGbpListingSnapshot } from '@/lib/gbp-listing'
import { openNowLabel, resolveSiteWeek, type SiteClosure, type SiteWeek } from '@/lib/site-hours'

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
  className,
  style,
}: {
  week: SiteWeek | null
  timeZone: string | null | undefined
  closures?: SiteClosure[] | null
  className?: string
  style?: React.CSSProperties
}) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => setLabel(openNowLabel(week, closures, new Date(), timeZone))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [week, closures, timeZone])
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
  data: Pick<ClinicSiteData, 'profile'>
  className?: string
  style?: React.CSSProperties
}) {
  const week = resolveSiteWeek(data.profile.hours, parseGbpListingSnapshot(data.profile.gbpListing)?.hours)
  return <OpenNow week={week} timeZone={data.profile.timezone} className={className} style={style} />
}
