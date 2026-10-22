import type { CSSProperties, ReactNode } from 'react'
import { parseServiceIcon } from '@/lib/service-icons'
import SiteImage from './site-image'

interface Props {
  /** The service's stored icon — `icon:<id>`, an https URL, or an emoji. */
  icon: string | null | undefined
  /** Rendered box, in CSS px — the glyph's and picture's width and height. */
  size?: number
  /** What to draw when the service has no drawable icon. Defaults to nothing. */
  fallback?: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * The one way a service's icon is drawn, on every template and in the
 * dashboard: a curated glyph as inline SVG in `currentColor` (so the host's
 * ink tints it), an uploaded picture through `SiteImage`, or the emoji as
 * text. Plain function, no hooks — server and client alike.
 */
export default function ServiceIcon({ icon, size = 24, fallback = null, className, style }: Props) {
  const ref = parseServiceIcon(icon)
  if (!ref) return <>{fallback}</>
  if (ref.kind === 'glyph') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
        style={style}
        data-service-icon={ref.id}
      >
        {ref.glyph.paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    )
  }
  if (ref.kind === 'image') {
    return (
      <SiteImage
        src={ref.url}
        alt=""
        displayWidth={size}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={className}
        style={{ width: size, height: size, objectFit: 'contain', ...style }}
        data-service-icon="image"
      />
    )
  }
  return (
    <span className={className} style={style} aria-hidden="true" data-service-icon="emoji">
      {ref.text}
    </span>
  )
}
