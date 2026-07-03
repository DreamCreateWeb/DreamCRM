'use client'

import { useTransition, useState } from 'react'
import type { DemoBrief } from '@/lib/types/demo-brief'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { generateDemoBriefAction } from '../../admin-actions'

const WEIGHT_LABEL: Record<string, { label: string; tone: 'special' | 'neutral' | 'info' }> = {
  lead: { label: 'LEAD WITH THIS', tone: 'special' },
  standard: { label: 'standard', tone: 'info' },
  skim: { label: 'skim', tone: 'neutral' },
}

export default function BriefPanel({
  prospectId,
  brief,
  beatTitles,
}: {
  prospectId: string
  brief: DemoBrief | null
  beatTitles: Record<string, string>
}) {
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const generate = (force: boolean) =>
    startTransition(async () => {
      setFailed(false)
      const r = await generateDemoBriefAction(prospectId, force)
      if (!r.ok) setFailed(true)
    })

  if (!brief) {
    return (
      <section className="v2-panel p-5 mb-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          AI strategist one-pager
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          A pre-call brief written from this practice&apos;s verified signals: your opening line,
          the walk-up story, which beat to lead with, likely objections with one-breath responses,
          and the closing ask. Generated once, cached — regenerate after a re-enrich.
        </p>
        <ActionButton variant="primary" disabled={pending} onClick={() => generate(false)} className="no-print">
          {pending ? 'Writing the brief…' : '✨ Generate the brief'}
        </ActionButton>
        {failed && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
            Generation failed — check the AI connection and try again.
          </p>
        )}
      </section>
    )
  }

  const ammoByBeat = new Map<string, string[]>()
  for (const a of brief.ammunition) {
    const list = ammoByBeat.get(a.beatId) ?? []
    list.push(a.point)
    ammoByBeat.set(a.beatId, list)
  }

  return (
    <section className="v2-panel p-5 mb-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          AI strategist one-pager
        </div>
        <div className="no-print flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {new Date(brief.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <ActionButton size="sm" variant="ghost" disabled={pending} onClick={() => generate(true)}>
            {pending ? 'Rewriting…' : '↻ Regenerate'}
          </ActionButton>
        </div>
      </div>

      <blockquote
        className="border-l-4 pl-3 text-base font-medium text-gray-900 dark:text-gray-100"
        style={{ borderColor: 'var(--demo-accent, #2dd4bf)' }}
      >
        &ldquo;{brief.openingLine}&rdquo;
      </blockquote>

      <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{brief.walkUpStory}</p>

      {brief.beatEmphasis.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Beat emphasis
          </div>
          <ul className="space-y-1.5">
            {brief.beatEmphasis.map((e) => (
              <li key={e.beatId} className="flex items-start gap-2 text-sm">
                <StatusPill
                  tone={WEIGHT_LABEL[e.weight]?.tone ?? 'neutral'}
                  label={WEIGHT_LABEL[e.weight]?.label ?? e.weight}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {beatTitles[e.beatId] ?? e.beatId}
                  </span>{' '}
                  — {e.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ammoByBeat.size > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Land these points
          </div>
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {Array.from(ammoByBeat.entries()).map(([beatId, points]) => (
              <li key={beatId}>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {beatTitles[beatId] ?? beatId}:
                </span>{' '}
                {points.join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.objections.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            Likely objections
          </div>
          <ul className="space-y-2">
            {brief.objections.map((o, i) => (
              <li key={i} className="text-sm">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  &ldquo;{o.objection}&rdquo;
                </div>
                <div className="text-gray-600 dark:text-gray-400">→ {o.response}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
        <span className="font-medium text-gray-900 dark:text-gray-100">The ask:</span>{' '}
        {brief.closingAsk}
      </div>
    </section>
  )
}
