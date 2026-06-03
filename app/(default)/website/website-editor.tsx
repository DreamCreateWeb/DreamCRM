'use client'

import { useRef, useState } from 'react'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicTestimonial,
  ClinicOfficePhoto,
  ClinicFinancingPartner,
  ClinicFaqItem,
} from '@/lib/types/clinic-content'
import { DEFAULT_PAYMENT_METHODS } from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import ImageUploader from '@/components/ui/image-uploader'
import ServicesLibraryPicker from '../settings/clinic/services-library-picker'
import StaffEditor from '../settings/clinic/staff-editor'
import StatsEditor from '../settings/clinic/stats-editor'
import TestimonialsEditor from '../settings/clinic/testimonials-editor'
import OfficePhotosEditor from '../settings/clinic/office-photos-editor'
import FinancingPartnersEditor from '../settings/clinic/financing-partners-editor'
import FaqEditor from './faq-editor'
import {
  saveHero,
  saveAbout,
  saveBranding,
  saveStats,
  saveStaff,
  saveTestimonials,
  saveOfficePhotos,
  saveFaq,
  saveContact,
  saveHours,
  saveInsurance,
  savePaymentFinancing,
  type SectionResult,
} from './website-actions'

interface Props {
  profile: ClinicProfile
  orgId: string
  slug: string
  /** Public URL (custom domain or subdomain) for the "open in new tab" link. */
  siteUrl: string
  /** Same-origin path the preview iframe loads (e.g. /site/acme-dental). */
  previewPath: string
  library: ServiceLibraryEntryWithStatus[]
}

type Status = 'done' | 'partial' | 'missing'
type SectionId =
  | 'brand' | 'hero' | 'stats' | 'services' | 'team' | 'testimonials'
  | 'photos' | 'about' | 'faq' | 'insurance' | 'payment' | 'contact' | 'hours'

interface SectionMeta {
  id: SectionId
  label: string
  group: 'Homepage' | 'Pages' | 'Contact'
  required: boolean
}

const SECTIONS: SectionMeta[] = [
  { id: 'brand', label: 'Brand & logo', group: 'Homepage', required: true },
  { id: 'hero', label: 'Hero headline', group: 'Homepage', required: true },
  { id: 'stats', label: 'Trust stats', group: 'Homepage', required: false },
  { id: 'services', label: 'Services', group: 'Homepage', required: true },
  { id: 'team', label: 'Meet the team', group: 'Homepage', required: true },
  { id: 'testimonials', label: 'Testimonials', group: 'Homepage', required: false },
  { id: 'photos', label: 'Office photos', group: 'Homepage', required: false },
  { id: 'about', label: 'About', group: 'Pages', required: true },
  { id: 'faq', label: 'FAQ', group: 'Pages', required: false },
  { id: 'insurance', label: 'Insurance', group: 'Pages', required: false },
  { id: 'payment', label: 'Payment & financing', group: 'Pages', required: false },
  { id: 'contact', label: 'Contact & address', group: 'Contact', required: true },
  { id: 'hours', label: 'Office hours', group: 'Contact', required: true },
]

const DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
] as const

interface HoursEntry { open?: string | null; close?: string | null; closed?: boolean }

