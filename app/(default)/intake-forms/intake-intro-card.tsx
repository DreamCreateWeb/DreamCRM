'use client'

import { useState } from 'react'
import { IntroShell, TurnOnButton, AskManager } from '@/components/feature-switch/feature-intro'
import { FEATURE_BY_KEY } from '@/lib/feature-switches'
import { DEFAULT_INTAKE_TEMPLATE, type IntakeSectionChoice } from '@/lib/types/forms'
import { turnOnIntakeFormsAction } from './actions'

const def = FEATURE_BY_KEY.intake_forms

export default function IntakeIntroCard({
  orgName,
  canManage,
  sections,
  existingForms,
  patientCount,
}: {
  orgName: string
  canManage: boolean
  sections: IntakeSectionChoice[]
  /** Forms already on file (a grandfathered or re-opened clinic keeps them). */
  /** Forms the practice made or edited; null = could not be read just now. */
  existingForms: number | null
  /** null = could not be counted just now. */
  patientCount: number | null
}) {
  const [keep, setKeep] = useState<Set<string>>(() => new Set(sections.map((s) => s.id)))
  const [preview, setPreview] = useState<string | null>(null)
  const chosen = sections.filter((s) => keep.has(s.id))
  const fields = chosen.reduce((a, s) => a + s.fieldCount, 0)

  function toggle(id: string) {
    setKeep((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <IntroShell eyebrow={`Daily · ${orgName}`} title={def.label} lede={def.lede} does={def.does} know={def.know} feature="intake_forms" testId="intake-intro">
      {existingForms == null ? (
        <p className="mt-5 text-sm text-gray-600 dark:text-gray-300" data-testid="intake-unreadable">
          Couldn’t read your forms just now — turning this on keeps whatever is there, and the standard form is built only if nothing is.
        </p>
      ) : existingForms > 0 ? (
        <p className="mt-5 text-sm text-gray-600 dark:text-gray-300" data-testid="intake-existing">
          You already have {existingForms} {existingForms === 1 ? 'form' : 'forms'} on file — turning this on brings {existingForms === 1 ? 'it' : 'them'} back as {existingForms === 1 ? 'it was' : 'they were'}.
        </p>
      ) : (
        <>
          <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What to collect</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Your first form starts from the standard dental intake. Untick anything you don’t want to ask; you can edit every question afterwards.</p>
          <ul className="mt-3 space-y-2" data-testid="intake-sections">
            {sections.map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                <input
                  id={`intake-sec-${s.id}`}
                  type="checkbox"
                  className="form-checkbox mt-0.5"
                  checked={keep.has(s.id)}
                  disabled={s.required || !canManage}
                  onChange={() => toggle(s.id)}
                />
                <div className="min-w-0 grow">
                  <label htmlFor={`intake-sec-${s.id}`} className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {s.title}
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400 font-mono-num tabular-nums">
                      {s.fieldCount} {s.fieldCount === 1 ? 'question' : 'questions'}
                      {s.required ? ' · always' : ''}
                    </span>
                  </label>
                  {s.description && <p className="text-xs text-gray-500 dark:text-gray-400">{s.description}</p>}
                  <button
                    type="button"
                    onClick={() => setPreview(preview === s.id ? null : s.id)}
                    className="mt-0.5 text-xs text-teal-700 dark:text-teal-400 hover:underline"
                    aria-expanded={preview === s.id}
                  >
                    {preview === s.id ? 'Hide the questions' : 'See the questions'}
                  </button>
                  {preview === s.id && (
                    <ol className="mt-1 list-decimal pl-5 text-xs text-gray-600 dark:text-gray-300 space-y-0.5" data-testid={`intake-preview-${s.id}`}>
                      {(DEFAULT_INTAKE_TEMPLATE.sections.find((x) => x.id === s.id)?.fields ?? []).map((f) => (
                        <li key={f.id}>
                          {f.label}
                          {f.required ? <span className="text-gray-400"> · required</span> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 font-mono-num tabular-nums" data-testid="intake-count">
            {chosen.length} {chosen.length === 1 ? 'section' : 'sections'} · {fields} questions
          </p>
        </>
      )}

      <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">How patients get it</p>
      <ul className="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
        <li>Every booking confirmation carries the link; a new patient gets the full form, a returning one the short update.</li>
        <li>The reminder before the visit chases anyone who hasn’t finished it.</li>
        <li>Staff can send it by hand from a patient’s record, and the link lives on your website.</li>
        {patientCount === 0 && <li className="text-gray-500 dark:text-gray-400">No patients loaded yet — the first form goes out with the first booking.</li>}
        {patientCount == null && <li className="text-gray-500 dark:text-gray-400">Couldn’t count your patients just now.</li>}
      </ul>

      {canManage ? (
        <TurnOnButton
          feature="intake_forms"
          label={def.label}
          onTurnOn={() => turnOnIntakeFormsAction({ sections: Array.from(keep) })}
        />
      ) : (
        <AskManager />
      )}
    </IntroShell>
  )
}
