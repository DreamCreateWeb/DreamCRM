'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useAppProvider } from '@/app/app-provider'
import { useTrail } from '@/app/trail-context'

// The ⌘K palette only opens on demand, so keep it out of the initial header
// bundle that every dashboard page ships — load its chunk client-side.
const SearchModal = dynamic(() => import('@/components/search-modal'), { ssr: false })
import Notifications from '@/components/dropdown-notifications'
import DropdownHelp from '@/components/dropdown-help'
import ThemeToggle from '@/components/theme-toggle'
import QuickCreateMenu from './quick-create-menu'
import DemoExitChip from './demo-exit-chip'
import PresentingChip from './presenting-chip'
import TrailBack from './trail-back'

/**
 * v2 header (DESIGN-SYSTEM.md Part 4) — 56px, surface-1 + bottom hairline.
 * Left: hamburger (<lg) + page title slot. Right: `+ New ▾` quick-create
 * (context-aware default, plan-gated via `moduleIds`, `C` opens it) · ⌘K
 * search · bell (amber unread) · "Exit demo" chip (when `isDemo`) · help ·
 * theme. The avatar/profile lives in the sidebar's bottom slot in v2, so it
 * isn't repeated here.
 */
export default function Header({
  variant = 'default',
  moduleIds = [],
  isDemo = false,
  presentingTo,
  title,
}: {
  variant?: 'default' | 'v2' | 'v3'
  /** Module ids visible to this tenant — gates the quick-create entries. */
  moduleIds?: string[]
  /** Platform-admin demo mode — shows the "Exit demo" chip. */
  isDemo?: boolean
  /** Prospect-branded demo: the practice being presented to — swaps the
   *  Exit-demo chip for the "🎬 Presenting to X" end-demo control. */
  presentingTo?: string
  /** Optional page title shown on the left (Settings subpages use it). */
  title?: string
}) {
  const { sidebarOpen, setSidebarOpen } = useAppProvider()
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false)
  // Whether the journey-trail back chip is showing — mirrors TrailBack's own
  // visibility rule so the title's "·" separator only renders alongside it.
  const { trail, previous } = useTrail()
  const hasTrailBack = trail.length > 1 && !!previous

  // ⌘K / Ctrl+K opens the global palette from anywhere in the dashboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchModalOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <header className="aura-chrome sticky top-0 z-30 border-b border-hairline bg-surface-1/90 backdrop-blur-md">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Left: hamburger (mobile) + page title */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="text-ink-500 hover:text-ink-600 lg:hidden"
              aria-controls="sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <span className="sr-only">Open sidebar</span>
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="5" width="16" height="2" />
                <rect x="4" y="11" width="16" height="2" />
                <rect x="4" y="17" width="16" height="2" />
              </svg>
            </button>
            {/* Journey-trail "← {came-from}" chip — renders only when there's
                somewhere to go back to, so it sits quietly before the title. */}
            <TrailBack />
            {title && (
              <h1 className="flex min-w-0 items-center truncate text-sm font-semibold text-ink-900">
                {/* "·" separator only when the back chip is also showing, so the
                    row reads "← Patients · Settings" — never a dangling dot. */}
                {hasTrailBack && (
                  <span className="mr-1.5 select-none font-normal text-ink-400" aria-hidden="true">
                    ·
                  </span>
                )}
                {title}
              </h1>
            )}
          </div>

          {/* Right: quick-create · search · bell · demo · help · theme */}
          <div className="flex items-center gap-3">
            <QuickCreateMenu moduleIds={moduleIds} />

            <div>
              <button
                className={`flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 hover:bg-ink-900/[0.05] dark:hover:bg-white/[0.06] ${
                  searchModalOpen ? 'bg-ink-900/[0.06] dark:bg-white/[0.08]' : ''
                }`}
                onClick={() => setSearchModalOpen(true)}
                title="Search everything (⌘K)"
              >
                <span className="sr-only">Search</span>
                <svg
                  className="fill-current text-ink-500"
                  width={16}
                  height={16}
                  viewBox="0 0 16 16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M7 14c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7ZM7 2C4.243 2 2 4.243 2 7s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5Z" />
                  <path d="m13.314 11.9 2.393 2.393a.999.999 0 1 1-1.414 1.414L11.9 13.314a8.019 8.019 0 0 0 1.414-1.414Z" />
                </svg>
                <kbd className="hidden rounded border border-hairline px-1 py-px text-xs font-medium tabular-nums text-ink-400 lg:inline-block">
                  ⌘K
                </kbd>
              </button>
              <SearchModal isOpen={searchModalOpen} setIsOpen={setSearchModalOpen} />
            </div>

            <Notifications align="right" />
            {isDemo && (presentingTo ? <PresentingChip clinicName={presentingTo} /> : <DemoExitChip />)}
            <DropdownHelp align="right" />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
