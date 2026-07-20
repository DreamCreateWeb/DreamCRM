/**
 * The Intake Forms page's ONE heartbeat (Design System law 7): forms
 * completed per clinic-local week over the trailing 8 weeks — completions
 * are the module's win, so that's the flow worth drawing. Decorative: the
 * svg is aria-hidden; the visible 12px label + the plain-language title
 * carry the meaning — and the label drills into the cross-template
 * submissions index (v3: every number links to the view that explains it).
 * Renders nothing unless at least 2 weeks carry any completions (a flat or
 * single-blip line says nothing worth drawing) — mirrors the Patients
 * list's 12-week spark.
 */
import Link from 'next/link'
import Sparkline from '@/components/ui/sparkline'
import type { FormsCompletedPerWeekPoint } from '@/lib/services/forms'

export default function CompletedHeartbeat({
  series,
}: {
  series: FormsCompletedPerWeekPoint[]
}) {
  const showFlow = series.filter((p) => p.value > 0).length >= 2
  if (!showFlow) return null

  return (
    <div
      className="hidden lg:flex items-center justify-end gap-2 mb-2"
      title="Forms completed per week over the last 8 weeks"
    >
      <Link
        href="/intake-forms/submissions"
        className="text-xs text-gray-500 dark:text-gray-400 hover:text-teal-700 dark:hover:text-teal-300 whitespace-nowrap"
      >
        Completed · 8 weeks
      </Link>
      <span aria-hidden="true">
        <Sparkline
          data={series}
          color="var(--color-teal-500)"
          width={104}
          height={26}
          labels={false}
        />
      </span>
    </div>
  )
}
