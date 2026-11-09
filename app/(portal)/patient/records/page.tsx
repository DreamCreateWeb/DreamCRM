export const metadata = {
  title: 'My records — Patient portal',
}

export const dynamic = 'force-dynamic'

import { getMyRecords } from '@/lib/services/patient-portal'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PortalEmptyState,
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
  PORTAL_SUCCESS_INK,
} from '@/components/patient-portal/ui'
import { fmtVisitDayShort } from '@/components/patient-portal/format'
import { portalVisitLabel } from '@/lib/portal-visit-label'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import { getLatestInsuranceCheckForPatient, listPatientInsurance } from '@/lib/services/insurance-eligibility'
import { portalInsurancePlans } from '@/lib/portal-insurance-note'
import type { InsuranceCheckView } from '@/lib/insurance-eligibility'
import RequestRecordsCard from './request-records'

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-[0.82rem] font-medium" style={{ color: PORTAL_MUTED }}>
        {label}
      </span>
      <span className="text-right text-[0.9rem] font-semibold" style={{ color: value ? PORTAL_INK : PORTAL_MUTED }}>
        {value ?? 'Not on file'}
      </span>
    </div>
  )
}

export default async function PortalRecordsPage() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'records')
  const { ctx, clinic, brand, timeZone } = pc

  const [records, switches, latestCheck, plans] = await Promise.all([
    getMyRecords(ctx.patientId, ctx.organizationId),
    getFeatureSwitchState(ctx.organizationId),
    // Org-scoped + keyed on THIS login's patient: never a family member's card.
    getLatestInsuranceCheckForPatient(ctx.organizationId, ctx.patientId, 'primary').catch(() => null),
    listPatientInsurance(ctx.organizationId, ctx.patientId).catch(() => []),
  ])
  if (!records) return null
  const p = records.patient
  const secondaryCard = plans.find((c) => c.rank === 'secondary') ?? null
  // The secondary's own last check — read only when the practice's tool is on AND a second plan exists.
  const secondaryCheck =
    secondaryCard && switches.insurance
      ? await getLatestInsuranceCheckForPatient(ctx.organizationId, ctx.patientId, 'secondary').catch(() => null)
      : null
  const noteCheck = (c: InsuranceCheckView | null) =>
    c?.result ? { status: c.status, checkedAtIso: c.checkedAtIso, planName: c.result.planName, payerName: c.result.payerName } : null
  const insurancePlans = portalInsurancePlans({
    toolOn: switches.insurance,
    primary: { carrier: p.insuranceProvider, memberId: p.insurancePolicyNumber, groupNumber: p.insuranceGroupNumber },
    primaryCheck: noteCheck(latestCheck),
    secondary: secondaryCard
      ? { carrier: secondaryCard.provider, memberId: secondaryCard.policyNumber, groupNumber: secondaryCard.groupNumber }
      : null,
    secondaryCheck: noteCheck(secondaryCheck),
    timeZone,
  })
  // An empty room always has a way forward: book if the portal books, else
  // the front desk by message, else back home.
  const door = pc.settings.features.booking
    ? { href: '/patient/book', label: pc.selfBookingEnabled ? 'Book a visit' : 'Request a visit' }
    : pc.settings.features.messages
      ? { href: '/patient/messages', label: 'Message the front desk' }
      : { href: '/patient/dashboard', label: 'Back to your home page' }

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>My records</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        What we keep on file for you — and how to get the rest.
      </p>

      <section className="mt-6">
        <PortalSectionLabel>Visit history</PortalSectionLabel>
        {records.visits.length === 0 ? (
          <PortalCard>
            <PortalEmptyState
              title="No visits on record yet"
              body="Once you’ve been in, your completed visits are listed here."
              ctaHref={door.href}
              ctaLabel={door.label}
              brand={brand}
            />
          </PortalCard>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
            <ul>
              {records.visits.map((v, i) => (
                <li
                  key={v.id}
                  className="px-5 py-3.5"
                  style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}
                >
                  <p className="text-[0.92rem] font-semibold" style={{ color: PORTAL_INK }}>
                    {portalVisitLabel(pc.visitTypes, v.type)}
                  </p>
                  <p className="text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                    {fmtVisitDayShort(v.startTime, timeZone)}
                    {v.providerName ? ` · with ${v.providerName}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-7">
        <PortalSectionLabel>Forms on file</PortalSectionLabel>
        {records.forms.length === 0 ? (
          <PortalCard>
            <PortalEmptyState
              title="No forms on file yet"
              body="Forms you fill out will be listed here."
              ctaHref={pc.settings.features.forms ? '/patient/intake' : door.href}
              ctaLabel={pc.settings.features.forms ? 'See your forms' : door.label}
              brand={brand}
            />
          </PortalCard>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
            <ul>
              {records.forms.map((f, i) => (
                <li
                  key={f.submissionId}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                  style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}
                >
                  <p className="text-[0.92rem] font-semibold" style={{ color: PORTAL_INK }}>
                    {f.formTitle}
                  </p>
                  <p className="shrink-0 text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                    {fmtVisitDayShort(f.submittedAt, timeZone)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-7">
        <PortalSectionLabel>Personal details</PortalSectionLabel>
        <PortalCard>
          <InfoRow label="Name" value={`${p.firstName} ${p.lastName}`} />
          <InfoRow label="Date of birth" value={p.dateOfBirth} />
          <InfoRow label="Email" value={p.email} />
          <InfoRow label="Phone" value={p.phone} />
          <InfoRow
            label="Address"
            value={
              p.addressLine1
                ? `${p.addressLine1}, ${[p.city, p.state, p.postalCode].filter(Boolean).join(', ')}`
                : null
            }
          />
          <p className="mt-2 text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
            Something changed?{' '}
            <a href="/patient/profile" className="font-semibold" style={{ color: brand }}>
              Update it here
            </a>
            .
          </p>
        </PortalCard>
      </section>

      <section className="mt-7">
        <PortalSectionLabel>Insurance on file</PortalSectionLabel>
        <PortalCard>
          {insurancePlans.map((plan, i) => (
            <div key={plan.rank} className={i > 0 ? 'mt-4 pt-4' : undefined} style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined} data-testid={`portal-plan-${plan.rank}`}>
              {plan.heading && (
                <p className="mb-1 text-[0.8rem] font-semibold uppercase tracking-wide" style={{ color: PORTAL_MUTED }}>
                  {plan.heading}
                </p>
              )}
              <InfoRow label="Carrier" value={plan.carrier} />
              <InfoRow label="Member ID" value={plan.memberId} />
              <InfoRow label="Group number" value={plan.groupNumber} />
              {plan.note && (
                <p
                  className="mt-2 text-[0.8rem] leading-relaxed"
                  style={{ color: plan.note.tone === 'verified' ? PORTAL_SUCCESS_INK : PORTAL_MUTED }}
                >
                  {plan.note.text}
                </p>
              )}
            </div>
          ))}
        </PortalCard>
      </section>

      <section className="mt-7">
        <RequestRecordsCard brand={brand} phone={clinic?.phone ?? null} />
      </section>
    </div>
  )
}
