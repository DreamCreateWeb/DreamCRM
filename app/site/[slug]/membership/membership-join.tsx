'use client'

import { useState, useTransition } from 'react'
import { formatCents } from '@/lib/types/shop'
import { intervalSuffix, type PlanRow } from '@/lib/types/membership'
import { startMembershipCheckout } from './actions'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

export default function MembershipJoin({ slug, brand, plans }: { slug: string; brand: string; plans: PlanRow[] }) {
  const [selected, setSelected] = useState<string | null>(plans.find((p) => p.featured)?.slug ?? plans[0]?.slug ?? null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (plans.length === 0) {
    return <p className="text-center text-[15px]" style={{ color: INK_MUTED }}>Membership plans are coming soon — ask our front desk for details.</p>
  }

  function join() {
    setError(null)
    if (!selected) return setError('Please choose a plan.')
    if (!email.trim()) return setError('Please enter your email.')
    setBusy(true)
    startMembershipCheckout(slug, {
      planSlug: selected,
      email: email.trim(),
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      phone: phone.trim() || null,
    })
      .then(({ url }) => { window.location.href = url })
      .catch((err) => { setError((err as Error).message); setBusy(false) })
  }

  const FIELD = 'w-full text-[15px] px-3.5 py-2.5 rounded-xl border bg-white'

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {plans.map((p) => {
          const active = selected === p.slug
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.slug)}
              className="text-left rounded-2xl border-2 p-6 transition"
              style={active ? { borderColor: brand, backgroundColor: `${brand}0D` } : { borderColor: BORDER, backgroundColor: '#fff' }}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-bold" style={{ color: INK }}>{p.name}</h3>
                {p.featured && <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: brand }}>Popular</span>}
              </div>
              <p className="text-2xl font-bold mt-1" style={{ color: INK }}>
                {formatCents(p.priceCents)}<span className="text-base font-medium" style={{ color: INK_MUTED }}>{intervalSuffix(p.billingInterval)}</span>
              </p>
              {p.description && <p className="text-[14px] mt-2" style={{ color: INK_MUTED }}>{p.description}</p>}
              <ul className="mt-4 space-y-1.5">
                {p.benefits.map((b, i) => (
                  <li key={i} className="text-[14px] flex items-start gap-2" style={{ color: INK }}>
                    <span style={{ color: brand }}>✓</span>
                    {b.qty != null ? `${b.qty}× ${b.label}` : b.label}
                  </li>
                ))}
                {p.discountPercent > 0 && (
                  <li className="text-[14px] flex items-start gap-2" style={{ color: INK }}>
                    <span style={{ color: brand }}>✓</span>
                    {p.discountPercent}% off all other treatment
                  </li>
                )}
              </ul>
            </button>
          )
        })}
      </div>

      <div className="max-w-[460px] mx-auto rounded-2xl border p-6" style={{ borderColor: BORDER }}>
        <h3 className="text-lg font-bold mb-4" style={{ color: INK }}>Join today</h3>
        <div className="space-y-3">
          <input type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} style={{ borderColor: BORDER }} />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={FIELD} style={{ borderColor: BORDER }} />
            <input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={FIELD} style={{ borderColor: BORDER }} />
          </div>
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} style={{ borderColor: BORDER }} />
        </div>
        {error && <p className="text-[14px] text-rose-600 mt-3">{error}</p>}
        <button disabled={busy} onClick={join} className="w-full mt-4 text-[16px] font-semibold px-6 py-3.5 rounded-xl text-white disabled:opacity-60" style={{ backgroundColor: brand }}>
          {busy ? 'Redirecting to secure checkout…' : 'Join & set up payment'}
        </button>
        <p className="text-[12px] text-center mt-3" style={{ color: INK_MUTED }}>Secure recurring payment by Stripe. Cancel anytime.</p>
      </div>
    </div>
  )
}
