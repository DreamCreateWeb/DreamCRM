'use client'

import { useState, type ReactNode } from 'react'
import { updateClinicProfile } from './actions'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import { CLINIC_DEFAULT_TZ } from '@/lib/clinic-timezone'
import ImageUploader from '@/components/ui/image-uploader'
import { ActionButton } from '@/components/ui/action-button'
import HoursGrid from './hours-grid'
import TimezonePicker from './timezone-picker'

interface Props {
  profile: ClinicProfile | null
  orgName: string
  gmailAccounts: Array<{ id: string; emailAddress: string; displayName: string | null }>
}

/**
 * The Business profile panel — the clinic's shared identity ONLY: names,
 * contact + email sender, address, hours, timezone, and logo. These drive
 * booking slots, reminder times, and the email "From", not just the site.
 *
 * Everything the WEBSITE says moved to the Website workspace (Content,
 * Design, Forms, Pages) with per-section scoped saves. This form's action is
 * identity-only in lockstep — a save here can never touch (or null) a
 * website-content column. That pairing is the load-bearing contract; see
 * updateClinicProfile.
 */

/**
 * A titled, anchorable settings section. The `id` is the scroll target the
 * sticky section rail (clinic-settings-nav) jumps to — and matches the old
 * SettingsTabs sub-id so the settings smart-search deep links still land here.
 */
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

export default function ClinicProfilePanel({ profile, orgName, gmailAccounts }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialHours = (profile?.hours ?? {}) as Record<
    string,
    { open?: string | null; close?: string | null; closed?: boolean }
  >

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
      <form onSubmit={handleSubmit} className="space-y-7 p-6">
        {/* The calm pointer — where all the website content went. */}
        <div className="v2-well p-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Your website content moved — edit what your site says and how it looks in{' '}
            <a href="/website" className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4">
              Website
            </a>{' '}
            (Content, Design, Forms, and Pages). This page is your business identity: names,
            contact, hours, and logo.
          </p>
        </div>

        <Section id="basics" title="Basics" desc="Your clinic’s name, as patients and the dashboard see it.">
          <div className="v2-card p-5">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="displayName">Display Name <span className="text-rose-500">*</span></label>
                <input id="displayName" name="displayName" className="form-input w-full" type="text" defaultValue={profile?.displayName ?? orgName} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shown on your website and in the dashboard.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="legalName">Legal Name</label>
                <input id="legalName" name="legalName" className="form-input w-full" type="text" defaultValue={profile?.legalName ?? ''} />
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="contact"
          title="Contact & email"
          desc="How patients reach you — and the identity your patient emails send from."
        >
          <div className="v2-card p-5">
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
                <label className="block text-sm font-medium mb-1" htmlFor="emailSenderName">Email sender name</label>
                <input
                  id="emailSenderName"
                  name="emailSenderName"
                  className="form-input w-full"
                  type="text"
                  defaultValue={profile?.emailSenderName ?? ''}
                  placeholder={profile?.displayName ?? orgName}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  The name patients see as the sender when you email them (reminders, intake forms, messages).
                  Defaults to your clinic name. Replies go to the contact email above.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Send patient email from</label>
                {gmailAccounts.length > 0 ? (
                  <div className="space-y-1.5">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="emailSendingAccountId"
                        value=""
                        defaultChecked={!profile?.emailSendingAccountId}
                        className="form-radio mt-0.5"
                      />
                      <span>
                        <span className="text-gray-800 dark:text-gray-100">DreamCRM (default)</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          Sent from your clinic name on our secure mail server — no setup needed.
                        </span>
                      </span>
                    </label>
                    {gmailAccounts.map((a) => (
                      <label key={a.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name="emailSendingAccountId"
                          value={a.id}
                          defaultChecked={profile?.emailSendingAccountId === a.id}
                          className="form-radio mt-0.5"
                        />
                        <span>
                          <span className="text-gray-800 dark:text-gray-100">Your Google inbox — {a.emailAddress}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            Patients see your real address; replies land back in your inbox.
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Want patient email to come from your own address? {' '}
                    <a href="/api/oauth/gmail/start" className="text-teal-600 dark:text-teal-400 hover:underline font-medium">
                      Connect your Google account
                    </a>{' '}
                    — then pick it here. Until then, email sends from your clinic name on our mail server.
                  </p>
                )}
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
          </div>
        </Section>

        <Section
          id="hours"
          title="Hours"
          desc="Opening hours and timezone. Drives your booking slots and the times shown in patient emails."
        >
          <div className="v2-card p-5">
            <div className="mb-5 max-w-sm">
              <span className="block text-sm font-medium mb-1">Timezone</span>
              <TimezonePicker
                name="timezone"
                defaultValue={profile?.timezone ?? CLINIC_DEFAULT_TZ}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                The hours below and appointment times in patient emails are shown in this timezone.
              </p>
            </div>
            <HoursGrid initial={initialHours} />
          </div>
        </Section>

        <Section
          id="logo"
          title="Logo"
          desc="Your logo is shared identity — the site header, patient emails, and the dashboard all use it."
        >
          <div className="v2-card p-5">
            <ImageUploader
              name="logoUrl"
              defaultValue={profile?.logoUrl ?? null}
              folder="clinic-logos"
              label="Logo"
              hint="Square logo, 256x256+. Replaces the letter mark in the site header."
              previewClass="aspect-square w-32"
            />
          </div>
        </Section>

        {/* Sticky save bar — one Save for every section (all inputs stay mounted). */}
        <div className="sticky bottom-4 z-10 flex items-center gap-3 v2-card px-4 py-3 shadow-[var(--shadow-pop)]">
          <ActionButton variant="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </ActionButton>
          {saved && <span className="text-sm text-emerald-700 dark:text-emerald-300">Saved ✓</span>}
          {error && <span className="text-sm text-rose-700 dark:text-rose-300">{error}</span>}
        </div>
      </form>
    </div>
  )
}
