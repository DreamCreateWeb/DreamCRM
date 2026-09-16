'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MARKETING, MARKETING_NAV, type MarketingNavChild } from '@/lib/marketing/site'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'
import { DAY_WIRE } from '@/components/marketing/ui'

/**
 * Marketing-site header: megamenu dropdowns for Product / Compare /
 * Resources, scroll-aware elevation, full mobile menu. The Dream Create lockup
 * (bubble-D mark + wordmark) is the company brand in the chrome; "DreamCRM"
 * stays the product name in copy.
 *
 * DAYLIGHT DREAM — `BRAND.md` Part 8 move 4 (DREAMCRM-72). Part 0 decision 5
 * is superseded here: this bar used to sit at `white/85` ABOVE a dark hero
 * band, and it drew an edge whose job was to explain the seam between the two.
 * The page is light end to end now, so there is no seam, and the treatment
 * that explained it goes with it — the header is TRANSPARENT at rest and
 * simply part of the page.
 *
 * WHAT IT BECOMES ON SCROLL is the whole design: a glass rail that only exists
 * once there is something under it. `white/85` + `backdrop-blur-xl`, a
 * `DAY_WIRE` hairline (Part 2 names that blue; it is not `gray-200`), and a
 * BLUE shadow rather than a grey one — Part 3's "depth is emission, not
 * stacking". The light belongs to the page, so when the bar lifts, what spills
 * out from under it is the page's own colour.
 *
 * THE 85% IS A CONTRAST DECISION, NOT A TASTE ONE, and it is the one number in
 * this file worth defending. A sticky bar composites over whatever is beneath
 * it, and the worst case on this site is the FOOTER — `gray-950`, the darkest
 * surface the marketing site declares, and what this rail sits over for the
 * last screenful of every page. The quietest nav ink (`gray-600`) renders:
 *
 *   | fill | rail ground | `gray-600` |
 *   |---|---|---|
 *   | `white/90` | `rgb(231 232 234)` | 5.63 |
 *   | **`white/85`** | **`rgb(219 220 224)`** | **5.05** |
 *   | `white/80` | `rgb(207 209 213)` | **4.51** |
 *   | `white/75` | `rgb(195 197 203)` | **4.01** |
 *
 * **Read the 80 row.** It clears a 4.5 floor by one hundredth — that is Part
 * 7's "4.18 reads as nearly fine" in its sharpest form, and it is why the fill
 * sits two steps above it rather than one. Nothing in CI could see this on its
 * own: the surface under a sticky bar is a SIBLING scrolling past, not an
 * ancestor, so axe and every source rule in `class-pairs.ts` correctly decline
 * to grade the pair. `tests/a11y/token-contrast.test.ts` grades it beside the
 * footer's own table, reading the alpha out of THIS file — so thinning the
 * fill turns a required check red naming the ratio. It is a measurement, never
 * a preference.
 *
 * Radii are Part 3's: 10px controls and buttons, 14px the megamenu card.
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
      <span className="block text-[0.85rem] font-semibold text-gray-900 group-hover/item:text-teal-700">
        {child.label}
        {child.external && <span className="ml-1 text-gray-600">↗</span>}
      </span>
      {/* 0.78rem / `gray-600`, not 0.74rem / `gray-500`. 0.74rem is 11.84px —
          under the 12px floor `BRAND.md` Part 4 sets — and `gray-500` is 5.30
          on white against `gray-600`'s 6.91, the quiet-ink direction the
          design system already picked. Both corrected on DREAMCRM-72; the
          first is now held by `tests/marketing/chrome-legibility.test.ts`. */}
      {child.description && (
        <span className="mt-0.5 block text-[0.78rem] leading-snug text-gray-600">{child.description}</span>
      )}
    </>
  )
  const cls = 'group/item block rounded-[10px] px-3 py-2 hover:bg-[#F8FAFF] focus-visible:bg-[#F8FAFF]'
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

/**
 * THE ACTIVE MARK — the signature gradient at nav scale.
 *
 * The bar used to say "you are here" with `text-gray-950` against
 * `text-gray-600` and nothing else. Those grade 17.62 and 6.91 against white,
 * both fine on their own, and **2.55 against EACH OTHER** — which is the same
 * shape the cinematic spine's chapter rail was corrected for on DREAMCRM-70:
 * two inks that both pass the background can still be hard to tell apart, and
 * nothing in CI measures that pair. So the state gets a second channel that is
 * not a hue at all: a 2px rule under the label, in `teal-600 → violet-700 →
 * fuchsia-700`. Present or absent reads in greyscale.
 *
 * It renders in BOTH states at `opacity-0`/`opacity-100` rather than mounting
 * conditionally, so the reserved box is identical and nothing in the bar
 * shifts by a pixel when a route changes. `aria-hidden` — `aria-current` is
 * not this component's job and the link text already says where you are.
 */
