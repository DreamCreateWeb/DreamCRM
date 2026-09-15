'use client'

import { useState, useTransition } from 'react'
import { DEMO_TRACK_LIST, type DemoTrackId } from '@/lib/types/demo-script'
import { getPlanById, type PlanId } from '@/lib/stripe-config'
import { ActionButton } from '@/components/ui/action-button'
import { startBrandedDemoAction } from '../../admin-actions'

/**
 * The story picker — which demo this prospect gets. One practice needs the
 * website rebuild, another needs the presence sync, another the social
 * suite; the picker preselects what their verified gaps suggest and the
 * presenter can still switch tracks live from the panel mid-call.
 */

/**
 * "closes on <plan>" — read from `lib/stripe-config.ts`, never copied
 * (DREAMCRM-38). The hardcoded labels here said Premium was $500/mo, the
 * struck-through LIST price, so the presenter's own panel disagreed with the
 * $200 founding rate on the pricing page and in checkout.
 */
function planLabel(planId: PlanId): string {
  const plan = getPlanById(planId)
  return plan ? `${plan.name} · $${plan.price.toLocaleString('en-US')}/mo` : planId
}

export default function TrackPicker({
  prospectId,
  suggested,
}: {
  prospectId: string
  suggested: DemoTrackId
}) {
  const [selected, setSelected] = useState<DemoTrackId>(suggested)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DEMO_TRACK_LIST.map((t) => {
          const isSelected = t.id === selected
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              aria-pressed={isSelected}
              className={`rounded-lg p-3 text-left ring-1 transition-colors ${
                isSelected
                  ? 'ring-2 ring-teal-500 bg-teal-500/5 dark:bg-teal-500/10'
                  : 'ring-inset ring-[color:var(--color-hairline)] hover:bg-gray-50 dark:hover:bg-gray-800/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t.emoji} {t.label}
                </span>
                {t.id === suggested && (
                  <span className="shrink-0 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300">
                    Suggested
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-snug text-gray-600 dark:text-gray-400">{t.story}</p>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t.beats.length} beats · ~{t.targetMinutes} min · closes on {planLabel(t.recommendedPlan)}
              </p>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ActionButton
          variant="primary"
          breath
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              // Pre-open the script window INSIDE the click gesture (popup
              // blockers kill window.open after an await), then point it at
              // the script once the demo cookies exist.
              const script = window.open('', 'dcDemoScript', 'width=440,height=780')
              const res = await startBrandedDemoAction(prospectId, selected)
              if (script) script.location.href = '/demo/script'
              // Hard-assign so middleware + tenant context see the new demo
              // cookies; the action picks the story's first beat.
              window.location.assign(res.to)
            })
          }
        >
          🎬 Start the {DEMO_TRACK_LIST.find((t) => t.id === selected)?.label.toLowerCase()} demo
        </ActionButton>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          You can switch stories live from the presenter panel.
        </span>
      </div>
    </div>
  )
}
