'use client'

import { useRef, useState, useTransition, type ReactNode } from 'react'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicOfficePhoto,
  ClinicFaqItem,
  ClinicColoringPage,
  ClinicFinancingPartner,
} from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import { Field, TagListEditor, inputCls, textareaCls } from '@/components/ui/editor-kit'
import StatsEditor from '../../settings/clinic/stats-editor'
import StaffEditor from '../../settings/clinic/staff-editor'
import OfficePhotosEditor from '../../settings/clinic/office-photos-editor'
import FinancingPartnersEditor from '../../settings/clinic/financing-partners-editor'
import ServicesLibraryPicker from '../../settings/clinic/services-library-picker'
import FaqEditor from '../editor/faq-editor'
import ColoringPagesEditor from '../editor/coloring-pages-editor'
import {
  saveStory,
  saveStaff,
  saveStats,
  saveOfficePhotos,
  saveFaq,
  saveDifferenceChips,
  saveColoringPages,
  saveInsurance,
  savePaymentFinancing,
  type SectionResult,
} from '../editor/website-actions'

/**
 * The Content panel — every website-content section as its own form with its
 * own save. Each section posts to the SAME scoped action the Studio modal
 * uses (one saver, two doors), so a save here never touches a section it
 * didn't edit and always lands in the undo history.
 */

interface Props {
  profile: ClinicProfile
  orgId: string
  library: ServiceLibraryEntryWithStatus[]
}

export default function ContentPanel({ profile, orgId, library }: Props) {
  const isPediatric = (profile.template ?? 'modern') === 'pediatric'
  return (
    <div className="p-5 sm:p-6 space-y-10">
      <SectionForm
        id="story"
        title="Your story"
        desc="The tagline patients see first and the paragraph about your practice."
        action={saveStory}
      >
        <Field label="Tagline" hint="One sentence — it’s your homepage headline.">
          <input
            name="tagline"
            defaultValue={profile.tagline ?? ''}
            placeholder="Dental care that finally feels human."
            className={inputCls}
          />
        </Field>
        <Field label="About your practice">
          <textarea
            name="about"
            defaultValue={profile.about ?? ''}
            rows={5}
            placeholder="What makes your practice yours — patients read this on your About page."
            className={textareaCls}
          />
        </Field>
      </SectionForm>

      <Section
        id="services"
        title="Services"
        desc="What you offer — each service gets its own page on your site. Changes save automatically."
      >
        <ServicesLibraryPicker
          name="services"
          initialServices={(profile.services as ClinicService[] | null) ?? []}
          library={library}
          orgId={orgId}
          clinicName={profile.displayName ?? ''}
          city={profile.city ?? null}
        />
      </Section>

      <SectionForm
        id="staff"
        title="Team"
        desc="The people patients will meet — photos and bios build trust."
        action={saveStaff}
      >
        <StaffEditor name="staff" defaultValue={(profile.staff as ClinicStaff[] | null) ?? null} />
      </SectionForm>

      <SectionForm
        id="stats"
        title="Trust stats"
        desc="Years of care, happy patients — the quick numbers on your homepage."
        action={saveStats}
      >
        <StatsEditor name="stats" defaultValue={(profile.stats as ClinicStat[] | null) ?? null} />
      </SectionForm>

      <SectionForm
        id="photos"
        title="Office photos"
        desc="Real photos of your space — patients want to see where they’re going."
        action={saveOfficePhotos}
      >
        <OfficePhotosEditor
          name="officePhotos"
          defaultValue={(profile.officePhotos as ClinicOfficePhoto[] | null) ?? null}
        />
      </SectionForm>

      <SectionForm
        id="faq"
        title="FAQ"
        desc="The questions patients actually ask, answered in your voice."
        action={saveFaq}
      >
        <FaqEditor name="faq" defaultValue={(profile.faq as ClinicFaqItem[] | null) ?? null} />
      </SectionForm>

      <SectionForm
        id="why-us"
        title="“Why us” highlights"
        desc="Short chips like “Same-week visits” that set you apart on the homepage."
        action={saveDifferenceChips}
      >
        <TagListEditor
          name="differenceChips"
          defaultValue={(profile.differenceChips as string[] | null) ?? []}
          placeholder="No judgment, ever"
          addLabel="Add a highlight…"
        />
      </SectionForm>

      {isPediatric && (
        <SectionForm
          id="coloring"
          title="Coloring pages"
          desc="Printable + digital coloring sheets for the kids’ corner of your site."
          action={saveColoringPages}
        >
          <ColoringPagesEditor
            name="coloringPages"
            defaultValue={(profile.coloringPages as ClinicColoringPage[] | null) ?? null}
          />
        </SectionForm>
      )}

      <SectionForm
        id="insurance"
        title="Insurance carriers"
        desc="The plans you accept — feeds your insurance page and the coverage-check form."
        action={saveInsurance}
      >
        <TagListEditor
          name="acceptedInsuranceCarriers"
          defaultValue={(profile.acceptedInsuranceCarriers as string[] | null) ?? []}
          placeholder="Delta Dental"
          addLabel="Add a carrier…"
        />
      </SectionForm>

      <SectionForm
        id="methods"
        title="Payments & policies"
        desc="How patients can pay, financing partners, and your cancellation wording."
        action={savePaymentFinancing}
      >
        <Field label="Payment methods">
          <TagListEditor
            name="paymentMethods"
            defaultValue={(profile.paymentMethods as string[] | null) ?? []}
            placeholder="Cash, Credit cards, HSA / FSA…"
            addLabel="Add a method…"
          />
        </Field>
        <div id="financing" className="scroll-mt-28">
          <Field
            label="Financing partners"
            hint="Only partners you actually work with — the section hides when empty."
          >
            <FinancingPartnersEditor
              name="financingPartners"
              defaultValue={(profile.financingPartners as ClinicFinancingPartner[] | null) ?? null}
            />
          </Field>
        </div>
        <div id="cancellation" className="scroll-mt-28">
          <Field label="Cancellation policy" hint="Leave blank to hide — no fake fees.">
            <textarea
              name="cancellationPolicy"
              defaultValue={profile.cancellationPolicy ?? ''}
              rows={4}
              placeholder="We ask for 48 hours’ notice to reschedule…"
              className={textareaCls}
            />
          </Field>
        </div>
      </SectionForm>
    </div>
  )
}

/** A titled, anchorable content section (no form — for self-saving editors). */
function Section({
  id,
  title,
  desc,
  children,
}: {
  id: string
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
        {desc && <p className="mt-0.5 max-w-prose text-xs text-gray-500 dark:text-gray-400">{desc}</p>}
      </div>
      {children}
    </section>
  )
}

/** A section wrapped in its own form + save bar, posting to a scoped action. */
function SectionForm({
  id,
  title,
  desc,
  action,
  children,
}: {
  id: string
  title: string
  desc?: string
  action: (fd: FormData) => Promise<SectionResult>
  children: ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res = await action(fd)
      if (res.ok) {
        setDirty(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Section id={id} title={title} desc={desc}>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        onInput={() => setDirty(true)}
        className="space-y-5"
      >
        {children}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition disabled:opacity-60"
          >
            {pending ? 'Saving…' : `Save ${title.toLowerCase()}`}
          </button>
          {saved && !dirty && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓ — publish to go live</span>}
          {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      </form>
    </Section>
  )
}
