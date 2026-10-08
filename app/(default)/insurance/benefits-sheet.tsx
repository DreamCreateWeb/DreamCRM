'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { ActionButton } from '@/components/ui/action-button'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  INSURANCE_DRIVER_LABEL,
  STATUS_LABEL,
  benefitDollars,
  checkAgeLabel,
  deductibleAsAmount,
  describeBenefitAmount,
  insuranceTypeLabel,
  niceDate,
  planPaysWord,
  replacementWords,
  FREQ_TO_KEY,
  fundingWords,
  lineFacts,
  networkWords,
  type BenefitAmount,
  type FormProcedureKey,
  type InsuranceCheckView,
} from '@/lib/insurance-eligibility'
import { benefitsSummaryText } from '@/lib/insurance-summary'
import type { PayerNoteView } from '@/lib/payer-notebook'
import { BREAKDOWN_COPY } from '@/lib/insurance-breakdown'

/**
 * The desk's paper (polish phase 4; reshaped 2026-10-08 into the
 * verification sheet a desk already fills by phone — the Ted Pinney form,
 * line for line, with the payer's answer where it answered, the practice's
 * own payer notebook on the practice-level lines, and honest blanks on the
 * rest), and a Copy button that puts the same facts on the clipboard for a
 * PMS note.
 *
 * PRINT ISOLATION is the receipt page's recipe: on paper only `#benefits-
 * sheet` is visible, so the dashboard chrome, the form and the recent list
 * never land on the page. The sheet is the benefits card in black and
 * white — no tone fills, no rings — because a printer's ink is one colour
 * and a photocopy is none. Nothing on it is under 12px. The honesty title
 * is printed IN FULL: a practice answer on paper must say it is one.
 */

/**
 * The sheet is PORTALED to <body> and printed IN FLOW: everything else on
 * the page is display:none, so the document's height is the sheet's own
 * and the browser paginates it. The first recipe (visibility:hidden +
 * position:absolute, borrowed from the one-page receipt) left the sheet
 * out of flow inside the card: a sheet taller than a page overflowed the
 * top, and the desk got page "1/1" starting at MAX with the patient's own
 * block cut off (2026-10-08, the first client's print).
 */
const PRINT_CSS = `@media print {
  body > *:not(#benefits-sheet) { display: none !important; }
  #benefits-sheet { display: block !important; position: static; width: 100%; padding: 0; }
  #benefits-sheet .sheet-strip, #benefits-sheet tr { break-inside: avoid; }
  #benefits-sheet thead { display: table-header-group; }
  @page { margin: 16mm; }
}`

function amountLine(amount: BenefitAmount | null | undefined, kind: 'max' | 'deductible'): string | null {
  const copy = describeBenefitAmount(amount, kind)
  return copy ? `${copy.headline}${copy.sub ? ` — ${copy.sub}` : ''}` : null
}

const WAITING_LABEL: Record<'basic' | 'major' | 'ortho', string> = {
  basic: 'Basic',
  major: 'Major',
  ortho: 'Ortho',
}

/** The blank a desk fills by hand — long enough to write in. */
const BLANK = '________________'

/**
 * One labelled line of the sheet. A null value prints the BLANK, never
 * nothing: the form's whole point is that an empty line is a question the
 * desk still has to ask, and a line that vanished is a question forgotten.
 */
function Field({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={`flex items-baseline gap-1.5 min-w-0 ${wide ? 'basis-full' : ''}`}>
      <span className="text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap">{label}:</span>
      <span className={`text-[14px] min-w-0 ${value ? 'font-medium' : 'tracking-widest text-gray-500'}`}>{value ?? BLANK}</span>
    </div>
  )
}

