'use client'

import { Fragment, type ReactNode } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Visible icon/button cluster shown right of the title (e.g. delete, more menu). */
  actions?: ReactNode
  /** Footer area pinned to the bottom of the drawer (e.g. Save / Cancel). */
  footer?: ReactNode
  /** Width: 'sm' = 380px, 'md' = 480px, 'lg' = 640px. Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

const SIZES = {
  sm: 'sm:max-w-[380px]',
  md: 'sm:max-w-[480px]',
  lg: 'sm:max-w-[640px]',
} as const

/**
 * Right-side slide-in drawer. Used as the canonical "detail view + edit"
 * surface across the platform admin dashboards (event detail, task detail,
 * future contact detail, etc.). Built on Headless UI's Dialog so focus
 * trap, escape-to-close, scroll-lock all come for free.
 *
 * The header (title + actions) is sticky so it stays visible while editing
 * long forms; the footer is sticky for the same reason (Save/Cancel always
 * reachable without scrolling).
 */
export default function Drawer({
  open,
  onClose,
  title,
  actions,
  footer,
  size = 'md',
  children,
}: Props) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="transition-opacity ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-stone-900/30 backdrop-blur-[2px]" aria-hidden="true" />
        </TransitionChild>

        {/* Drawer panel */}
        <div className="fixed inset-0 flex justify-end pointer-events-none">
          <TransitionChild
            as={Fragment}
            enter="transform transition ease-out duration-250"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transform transition ease-in duration-200"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel
              className={cn(
                'pointer-events-auto w-full bg-white dark:bg-stone-900 shadow-2xl flex flex-col h-full',
                SIZES[size],
              )}
            >
              {(title || actions) && (
                <div className="sticky top-0 z-10 bg-white/95 dark:bg-stone-900/95 backdrop-blur border-b border-stone-200 dark:border-stone-700/60 px-5 py-3 flex items-center gap-3">
                  <div className="min-w-0 grow text-[14px] font-medium text-stone-900 dark:text-stone-100 truncate">
                    {title}
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    {actions}
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-colors"
                      title="Close (Esc)"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">{children}</div>
              {footer && (
                <div className="sticky bottom-0 bg-white/95 dark:bg-stone-900/95 backdrop-blur border-t border-stone-200 dark:border-stone-700/60 px-5 py-3">
                  {footer}
                </div>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
