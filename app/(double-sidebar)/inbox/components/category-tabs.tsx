'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Props {
  counts: Record<string, number>
  activeCategory: string
}

interface TabSpec {
  key: string
  label: string
  hideWhenEmpty?: boolean
}

const TABS: TabSpec[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'updates', label: 'Updates' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'spam', label: 'Spam', hideWhenEmpty: true },
]

/**
 * Gmail-style category tabs sitting above the message list. AI-classified
 * `category` decides which tab a message lands in:
 *   - primary: real personal/business email from a human, needs attention
 *   - updates: automated/transactional (receipts, alerts, calendar invites)
 *   - promotions: marketing, newsletters, bulk sales pitches
 *   - spam: phishing/scams (hidden when empty so it stays out of the way)
 */
export default function CategoryTabs({ counts, activeCategory }: Props) {
  const pathname = usePathname()
  const sp = useSearchParams()

  function href(category: string): string {
    const params = new URLSearchParams(sp.toString())
    if (category === 'primary') params.delete('cat'); else params.set('cat', category)
    // Reset transient state when switching tabs.
    params.delete('m')
    params.delete('intent')
    params.delete('view')
    params.delete('patients')
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const visibleTabs = TABS.filter((t) => !t.hideWhenEmpty || (counts[t.key] ?? 0) > 0)
  return (
    // Horizontally scrollable on overflow with a right-edge fade so the
    // user knows there's more. Hidden scrollbar (no-scrollbar) keeps the
    // chrome clean. Built for future tenants who might add many custom
    // categories — current 4 tabs always fit, but the design scales.
    <div className="relative border-b border-stone-200 dark:border-stone-700/60">
      <div className="flex items-center gap-0.5 px-2 pt-1 overflow-x-auto no-scrollbar">
        {visibleTabs.map((tab) => {
          const active = activeCategory === tab.key
          const count = counts[tab.key] ?? 0
          return (
            <Link
              key={tab.key}
              href={href(tab.key)}
              className={cn(
                'relative inline-flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium transition-colors whitespace-nowrap shrink-0',
                active
                  ? 'text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200',
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    'tabular-nums text-[10px] rounded-full px-1.5 py-0.5 leading-none',
                    active
                      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
                  )}
                >
                  {count}
                </span>
              )}
              {active && (
                <span className="absolute -bottom-px left-2 right-2 h-[2px] bg-stone-900 dark:bg-stone-100 rounded-t" />
              )}
            </Link>
          )
        })}
      </div>
      {/* Right-edge fade indicating horizontal scroll. Pointer-events-none
          so it doesn't block clicks on tabs underneath. */}
      <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-6 bg-gradient-to-l from-white dark:from-stone-900 to-transparent" />
    </div>
  )
}
