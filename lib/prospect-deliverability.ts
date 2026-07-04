import type { ProspectingConfig } from '@/lib/types/prospecting'

/**
 * Deliverability watchdog — pure math over trailing send/bounce/complaint
 * counts. Aggressive cold-outreach volume needs an immune system: when the
 * bounce or complaint rate breaches, the engine auto-pauses LIVE sending
 * (flips config.dryRun) before a bad batch can poison the sending domain.
 *
 * Never trips below the sample floor (a handful of bounces on 5 sends isn't
 * signal), and trips on strict `>` so a threshold set exactly at the rate
 * doesn't fire.
 */

export interface DeliverabilityCounts {
  sent: number
  bounces: number
  complaints: number
}

export interface DeliverabilityVerdict {
  tripped: boolean
  reason: string | null
  bouncePct: number
  complaintPct: number
}

export function assessDeliverability(
  counts: DeliverabilityCounts,
  watchdog: ProspectingConfig['watchdog'],
): DeliverabilityVerdict {
  const bouncePct = counts.sent > 0 ? (counts.bounces / counts.sent) * 100 : 0
  const complaintPct = counts.sent > 0 ? (counts.complaints / counts.sent) * 100 : 0
  const base = { bouncePct, complaintPct }

  if (!watchdog.enabled || counts.sent < watchdog.minSends) {
    return { tripped: false, reason: null, ...base }
  }
  if (bouncePct > watchdog.maxBouncePct) {
    return {
      tripped: true,
      reason: `bounce rate ${bouncePct.toFixed(1)}% (${counts.bounces} of ${counts.sent} sends, last ${watchdog.windowHours}h)`,
      ...base,
    }
  }
  if (complaintPct > watchdog.maxComplaintPct) {
    return {
      tripped: true,
      reason: `complaint rate ${complaintPct.toFixed(2)}% (${counts.complaints} of ${counts.sent} sends, last ${watchdog.windowHours}h)`,
      ...base,
    }
  }
  return { tripped: false, reason: null, ...base }
}
