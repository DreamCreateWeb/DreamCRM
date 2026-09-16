'use client'

import { useState } from 'react'
import {
  PLAN_PRICE_MONTHLY,
  VISITS_PER_PATIENT_PER_YEAR,
  computeRecallRoi,
  type RecallRoiInputs,
} from '@/lib/recall-roi'
import { MONO_LABEL, DAY_WIRE, ToneTile } from '@/components/marketing/ui'

/**
 * The interactive half of /roi. Everything computes in the browser —
 * nothing typed here is sent, stored, or seen by us, and the page says so
 * (that honesty is the marketing).
 *
 * DAYLIGHT DREAM, move 6 page 6 — THE DIAL AND ITS READOUT, and not one line
 * of what it computes. `computeRecallRoi`, the three hedged scenarios, the
 * break-even arithmetic and every number they produce are untouched;
 * `BRAND.md` Part 5 is explicit that a measurement about a real practice must
 * not be restyled into looking like a marketing claim, and this file is where
 * that rule has teeth.
 *
 * WHAT DID CHANGE, and why each is a rule rather than a preference:
 *
 *  - **Part 4's mono register on every number the reader is meant to
 *    compare** — the three field readouts, the headline figure and the three
 *    scenario columns. That is the call page 5's `kind="figures"` made about
 *    the membership guide's arithmetic, and it is the whole point of this
 *    page: three columns of money in a proportional face do not form a
 *    column, which is exactly what "meant to compare" means.
 *  - **Part 3's radius ladder** — 14px cards, 12px small tiles, 10px
 *    controls. This file was uniformly `rounded-xl`/`rounded-lg`, and nothing
 *    in CI grades a radius.
 *  - **The lock emoji is gone.** Part 5 bans emoji as decoration AND bans
 *    them on "ROI and grader numbers" by name; a padlock beside the privacy
 *    line is both at once. It is a tone tile now (`shield`, the subject that
 *    already owns that meaning in the registry) and reads more like a
 *    guarantee for it.
 *  - **The tinted wells went white.** The headline card carried
 *    `bg-teal-50/50` and the privacy note `bg-gray-50`, both under reading
 *    text — the shape page 5's script cards were corrected from. Headroom
 *    bought rather than a defect closed: nothing here measured under 4.5.
 *    The headline card keeps a teal LEFT EDGE, which says "this is the
 *    answer" without putting a wash under one.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

const DEFAULTS: RecallRoiInputs = { activePatients: 1500, onSchedulePct: 60, visitValue: 150 }

export default function RoiCalculator() {
  const [inputs, setInputs] = useState<RecallRoiInputs>(DEFAULTS)
  const r = computeRecallRoi(inputs)

  const set = (patch: Partial<RecallRoiInputs>) => setInputs((prev) => ({ ...prev, ...patch }))

  // `items-start` on the grid so the inputs card is as tall as its fields
  // rather than stretching to match the readout column — a card with 120px of
  // white under its last control reads as a form that ran out of questions.
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      {/* ── Inputs ── */}
      <div
        className="rounded-[14px] border bg-white p-6 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
        style={{ borderColor: DAY_WIRE }}
      >
        <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-gray-950">Your practice</h2>
        <p className="mt-1 text-[0.85rem] leading-relaxed text-gray-600">
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

        <p
          className="mt-6 flex items-start gap-2.5 border-t pt-4 text-[0.8rem] leading-relaxed text-gray-600"
          style={{ borderColor: DAY_WIRE }}
        >
          <ToneTile glyph="shield" className="mt-px" />
          <span>
            This all happens in your browser. Nothing you type is sent, stored, or seen by us.
          </span>
        </p>
      </div>

      {/* ── Outputs ── */}
      <div>
        {/* THE ANSWER. A 3px teal left edge rather than a teal WASH: Part 3's
            depth is emission, and the paragraph below it is exactly the run
            of reading text a tint costs the most on (Part 7). The figure is
            mono because it is the number every other number on this page is
            compared against. */}
        <div
          className="rounded-[14px] border border-l-[3px] border-l-teal-600 bg-white p-6"
          style={{ borderTopColor: DAY_WIRE, borderRightColor: DAY_WIRE, borderBottomColor: DAY_WIRE }}
        >
          <p className={`text-teal-700 ${MONO_LABEL}`}>Left on the table each year</p>
          <p className="mt-2 font-mono-num text-[2.4rem] font-extrabold leading-none tracking-[-0.03em] text-gray-950 sm:text-[2.6rem]">
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

        <p className={`mt-7 mb-2.5 text-gray-500 ${MONO_LABEL}`}>
          If steady recall wins some of them back
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {r.scenarios.map((s) => (
            <div
              key={s.key}
              className="rounded-[12px] border bg-white p-4"
              style={{ borderColor: DAY_WIRE }}
            >
              {/* 0.75rem is the mono floor (Part 4). This label was 0.72rem —
                  11.52px, UNDER the 12px floor — and nothing would have
                  caught it: `tests/a11y/legibility-floor.test.ts` skips
                  `components/marketing`, and this file is not even in that
                  tree. Part 4 records the same arithmetic slip being fixed in
                  the brand book before the first mono label shipped. */}
              <p className={`text-gray-500 ${MONO_LABEL}`}>
                {s.label} · {s.ratePct}%
              </p>
              <p className="mt-1.5 font-mono-num text-[1.35rem] font-extrabold tracking-[-0.02em] text-gray-950">
                {money(s.revenuePerYear)}
                <span className="text-[0.8rem] font-semibold text-gray-500">/yr</span>
              </p>
              <p className="mt-1 text-[0.8rem] leading-snug text-gray-600">
                {s.visitsPerYear.toLocaleString('en-US')} visits back on the books
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.8rem] leading-relaxed text-gray-600">
          Scenarios, not promises — real win-back depends on your list, your area, and how long
          patients have been away. Practices that never ask win back close to none of it.
        </p>

        {inputs.visitValue > 0 && (
          <p
            className="mt-5 rounded-[12px] border bg-white px-4 py-3.5 text-[0.88rem] leading-relaxed text-gray-700"
            style={{ borderColor: DAY_WIRE }}
          >
            <span className="font-bold text-gray-950">The break-even line:</span> DreamCRM is{' '}
            <span className="font-mono-num font-semibold text-gray-950">
              ${PLAN_PRICE_MONTHLY}/mo
            </span>{' '}
            — at your fees it pays for itself the moment recall books back{' '}
            <span className="font-mono-num font-bold text-gray-950">
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
        <span className="font-mono-num text-[0.95rem] font-bold tabular-nums text-teal-700">
          {prefix}
          {value.toLocaleString('en-US')}
          {suffix}
        </span>
      </span>
      <span className="mt-0.5 block text-[0.78rem] leading-snug text-gray-600">{hint}</span>
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
