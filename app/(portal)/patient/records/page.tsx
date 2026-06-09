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
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
} from '@/components/patient-portal/ui'
import { fmtVisitDayShort } from '@/components/patient-portal/format'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-[0.82rem] font-medium" style={{ color: PORTAL_MUTED }}>
        {label}
      </span>
      <span className="text-right text-[0.9rem] font-semibold" style={{ color: value ? PORTAL_INK : '#B9B0A5' }}>
        {value ?? 'Not on file'}
      </span>
    </div>
  )
}

export default async function PortalRecordsPage() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'records')
  const { ctx, clinic, brand, timeZone } = pc

  const records = await getMyRecords(ctx.patientId, ctx.organizationId)
  if (!records) return null
  const p = records.patient

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
            <p className="py-3 text-center text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
              Your completed visits will live here.
            </p>
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
                    {PORTAL_VISIT_LABELS[v.type] ?? 'Visit'}
                  </p>
                  <p className="text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                    {fmtVisitDayShort(v.startTime, timeZone)}
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
            <p className="py-3 text-center text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
              Forms you fill out will be listed here.
            </p>
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
          <InfoRow label="Carrier" value={p.insuranceProvider} />
          <InfoRow label="Member ID" value={p.insurancePolicyNumber} />
          <InfoRow label="Group number" value={p.insuranceGroupNumber} />
          <p className="mt-2 text-[0.8rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
            We&apos;ll verify your coverage before treatment — bring your card to your first visit
            and we&apos;ll handle the rest.
          </p>
        </PortalCard>
      </section>

      <section className="mt-7">
        <PortalCard>
          <p className="text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
            Need your full chart or X-rays?
          </p>
          <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
            Your clinical records live in our practice system, and they&apos;re yours — by law you
            can request a copy anytime, X-rays included.{' '}
            {clinic?.phone ? (
              <>
                Call{' '}
                <a href={`tel:${clinic.phone}`} className="font-semibold" style={{ color: brand }}>
                  {clinic.phone}
                </a>{' '}
                or send a message and we&apos;ll get them to you.
              </>
            ) : (
              'Send us a message and we’ll get them to you.'
            )}
          </p>
        </PortalCard>
      </section>
    </div>
  )
}
