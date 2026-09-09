'use client'

import { useState } from 'react'
import {
  PLAN_PRICE_MONTHLY,
  VISITS_PER_PATIENT_PER_YEAR,
  computeRecallRoi,
  type RecallRoiInputs,
} from '@/lib/recall-roi'

/**
 * The interactive half of /roi. Everything computes in the browser —
 * nothing typed here is sent, stored, or seen by us, and the page says so
 * (that honesty is the marketing).
 */

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

const DEFAULTS: RecallRoiInputs = { activePatients: 1500, onSchedulePct: 60, visitValue: 150 }

export default function RoiCalculator() {
  const [inputs, setInputs] = useState<RecallRoiInputs>(DEFAULTS)
  const r = computeRecallRoi(inputs)

  const set = (patch: Partial<RecallRoiInputs>) => setInputs((prev) => ({ ...prev, ...patch }))

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* ── Inputs ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-[1.05rem] font-bold tracking-tight">Your practice</h2>
        <p className="mt-1 text-[0.8rem] text-gray-500">
          Rough numbers are fine — your PMS knows the exact ones.
        </p>

        <Field
          label="Active patients"
          hint="Charts seen in the last ~18 months"
          value={inputs.activePatients}
          min={0}
          max={10000}
          step={50}
          onChange={(v) => set({ activePatients: v })}
        />
        <Field
          label="On a hygiene schedule"
          hint="% of them with a recall visit booked or kept"
          value={inputs.onSchedulePct}
          min={0}
          max={100}
          step={5}
          suffix="%"
          onChange={(v) => set({ onSchedulePct: v })}
        />
        <Field
          label="Average hygiene visit"
          hint="Cleaning + exam + X-rays, your fees"
          value={inputs.visitValue}
          min={0}
          max={1000}
          step={10}
          prefix="$"
          onChange={(v) => set({ visitValue: v })}
        />

        <p className="mt-6 rounded-lg bg-gray-50 px-3 py-2.5 text-[0.75rem] leading-relaxed text-gray-500">
          🔒 This all happens in your browser. Nothing you type is sent, stored, or seen by us.
        </p>
      </div>

      {/* ── Outputs ── */}
      <div>
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-6">
          <p className="text-[0.75rem] font-bold uppercase tracking-wider text-teal-700">
            Left on the table each year
          </p>
          <p className="mt-2 text-[2.6rem] font-extrabold leading-none tracking-tight text-gray-950">
            {money(r.atStakePerYear)}
          </p>
          <p className="mt-3 text-[0.85rem] leading-relaxed text-gray-600">
            {r.offSchedulePatients.toLocaleString('en-US')} of your patients are off the hygiene
            schedule. At {VISITS_PER_PATIENT_PER_YEAR} visits a year and {money(inputs.visitValue)} a
            visit, that’s {r.missedVisitsPerYear.toLocaleString('en-US')} visits —{' '}
            {money(r.atStakePerMonth)} a month — not happening. That’s arithmetic on your own
            numbers, not a projection.
          </p>
        </div>

        <p className="mt-6 mb-2 text-[0.8rem] font-semibold uppercase tracking-wider text-gray-500">
          If steady recall wins some of them back
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {r.scenarios.map((s) => (
            <div key={s.key} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[0.72rem] font-bold uppercase tracking-wider text-gray-400">
                {s.label} · {s.ratePct}%
              </p>
              <p className="mt-1.5 text-[1.35rem] font-extrabold tracking-tight text-gray-950">
                {money(s.revenuePerYear)}
                <span className="text-[0.8rem] font-semibold text-gray-400">/yr</span>
              </p>
              <p className="mt-1 text-[0.78rem] text-gray-500">
                {s.visitsPerYear.toLocaleString('en-US')} visits back on the books
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.75rem] leading-relaxed text-gray-400">
          Scenarios, not promises — real win-back depends on your list, your area, and how long
          patients have been away. Practices that never ask win back close to none of it.
        </p>

        {inputs.visitValue > 0 && (
          <p className="mt-5 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[0.85rem] leading-relaxed text-gray-700">
            <span className="font-bold">The break-even line:</span> DreamCRM is $
            {PLAN_PRICE_MONTHLY}/mo — at your fees it pays for itself the moment recall books back{' '}
            <span className="font-bold">
              {r.breakEvenVisitsPerMonth} visit{r.breakEvenVisitsPerMonth === 1 ? '' : 's'} a month
            </span>
            . Everything past that is the upside above.
          </p>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
  onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  prefix?: string
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="mt-5 block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[0.85rem] font-semibold text-gray-800">{label}</span>
        <span className="text-[0.95rem] font-bold tabular-nums text-teal-700">
          {prefix}
          {value.toLocaleString('en-US')}
          {suffix}
        </span>
      </span>
      <span className="mt-0.5 block text-[0.75rem] text-gray-400">{hint}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 w-full accent-teal-600"
      />
    </label>
  )
}
