'use client'

import { useState, type ReactNode } from 'react'

/**
 * The standard two-level navigation for a Settings page: top tabs, optional
 * subtabs per tab. Build any settings surface from this so it scales — a new
 * concern is just another tab/subtab, never another wall of fields.
 *
 * IMPORTANT: every tab + subtab's content is RENDERED (inactive ones are
 * `hidden` via CSS, not unmounted). That keeps all inputs in the DOM, so a
 * single form Save still submits every field across every tab.
 */

export interface SettingsSubtabDef {
  id: string
  label: string
  content: ReactNode
}

export interface SettingsTabDef {
  id: string
  label: string
  /** Leaf content — used when the tab has no subtabs. */
  content?: ReactNode
  /** Nested subtabs. */
  subtabs?: SettingsSubtabDef[]
}

function firstSubId(t: SettingsTabDef): string | undefined {
  return t.subtabs && t.subtabs.length > 0 ? t.subtabs[0].id : undefined
}

export function SettingsTabs({ tabs }: { tabs: SettingsTabDef[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '')
  // Remember the active subtab per parent tab so switching tabs keeps your place.
  const [activeSub, setActiveSub] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const t of tabs) {
      const f = firstSubId(t)
      if (f) m[t.id] = f
    }
    return m
  })

  return (
    <div>
      {/* Top-level tabs — underline nav. */}
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700/60 mb-6">
        {tabs.map((t) => {
          const on = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActiveTab(t.id)}
              className={`-mb-px px-3.5 py-2 text-sm font-medium border-b-2 transition-colors ${
                on
                  ? 'border-teal-500 text-teal-700 dark:text-teal-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Render every tab (inactive hidden) so a single Save submits everything. */}
      {tabs.map((t) => {
        const tabOn = t.id === activeTab
        const subs = t.subtabs ?? []
        const activeSubId = activeSub[t.id] ?? firstSubId(t)
        return (
          <div key={t.id} role="tabpanel" className={tabOn ? '' : 'hidden'}>
            {subs.length > 0 ? (
              <>
                {/* Subtab pills. */}
                <div role="tablist" className="flex flex-wrap gap-1.5 mb-5">
                  {subs.map((s) => {
                    const on = s.id === activeSubId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setActiveSub((p) => ({ ...p, [t.id]: s.id }))}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                          on
                            ? 'bg-teal-500/10 border-teal-500/40 text-teal-700 dark:text-teal-300'
                            : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100'
                        }`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
                {subs.map((s) => (
                  <div key={s.id} className={s.id === activeSubId ? '' : 'hidden'}>
                    {s.content}
                  </div>
                ))}
              </>
            ) : (
              t.content
            )}
          </div>
        )
      })}
    </div>
  )
}
