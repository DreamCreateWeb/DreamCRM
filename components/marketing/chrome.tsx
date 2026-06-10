'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { MARKETING_NAV } from '@/lib/marketing/site'

/**
 * Marketing-site header (client: mobile menu + Compare dropdown). B2B SaaS
 * register — ink on white, violet accent (the product's own accent color),
 * Inter, dense. Deliberately NOT the warm serif language of the clinic
 * sites: this sells software to practice owners, not dentistry to patients.
 */
export function MarketingHeader() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-[0.8rem] font-extrabold text-white">
              D
            </span>
            <span className="text-[0.98rem] font-bold tracking-tight text-gray-950">DreamCRM</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {MARKETING_NAV.map((item) =>
              item.children ? (
                <div
                  key={item.label}
                  className="relative"
                  onMouseEnter={() => setCompareOpen(true)}
                  onMouseLeave={() => setCompareOpen(false)}
                >
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1 rounded-lg px-3 py-2 text-[0.875rem] font-medium ${
                      isActive(item.href) ? 'text-gray-950' : 'text-gray-600 hover:text-gray-950'
                    }`}
                  >
                    {item.label}
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current opacity-60" aria-hidden="true">
                      <path d="M6 8.5 1.5 4h9L6 8.5Z" />
                    </svg>
                  </Link>
                  {compareOpen && (
                    <div className="absolute left-0 top-full w-56 pt-1">
                      <div className="rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className="block rounded-lg px-3 py-2 text-[0.85rem] font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-950"
                            onClick={() => setCompareOpen(false)}
                          >
                            {child.label}
                          </Link>
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
            className="rounded-lg bg-violet-600 px-3.5 py-2 text-[0.875rem] font-semibold text-white hover:bg-violet-700"
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
        <nav className="border-t border-gray-200 bg-white px-4 pb-4 pt-2 lg:hidden" aria-label="Mobile">
          {MARKETING_NAV.map((item) => (
            <div key={item.label}>
              <Link
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-[0.95rem] font-semibold text-gray-900"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
              {item.children?.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  className="block rounded-lg py-2 pl-7 pr-3 text-[0.875rem] text-gray-600"
                  onClick={() => setMobileOpen(false)}
                >
                  {child.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
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
