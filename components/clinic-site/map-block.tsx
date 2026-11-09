import { officeDirectionsHref, officeEmbedSrc, officeHasAddress, officeOneLine, type SiteOffice } from '@/lib/site-offices'

/**
 * The shared map surface. ONLY when the office has an address:
 *  - `MapLink` — a plain "Get directions" link into Google Maps (the address
 *    is the whole query; never an API key, never a script).
 *  - `MapBlock` — the link plus a lazy keyless embed (`maps?q=…&output=embed`;
 *    the `maps/embed/v1/place` form needs a key, this one does not). The
 *    iframe carries a title and `loading="lazy"`; nothing else third-party.
 */
export function MapLink({
  office,
  label = 'Get directions',
  className,
  style,
}: {
  office: SiteOffice
  label?: string
  className?: string
  style?: React.CSSProperties
}) {
  if (!officeHasAddress(office)) return null
  const where = office.name ? ` to ${office.name}` : ''
  return (
    <a
      href={officeDirectionsHref(office)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}${where} (opens Google Maps in a new tab)`}
      className={className ?? 'text-sm font-semibold underline underline-offset-4'}
      style={style}
      data-map-link=""
    >
      {label}
    </a>
  )
}

export default function MapBlock({
  office,
  clinicName,
  className,
  frameClassName,
  frameStyle,
  linkClassName,
  linkStyle,
}: {
  office: SiteOffice
  clinicName: string
  className?: string
  frameClassName?: string
  frameStyle?: React.CSSProperties
  linkClassName?: string
  linkStyle?: React.CSSProperties
}) {
  if (!officeHasAddress(office)) return null
  const title = `Map showing ${office.name ?? clinicName}${officeOneLine(office) ? `, ${officeOneLine(office)}` : ''}`
  return (
    <div className={className} data-map-block="">
      <iframe
        src={officeEmbedSrc(office)}
        className={frameClassName ?? 'w-full h-[280px] sm:h-[360px] rounded-2xl'}
        style={{ border: 0, ...frameStyle }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        title={title}
      />
      <div className="mt-4 text-center">
        <MapLink office={office} className={linkClassName} style={linkStyle} />
      </div>
    </div>
  )
}
