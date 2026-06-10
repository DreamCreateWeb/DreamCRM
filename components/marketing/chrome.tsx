'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MARKETING, MARKETING_NAV, type MarketingNavChild } from '@/lib/marketing/site'

/**
 * Marketing-site header: megamenu dropdowns for Product / Compare /
 * Resources, scroll-aware elevation, full mobile menu. B2B SaaS register —
 * ink on white, violet accent (the product's own accent), Inter, dense.
 */

function ChildLink({
  child,
  onNavigate,
}: {
  child: MarketingNavChild
  onNavigate: () => void
}) {
  const inner = (
    <>
      <span className="block text-[0.85rem] font-semibold text-gray-900 group-hover/item:text-violet-700">
        {child.label}
        {child.external && <span className="ml-1 text-gray-400">↗</span>}
      </span>
      {child.description && (
        <span className="mt-0.5 block text-[0.74rem] leading-snug text-gray-500">{child.description}</span>
      )}
    </>
  )
  const cls = 'group/item block rounded-lg px-3 py-2 hover:bg-gray-50 focus-visible:bg-gray-50'
  if (child.external) {
    return (
      <a href={child.href} target="_blank" rel="noreferrer" className={cls} onClick={onNavigate}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={child.href} className={cls} onClick={onNavigate}>
      {inner}
    </Link>
  )
}

export function MarketingHeader() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [elevated, setElevated] = useState(false)

  // Subtle elevation once the page scrolls — keeps the header feeling
  // attached to the content instead of floating arbitrarily.
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close menus on navigation.
  useEffect(() => {
    setMobileOpen(false)
    setOpenMenu(null)
  }, [pathname])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href.split('#')[0] + '/')

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-white/85 backdrop-blur transition-shadow ${
        elevated ? 'border-gray-200 shadow-sm' : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-[0.8rem] font-extrabold text-white">
              D
            </span>
            <span className="text-[0.98rem] font-bold tracking-tight text-gray-950">{MARKETING.productName}</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {MARKETING_NAV.map((item) =>
              item.children ? (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => setOpenMenu(item.label)}
                  onMouseLeave={() => setOpenMenu(null)}
                  // Keyboard parity with hover: tabbing into the trigger (or
                  // any child) opens the panel; tabbing out or Escape closes.
                  onFocusCapture={() => setOpenMenu(item.label)}
                  onBlurCapture={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenMenu(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpenMenu(null)
                  }}
                >
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1 rounded-lg px-3 py-2 text-[0.875rem] font-medium ${
                      isActive(item.href) ? 'text-gray-950' : 'text-gray-600 hover:text-gray-950'
                    }`}
                    aria-expanded={openMenu === item.label}
                  >
                    {item.label}
                    <svg
                      viewBox="0 0 12 12"
                      className={`h-2.5 w-2.5 fill-current opacity-60 transition-transform ${openMenu === item.label ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    >
                      <path d="M6 8.5 1.5 4h9L6 8.5Z" />
                    </svg>
                  </Link>
                  {openMenu === item.label && (
                    <div className="absolute left-0 top-full pt-1.5">
                      <div
                        className={`rounded-xl border border-gray-200 bg-white p-2 shadow-xl shadow-gray-200/60 ${
                          item.children.length > 5 ? 'grid w-[34rem] grid-cols-2 gap-x-2' : 'w-72'
                        }`}
                      >
                        {item.children.map((child) => (
                          <ChildLink key={child.href} child={child} onNavigate={() => setOpenMenu(null)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-[0.875rem] font-medium ${
                    isActive(item.href) ? 'text-gray-950' : 'text-gray-600 hover:text-gray-950'
                  }`}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/signin"
            className="rounded-lg px-3.5 py-2 text-[0.875rem] font-medium text-gray-700 hover:text-gray-950"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-violet-600 px-3.5 py-2 text-[0.875rem] font-semibold text-white transition-colors hover:bg-violet-700"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-gray-600 lg:hidden"
          aria-expanded={mobileOpen}
          aria-label="Menu"
          onClick={() => setMobileOpen((v) => !v)}
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current" aria-hidden="true">
            {mobileOpen ? (
              <path d="M5.3 4.3a1 1 0 0 0-1 1.7L8.6 10l-4.3 4a1 1 0 1 0 1.4 1.5L10 11.4l4.3 4a1 1 0 0 0 1.4-1.4L11.4 10l4.3-4a1 1 0 1 0-1.4-1.4L10 8.6 5.7 4.6a1 1 0 0 0-.4-.3Z" />
            ) : (
              <path d="M2 5h16v2H2V5Zm0 4h16v2H2V9Zm0 4h16v2H2v-2Z" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <nav className="max-h-[calc(100dvh-60px)] overflow-y-auto border-t border-gray-200 bg-white px-4 pb-6 pt-2 lg:hidden" aria-label="Mobile">
          {MARKETING_NAV.map((item) => (
            <div key={item.label} className="border-b border-gray-50 py-1 last:border-b-0">
              <Link
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-[0.95rem] font-bold text-gray-900"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
              {item.children && (
                <div className="grid grid-cols-1 gap-0.5 pb-2 sm:grid-cols-2">
                  {item.children.map((child) =>
                    child.external ? (
                      <a
                        key={child.href}
                        href={child.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg py-1.5 pl-6 pr-3 text-[0.85rem] text-gray-600"
                        onClick={() => setMobileOpen(false)}
                      >
                        {child.label} ↗
                      </a>
                    ) : (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="rounded-lg py-1.5 pl-6 pr-3 text-[0.85rem] text-gray-600"
                        onClick={() => setMobileOpen(false)}
                      >
                        {child.label}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="mt-4 flex gap-2">
            <Link
              href="/signin"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-center text-[0.9rem] font-semibold text-gray-800"
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="flex-1 rounded-lg bg-violet-600 px-3 py-2.5 text-center text-[0.9rem] font-semibold text-white"
              onClick={() => setMobileOpen(false)}
            >
              Get started
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
