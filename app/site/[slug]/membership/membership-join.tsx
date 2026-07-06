'use client'

import { useState, useEffect } from 'react'
import { formatCents } from '@/lib/types/shop'
import { intervalSuffix, type PlanRow } from '@/lib/types/membership'
import { readableInk } from '@/lib/clinic-site-theme'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import { startMembershipCheckout } from './actions'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'


/** Inline checkmark — the site language uses real SVG checks, not a "✓" glyph. */
function Check({ color }: { color: string }) {
  return (
    <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={2.25} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5l3.5 3.5L16 5.5" />
    </svg>
  )
}

export default function MembershipJoin({ slug, brand, plans }: { slug: string; brand: string; plans: PlanRow[] }) {
  const [selected, setSelected] = useState<string | null>(plans.find((p) => p.featured)?.slug ?? plans[0]?.slug ?? null)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [honeypot, setHoneypot] = useState('')
  const [loadedAt, setLoadedAt] = useState('')

  // Time-trap mount stamp (set client-side to avoid a hydration mismatch).
  useEffect(() => {
    setLoadedAt(String(Date.now()))
  }, [])

  const ink = readableInk(brand)
  const display = { fontFamily: 'var(--font-display, Georgia, serif)' }

  if (plans.length === 0) {
    return (
      <p className="text-center text-[15px]" style={{ color: INK_MUTED }}>
        Membership plans are coming soon — ask our front desk for details.
      </p>
    )
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
      hp: honeypot,
      ts: loadedAt,
    })
      .then(({ url }) => {
        // Guard against an empty/missing URL — never navigate to "" (which
        // would silently reload the page and look like the button did nothing).
        if (url) {
          window.location.href = url
        } else {
          setError('We couldn’t start checkout. Please try again, or call our front desk.')
          setBusy(false)
        }
      })
      .catch((err) => {
        setError((err as Error).message)
        setBusy(false)
      })
  }

  const FIELD = 'w-full text-[15px] px-4 py-3 rounded-xl border bg-[var(--c-surface,#FFFFFF)] focus:outline-none focus:ring-2'
  const fieldStyle = { borderColor: BORDER, ['--tw-ring-color' as string]: `${brand}55` }

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
              style={active ? { borderColor: brand, backgroundColor: `${brand}0D` } : { borderColor: BORDER, backgroundColor: SURFACE }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-xl font-semibold" style={{ color: ink, ...display }}>{p.name}</h3>
                {p.featured && (
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: ink }}>Popular</span>
                )}
              </div>
              <p className="text-3xl font-semibold mt-1" style={{ color: ink, ...display }}>
                {formatCents(p.priceCents)}
                <span className="text-base font-medium" style={{ color: INK_MUTED, fontFamily: 'inherit' }}>{intervalSuffix(p.billingInterval)}</span>
              </p>
              {p.description && <p className="text-[14px] mt-2" style={{ color: INK_MUTED }}>{p.description}</p>}
              <ul className="mt-4 space-y-2">
                {p.benefits.map((b, i) => (
                  <li key={i} className="text-[14px] flex items-start gap-2" style={{ color: INK }}>
                    <Check color={brand} />
                    <span>{b.qty != null ? `${b.qty}× ${b.label}` : b.label}</span>
                  </li>
                ))}
                {p.discountPercent > 0 && (
                  <li className="text-[14px] flex items-start gap-2" style={{ color: INK }}>
                    <Check color={brand} />
                    <span>{p.discountPercent}% off all other treatment</span>
                  </li>
                )}
              </ul>
            </button>
          )
        })}
      </div>

      <div className="max-w-[460px] mx-auto rounded-2xl border p-6" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
        <h3 className="text-lg font-semibold mb-4" style={{ color: ink, ...display }}>Join today</h3>
        {/* Honeypot — off-screen, never seen or filled by a human. */}
        <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0, padding: 0, margin: -1 }}>
          <label htmlFor={HONEYPOT_FIELD}>Leave this field empty</label>
          <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>
        <input type="hidden" name={TIMETRAP_FIELD} value={loadedAt} readOnly />
        <div className="space-y-3">
          <input type="email" inputMode="email" autoComplete="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} style={fieldStyle} />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="First name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={FIELD} style={fieldStyle} />
            <input placeholder="Last name" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={FIELD} style={fieldStyle} />
          </div>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} style={fieldStyle} />
        </div>
        {error && <p className="text-[14px] text-rose-600 mt-3">{error}</p>}
        <button disabled={busy} onClick={join} className="w-full mt-4 text-[16px] font-semibold px-6 py-3.5 rounded-xl text-white disabled:opacity-60 transition hover:opacity-95" style={{ backgroundColor: `var(--c-brand-strong, ${brand})` }}>
          {busy ? 'Redirecting to secure checkout…' : 'Join & set up payment'}
        </button>
        <p className="text-[12px] text-center mt-3" style={{ color: INK_MUTED }}>
          We only use this to set up your plan — never spam. Secure recurring payment by Stripe; cancel anytime.
        </p>
      </div>
    </div>
  )
}
