'use client'

import { useState } from 'react'
import { updateClinicProfile } from './actions'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicTestimonial,
  ClinicOfficePhoto,
} from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import ImageUploader from '@/components/ui/image-uploader'
import ServicesLibraryPicker from './services-library-picker'
import StaffEditor from './staff-editor'
import StatsEditor from './stats-editor'
import TestimonialsEditor from './testimonials-editor'
import OfficePhotosEditor from './office-photos-editor'

interface Props {
  profile: ClinicProfile | null
  orgName: string
  orgId: string
  library: ServiceLibraryEntryWithStatus[]
}

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

export default function ClinicProfilePanel({ profile, orgName, orgId, library }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialHours = (profile?.hours ?? {}) as Record<string, HoursEntry>
  const initialServices = (profile?.services ?? null) as ClinicService[] | null
  const initialStaff = (profile?.staff ?? null) as ClinicStaff[] | null
  const initialStats = (profile?.stats ?? null) as ClinicStat[] | null
  const initialTestimonials = (profile?.testimonials ?? null) as ClinicTestimonial[] | null
  const initialOfficePhotos = (profile?.officePhotos ?? null) as ClinicOfficePhoto[] | null
  // Accepted insurance carriers — JSON string[] on clinic_profile
  // (migration 0038). Edited as one carrier per line in a textarea so
  // clinics can paste-or-type without us building a multi-select picker.
  const initialInsuranceCarriers = Array.isArray(profile?.acceptedInsuranceCarriers)
    ? ((profile?.acceptedInsuranceCarriers as unknown[]).filter(
        (c): c is string => typeof c === 'string',
      ) as string[])
    : []

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const fd = new FormData(e.currentTarget)
      await updateClinicProfile(fd)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grow">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-1">Clinic Profile</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            These details power your public clinic website.
          </p>
        </div>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Basics</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="displayName">Display Name <span className="text-red-500">*</span></label>
              <input id="displayName" name="displayName" className="form-input w-full" type="text" required defaultValue={profile?.displayName ?? orgName} />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shown on your website and in the dashboard.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="legalName">Legal Name</label>
              <input id="legalName" name="legalName" className="form-input w-full" type="text" defaultValue={profile?.legalName ?? ''} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="tagline">Tagline</label>
              <input id="tagline" name="tagline" className="form-input w-full" type="text" defaultValue={profile?.tagline ?? ''} placeholder="e.g. Modern family dentistry in Brooklyn" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="about">About</label>
              <textarea id="about" name="about" className="form-textarea w-full" rows={4} defaultValue={profile?.about ?? ''} placeholder="A short paragraph about your clinic, your team, and what makes you different." />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Contact</h3>
          <div className="space-y-4">
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="phone">Phone</label>
                <input id="phone" name="phone" className="form-input w-full" type="tel" defaultValue={profile?.phone ?? ''} />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
                <input id="email" name="email" className="form-input w-full" type="email" defaultValue={profile?.email ?? ''} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="addressLine1">Street Address</label>
              <input id="addressLine1" name="addressLine1" className="form-input w-full" type="text" defaultValue={profile?.addressLine1 ?? ''} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="addressLine2">Suite / Apt</label>
              <input id="addressLine2" name="addressLine2" className="form-input w-full" type="text" defaultValue={profile?.addressLine2 ?? ''} />
            </div>
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="city">City</label>
                <input id="city" name="city" className="form-input w-full" type="text" defaultValue={profile?.city ?? ''} />
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium mb-1" htmlFor="state">State</label>
                <input id="state" name="state" className="form-input w-full" type="text" defaultValue={profile?.state ?? ''} />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium mb-1" htmlFor="postalCode">Postal Code</label>
                <input id="postalCode" name="postalCode" className="form-input w-full" type="text" defaultValue={profile?.postalCode ?? ''} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="country">Country</label>
              <select id="country" name="country" className="form-select w-full" defaultValue={profile?.country ?? 'US'}>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Office Hours</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">24-hour format (HH:MM). Leave blank to omit a day.</p>
          <div className="space-y-2">
            {DAYS.map(({ id, label }) => {
              const day = initialHours[id]
              return (
                <div key={id} className="flex items-center gap-3 py-1">
                  <label className="w-28 text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
                  <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      name={`hours[${id}].closed`}
                      defaultChecked={!!day?.closed}
                    />
                    Closed
                  </label>
                  <input
                    name={`hours[${id}].open`}
                    type="time"
                    defaultValue={day?.closed ? '' : day?.open ?? ''}
                    className="form-input w-32"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    name={`hours[${id}].close`}
                    type="time"
                    defaultValue={day?.closed ? '' : day?.close ?? ''}
                    className="form-input w-32"
                  />
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Branding</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="brandColor">Brand Color</label>
              <div className="flex items-center gap-3">
                <input id="brandColor" name="brandColor" className="form-input w-32" type="text" placeholder="#8b5cf6" defaultValue={profile?.brandColor ?? ''} />
                <span className="text-xs text-gray-500 dark:text-gray-400">Used as the accent color across your clinic website.</span>
              </div>
            </div>
            <ImageUploader
              name="logoUrl"
              defaultValue={profile?.logoUrl ?? null}
              folder="clinic-logos"
              label="Logo"
              hint="Square logo, 256x256+. Replaces the letter mark in the site header."
              previewClass="aspect-square w-32"
            />
            <ImageUploader
              name="heroImageUrl"
              defaultValue={profile?.heroImageUrl ?? null}
              folder="clinic-hero"
              label="Hero Image"
              hint="Wide banner image shown behind your hero. 16:9 or wider. JPG/PNG, up to 5MB."
              previewClass="aspect-[3/1]"
            />
            {/* "Why us?" section ambient video. URL only for v1 — clinics
                paste a public mp4/webm URL (their own CDN, Pexels, etc.).
                A native in-product video uploader (mime-aware, S3 multipart)
                is a future v1.1 addition; for now this is the lightest-
                touch wiring that exercises the new differenceVideoUrl column.
                Falls back to the hero image when left blank. */}
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="differenceVideoUrl">
                &ldquo;Why us?&rdquo; ambient video URL
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-2">(optional)</span>
              </label>
              <input
                id="differenceVideoUrl"
                name="differenceVideoUrl"
                type="url"
                className="form-input w-full"
                placeholder="https://…/video.mp4"
                defaultValue={profile?.differenceVideoUrl ?? ''}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Plays as an ambient autoplay loop in the &ldquo;Why us?&rdquo; section. Falls back to the hero image when blank. MP4 or WebM recommended.
              </p>
            </div>
            <input type="hidden" name="template" value="modern" />
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Services</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Pick from the shared library — each service gets a full Tend-style detail
            page on your site, rewritten in your clinic&apos;s voice with AI.
          </p>
          <ServicesLibraryPicker
            name="services"
            initialServices={initialServices ?? []}
            library={library}
            orgId={orgId}
          />
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Staff</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Your team. Add headshots and bios — they appear in a Meet The Team section.
          </p>
          <StaffEditor name="staff" defaultValue={initialStaff} />
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Stats</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Three short trust signals shown right under your hero. Examples: &ldquo;8,000+
            five-star reviews&rdquo;, &ldquo;Same-week appointments&rdquo;, &ldquo;Most insurance accepted&rdquo;.
          </p>
          <StatsEditor name="stats" defaultValue={initialStats} />
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Testimonials</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Long-form patient quotes — first name + city. The single strongest trust signal
            on the page when done well.
          </p>
          <TestimonialsEditor name="testimonials" defaultValue={initialTestimonials} />
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Office Photos</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            3–4 real photos of your office (reception, treatment room, waiting area). Drop
            them in below and they&apos;ll appear as a gallery on your site.
          </p>
          <OfficePhotosEditor name="officePhotos" defaultValue={initialOfficePhotos} />
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
            Accepted Insurance Carriers
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Shown on your public site in the &ldquo;Dental insurance coverage&rdquo; section
            and used as the dropdown options on the insurance verifier form. One carrier per
            line. Leave blank if you&apos;d rather just invite patients to call to verify.
          </p>
          <textarea
            id="acceptedInsuranceCarriers"
            name="acceptedInsuranceCarriers"
            className="form-textarea w-full font-mono text-sm"
            rows={6}
            defaultValue={initialInsuranceCarriers.join('\n')}
            placeholder={'Aetna\nCigna\nDelta Dental\nGuardian\nMetLife'}
          />
        </section>

        <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700/60">
          <button type="submit" disabled={saving} className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </form>
    </div>
  )
}
