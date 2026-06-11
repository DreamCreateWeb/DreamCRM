'use client'

import {
  createContext,
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

interface ContextProps {
  /** Mobile (<lg) overlay-drawer open/closed. */
  sidebarOpen: boolean
  setSidebarOpen: Dispatch<SetStateAction<boolean>>
  /**
   * Legacy Mosaic expand flag — retained so any older callers keep compiling.
   * The v2 sidebar uses `railCollapsed` instead (the inverse, persisted).
   */
  sidebarExpanded: boolean
  setSidebarExpanded: Dispatch<SetStateAction<boolean>>
  /**
   * v2 sidebar rail state for ≥lg widths. `true` = 64px icon rail (with
   * hover-flyout labels), `false` = 248px expanded. Persisted to
   * localStorage; toggled by the `[` key (see KeyboardShortcuts). Below lg
   * the sidebar is always an overlay drawer regardless of this flag.
   */
  railCollapsed: boolean
  setRailCollapsed: Dispatch<SetStateAction<boolean>>
  toggleRail: () => void
}

const RAIL_STORAGE_KEY = 'dc.sidebar.railCollapsed'

const AppContext = createContext<ContextProps>({
  sidebarOpen: false,
  setSidebarOpen: (): boolean => false,
  sidebarExpanded: false,
  setSidebarExpanded: (): boolean => false,
  railCollapsed: false,
  setRailCollapsed: (): boolean => false,
  toggleRail: () => {},
})

export default function AppProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false)
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false)
  const [railCollapsed, setRailCollapsed] = useState<boolean>(false)

  // Resolve the initial rail state once on mount: a persisted user choice wins;
  // otherwise fall back to the responsive default — rail in the lg→xl band
  // (tablet landscape), expanded at xl+. SSR renders expanded (false) and this
  // reconciles client-side without a layout flash on the common desktop case.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RAIL_STORAGE_KEY)
      if (saved === '1') {
        setRailCollapsed(true)
        return
      }
      if (saved === '0') {
        setRailCollapsed(false)
        return
      }
      // No saved preference → responsive default: collapse only in lg→xl.
      const lg = window.matchMedia('(min-width: 1024px)').matches
      const xl = window.matchMedia('(min-width: 1280px)').matches
      setRailCollapsed(lg && !xl)
    } catch {
      // localStorage/matchMedia unavailable (or denied) — keep expanded.
    }
  }, [])

  const toggleRail = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore persistence failures */
      }
      return next
    })
  }, [])

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        sidebarExpanded,
        setSidebarExpanded,
        railCollapsed,
        setRailCollapsed,
        toggleRail,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useAppProvider = () => useContext(AppContext)