/** "YES / NO" with the true one marked — or neither, when the payer didn't say. */
function Choice({ label, options, picked }: { label: string; options: string[]; picked: string | null }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap">{label}:</span>
      <span className="text-[14px]">
        {options.map((o, i) => (
          <span key={o}>
            {i > 0 && <span className="text-gray-500"> / </span>}
            <span className={o === picked ? 'font-bold underline underline-offset-2' : 'text-gray-600'}>{o}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

function Strip({ children }: { children: ReactNode }) {
  return <div className="sheet-strip flex flex-wrap gap-x-6 gap-y-1.5 py-1.5 border-b border-gray-300">{children}</div>
}

function pct(v: number | null | undefined): string | null {
  return v == null ? null : planPaysWord(v)
}

function yesNo(v: boolean | null | undefined): string | null {
  return v == null ? null : v ? 'YES' : 'NO'
}

function joinPhones(list: string[]): string | null {
  return list.length ? list.join(' · ') : null
}

/** "5 YR / 7 YR / 10 YR / ____" with the stated window marked, or a bare value when it is none of them. */
function ReplacementChoice({ label, months }: { label: string; months: number | null | undefined }) {
  const years = months != null && months % 12 === 0 ? months / 12 : null
  const standard = [5, 7, 10]
  if (years != null && !standard.includes(years)) return <Field label={label} value={replacementWords(months)} />
  return <Choice label={label} options={standard.map((y) => `${y} YR`)} picked={years != null ? `${years} YR` : null} />
}

/**
 * The verification sheet, line for line in the layout a desk already fills
 * by phone (the Ted Pinney form, 2026-10-08). Three sources feed it: the
 * payer's answer, the practice's own notebook about this payer, and the
 * blanks — printed as blanks, because a question the payer didn't answer is
 * still a question. SSN is always blank: nothing here collects it.
 */
export function BenefitsSheet({
  check,
  clinicName,
  timeZone,
  practice = null,
}: {
  check: InsuranceCheckView
  clinicName: string
  timeZone: string
  /** The practice's notebook for this payer (fee schedule, network, pays-on, claims address, phone). */
  practice?: PayerNoteView | null
}) {
  const r = check.result
  const inp = check.input
  const who = `${inp.patient.firstName} ${inp.patient.lastName}`.trim()
  const subscriber = inp.relationship === 'self' || !inp.subscriber ? inp.patient : inp.subscriber
  const label = INSURANCE_DRIVER_LABEL[check.driver]
  const dedAmount = deductibleAsAmount(r?.deductible)
  const plan = r?.plan ?? null
  const contacts = r?.payerContacts ?? null
  const phone = practice?.phone ?? joinPhones(contacts?.contacts.flatMap((c) => c.phones) ?? [])
  const claimsAddress = practice?.claimsAddress ?? contacts?.claimsAddress ?? null
  const payerId = inp.payerId ?? null
  const payerName = r?.payerName ?? inp.payerName ?? inp.carrierName
  const network = practice?.network === 'in' ? 'IN' : practice?.network === 'out' ? 'OUT' : null
  const paysOn = practice?.paysOn ?? r?.replacement?.paysOn ?? null
  const year = plan?.benefitYear === 'calendar' ? 'CAL YEAR' : plan?.benefitYear === 'plan' ? 'FISCAL YEAR' : null
  const yearSpan = plan?.benefitYearStart || plan?.benefitYearEnd ? `${plan.benefitYearStart ? niceDate(plan.benefitYearStart) : BLANK} to ${plan.benefitYearEnd ? niceDate(plan.benefitYearEnd) : BLANK}` : null
  const active = !!r && r.status === 'active'
  const ded = r?.deductibleApplies ?? null
  const procs = new Map((r?.procedures ?? []).map((p) => [p.key, p]))
  const ages = r?.ageLimits ?? null
  const guard = procs.get('occlusal_guard')
  const fluoride = procs.get('fluoride')
  const sealants = procs.get('sealants')
  const orthoMax = describeBenefitAmount(r?.orthoLifetimeMax, 'max')
  // The downgrade line on the form is specific — pano + bitewings paid as a
  // full-mouth series — so it is answered only by a note that says so.
  const panoDowngrade = [...(r?.downgrades ?? []), ...(r?.payerNotes ?? [])].some((n) => /(PANO|PANORAMIC|BITEWING|BWX).*(FMX|FULL.?MOUTH)|(FMX|FULL.?MOUTH).*(PANO|PANORAMIC|BITEWING|BWX)/i.test(n)) ? true : null
  // The MISC box: the payer's downgrade sentences, the sentences that answer
  // no line on this sheet, and the tool's own caveats. Scope, shared codes,
  // deductible waivers, networks, funding and ages are read into their lines.
  const misc = Array.from(
    new Set([...(r?.downgrades ?? []), ...(r?.payerNotes ?? []).filter((n) => !(r?.downgrades ?? []).includes(n)), ...(r?.notes ?? [])]),
  )
  // What the payer counts by CATEGORY — every frequency line no answered
  // procedure line below already carries.
  const categoryRows = (r?.frequencies ?? []).filter((f) => {
    const key = FREQ_TO_KEY[f.code]
    return !key || !procs.has(key)
  })
  const historyRows: Array<{ key: FormProcedureKey; label: string }> = [
    { key: 'er_exam', label: 'ER exam' },
    { key: 'exam', label: 'Exam' },
    { key: 'bitewings', label: 'BW' },
    { key: 'pa', label: 'PA' },
    { key: 'pano', label: 'Pano' },
    { key: 'fmx', label: 'FMX' },
    { key: 'srp', label: 'SRP (4341)' },
    { key: 'perio_maint', label: 'PM (4910)' },
    { key: 'prophy', label: 'Prophy' },
  ]

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div id="benefits-sheet" className="hidden bg-white text-black" data-testid="benefits-sheet">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-black pb-2">
          <h1 className="text-[22px] font-extrabold">Insurance verification</h1>
          <p className="text-[13px]">{clinicName}</p>
        </div>

        {/* ── Who ───────────────────────────────────────────────────── */}
        <Strip>
          <Field label="Patient name" value={who} />
          <Field label="DOB" value={niceDate(inp.patient.dateOfBirth)} />
        </Strip>
        <Strip>
          <Field label="Subscriber name" value={`${subscriber.firstName} ${subscriber.lastName}`.trim()} />
          <Field label="DOB" value={niceDate(subscriber.dateOfBirth)} />
          <Field label="SSN" value={null} />
        </Strip>
        <Strip>
          <Field label="Subscriber ID" value={inp.memberId} />
          <Field label="Group #" value={plan?.groupNumber ?? inp.groupNumber ?? null} />
          <Field label="Employer" value={plan?.groupName ?? null} />
        </Strip>
        <Strip>
          <Field label="Insurance company" value={`${payerName}${r?.planName ? ` · ${r.planName}` : ''}${plan?.insuranceType ? ` (${insuranceTypeLabel(plan.insuranceType)})` : ''}`} />
          <Field label="Fee schedule" value={practice?.feeSchedule ?? null} />
        </Strip>
        <Strip>
          <Field label="Claims mailing address" value={claimsAddress} wide />
        </Strip>
        <Strip>
          <Field label="E-claim payer ID" value={payerId} />
          <Field label="Phone #" value={phone} />
        </Strip>
        <Strip>
          <Choice label="Network" options={['IN', 'OUT']} picked={network} />
          <Choice label="Benefit year" options={['CAL YEAR', 'FISCAL YEAR']} picked={year} />
          <Field label="Runs" value={yearSpan} />
          <Field label="Eff date" value={r?.coverage.effective ? niceDate(r.coverage.effective) : null} />
        </Strip>
        {(plan?.networks?.length || plan?.funding || ages?.dependent != null) && (
          <Strip>
            {plan?.networks?.length ? <Field label="Plan networks" value={networkWords(plan.networks)} /> : null}
            {plan?.funding ? <Field label="Funding" value={fundingWords(plan.funding)} /> : null}
            {ages?.dependent != null ? <Field label="Dependents to age" value={String(ages.dependent)} /> : null}
          </Strip>
        )}

        {!active && (
          <p className="mt-3 text-[14px] font-semibold">
            {STATUS_LABEL[check.status]}
            {check.status === 'error' ? ` — ${check.error ?? 'the payer could not be reached.'}` : r?.notes[0] ? ` — ${r.notes[0]}` : ''}
          </p>
        )}

        {/* ── The money ─────────────────────────────────────────────── */}
        <Strip>
          <Field label="Max" value={active ? amountLine(r.annualMax, 'max') : null} />
          <Field label="Avail benefits" value={active && r.annualMax?.remainingCents != null ? benefitDollars(r.annualMax.remainingCents) : null} />
        </Strip>
        <Strip>
          <Field label="Ded" value={active && dedAmount?.totalCents != null ? benefitDollars(dedAmount.totalCents) : null} />
          <Field label="Remaining deductible" value={active && dedAmount?.remainingCents != null ? benefitDollars(dedAmount.remainingCents) : null} />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-wider">Applies to:</span>
            <span className="text-[14px]">
              {(
                [
                  ['PV', ded?.preventive],
                  ['Basic', ded?.basic],
                  ['Major', ded?.major],
                ] as Array<[string, boolean | null | undefined]>
              ).map(([name, v], i) => (
                <span key={name}>
                  {i > 0 && ' '}
                  <span className={v === true ? 'font-bold underline underline-offset-2' : v === false ? 'line-through text-gray-500' : 'text-gray-600'}>{name}</span>
                </span>
              ))}
              {ded?.note ? <span className="text-[12px] text-gray-600"> ({ded.note})</span> : null}
            </span>
          </div>
        </Strip>

        {/* ── Tiers ─────────────────────────────────────────────────── */}
        <Strip>
          <Field label="Diagnostic" value={active ? pct(r.coveragePct?.diagnostic) : null} />
          <Field label="Preventative" value={active ? pct(r.coveragePct?.preventive) : null} />
          <Field label="Basic" value={active ? pct(r.coveragePct?.basic) : null} />
          <Field label="Major" value={active ? pct(r.coveragePct?.major) : null} />
        </Strip>
        <Strip>
          <Field label="Perio" value={active ? pct(r.coveragePct?.perio) : null} />
          <Field label="Oral surgery" value={active ? pct(r.coveragePct?.oralSurgery) : null} />
          <Field label="Endo" value={active ? pct(r.coveragePct?.endo) : null} />
        </Strip>
        <Strip>
          <Field label="Fluoride · age" value={ages?.fluoride != null ? `through ${ages.fluoride}` : null} />
          <Field label="Freq" value={fluoride?.limit ?? null} />
          <Field label="Sealants · age" value={ages?.sealants != null ? `through ${ages.sealants}` : null} />
          <Field label="Freq" value={sealants?.limit ?? null} />
          <Field label="Teeth" value={sealants?.notes.find((n) => /molar|tooth|teeth/i.test(n)) ?? null} />
        </Strip>
        <Strip>
          <Field label="Ortho" value={active ? pct(r.coveragePct?.ortho) : null} />
          <Field label="Age" value={ages?.ortho != null ? `through ${ages.ortho}` : null} />
          <Field label="Max" value={orthoMax ? `${orthoMax.headline}${orthoMax.sub ? ` — ${orthoMax.sub}` : ''}` : null} />
          <Field label="Ded" value={null} />
        </Strip>
        <Strip>
          <Choice label="Occlusal guard covered?" options={['YES', 'NO']} picked={guard?.planPays == null ? null : guard.planPays > 0 ? 'YES' : 'NO'} />
          <Field label="%" value={guard?.planPays != null && guard.planPays > 0 ? `${guard.planPays}%` : null} />
        </Strip>
        <Strip>
          <Choice label="Missing tooth clause" options={['YES', 'NO']} picked={yesNo(r?.missingToothClause)} />
          {r?.noWaitingPeriods ? <Field label="Waiting periods" value="None" /> : r && r.waitingPeriods.length > 0 ? <Field label="Waiting periods" value={r.waitingPeriods.map((w) => `${WAITING_LABEL[w.category]} until ${niceDate(w.endsOn)}`).join('; ')} /> : <Field label="Waiting periods" value={null} />}
        </Strip>
        <Strip>
          <ReplacementChoice label="Replacement · crown/bridge" months={r?.replacement?.crownBridgeMonths} />
          <ReplacementChoice label="Denture/partial" months={r?.replacement?.dentureMonths} />
          <Choice label="Pays on" options={['SEAT', 'PREP']} picked={paysOn ? paysOn.toUpperCase() : null} />
        </Strip>

        {/* ── Misc ──────────────────────────────────────────────────── */}
        <div className="py-1.5 border-b border-gray-300">
          <span className="text-[12px] font-semibold uppercase tracking-wider">Misc:</span>
          {misc.length > 0 || practice?.notes ? (
            <ul className="mt-0.5 list-disc pl-5 text-[13px] leading-snug">
              {practice?.notes && <li className="font-medium">{practice.notes}</li>}
              {misc.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <span className="ml-1.5 text-[14px] tracking-widest text-gray-500">{BLANK}</span>
          )}
        </div>

        {/* ── By category: the pots the payer counts (beside the code lines, never instead) ── */}
        {categoryRows.length > 0 && (
          <table className="mt-2 w-full border-collapse text-[13px]" data-testid="sheet-categories">
            <thead>
              <tr className="border-b border-black text-left text-[12px] uppercase tracking-wider">
                <th scope="col" className="py-1 pr-3">By category</th>
                <th scope="col" className="py-1 pr-3">Freq</th>
                <th scope="col" className="py-1 pr-3">Left</th>
                <th scope="col" className="py-1 pr-3">Last</th>
                <th scope="col" className="py-1">Payer says</th>
              </tr>
            </thead>
            <tbody>
              {categoryRows.map((f) => (
                <tr key={`${f.code}:${f.label}`} className="border-b border-gray-300 align-top">
                  <td className="py-1 pr-3 font-medium">{f.label}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{f.limit || <span className="tracking-widest text-gray-500">______</span>}</td>
                  <td className="py-1 pr-3 tabular-nums">{f.remaining != null ? f.remaining : <span className="tracking-widest text-gray-500">____</span>}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{f.lastOn ? niceDate(f.lastOn) : f.nextOn ? `next ${niceDate(f.nextOn)}` : <span className="tracking-widest text-gray-500">______</span>}</td>
                  <td className="py-1">{lineFacts({ ...f, remaining: null }).join(' · ') || <span className="text-gray-500">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── History ───────────────────────────────────────────────── */}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6">
          <span className="text-[12px] font-semibold uppercase tracking-wider">History</span>
          <Choice label="Pano & BWX downgraded to FMX" options={['Yes', 'No']} picked={panoDowngrade ? 'Yes' : null} />
        </div>
        <table className="mt-1 w-full border-collapse text-[13px]" data-testid="sheet-history">
          <thead>
            <tr className="border-b border-black text-left text-[12px] uppercase tracking-wider">
              <th scope="col" className="py-1 pr-3">Service</th>
              <th scope="col" className="py-1 pr-3">Last</th>
              <th scope="col" className="py-1 pr-3">Next</th>
              <th scope="col" className="py-1 pr-3">Freq</th>
              <th scope="col" className="py-1 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.map((row) => {
              const p = procs.get(row.key)
              return (
                <tr key={row.key} className="border-b border-gray-300">
                  <td className="py-1 pr-3 font-medium whitespace-nowrap">{row.label}</td>
                  <td className="py-1 pr-3">{p?.lastOn ? niceDate(p.lastOn) : <span className="tracking-widest text-gray-500">______</span>}</td>
                  <td className="py-1 pr-3">{p?.nextOn ? niceDate(p.nextOn) : <span className="tracking-widest text-gray-500">______</span>}</td>
                  <td className="py-1 pr-3">
                    {p?.limit || p?.remaining != null || p?.sharesWith?.length || p?.scope ? (
                      <>
                        {p.limit ?? ''}
                        {lineFacts(p).length > 0 && <span className="text-[12px] text-gray-700">{p.limit ? ' · ' : ''}{lineFacts(p).join(' · ')}</span>}
                      </>
                    ) : (
                      <span className="tracking-widest text-gray-500">__________</span>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">{p?.planPays != null ? `${p.planPays}%${p.pctSource === 'tier' ? '*' : ''}` : <span className="tracking-widest text-gray-500">____</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {(r?.procedures ?? []).some((p) => p.pctSource === 'tier') && <p className="mt-1 text-[12px] text-gray-700">* the category’s rate — the payer priced the category, not this code.</p>}

        <p className="mt-4 border-t border-black pt-2 text-[12px]">
          Checked {formatClinicDayTime(new Date(check.checkedAtIso), timeZone)} ({checkAgeLabel(check.checkedAtIso)})
          {check.requestedByName ? ` by ${check.requestedByName}` : ''} · {STATUS_LABEL[check.status]} · check {check.id}
          {r?.breakdown ? ` · ${BREAKDOWN_COPY.pill(r.breakdown.checks).toLowerCase()}${r.breakdown.mode === 'capped' ? ' (stopped at the allowance)' : ''}` : ''}
          {practice?.updatedAtIso ? ` · practice notes updated ${niceDate(practice.updatedAtIso.slice(0, 10))}` : ''}
        </p>
        <p className="mt-1 text-[12px]">{label.title}</p>
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
export function PrintableBenefits(props: { check: InsuranceCheckView; clinicName: string; timeZone: string; practice?: PayerNoteView | null }) {
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
  // A direct child of <body>, so the print rule can hide every sibling and
  // the sheet paginates in normal flow.
  return printing ? createPortal(<BenefitsSheet {...props} />, document.body) : null
}

export function PrintBenefitsButton() {
  return (
    <ActionButton variant="secondary" size="sm" onClick={() => window.print()}>
      🖨 Print sheet
    </ActionButton>
  )
}

/** Copies the text summary; the clipboard + textarea fallback mirrors CopyChip's. */
export function CopySummaryButton({ check, clinicName, timeZone, practice = null }: { check: InsuranceCheckView; clinicName: string; timeZone: string; practice?: PayerNoteView | null }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    const text = benefitsSummaryText(check, { clinicName, timeZone, practice })
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
