'use client'

import { useState } from 'react'
import IntakeFormRunner, { type IntakeSubmitPayload, type OcrAction } from '../../[formSlug]/intake-form-runner'
import type { FormTemplateSchema, FormTranslations } from '@/lib/types/forms'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

export interface PacketForm {
  id: string
  title: string
  schema: FormTemplateSchema
  translations: FormTranslations | null
}


/**
 * Walks a patient through a packet's forms one at a time. Each form submits
 * independently (its own form_submission — no cross-form field-id collisions);
 * on success we advance to the next, then show one final "all done" screen.
 */
export default function PacketRunner({
  orgId,
  brand,
  clinicName,
  forms,
  action,
  ocrAction,
}: {
  orgId: string
  brand: string
  clinicName: string
  forms: PacketForm[]
  action: (payload: IntakeSubmitPayload) => Promise<void>
  ocrAction?: OcrAction
}) {
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)

  function advance() {
    if (index < forms.length - 1) {
      setIndex((i) => i + 1)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setDone(true)
    }
  }

  if (done || forms.length === 0) {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: brand + '22' }}>
          <svg className="h-10 w-10" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-3 text-3xl font-bold tracking-[-0.02em]" style={{ color: INK }}>
          All done — thank you.
        </h2>
        <p className="mx-auto max-w-sm leading-relaxed" style={{ color: INK_MUTED }}>
          {clinicName} has everything we need. We&rsquo;ll see you at your appointment.
        </p>
      </div>
    )
  }

  const form = forms[index]
  return (
    <div className="rounded-2xl sm:rounded-3xl p-5 sm:p-9 shadow-sm" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
      <IntakeFormRunner
        // Remount per form so its useState (values/channel/lang) resets cleanly.
        key={form.id}
        orgId={orgId}
        templateId={form.id}
        schema={form.schema}
        brand={brand}
        clinicName={clinicName}
        action={action}
        ocrAction={ocrAction}
        translations={form.translations}
        onComplete={advance}
        progressLabel={`Form ${index + 1} of ${forms.length} · ${form.title}`}
      />
    </div>
  )
}
