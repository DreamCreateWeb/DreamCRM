'use client'

import { Fragment, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { createManagedClinicAction, checkManagedClinicSlugAction } from './admin-actions'
import { PLANS, type BillingInterval } from '@/lib/stripe-config'
import { runAction } from '@/lib/run-action'
import { US_TIMEZONES, CLINIC_DEFAULT_TZ } from '@/lib/clinic-timezone'
import { PMS_VENDORS } from '@/lib/pms-connect'
import { slugify } from '@/lib/utils'
import { ActionButton } from '@/components/ui/action-button'
import { formatBps } from '@/lib/types/referrals'

type PricingKind = 'standard' | 'percent_off' | 'amount_off' | 'comped'
type Duration = 'forever' | '1' | '3' | '6' | '12' | '24'

export interface PartnerOption {
  id: string
  name: string
  company: string | null
  defaultPercentBps: number
  defaultTermMonths: number | null
}

interface Created {
  slug: string
  ownerEmail: string
  comped: boolean
  hasDiscount: boolean
  /** The slug was already this owner's clinic — nothing new was made or sent. */
  already: boolean
}

/** The one managed plan — internally the full plan; on screen only its price terms. */
const MANAGED_PLAN_ID = 'premium' as const
const MANAGED_PLAN = PLANS.find((p) => p.id === MANAGED_PLAN_ID)!

/**
 * Platform-admin "+ Add clinic" — THE SETUP-CALL FORM. The owner finishes the
 * call and types what they learned once: the practice, its web address, time
 * zone, address / phone / NPI, brand colour, the PMS they run, and the owner
 * (who is invited — never given a password). Everything is saved in one go
 * (`provisionManagedClinic`); a repeat submit never makes a second clinic.
 */
export default function AddClinicModal({ partners = [] }: { partners?: PartnerOption[] }) {
  // ?add=1 (the Overview's + Add clinic primary) opens the modal on arrival.
  const params = useSearchParams()
  const [open, setOpen] = useState(() => params.get('add') === '1')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugNote, setSlugNote] = useState<string | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [timezone, setTimezone] = useState<string>(CLINIC_DEFAULT_TZ)
  const [phone, setPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [npi, setNpi] = useState('')
  const [brandColor, setBrandColor] = useState('')
  const [pmsVendor, setPmsVendor] = useState('not_sure')
  const [pmsVendorName, setPmsVendorName] = useState('')
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [pricingKind, setPricingKind] = useState<PricingKind>('standard')
  const [percentOff, setPercentOff] = useState('20')
  const [amountOff, setAmountOff] = useState('50')
  const [duration, setDuration] = useState<Duration>('forever')
  const [note, setNote] = useState('')
  // Referral attribution (optional)
  const [partnerId, setPartnerId] = useState('')
  const [referralPercent, setReferralPercent] = useState('') // blank = partner default
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)

  const effectiveSlug = slugTouched ? slug : slugify(name)
  const plan = MANAGED_PLAN
  const basePrice = interval === 'annual' ? plan.annualPrice : plan.price

  function previewPrice(): string | null {
    if (pricingKind === 'percent_off') {
      const pct = Number(percentOff)
      if (!Number.isFinite(pct) || pct < 1 || pct > 100) return null
      return `$${(Math.round(basePrice * (1 - pct / 100) * 100) / 100).toLocaleString('en-US')}`
    }
    if (pricingKind === 'amount_off') {
      const dollars = Number(amountOff)
      if (!Number.isFinite(dollars) || dollars <= 0) return null
      return `$${Math.max(0, Math.round((basePrice - dollars) * 100) / 100).toLocaleString('en-US')}`
    }
    return null
  }

  function reset() {
    setName(''); setSlug(''); setSlugTouched(false); setSlugNote(null)
    setOwnerName(''); setOwnerEmail('')
    setTimezone(CLINIC_DEFAULT_TZ); setPhone(''); setAddressLine1(''); setCity(''); setState(''); setPostalCode('')
    setNpi(''); setBrandColor(''); setPmsVendor('not_sure'); setPmsVendorName(''); setInterval('monthly')
    setPricingKind('standard'); setPercentOff('20'); setAmountOff('50'); setDuration('forever')
    setNote(''); setPartnerId(''); setReferralPercent(''); setError(null); setCreated(null)
  }

  const selectedPartner = partners.find((p) => p.id === partnerId) ?? null

  async function onSlugBlur() {
    const value = (slugTouched ? slug : effectiveSlug).trim()
    if (!value) return
    const result = await runAction(() => checkManagedClinicSlugAction(value))
    if (!result.ok) { setSlugNote(null); return }
    setSlugNote(
      result.available
        ? null
        : result.suggestion
          ? `"${value}" isn't available — try "${result.suggestion}".`
          : `"${value}" isn't available — pick another.`,
    )
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const durationMonths = duration === 'forever' ? undefined : Number(duration)
    const pricing =
      pricingKind === 'standard'
        ? { kind: 'standard' as const }
        : pricingKind === 'comped'
          ? { kind: 'comped' as const }
          : pricingKind === 'percent_off'
            ? { kind: 'percent_off' as const, percentOff: Number(percentOff), durationMonths }
            : { kind: 'amount_off' as const, amountOffCents: Math.round(Number(amountOff) * 100), durationMonths }

    startTransition(async () => {
      const referral = partnerId
        ? {
            partnerId,
            percentBps:
              referralPercent.trim() === '' ? null : Math.round(Number(referralPercent) * 100),
          }
        : undefined
      const result = await runAction(() =>
        createManagedClinicAction({
          name,
          slug: effectiveSlug || undefined,
          ownerName,
          ownerEmail,
          planId: MANAGED_PLAN_ID,
          interval,
          pricing,
          note: note || undefined,
          referral,
          timezone,
          phone: phone || undefined,
          addressLine1: addressLine1 || undefined,
          city: city || undefined,
          state: state || undefined,
          postalCode: postalCode || undefined,
          npi: npi || undefined,
          brandColor: brandColor || undefined,
          pmsVendor,
          pmsVendorName: pmsVendor === 'other' ? pmsVendorName : undefined,
        }),
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCreated({
        slug: result.slug,
        ownerEmail: ownerEmail.trim().toLowerCase(),
        comped: pricingKind === 'comped',
        hasDiscount: Boolean(result.couponId),
        already: Boolean(result.alreadyProvisioned),
      })
    })
  }

  return (
    <>
      <ActionButton variant="primary" onClick={() => setOpen(true)}>
        + Add clinic
      </ActionButton>

      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
            leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-[color:var(--color-ink-900)]/40" aria-hidden="true" />
          </TransitionChild>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
              <DialogPanel className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[var(--r-lg)] bg-white dark:bg-gray-800 shadow-lg p-6">
                {created ? (
                  <div role="status" className="text-center py-4">
                    <div className="text-3xl mb-3" aria-hidden="true">📨</div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                      {created.already ? `Already set up — ${created.ownerEmail} was invited before` : `Invite sent to ${created.ownerEmail}`}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                      <strong>{created.slug}.dreamcreatestudio.com</strong> {created.already ? 'is this clinic’s address. No second invite was sent.' : 'is reserved.'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                      {created.comped
                        ? 'This clinic is comped — their plan is live with no billing step.'
                        : created.hasDiscount
                          ? 'When they accept, they’ll see their negotiated price and add billing — no code to type.'
                          : 'When they accept, they’ll add billing for the reserved plan.'}
                    </p>
                    <div className="flex justify-center gap-2">
                      <ActionButton variant="secondary" onClick={() => reset()}>
                        Add another
                      </ActionButton>
                      <ActionButton variant="primary" onClick={() => { reset(); setOpen(false) }}>
                        Done
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Add a clinic</h2>
                    <form onSubmit={onSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="ac-name">
                          Clinic name <span className="text-rose-500">*</span>
                        </label>
                        <input id="ac-name" className="form-input w-full" required value={name}
                          onChange={(e) => setName(e.target.value)} placeholder="Bright Smile Dental" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="ac-slug">Web address</label>
                        <div className="flex items-center">
                          <input id="ac-slug" className="form-input w-full rounded-r-none" value={effectiveSlug}
                            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }}
                            onBlur={onSlugBlur} placeholder="bright-smile" spellCheck={false} />
                          <span className="shrink-0 rounded-r-lg border border-l-0 border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/30 px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                            .dreamcreatestudio.com
                          </span>
                        </div>
                        {slugNote && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{slugNote}</p>}
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-owner-name">
                            Owner name <span className="text-rose-500">*</span>
                          </label>
                          <input id="ac-owner-name" className="form-input w-full" required value={ownerName}
                            onChange={(e) => setOwnerName(e.target.value)} placeholder="Dr. Jane Lee" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-owner-email">
                            Owner email <span className="text-rose-500">*</span>
                          </label>
                          <input id="ac-owner-email" className="form-input w-full" type="email" required value={ownerEmail}
                            onChange={(e) => setOwnerEmail(e.target.value)} placeholder="jane@brightsmile.com" />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-tz">Time zone</label>
                          <select id="ac-tz" className="form-select w-full" value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}>
                            {US_TIMEZONES.map((z) => (<option key={z.id} value={z.id}>{z.label}</option>))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-phone">Phone</label>
                          <input id="ac-phone" className="form-input w-full" type="tel" value={phone}
                            onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="ac-addr">Street address</label>
                        <input id="ac-addr" className="form-input w-full" value={addressLine1}
                          onChange={(e) => setAddressLine1(e.target.value)} placeholder="120 Main St" />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-[2]">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-city">City</label>
                          <input id="ac-city" className="form-input w-full" value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-state">State</label>
                          <input id="ac-state" className="form-input w-full" value={state} maxLength={2}
                            onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="OH" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-zip">ZIP</label>
                          <input id="ac-zip" className="form-input w-full" value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)} inputMode="numeric" />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-npi">Practice NPI</label>
                          <input id="ac-npi" className="form-input w-full" value={npi} inputMode="numeric"
                            onChange={(e) => setNpi(e.target.value)} placeholder="10 digits — optional" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-brand">Brand colour</label>
                          <div className="flex items-center gap-2">
                            <input id="ac-brand" className="form-input w-full" value={brandColor}
                              onChange={(e) => setBrandColor(e.target.value)} placeholder="#0d9488 — optional" spellCheck={false} />
                            {/^#[0-9a-fA-F]{6}$/.test(brandColor) && (
                              <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: brandColor }} />
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-pms">Practice-management system</label>
                          <select id="ac-pms" className="form-select w-full" value={pmsVendor}
                            onChange={(e) => setPmsVendor(e.target.value)}>
                            <option value="not_sure">Not sure yet</option>
                            <option value="none">None — paper or no system</option>
                            {PMS_VENDORS.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
                          </select>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            A system picked here files the connect request for you.
                          </p>
                        </div>
                        {pmsVendor === 'other' && (
                          <div className="flex-1">
                            <label className="block text-sm font-medium mb-1" htmlFor="ac-pms-name">What is it called?</label>
                            <input id="ac-pms-name" className="form-input w-full" required value={pmsVendorName}
                              onChange={(e) => setPmsVendorName(e.target.value)} />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <span className="block text-sm font-medium mb-1">Plan</span>
                          <div className="form-input w-full bg-gray-50 dark:bg-gray-900/30 text-gray-700 dark:text-gray-200">
                            Managed (founding rate)
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-interval">Billing</label>
                          <select id="ac-interval" className="form-select w-full" value={interval}
                            onChange={(e) => setInterval(e.target.value as BillingInterval)}>
                            <option value="monthly">Monthly</option>
                            <option value="annual">Annual (2 mo free)</option>
                          </select>
                        </div>
                      </div>

                      <fieldset>
                        <legend className="block text-sm font-medium mb-2">Pricing</legend>
                        <div className="space-y-2">
                          {([
                            ['standard', `Standard price — $${basePrice.toLocaleString('en-US')}${interval === 'annual' ? '/yr' : '/mo'}`],
                            ['percent_off', 'Percent off'],
                            ['amount_off', 'Dollar amount off'],
                            ['comped', 'Comped — free, no billing'],
                          ] as Array<[PricingKind, string]>).map(([kind, label]) => (
                            <label key={kind} className="flex items-center gap-2 text-sm">
                              <input type="radio" name="ac-pricing" className="form-radio" checked={pricingKind === kind}
                                onChange={() => setPricingKind(kind)} />
                              <span className="text-gray-700 dark:text-gray-200">{label}</span>
                            </label>
                          ))}
                        </div>
                        {(pricingKind === 'percent_off' || pricingKind === 'amount_off') && (
                          <div className="mt-3 flex items-end gap-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 p-3">
                            <div className="w-28">
                              <label className="block text-xs font-medium mb-1" htmlFor="ac-discount">
                                {pricingKind === 'percent_off' ? '% off' : '$ off'}
                              </label>
                              <input id="ac-discount" className="form-input w-full" type="number" min={1}
                                max={pricingKind === 'percent_off' ? 100 : undefined}
                                value={pricingKind === 'percent_off' ? percentOff : amountOff}
                                onChange={(e) =>
                                  pricingKind === 'percent_off' ? setPercentOff(e.target.value) : setAmountOff(e.target.value)
                                } />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-medium mb-1" htmlFor="ac-duration">Applies</label>
                              <select id="ac-duration" className="form-select w-full" value={duration}
                                onChange={(e) => setDuration(e.target.value as Duration)}>
                                <option value="forever">Forever</option>
                                <option value="1">First {interval === 'annual' ? 'year' : 'month'} only</option>
                                <option value="3">For 3 months</option>
                                <option value="6">For 6 months</option>
                                <option value="12">For 12 months</option>
                                <option value="24">For 24 months</option>
                              </select>
                            </div>
                            {previewPrice() && (
                              <div className="text-sm text-emerald-700 dark:text-emerald-300 font-medium whitespace-nowrap pb-2 tabular-nums">
                                → {previewPrice()}
                                {interval === 'annual' ? '/yr' : '/mo'}
                              </div>
                            )}
                          </div>
                        )}
                      </fieldset>

                      <div>
                        <label className="block text-sm font-medium mb-1" htmlFor="ac-note">Internal note</label>
                        <textarea id="ac-note" className="form-textarea w-full" rows={2} value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Why this pricing / who closed the deal — only your team sees this." />
                      </div>

                      {partners.length > 0 && (
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-sm font-medium mb-1" htmlFor="ac-partner">Referred by</label>
                            <select id="ac-partner" className="form-select w-full" value={partnerId}
                              onChange={(e) => { setPartnerId(e.target.value); setReferralPercent('') }}>
                              <option value="">No referral</option>
                              {partners.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}{p.company ? ` (${p.company})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          {selectedPartner && (
                            <div className="w-36">
                              <label className="block text-sm font-medium mb-1" htmlFor="ac-ref-pct">Commission %</label>
                              <input id="ac-ref-pct" className="form-input w-full" type="number" min={0} max={100} step="0.5"
                                value={referralPercent} onChange={(e) => setReferralPercent(e.target.value)}
                                placeholder={String(selectedPartner.defaultPercentBps / 100)} />
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Blank uses the partner default — currently {formatBps(selectedPartner.defaultPercentBps)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {error && (
                        <div role="alert" className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 ring-1 ring-inset ring-rose-500/20 px-3 py-2 rounded-[var(--r-sm)]">{error}</div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <ActionButton variant="secondary" onClick={() => setOpen(false)}>
                          Cancel
                        </ActionButton>
                        <ActionButton type="submit" variant="primary" pending={pending}>
                          Create &amp; send invite
                        </ActionButton>
                      </div>
                    </form>
                  </>
                )}
              </DialogPanel>
            </div>
          </TransitionChild>
        </Dialog>
      </Transition>
    </>
  )
}