function ActiveSpark({ on }: { on: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700 transition-opacity duration-200 ${
        on ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden="true"
    />
  )
}

export function MarketingHeader() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [elevated, setElevated] = useState(false)

  // The rail appears only once there is something under it. 2px rather than
  // the old 8: at rest this bar has NO fill, so the gap between "content is
  // sliding under me" and "I have a surface" is a gap where ink composites
  // over whatever is passing. Nothing on this site puts text in the top 2px of
  // a hero, so 2 closes it.
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 2)
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
      className={`sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-200 ease-out ${
        elevated
          ? 'bg-white/85 shadow-[0_10px_30px_-22px_rgb(47_82_179/0.55)] backdrop-blur-xl'
          : 'bg-transparent'
      }`}
      style={{ borderBottomColor: elevated ? DAY_WIRE : 'transparent' }}
    >
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center"
            aria-label={`${MARKETING.companyName} — home`}
            onClick={() => setMobileOpen(false)}
          >
            <DreamCreateLogo size={32} />
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
                    className={`relative flex items-center gap-1 rounded-[10px] px-3 py-2 text-[0.875rem] font-medium transition-colors ${
                      isActive(item.href) ? 'text-gray-950' : 'text-gray-600 hover:text-gray-950'
                    }`}
                    aria-expanded={openMenu === item.label}
                  >
                    {item.label}
                    <ActiveSpark on={isActive(item.href)} />
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
                        className={`rounded-[14px] border bg-white p-2 shadow-[0_28px_70px_-30px_rgb(47_82_179/0.55)] ${
                          item.children.length > 5 ? 'grid w-[34rem] grid-cols-2 gap-x-2' : 'w-72'
                        }`}
                        style={{ borderColor: DAY_WIRE }}
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
                  className={`relative rounded-[10px] px-3 py-2 text-[0.875rem] font-medium transition-colors ${
                    isActive(item.href) ? 'text-gray-950' : 'text-gray-600 hover:text-gray-950'
                  }`}
                >
                  {item.label}
                  <ActiveSpark on={isActive(item.href)} />
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/signin"
            className="rounded-[10px] px-3.5 py-2 text-[0.875rem] font-medium text-gray-700 transition-colors hover:text-gray-950"
          >
            Sign in
          </Link>
          {/* Part 2's primary action, at chrome scale: `teal-600 → teal-700`
              carrying white (5.09 / 7.05, both graded by rule 3 in
              `tests/a11y/class-pairs.ts`), 10px radius, and the glow deepening
              on hover rather than the fill darkening — Part 3, depth is
              emission. It was a flat `bg-teal-700` that went `teal-800` on
              hover, which is the dashboard's move. */}
          <Link
            href="/signup"
            className="rounded-[10px] bg-gradient-to-r from-teal-600 to-teal-700 px-3.5 py-2 text-[0.875rem] font-semibold text-white shadow-[0_6px_18px_-8px_rgb(58_103_217/0.65)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_9px_24px_-8px_rgb(58_103_217/0.8)]"
          >
            Start free trial
          </Link>
        </div>

        <button
          type="button"
          className="rounded-[10px] p-2 text-gray-600 lg:hidden"
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
        <nav
          className="max-h-[calc(100dvh-60px)] overflow-y-auto border-t bg-white px-4 pb-6 pt-2 lg:hidden"
          style={{ borderColor: DAY_WIRE }}
          aria-label="Mobile"
        >
          {MARKETING_NAV.map((item) => (
            <div
              key={item.label}
              className="border-b py-1 last:border-b-0"
              style={{ borderColor: DAY_WIRE }}
            >
              <Link
                href={item.href}
                className="block rounded-[10px] px-3 py-2.5 text-[0.95rem] font-bold text-gray-900"
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
                        className="rounded-[10px] py-1.5 pl-6 pr-3 text-[0.85rem] text-gray-600"
                        onClick={() => setMobileOpen(false)}
                      >
                        {child.label} ↗
                      </a>
                    ) : (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="rounded-[10px] py-1.5 pl-6 pr-3 text-[0.85rem] text-gray-600"
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
              className="flex-1 rounded-[10px] border bg-white px-3 py-2.5 text-center text-[0.9rem] font-semibold text-gray-950 shadow-[0_2px_10px_-4px_rgb(26_36_64/0.18)]"
              style={{ borderColor: DAY_WIRE }}
              onClick={() => setMobileOpen(false)}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="flex-1 rounded-[10px] bg-gradient-to-r from-teal-600 to-teal-700 px-3 py-2.5 text-center text-[0.9rem] font-semibold text-white shadow-[0_6px_18px_-8px_rgb(58_103_217/0.65)]"
              onClick={() => setMobileOpen(false)}
            >
              Start free trial
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
