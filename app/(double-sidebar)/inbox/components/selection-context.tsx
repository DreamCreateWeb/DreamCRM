'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

interface SelectionContextValue {
  selected: Set<string>
  isSelected: (id: string) => boolean
  toggle: (id: string, opts?: { rangeFrom?: string; allIds?: string[] }) => void
  selectAll: (ids: string[]) => void
  clear: () => void
  lastToggledRef: React.MutableRefObject<string | null>
  count: number
}

const Ctx = createContext<SelectionContextValue | null>(null)

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const lastToggledRef = useRef<string | null>(null)

  const isSelected = useCallback((id: string) => selected.has(id), [selected])

  const toggle = useCallback(
    (id: string, opts?: { rangeFrom?: string; allIds?: string[] }) => {
      setSelected((prev) => {
        const next = new Set(prev)
        // Range select: extend from the last anchor to id, additive.
        if (opts?.rangeFrom && opts.allIds) {
          const a = opts.allIds.indexOf(opts.rangeFrom)
          const b = opts.allIds.indexOf(id)
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a]
            for (let i = lo; i <= hi; i++) next.add(opts.allIds[i])
            lastToggledRef.current = id
            return next
          }
        }
        if (next.has(id)) next.delete(id)
        else next.add(id)
        lastToggledRef.current = id
        return next
      })
    },
    [],
  )

  const selectAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allOn = ids.length > 0 && ids.every((id) => prev.has(id))
      if (allOn) return new Set()
      return new Set(ids)
    })
  }, [])

  const clear = useCallback(() => {
    setSelected(new Set())
    lastToggledRef.current = null
  }, [])

  const value = useMemo<SelectionContextValue>(
    () => ({ selected, isSelected, toggle, selectAll, clear, lastToggledRef, count: selected.size }),
    [selected, isSelected, toggle, selectAll, clear],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSelection must be used inside <SelectionProvider>')
  return ctx
}
