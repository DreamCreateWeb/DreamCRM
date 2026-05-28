'use client'

import { useEffect, useState, useTransition } from 'react'
import { formatCents, type CartLine } from '@/lib/types/shop'
import { getCart, setQty, removeLine } from './cart-store'
import { startCheckout, applyCoupon } from './actions'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

export default function CartView({
  slug,
  brand,
  basePath,
  pickupEnabled,
  shippingEnabled,
}: {
  slug: string
  brand: string
  basePath: string
  pickupEnabled: boolean
  shippingEnabled: boolean
}) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [ready, setReady] = useState(false)
  const [fulfillment, setFulfillment] = useState<'pickup' | 'ship'>(pickupEnabled ? 'pickup' : 'ship')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [discountCents, setDiscountCents] = useState(0)
  const [couponMsg, setCouponMsg] = useState<string | null>(null)
  const [applyingCoupon, startCoupon] = useTransition()

  useEffect(() => {
    const refresh = () => setLines(getCart(slug))
    refresh()
    setReady(true)
    window.addEventListener('cart-updated', refresh)
    return () => window.removeEventListener('cart-updated', refresh)
  }, [slug])

  const subtotal = lines.reduce((s, l) => s + l.priceCents * l.qty, 0)

  if (!ready) return null
  if (lines.length === 0) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold" style={{ color: INK }}>Your cart is empty</h1>
        <a href={`${basePath}/shop`} className="inline-block mt-4 text-[15px] font-semibold underline" style={{ color: brand }}>
          Browse products →
        </a>
      </div>
    )
  }

  function checkout() {
    setError(null)
    if (!email.trim()) return setError('Please enter your email.')
    setBusy(true)
    startCheckout(slug, {
      items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      fulfillmentType: fulfillment,
      email: email.trim(),
      name: name.trim() || null,
      phone: phone.trim() || null,
      couponCode: discountCents > 0 ? code.trim() : null,
    })
      .then(({ url }) => {
        window.location.href = url
      })
      .catch((err) => {
        setError((err as Error).message)
        setBusy(false)
      })
  }

  const FIELD = 'w-full text-[15px] px-3.5 py-2.5 rounded-xl border bg-white'

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-[-0.02em] mb-6" style={{ color: INK }}>Your cart</h1>

      <div className="space-y-3 mb-6">
        {lines.map((l) => (
          <div key={l.variantId} className="flex items-center gap-4 rounded-xl border p-3" style={{ borderColor: BORDER }}>
            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: `${brand}1A` }}>
              {l.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={l.image} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate" style={{ color: INK }}>{l.productName}</p>
              {l.variantName !== 'Default' && <p className="text-[13px]" style={{ color: INK_MUTED }}>{l.variantName}</p>}
              <p className="text-[14px]" style={{ color: INK }}>{formatCents(l.priceCents)}</p>
            </div>
            <input
              type="number"
              min={1}
              max={99}
              value={l.qty}
              onChange={(e) => setQty(slug, l.variantId, parseInt(e.target.value) || 1)}
              className="w-14 text-[15px] px-2 py-1.5 rounded-lg border bg-white"
              style={{ borderColor: BORDER }}
            />
            <button onClick={() => removeLine(slug, l.variantId)} className="text-stone-400 hover:text-rose-600 text-lg leading-none">×</button>
          </div>
        ))}
      </div>

      {/* Promo code */}
      <div className="flex gap-2 mb-4">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); setCouponMsg(null) }}
          placeholder="Promo code"
          className="flex-1 text-[14px] px-3 py-2 rounded-lg border bg-white uppercase"
          style={{ borderColor: BORDER }}
        />
        <button
          disabled={applyingCoupon || !code.trim()}
          onClick={() => {
            setCouponMsg(null)
            startCoupon(async () => {
              const res = await applyCoupon(slug, code.trim(), subtotal)
              if (res.ok) {
                setDiscountCents(res.discountCents ?? 0)
                setCouponMsg(`Applied — ${formatCents(res.discountCents ?? 0)} off`)
              } else {
                setDiscountCents(0)
                setCouponMsg(res.error ?? 'Invalid code')
              }
            })
          }}
          className="text-[14px] font-semibold px-4 py-2 rounded-lg border"
          style={{ borderColor: BORDER, color: INK }}
        >
          {applyingCoupon ? '…' : 'Apply'}
        </button>
      </div>
      {couponMsg && <p className="text-[13px] mb-3" style={{ color: discountCents > 0 ? '#15803d' : '#dc2626' }}>{couponMsg}</p>}

      <div className="text-[15px] mb-6 pb-6 border-b space-y-1" style={{ borderColor: BORDER, color: INK }}>
        <div className="flex items-center justify-between"><span>Subtotal</span><span>{formatCents(subtotal)}</span></div>
        {discountCents > 0 && (
          <div className="flex items-center justify-between" style={{ color: '#15803d' }}><span>Discount</span><span>−{formatCents(discountCents)}</span></div>
        )}
        <div className="flex items-center justify-between font-bold pt-1"><span>{fulfillment === 'ship' ? 'Total before shipping/tax' : 'Total'}</span><span>{formatCents(Math.max(subtotal - discountCents, 0))}</span></div>
      </div>

      {/* Fulfillment */}
      {pickupEnabled && shippingEnabled && (
        <div className="flex gap-2 mb-5">
          {(['pickup', 'ship'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFulfillment(f)}
              className="flex-1 text-[14px] font-medium px-4 py-2.5 rounded-xl border"
              style={fulfillment === f ? { backgroundColor: brand, color: '#fff', borderColor: brand } : { borderColor: BORDER, color: INK_MUTED }}
            >
              {f === 'pickup' ? 'Pick up at the office' : 'Ship to me'}
            </button>
          ))}
        </div>
      )}
      {fulfillment === 'ship' && (
        <p className="text-[13px] mb-4" style={{ color: INK_MUTED }}>Shipping + any tax are calculated at checkout. You&apos;ll enter your address on the next screen.</p>
      )}
      {fulfillment === 'pickup' && (
        <p className="text-[13px] mb-4" style={{ color: INK_MUTED }}>We&apos;ll have your order ready to grab at your next visit.</p>
      )}

      {/* Contact */}
      <div className="space-y-3 mb-5">
        <input type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} style={{ borderColor: BORDER }} />
        <div className="grid sm:grid-cols-2 gap-3">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} style={{ borderColor: BORDER }} />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} style={{ borderColor: BORDER }} />
        </div>
      </div>

      {error && <p className="text-[14px] text-rose-600 mb-3">{error}</p>}

      <button
        disabled={busy}
        onClick={checkout}
        className="w-full text-[16px] font-semibold px-6 py-3.5 rounded-xl text-white disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {busy ? 'Redirecting to secure checkout…' : 'Check out'}
      </button>
      <p className="text-[12px] text-center mt-3" style={{ color: INK_MUTED }}>Secure payment by Stripe.</p>
    </div>
  )
}
