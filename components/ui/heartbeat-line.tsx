import type { ReactNode } from 'react'

/**
 * The honest line a heartbeat tile whispers under its number (ML-38):
 * "tracked since Nov 9" until a fortnight exists, then the comparison. Pure
 * presentation of `Heartbeat.line` (lib/metric-series.ts decides the words);
 * renders nothing when there is nothing true to say. Use inside a KpiStat
 * `sub`, after the tile's own sub.
 */
export function HeartbeatLine({
  line,
  onlySince = false,
}: {
  line: string | null | undefined
  /** For a tile whose own sub already carries a delta: say only the honest
   *  "tracked since <date>" (the history disclaimer), never a second comparison. */
  onlySince?: boolean
}): ReactNode {
  if (!line) return null
  if (onlySince && !line.startsWith('tracked since')) return null
  return (
    <span className="block text-xs font-normal text-gray-500 dark:text-gray-400" data-heartbeat-line>
      {line}
    </span>
  )
}
