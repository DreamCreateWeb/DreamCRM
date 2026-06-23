export const metadata = {
  title: 'Forms — Patient portal',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getMyPendingForms, getMyRecords } from '@/lib/services/patient-portal'
import { getFormTemplate } from '@/lib/services/forms'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import type { FormTemplateSchema } from '@/lib/types/forms'
import IntakeFormRunner from '@/app/site/[slug]/intake/[formSlug]/intake-form-runner'
import { submitPatientIntakeAction, readPatientInsuranceCardAction } from './actions'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
} from '@/components/patient-portal/ui'
import { fmtVisitDayShort } from '@/components/patient-portal/format'

export default async function PortalFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ form?: string }>
}) {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'forms')
  const { ctx, clinic, brand, timeZone } = pc
  const { form: selectedId } = await searchParams

  // Fill view — one specific template.
  if (selectedId) {
    const template = await getFormTemplate(ctx.organizationId, selectedId)
    if (template && !template.archivedAt) {
      return (
        <div className="mx-auto max-w-2xl">
          <Link href="/patient/intake" className="text-[0.85rem] font-semibold" style={{ color: brand }}>
            ← All forms
          </Link>
          <div className="mb-6 mt-3">
            <PortalHeading color={brand}>{template.title}</PortalHeading>
            {template.description && (
              <p className="mt-2 text-[0.92rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
                {template.description}
              </p>
            )}
            <p className="mt-2 text-[0.85rem]" style={{ color: PORTAL_MUTED }}>
              Take your time — your answers save when you submit, and there are no wrong answers here.
            </p>
          </div>
          <IntakeFormRunner
            orgId={ctx.organizationId}
            templateId={template.id}
            schema={template.schema as FormTemplateSchema}
            brand={brand}
            clinicName={clinic?.displayName ?? ctx.organizationName}
            action={submitPatientIntakeAction}
            ocrAction={readPatientInsuranceCardAction}
          />
        </div>
      )
    }
  }

  const [pending, records] = await Promise.all([
    getMyPendingForms(ctx.patientId, ctx.organizationId),
    getMyRecords(ctx.patientId, ctx.organizationId),
  ])
  const completed = records?.forms ?? []

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>Forms</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        Five minutes here saves fifteen on a clipboard in the waiting room.
      </p>

      <section className="mt-6">
        <PortalSectionLabel>To fill out</PortalSectionLabel>
        {pending.length === 0 ? (
          <PortalCard>
            <p className="py-3 text-center text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
              Nothing waiting on you — we’ll let you know if a visit needs paperwork.
            </p>
          </PortalCard>
        ) : (
          <div className="space-y-3">
            {pending.map((f) => (
              <PortalCard key={f.templateId} accent={f.isDefault ? brand : undefined}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
                      {f.title}
                    </p>
                    {f.description && (
                      <p className="mt-0.5 text-[0.82rem]" style={{ color: PORTAL_MUTED }}>
                        {f.description}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/patient/intake?form=${f.templateId}`}
                    className="shrink-0 rounded-full px-4 py-2 text-[0.82rem] font-semibold text-white"
                    style={{ backgroundColor: brand }}
                  >
                    Fill it out
                  </Link>
                </div>
              </PortalCard>
            ))}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section className="mt-7">
          <PortalSectionLabel>Done</PortalSectionLabel>
          <div className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
            <ul>
              {completed.map((f, i) => (
                <li
                  key={f.submissionId}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                  style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold text-white"
                      style={{ backgroundColor: '#7BA37E' }}
                    >
                      ✓
                    </span>
                    <p className="truncate text-[0.92rem] font-semibold" style={{ color: PORTAL_INK }}>
                      {f.formTitle}
                    </p>
                  </div>
                  <p className="shrink-0 text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                    {fmtVisitDayShort(f.submittedAt, timeZone)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}
