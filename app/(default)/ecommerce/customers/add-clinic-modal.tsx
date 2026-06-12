'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { createManagedClinicAction } from './admin-actions'
import { checkClinicSlug } from '@/app/(onboarding)/actions'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
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
}

/**
 * Platform-admin "+ Add clinic": creates the org, reserves a plan at an
 * optionally negotiated price (Stripe coupon) or comped, and emails the
 * owner their invite. Optionally attributes the clinic to a referral partner.
 */
export default function AddClinicModal({ partners = [] }: { partners?: PartnerOption[] }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugNote, setSlugNote] = useState<string | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [planId, setPlanId] = useState<PlanId>('pro')
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
  const plan = PLANS.find((p) => p.id === planId)!
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
    setPlanId('pro'); setInterval('monthly')
    setPricingKind('standard'); setPercentOff('20'); setAmountOff('50'); setDuration('forever')
    setNote(''); setPartnerId(''); setReferralPercent(''); setError(null); setCreated(null)
  }

  const selectedPartner = partners.find((p) => p.id === partnerId) ?? null

  async function onSlugBlur() {
    const value = (slugTouched ? slug : effectiveSlug).trim()
    if (!value) return
    try {
      const result = await checkClinicSlug(value)
      setSlugNote(
        result.available
          ? null
          : result.suggestion
            ? `"${value}" isn't available — they'll get "${result.suggestion}".`
            : `"${value}" isn't available — a free variant will be used.`,
      )
    } catch {
      setSlugNote(null)
    }
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
      try {
        const referral = partnerId
          ? {
              partnerId,
              percentBps:
                referralPercent.trim() === '' ? null : Math.round(Number(referralPercent) * 100),
            }
          : undefined
        const result = await createManagedClinicAction({
          name,
          slug: effectiveSlug || undefined,
          ownerName,
          ownerEmail,
          planId,
          interval,
          pricing,
          note: note || undefined,
          referral,
        })
        setCreated({
          slug: result.slug,
          ownerEmail: ownerEmail.trim().toLowerCase(),
          comped: pricingKind === 'comped',
          hasDiscount: Boolean(result.couponId),
        })
      } catch (err) {
        setError((err as Error).message)
      }
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
            <div className="fixed inset-0 bg-gray-900/40" aria-hidden="true" />
          </TransitionChild>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
            leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
          >
            <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
              <DialogPanel className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-lg p-6">
                {created ? (
                  <div className="text-center py-4">
                    <div className="text-3xl mb-3" aria-hidden="true">📨</div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                      Invite sent to {created.ownerEmail}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                      <strong>{created.slug}.dreamcreatestudio.com</strong> is reserved.
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
                          <label className="block text-sm font-medium mb-1" htmlFor="ac-plan">Plan</label>
                          <select id="ac-plan" className="form-select w-full" value={planId}
                            onChange={(e) => setPlanId(e.target.value as PlanId)}>
                            {PLANS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (${interval === 'annual' ? p.annualPrice.toLocaleString('en-US') + '/yr' : p.price + '/mo'})
                              </option>
                            ))}
                          </select>
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
                        <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <ActionButton variant="secondary" onClick={() => setOpen(false)}>
                          Cancel
                        </ActionButton>
                        <ActionButton type="submit" variant="primary" disabled={pending}>
                          {pending ? 'Creating…' : 'Create & send invite'}
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