const PILL: Record<Status, string> = {
  done: 'bg-emerald-500',
  partial: 'bg-amber-400',
  missing: 'bg-stone-300 dark:bg-stone-600',
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export default function WebsiteEditor({
  profile,
  orgId,
  slug,
  siteUrl,
  previewPath,
  library,
}: Props) {
  const [active, setActive] = useState<SectionId>('brand')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [showPreview, setShowPreview] = useState(true)
  const [previewNonce, setPreviewNonce] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const services = (profile.services ?? null) as ClinicService[] | null
  const staff = (profile.staff ?? null) as ClinicStaff[] | null
  const stats = (profile.stats ?? null) as ClinicStat[] | null
  const testimonials = (profile.testimonials ?? null) as ClinicTestimonial[] | null
  const officePhotos = (profile.officePhotos ?? null) as ClinicOfficePhoto[] | null
  const faq = (profile.faq ?? null) as ClinicFaqItem[] | null
  const financingPartners = (profile.financingPartners ?? null) as ClinicFinancingPartner[] | null
  const hours = (profile.hours ?? {}) as Record<string, HoursEntry>
  const insuranceList = arr(profile.acceptedInsuranceCarriers)
    .filter((c): c is string => typeof c === 'string')
  const paymentList = arr(profile.paymentMethods).filter((c): c is string => typeof c === 'string')

  function reloadPreview() {
    setPreviewNonce((n) => n + 1)
  }

  function statusFor(id: SectionId): Status {
    const count = (v: unknown[], target: number): Status =>
      v.length >= target ? 'done' : v.length > 0 ? 'partial' : 'missing'
    const str = (v: string | null | undefined): Status => (v?.trim() ? 'done' : 'missing')
    switch (id) {
      case 'brand':
        return profile.logoUrl && profile.heroImageUrl
          ? 'done'
          : profile.logoUrl || profile.heroImageUrl
            ? 'partial'
            : 'missing'
      case 'hero':
        return str(profile.tagline)
      case 'stats':
        return count(arr(profile.stats), 3)
      case 'services':
        return count(arr(profile.services), 4)
      case 'team':
        return count(arr(profile.staff), 2)
      case 'testimonials':
        return count(arr(profile.testimonials), 2)
      case 'photos':
        return count(arr(profile.officePhotos), 3)
      case 'about':
        return str(profile.about)
      case 'faq':
        return count(arr(profile.faq), 1)
      case 'insurance':
        return count(insuranceList, 1)
      case 'payment':
        return count(paymentList, 1)
      case 'contact':
        return profile.phone && profile.addressLine1 && profile.city ? 'done'
          : profile.phone || profile.addressLine1 ? 'partial' : 'missing'
      case 'hours':
        return Object.keys(hours).length > 0 ? 'done' : 'missing'
    }
  }

  const requiredMissing = SECTIONS.filter(
    (s) => s.required && statusFor(s.id) !== 'done',
  ).length

  const groups: SectionMeta['group'][] = ['Homepage', 'Pages', 'Contact']

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[100rem] mx-auto">
      {/* ── Ownership header ─────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-1">
            Your website
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            {profile.displayName ?? 'Your clinic'}
          </h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Published live
            </span>
            {' · '}
            <span>You own it — change anything, it&apos;s live in seconds. No tickets, no waiting.</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {requiredMissing > 0 ? (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {requiredMissing} essential {requiredMissing === 1 ? 'item' : 'items'} to finish
            </span>
          ) : (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              ✓ All essentials set
            </span>
          )}
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900"
          >
            View live site →
          </a>
        </div>
      </div>

      <div className="flex gap-5">
        {/* ── Left rail: section anatomy ─────────────────────────────────── */}
        <nav className="w-48 shrink-0 hidden md:block">
          <div className="sticky top-4 space-y-4">
            {groups.map((g) => (
              <div key={g}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 px-2 mb-1">
                  {g}
                </p>
                <ul className="space-y-0.5">
                  {SECTIONS.filter((s) => s.group === g).map((s) => {
                    const st = statusFor(s.id)
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => setActive(s.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] text-left transition-colors ${
                            active === s.id
                              ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 font-semibold'
                              : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/40'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${PILL[st]}`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{s.label}</span>
                          {s.required && st !== 'done' && (
                            <span className="ml-auto text-[10px] text-amber-500" aria-label="required">●</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* ── Center: active section editor ──────────────────────────────── */}
        <div className={`min-w-0 ${showPreview ? 'flex-1 xl:max-w-2xl' : 'flex-1'}`}>
          {/* Mobile section switcher */}
          <div className="md:hidden mb-4">
            <select
              value={active}
              onChange={(e) => setActive(e.target.value as SectionId)}
              className="form-select w-full"
            >
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.group} · {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Brand */}
          <Panel active={active === 'brand'}>
            <SectionForm
              title="Brand & logo"
              description="Your accent color and the two images that frame the homepage. Real photos beat stock — the template intentionally looks plain without them."
              action={saveBranding}
              onSaved={reloadPreview}
            >
              <Field label="Brand color" hint="Accent color for buttons and highlights across your site.">
                <div className="flex items-center gap-3">
                  <input
                    name="brandColor"
                    className="form-input w-32"
                    type="text"
                    placeholder="#8b5cf6"
                    defaultValue={profile.brandColor ?? ''}
                  />
                  {profile.brandColor && (
                    <span
                      className="w-8 h-8 rounded-full border border-stone-300 dark:border-stone-600"
                      style={{ backgroundColor: profile.brandColor }}
                    />
                  )}
                </div>
              </Field>
              <ImageUploader
                name="logoUrl"
                defaultValue={profile.logoUrl ?? null}
                folder="clinic-logos"
                label="Logo"
                hint="Square logo, 256×256+. Falls back to a letter-mark when empty."
                previewClass="aspect-square w-28"
              />
              <ImageUploader
                name="heroImageUrl"
                defaultValue={profile.heroImageUrl ?? null}
                folder="clinic-hero"
                label="Hero image"
                hint="Wide banner behind your headline. A real interior or team shot, 16:9 or wider."
                previewClass="aspect-[3/1]"
              />
              <Field label="“Why us?” ambient video URL" hint="Optional. A public mp4/webm URL — plays as an ambient loop. Falls back to the hero image.">
                <input
                  name="differenceVideoUrl"
                  type="url"
                  className="form-input w-full"
                  placeholder="https://…/video.mp4"
                  defaultValue={profile.differenceVideoUrl ?? ''}
                />
              </Field>
            </SectionForm>
          </Panel>

          {/* Hero */}
          <Panel active={active === 'hero'}>
            <SectionForm
              title="Hero headline"
              description="The first thing patients read. Keep the tagline short and concrete — a promise, not a slogan."
              action={saveHero}
              onSaved={reloadPreview}
            >
              <Field label="Display name" hint="Shown on your site and in the dashboard." required>
                <input name="displayName" className="form-input w-full" type="text" required defaultValue={profile.displayName ?? ''} />
              </Field>
              <Field label="Legal name" hint="Optional — used in the footer and legal text.">
                <input name="legalName" className="form-input w-full" type="text" defaultValue={profile.legalName ?? ''} />
              </Field>
              <Field label="Tagline" hint="One line under the headline. “Gentle family dentistry in Brooklyn,” not a paragraph.">
                <input name="tagline" className="form-input w-full" type="text" defaultValue={profile.tagline ?? ''} placeholder="Modern, judgment-free dentistry" />
              </Field>
            </SectionForm>
          </Panel>

          {/* Stats */}
          <Panel active={active === 'stats'}>
            <SectionForm
              title="Trust stats"
              description="Three short signals right under the hero — “8,000+ five-star reviews,” “Same-week appointments,” “Most insurance accepted.”"
              action={saveStats}
              onSaved={reloadPreview}
            >
              <StatsEditor name="stats" defaultValue={stats} />
            </SectionForm>
          </Panel>

          {/* Services */}
          <Panel active={active === 'services'}>
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
              <SectionHeader
                title="Services"
                description="Pick from the shared library — each gets a full detail page rewritten in your clinic's voice with AI. Changes here save automatically."
              />
              <ServicesLibraryPicker
                name="services"
                initialServices={services ?? []}
                library={library}
                orgId={orgId}
              />
              <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-700/40">
                <button
                  type="button"
                  onClick={reloadPreview}
                  className="text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
                >
                  ↻ Refresh preview
                </button>
              </div>
            </div>
          </Panel>

          {/* Team */}
          <Panel active={active === 'team'}>
            <SectionForm
              title="Meet the team"
              description="Headshots + bios. Real faces are one of the strongest trust signals — patients want to know the dentist before they read credentials."
              action={saveStaff}
              onSaved={reloadPreview}
            >
              <StaffEditor name="staff" defaultValue={staff} />
            </SectionForm>
          </Panel>

          {/* Testimonials */}
          <Panel active={active === 'testimonials'}>
            <SectionForm
              title="Testimonials"
              description="Long-form patient quotes with a first name + city. Tip: feature real reviews from the Reviews module so you never put words in a patient's mouth."
              action={saveTestimonials}
              onSaved={reloadPreview}
            >
              <TestimonialsEditor name="testimonials" defaultValue={testimonials} />
            </SectionForm>
          </Panel>

          {/* Office photos */}
          <Panel active={active === 'photos'}>
            <SectionForm
              title="Office photos"
              description="3–4 real interior shots (reception, treatment room, waiting area). They render as a gallery on your site."
              action={saveOfficePhotos}
              onSaved={reloadPreview}
            >
              <OfficePhotosEditor name="officePhotos" defaultValue={officePhotos} />
            </SectionForm>
          </Panel>

          {/* About */}
          <Panel active={active === 'about'}>
            <SectionForm
              title="About"
              description="A paragraph or two — what makes the practice different, who the dentists are, why a patient should trust you. Used on the homepage and the /about page."
              action={saveAbout}
              onSaved={reloadPreview}
            >
              <textarea name="about" className="form-textarea w-full" rows={7} defaultValue={profile.about ?? ''} placeholder="We're a family practice that believes a dental visit should feel calm, honest, and judgment-free…" />
            </SectionForm>
          </Panel>

          {/* FAQ */}
          <Panel active={active === 'faq'}>
            <SectionForm
              title="FAQ"
              description="Answers patients look for before booking — insurance, anxiety, first visit. Grouped by category on your /faq page and emitted as FAQ structured data for Google."
              action={saveFaq}
              onSaved={reloadPreview}
            >
              <FaqEditor name="faq" defaultValue={faq} />
            </SectionForm>
          </Panel>

          {/* Insurance */}
          <Panel active={active === 'insurance'}>
            <SectionForm
              title="Insurance carriers"
              description="“Do they take my insurance?” is one of the top questions patients have. One carrier per line. Leave blank to just invite patients to call and verify."
              action={saveInsurance}
              onSaved={reloadPreview}
            >
              <textarea
                name="acceptedInsuranceCarriers"
                className="form-textarea w-full font-mono text-sm"
                rows={7}
                defaultValue={insuranceList.join('\n')}
                placeholder={'Aetna\nCigna\nDelta Dental\nGuardian\nMetLife'}
              />
            </SectionForm>
          </Panel>

          {/* Payment & financing */}
          <Panel active={active === 'payment'}>
            <SectionForm
              title="Payment & financing"
              description="Shown on your /payment-financing page."
              action={savePaymentFinancing}
              onSaved={reloadPreview}
            >
              <Field label="Accepted payment methods" hint="One per line. Leave blank to use a sensible default list — the section never reads empty.">
                <textarea
                  name="paymentMethods"
                  className="form-textarea w-full font-mono text-sm"
                  rows={5}
                  defaultValue={paymentList.join('\n')}
                  placeholder={DEFAULT_PAYMENT_METHODS.join('\n')}
                />
              </Field>
              <Field label="Financing partners" hint="CareCredit, Sunbit, Cherry, etc. Leave empty if you don't partner with anyone — we won't push patients to financing you can't use.">
                <FinancingPartnersEditor name="financingPartners" defaultValue={financingPartners} />
              </Field>
              <Field label="Cancellation & no-show policy" hint="Plain language. Hides entirely when blank — no fake fees.">
                <textarea
                  name="cancellationPolicy"
                  className="form-textarea w-full text-sm"
                  rows={3}
                  defaultValue={profile.cancellationPolicy ?? ''}
                  placeholder="We ask for 24 hours notice when you need to cancel or reschedule. Things come up — just let us know."
                />
              </Field>
            </SectionForm>
          </Panel>

          {/* Contact & address */}
          <Panel active={active === 'contact'}>
            <SectionForm
              title="Contact & address"
              description="Powers the contact section, the call button, the Maps embed, and your local-SEO structured data. Make sure these are exact."
              action={saveContact}
              onSaved={reloadPreview}
            >
              <div className="flex gap-4">
                <Field label="Phone" className="flex-1">
                  <input name="phone" className="form-input w-full" type="tel" defaultValue={profile.phone ?? ''} />
                </Field>
                <Field label="Email" className="flex-1">
                  <input name="email" className="form-input w-full" type="email" defaultValue={profile.email ?? ''} />
                </Field>
              </div>
              <Field label="Street address">
                <input name="addressLine1" className="form-input w-full" type="text" defaultValue={profile.addressLine1 ?? ''} />
              </Field>
              <Field label="Suite / Apt">
                <input name="addressLine2" className="form-input w-full" type="text" defaultValue={profile.addressLine2 ?? ''} />
              </Field>
              <div className="flex gap-4">
                <Field label="City" className="flex-1">
                  <input name="city" className="form-input w-full" type="text" defaultValue={profile.city ?? ''} />
                </Field>
                <Field label="State" className="w-24">
                  <input name="state" className="form-input w-full" type="text" defaultValue={profile.state ?? ''} />
                </Field>
                <Field label="Postal" className="w-28">
                  <input name="postalCode" className="form-input w-full" type="text" defaultValue={profile.postalCode ?? ''} />
                </Field>
              </div>
              <Field label="Country">
                <select name="country" className="form-select w-full" defaultValue={profile.country ?? 'US'}>
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                </select>
              </Field>
            </SectionForm>
          </Panel>

          {/* Hours */}
          <Panel active={active === 'hours'}>
            <SectionForm
              title="Office hours"
              description="Used by your public site, the booking widget, and SEO. Wrong hours = patients showing up to a closed office, the #1 complaint. 24-hour format."
              action={saveHours}
              onSaved={reloadPreview}
            >
              <div className="space-y-2">
                {DAYS.map(({ id, label }) => {
                  const day = hours[id]
                  return (
                    <div key={id} className="flex items-center gap-3 py-1">
                      <label className="w-24 text-sm font-medium text-stone-700 dark:text-stone-200">{label}</label>
                      <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                        <input type="checkbox" className="form-checkbox" name={`hours[${id}].closed`} defaultChecked={!!day?.closed} />
                        Closed
                      </label>
                      <input name={`hours[${id}].open`} type="time" defaultValue={day?.closed ? '' : day?.open ?? ''} className="form-input w-32" />
                      <span className="text-xs text-stone-400">to</span>
                      <input name={`hours[${id}].close`} type="time" defaultValue={day?.closed ? '' : day?.close ?? ''} className="form-input w-32" />
                    </div>
                  )
                })}
              </div>
            </SectionForm>
          </Panel>
        </div>

        {/* ── Right: live preview ────────────────────────────────────────── */}
        {showPreview && (
          <div className="hidden xl:block flex-1 min-w-0">
            <div className="sticky top-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <DeviceBtn active={device === 'desktop'} onClick={() => setDevice('desktop')} label="Desktop" />
                  <DeviceBtn active={device === 'mobile'} onClick={() => setDevice('mobile')} label="Mobile" />
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={reloadPreview} className="text-[12px] text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200">
                    ↻ Reload
                  </button>
                  <button type="button" onClick={() => setShowPreview(false)} className="text-[12px] text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200">
                    Hide
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 dark:border-stone-700/60 bg-stone-100 dark:bg-stone-800/40 p-3 overflow-hidden">
                <div className={`mx-auto bg-white transition-all ${device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'}`}>
                  <iframe
                    ref={iframeRef}
                    key={previewNonce}
                    src={`${previewPath}?editorPreview=${previewNonce}`}
                    title="Live preview of your website"
                    className="w-full h-[calc(100vh-9rem)] rounded-lg border border-stone-200 dark:border-stone-700 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {!showPreview && (
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="hidden xl:block self-start mt-7 text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            Show preview
          </button>
        )}
      </div>
    </div>
  )
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Panel({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Kept mounted (hidden, not unmounted) so unsaved edits survive a section switch.
  return <div className={active ? 'block' : 'hidden'}>{children}</div>
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>
      <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-0.5">{description}</p>
    </div>
  )
}

function SectionForm({
  title,
  description,
  action,
  onSaved,
  children,
}: {
  title: string
  description: string
  action: (fd: FormData) => Promise<SectionResult>
  onSaved: () => void
  children: React.ReactNode
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await action(new FormData(e.currentTarget))
      if (res.ok) {
        setSaved(true)
        onSaved()
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5"
    >
      <SectionHeader title={title} description={description} />
      <div className="space-y-4">{children}</div>
      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-stone-100 dark:border-stone-700/40">
        <button
          type="submit"
          disabled={saving}
          className="btn-sm bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-[13px] text-emerald-600 dark:text-emerald-400">Saved ✓ — live on your site</span>}
        {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  children,
  className,
  required,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
  required?: boolean
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-stone-700 dark:text-stone-200 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">{hint}</p>}
    </div>
  )
}

function DeviceBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] font-medium px-2.5 py-1 rounded-md ${
        active
          ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
          : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
      }`}
    >
      {label}
    </button>
  )
}
