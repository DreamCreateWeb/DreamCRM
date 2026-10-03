'use client'

import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ActionButton } from '@/components/ui/action-button'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  INSURANCE_DRIVER_LABEL,
  STATUS_LABEL,
  checkAgeLabel,
  deductibleAsAmount,
  describeBenefitAmount,
  niceDate,
  type BenefitAmount,
  type InsuranceCheckView,
} from '@/lib/insurance-eligibility'
import { benefitsSummaryText } from '@/lib/insurance-summary'

/**
 * The desk's paper (polish phase 4): a one-page benefits sheet for the
 * chart or the patient's hand, and a Copy button that puts the same facts
 * on the clipboard for a PMS note.
 *
 * PRINT ISOLATION is the receipt page's recipe: on paper only `#benefits-
 * sheet` is visible, so the dashboard chrome, the form and the recent list
 * never land on the page. The sheet is the benefits card in black and
 * white — no tone fills, no rings — because a printer's ink is one colour
 * and a photocopy is none. Nothing on it is under 12px. The honesty title
 * is printed IN FULL: a practice answer on paper must say it is one.
 */

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #benefits-sheet, #benefits-sheet * { visibility: visible !important; }
  #benefits-sheet { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  @page { margin: 16mm; }
}`

function amountLine(amount: BenefitAmount | null | undefined, kind: 'max' | 'deductible'): string | null {
  const copy = describeBenefitAmount(amount, kind)
  return copy ? `${copy.headline}${copy.sub ? ` — ${copy.sub}` : ''}` : null
}

const WAITING_LABEL: Record<'basic' | 'major' | 'ortho', string> = {
  basic: 'Basic (fillings, extractions)',
  major: 'Major (crowns, bridges)',
  ortho: 'Orthodontics',
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <tr>
      <th scope="row" className="py-1 pr-4 text-left align-top font-semibold text-black text-[12px] uppercase tracking-wider whitespace-nowrap">
        {label}
      </th>
      <td className="py-1 text-black text-[14px]">{value}</td>
    </tr>
  )
}

/** Print-only. Mounted beside the card; invisible on screen (`hidden`). */
export function BenefitsSheet({ check, clinicName, timeZone }: { check: InsuranceCheckView; clinicName: string; timeZone: string }) {
  const r = check.result
  const who = `${check.input.patient.firstName} ${check.input.patient.lastName}`.trim()
  const label = INSURANCE_DRIVER_LABEL[check.driver]
  const dedAmount = deductibleAsAmount(r?.deductible)
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div id="benefits-sheet" className="hidden bg-white text-black" data-testid="benefits-sheet">
        <div className="flex items-baseline justify-between gap-4 border-b border-black pb-2">
          <h1 className="text-[22px] font-extrabold">Insurance benefits</h1>
          <p className="text-[13px]">{clinicName}</p>
        </div>
        <table className="mt-3 w-full border-collapse">
          <tbody>
            <Row label="Patient" value={`${who} · DOB ${niceDate(check.input.patient.dateOfBirth)}`} />
            <Row label="Member ID" value={`${check.input.memberId}${check.input.groupNumber ? ` · Group ${check.input.groupNumber}` : ''}`} />
            {check.input.relationship !== 'self' && check.input.subscriber && (
              <Row label="Policyholder" value={`${check.input.subscriber.firstName} ${check.input.subscriber.lastName} · DOB ${niceDate(check.input.subscriber.dateOfBirth)}`} />
            )}
            <Row label="Payer" value={`${r?.payerName ?? check.input.payerName ?? check.input.carrierName}${r?.planName ? ` · ${r.planName}` : ''}`} />
            <Row label="Status" value={STATUS_LABEL[check.status]} />
            {r?.coverage.effective && (
              <Row label="Coverage" value={r.coverage.termination ? `${niceDate(r.coverage.effective)} to ${niceDate(r.coverage.termination)}` : `since ${niceDate(r.coverage.effective)}`} />
            )}
            <Row
              label="Checked"
              value={`${formatClinicDayTime(new Date(check.checkedAtIso), timeZone)} (${checkAgeLabel(check.checkedAtIso)})${check.requestedByName ? ` by ${check.requestedByName}` : ''}`}
            />
          </tbody>
        </table>

        {check.status === 'error' && <p className="mt-3 text-[14px]">Couldn’t check: {check.error ?? 'the payer could not be reached.'}</p>}

        {r && r.status === 'active' && (
          <>
            <table className="mt-4 w-full border-collapse border-t border-black">
              <tbody>
                <Row label={r.annualMax?.remainingCents == null ? 'Yearly maximum' : 'Left this year'} value={amountLine(r.annualMax, 'max')} />
                <Row label={dedAmount?.remainingCents == null ? 'Deductible' : 'Deductible left'} value={amountLine(dedAmount, 'deductible')} />
                {r.coveragePct && (
                  <Row
                    label="Plan pays"
                    value={[
                      `Preventive ${r.coveragePct.preventive == null ? 'not stated' : `${r.coveragePct.preventive}%`}`,
                      `Basic ${r.coveragePct.basic == null ? 'not stated' : `${r.coveragePct.basic}%`}`,
                      `Major ${r.coveragePct.major == null ? 'not stated' : `${r.coveragePct.major}%`}`,
                      `Ortho ${r.coveragePct.ortho == null ? 'not stated' : r.coveragePct.ortho === 0 ? 'not covered' : `${r.coveragePct.ortho}%`}`,
                    ].join(' · ')}
                  />
                )}
                {r.missingToothClause === true && <Row label="Plan rules" value="Missing-tooth clause applies" />}
                <Row label="Ortho lifetime" value={amountLine(r.orthoLifetimeMax, 'max')} />
                <Row label="Family maximum" value={amountLine(r.familyMax, 'max')} />
                <Row label="Family deductible" value={amountLine(deductibleAsAmount(r.familyDeductible), 'deductible')} />
              </tbody>
            </table>
            {r.waitingPeriods.length > 0 && (
              <div className="mt-3">
                <p className="text-[12px] font-semibold uppercase tracking-wider">Still waiting</p>
                <ul className="mt-1 list-disc pl-5 text-[14px]">
                  {r.waitingPeriods.map((w) => (
                    <li key={w.category}>
                      {WAITING_LABEL[w.category]} — covered from {niceDate(w.endsOn)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.frequencies.length > 0 && (
              <table className="mt-4 w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b border-black text-left text-[12px] uppercase tracking-wider">
                    <th scope="col" className="py-1 pr-3">Service</th>
                    <th scope="col" className="py-1 pr-3">Allowed</th>
                    <th scope="col" className="py-1">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {r.frequencies.map((f) => (
                    <tr key={`${f.code}:${f.label}`} className="border-b border-gray-300">
                      <td className="py-1 pr-3">{f.label}</td>
                      <td className="py-1 pr-3">{f.limit}</td>
                      <td className="py-1">{f.nextOn ? `from ${niceDate(f.nextOn)}` : f.lastOn ? `last ${niceDate(f.lastOn)}` : 'none on record'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {r && r.notes.length > 0 && (
          <ul className="mt-4 list-disc pl-5 text-[14px]">
            {r.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}

        <p className="mt-5 border-t border-black pt-2 text-[12px]">{label.title}</p>
      </div>
    </>
  )
}

/**
 * Mounts the sheet ONLY while printing. The dashboard's DOM carries no second
 * copy of the card at rest (screen readers and tests see one card), and
 * `beforeprint` — fired by the button's `window.print()` and by Ctrl+P alike —
 * commits the sheet synchronously (`flushSync`) before the browser snapshots
 * the page; `afterprint` unmounts it again.
 */
export function PrintableBenefits(props: { check: InsuranceCheckView; clinicName: string; timeZone: string }) {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return printing ? <BenefitsSheet {...props} /> : null
}

export function PrintBenefitsButton() {
  return (
    <ActionButton variant="secondary" size="sm" onClick={() => window.print()}>
      🖨 Print sheet
    </ActionButton>
  )
}

/** Copies the text summary; the clipboard + textarea fallback mirrors CopyChip's. */
export function CopySummaryButton({ check, clinicName, timeZone }: { check: InsuranceCheckView; clinicName: string; timeZone: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    const text = benefitsSummaryText(check, { clinicName, timeZone })
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      /* nothing to do — the sheet is still on screen to select by hand */
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <ActionButton variant="secondary" size="sm" onClick={copy} title="Copy a plain-text summary for a note or the PMS">
        Copy summary
      </ActionButton>
      <span aria-live="polite" className={`text-xs font-medium ${copied ? TONE_TEXT.ok : 'sr-only'}`}>
        {copied ? 'Copied ✓' : ''}
      </span>
    </span>
  )
}
