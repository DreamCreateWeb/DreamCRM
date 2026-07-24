import Link from 'next/link'
import type { ClinicAnnouncement } from '@/lib/types/clinic-content'
import { SITE_DEEP, SITE_DEEP_INK } from './tokens'

/**
 * The site-wide announcement strip — a thin brand-deep bar above the header
 * on every public page + every template (rendered once in the site layout,
 * so a new template gets it for free). Non-sticky: it scrolls away and the
 * header sticks to the top behind it (the Shopify pattern). Optional link
 * makes the whole bar tappable; a site-relative path uses next/link, an
 * absolute URL renders a plain anchor. Presentation only — expiry + trimming
 * happen upstream in `activeAnnouncement`, so this renders whatever it's
 * handed or nothing.
 */
export default function AnnouncementBar({ announcement }: { announcement: ClinicAnnouncement | null }) {
  if (!announcement) return null
  const { message, href } = announcement

  const inner = (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true">📣</span>
      <span>{message}</span>
      {href && (
        <span aria-hidden="true" className="opacity-80">
          →
        </span>
      )}
    </span>
  )

  const cls =
    'block w-full text-center px-4 py-2 text-sm font-medium leading-snug'
  const style = { background: SITE_DEEP, color: SITE_DEEP_INK }

  if (!href) {
    return (
      <div role="region" aria-label="Announcement" className={cls} style={style}>
        {inner}
      </div>
    )
  }
  const isInternal = href.startsWith('/') && !href.startsWith('//')
  if (isInternal) {
    return (
      <Link href={href} aria-label={`Announcement: ${message}`} className={`${cls} hover:underline underline-offset-4`} style={style}>
        {inner}
      </Link>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Announcement: ${message}`}
      className={`${cls} hover:underline underline-offset-4`}
      style={style}
    >
      {inner}
    </a>
  )
}
