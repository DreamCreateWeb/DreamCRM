'use client'

import { useState, useTransition } from 'react'
import type { SequenceWithTouches } from '@/lib/services/prospect-outreach'
import { SEGMENT_LABELS } from '@/lib/types/prospecting'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { updateTouchTemplateAction, setSequenceStatusAction } from '../admin-actions'

function TouchCard({ touch }: { touch: SequenceWithTouches['touches'][number] }) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(touch.subjectTemplate)
  const [body, setBody] = useState(touch.bodyTemplate)
  const [dayOffset, setDayOffset] = useState(touch.dayOffset)
  const [aiPersonalize, setAiPersonalize] = useState(touch.aiPersonalize)
  const [saved, setSaved] = useState(false)

  const save = () =>
    startTransition(async () => {
      await updateTouchTemplateAction({
        templateId: touch.id,
        subjectTemplate: subject,
        bodyTemplate: body,
        aiPersonalize,
        dayOffset,
      })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    })

  return (
    <div className="rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <span
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-xs font-extrabold text-teal-600 dark:text-teal-400"
            aria-hidden="true"
          >
            {touch.stepNumber}
          </span>
          <span>
          Touch {touch.stepNumber}
          <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
            day {dayOffset}
          </span>
          {aiPersonalize && (
            <span className="ml-2 text-xs text-teal-600 dark:text-teal-400" title="AI weaves in each prospect's verified gaps">
              ✨ AI-personalized
            </span>
          )}
          {touch.stats.sent > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400 tabular-nums">
              · {touch.stats.sent} sent
              {touch.stats.sent >= 10 ? (
                <>
                  {' '}
                  · {Math.round((touch.stats.uniqueOpens / touch.stats.sent) * 100)}% open ·{' '}
                  {Math.round((touch.stats.uniqueClicks / touch.stats.sent) * 100)}% click
                </>
              ) : (
                <>
                  {' '}
                  · {touch.stats.uniqueOpens} opens · {touch.stats.uniqueClicks} clicks
                </>
              )}
            </span>
          )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-teal-600 dark:text-teal-400">Saved</span>}
          <ActionButton size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
            {editing ? 'Close' : 'Edit'}
          </ActionButton>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            Subject
            <input
              className="form-input mt-1 w-full text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            Body (blank line = new paragraph)
            <textarea
              className="form-textarea mt-1 w-full text-sm"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              Day offset
              <input
                type="number"
                min={0}
                max={60}
                className="form-input w-20 text-sm"
                value={dayOffset}
                onChange={(e) => setDayOffset(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={aiPersonalize}
                onChange={(e) => setAiPersonalize(e.target.checked)}
              />
              AI-personalize with the prospect&apos;s gaps
            </label>
            <ActionButton size="sm" variant="primary" disabled={pending} onClick={save}>
              {pending ? 'Saving…' : 'Save touch'}
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="text-sm text-gray-700 dark:text-gray-300">{subject}</div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line line-clamp-3">
            {body}
          </p>
        </div>
      )}
    </div>
  )
}

export default function SequenceEditor({ sequence }: { sequence: SequenceWithTouches }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(sequence.status)

  return (
    <section className="v2-card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {sequence.name}
          </h2>
          <StatusPill
            tone={status === 'active' ? 'ok' : 'warn'}
            label={status === 'active' ? 'Active' : 'Paused'}
          />
          {sequence.segment && (
            <StatusPill
              tone="info"
              label={SEGMENT_LABELS[sequence.segment]}
              title="The prospect segment the auto-enroller routes to this pitch"
            />
          )}
        </div>
        <ActionButton
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            const next = status === 'active' ? 'paused' : 'active'
            setStatus(next)
            startTransition(() => setSequenceStatusAction(sequence.id, next))
          }}
        >
          {status === 'active' ? '⏸ Pause all sending' : '▶ Resume'}
        </ActionButton>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {sequence.description}
        {' · '}
        <span className="tabular-nums">{sequence.liveEnrollments}</span> live ·{' '}
        <span className="tabular-nums">{sequence.totalSent}</span> touches sent ·{' '}
        <span className="tabular-nums">{sequence.replies}</span> replies
        {sequence.replyRatePct != null && ` (${sequence.replyRatePct}%)`}
        {status === 'paused' &&
          ' — paused: enrollments hold in place and resume exactly where they stood.'}
      </p>
      <div className="space-y-3">
        {sequence.touches.map((t) => (
          <TouchCard key={t.id} touch={t} />
        ))}
      </div>
    </section>
  )
}
