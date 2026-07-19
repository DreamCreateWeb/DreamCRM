import Sparkline from '@/components/ui/sparkline'

export interface ClosedHeartbeatPoint {
  bucket: string
  value: number
}

/**
 * My Day's ONE heartbeat (Design System law 7): follow-ups YOU closed per
 * clinic-local week over the trailing 8 weeks. Personal encouragement, not a
 * manager metric — it counts only the signed-in staffer's own closes
 * (completedBy) and speaks in "you closed…" voice. Decorative: the svg is
 * aria-hidden; the visible 12px label carries the meaning. Hidden entirely
 * when fewer than 2 weeks carry a close — a flat or single-blip chart says
 * nothing worth drawing, and a "you closed 0" readout would be shame, not
 * encouragement (mirrors the Patients/Leads heartbeat threshold).
 */
export default function ClosedHeartbeat({ series }: { series: ClosedHeartbeatPoint[] }) {
  const weeksWithCloses = series.filter((p) => p.value > 0).length
  if (weeksWithCloses < 2) return null

  const thisWeek = series[series.length - 1]?.value ?? 0
  const total = series.reduce((sum, p) => sum + p.value, 0)
  const label =
    thisWeek > 0 ? `You closed ${thisWeek} this week` : `You closed ${total} these past 8 weeks`

  return (
    <div
      className="mb-2 px-0.5 flex items-center justify-between gap-2"
      title="Follow-ups you closed per week over the last 8 weeks — every one is a patient who didn't slip through"
    >
      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{label}</span>
      <span aria-hidden="true">
        <Sparkline
          data={series}
          variant="bar"
          color="var(--color-teal-500)"
          width={104}
          height={26}
          labels={false}
        />
      </span>
    </div>
  )
}
