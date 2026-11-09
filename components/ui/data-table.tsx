import type { ReactNode } from 'react'

/**
 * THE phone recipe for a dashboard data table (ML-53).
 *
 * Wrap the existing `<table className="w-full text-sm">` in `<TableFit>`:
 * on a phone the table scrolls sideways INSIDE its own focusable region (the
 * page never widens) with the first column pinned (`.table-fit` in
 * app/css/style.css), and the table keeps a readable minimum width so no cell
 * clips. Secondary columns hide below `sm` with `hidden sm:table-cell` on the
 * `<th>` and `<td>`, and their facts fold into the primary cell as a
 * `<FoldedFacts>` line that only shows below `sm`. Nothing the table says
 * changes — only how it fits. Server-safe: no hooks.
 */
export function TableFit({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-fit overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}

/** The folded line under a primary cell — phone only. */
export function FoldedFacts({ children }: { children: ReactNode }) {
  return <p className="sm:hidden mt-0.5 text-xs text-gray-500 dark:text-gray-400">{children}</p>
}
