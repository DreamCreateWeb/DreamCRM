'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PORTAL_BORDER, PORTAL_MUTED } from './ui'

/**
 * The header's "Book a visit" pill. On every page it's the brand primary;
 * ON /patient/book it stops being a self-link — same pill shape, quiet
 * outline, aria-current — because a primary button that reloads the page
 * you're on is a small lie.
 */
export default function HeaderBookButton({ brand, label }: { brand: string; label: string }) {
  const pathname = usePathname()
  const onBookPage = pathname === '/patient/book'

  if (onBookPage) {
    return (
      <span
        aria-current="page"
        className="rounded-full px-4 py-2 text-[0.85rem] font-semibold"
        style={{ border: `1px solid ${PORTAL_BORDER}`, color: PORTAL_MUTED, backgroundColor: '#FFFFFF' }}
      >
        {label}
      </span>
    )
  }

  return (
    <Link
      href="/patient/book"
      className="rounded-full px-4 py-2 text-[0.85rem] font-semibold text-white"
      style={{ backgroundColor: brand }}
    >
      {label}
    </Link>
  )
}
