'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tab, Tabs } from '@/components/ui/tabs'

/**
 * The standard two-level navigation for a Settings page: top tabs, optional
 * subtabs per tab. Build any settings surface from this so it scales — a new
 * concern is just another tab/subtab, never another wall of fields.
 *
 * IMPORTANT: every tab + subtab's content is RENDERED (inactive ones are
 * `hidden` via CSS, not unmounted). That keeps all inputs in the DOM, so a
 * single form Save still submits every field across every tab.
 *
 * Deep-linking: `?tab=<id>&sub=<id>` opens straight to that tab/subtab (used by
 * the settings rail's smart search). Unknown ids are ignored — we fall back to
 * the first tab. We only honor a `tab` param this instance actually owns, so
 * multiple SettingsTabs on a page don't fight over it.
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
  const searchParams = useSearchParams()
  const urlTab = searchParams?.get('tab') ?? null
  const urlSub = searchParams?.get('sub') ?? null
  // Only adopt the URL tab if it's one of ours (avoids cross-instance fights).
  const ownsUrlTab = !!urlTab && tabs.some((t) => t.id === urlTab)

  const [activeTab, setActiveTab] = useState(() =>
    ownsUrlTab ? (urlTab as string) : tabs[0]?.id ?? '',
  )
  // Remember the active subtab per parent tab so switching tabs keeps your place.
  const [activeSub, setActiveSub] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const t of tabs) {
      const f = firstSubId(t)
      if (f) m[t.id] = f
    }
    // Honor a deep-linked subtab on first paint.
    if (ownsUrlTab && urlSub) {
      const t = tabs.find((x) => x.id === urlTab)
      if (t?.subtabs?.some((s) => s.id === urlSub)) m[urlTab as string] = urlSub
    }
    return m
  })

  // Write the selection back to the URL (history.replaceState — no nav churn,
  // the patient-detail ?tab= precedent) so refresh/share lands on the same
  // tab. Only fires on a click on THIS instance, so co-mounted tab sets
  // can't fight over the param.
  function writeUrl(tab: string, sub?: string) {
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tab)
      if (sub) url.searchParams.set('sub', sub)
      else url.searchParams.delete('sub')
      window.history.replaceState(null, '', url.toString())
    } catch {
      // non-blocking — the tabs still switch
    }
  }

  // React to deep-link changes that arrive after mount (clicking a search
  // result while this page is already open — the rail navigates client-side).
  useEffect(() => {
    if (!urlTab || !tabs.some((t) => t.id === urlTab)) return
    setActiveTab(urlTab)
    if (urlSub) {
      const t = tabs.find((x) => x.id === urlTab)
      if (t?.subtabs?.some((s) => s.id === urlSub)) {
        setActiveSub((p) => ({ ...p, [urlTab]: urlSub }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab, urlSub])

  return (
    <div>
      {/* Top-level tabs — underline nav. */}
      <Tabs label="Settings sections" className="mb-6">
        {tabs.map((t) => (
          <Tab
            key={t.id}
            active={t.id === activeTab}
            onClick={() => {
              setActiveTab(t.id)
              writeUrl(t.id, activeSub[t.id])
            }}
          >
            {t.label}
          </Tab>
        ))}
      </Tabs>

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
                <Tabs label={`${t.label} sections`} variant="pill" className="mb-5">
                  {subs.map((s) => (
                    <Tab
                      key={s.id}
                      variant="pill"
                      active={s.id === activeSubId}
                      onClick={() => {
                        setActiveSub((p) => ({ ...p, [t.id]: s.id }))
                        writeUrl(t.id, s.id)
                      }}
                    >
                      {s.label}
                    </Tab>
                  ))}
                </Tabs>
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
