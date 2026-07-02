'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { redeemMyPointsAction } from '@/app/(portal)/patient/actions'
import { PortalCard, PORTAL_INK, PORTAL_MUTED } from '@/components/patient-portal/ui'

/**
 * The portal's rewards card: points balance + redeem-for-shop-discount when
 * the threshold is met. The reward is a single-use code bound to this
 * patient — shown once here and re-surfaced by email? No: it stays visible
 * in this card's success state and at checkout the code is theirs alone.
 */
export default function LoyaltyCard({
  brand,
  balance,
  redeemPoints,
  redeemValueCents,
  shopHref,
}: {
  brand: string
  balance: number
  redeemPoints: number
  redeemValueCents: number
  shopHref: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reward, setReward] = useState<{ code: string; valueCents: number } | null>(null)
  const [error, setError] = useState('')

  const money = (c: number) => `$${Math.round(c / 100)}`
  const canRedeem = balance >= redeemPoints

  function redeem() {
    setError('')
    startTransition(async () => {
      const r = await redeemMyPointsAction()
      if (r.ok) setReward({ code: r.couponCode, valueCents: r.valueCents })
      else setError(r.error)
    })
  }

  if (reward) {
    return (
      <PortalCard accent={brand}>
        <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
          🎉 {money(reward.valueCents)} off is yours
        </p>
        <p className="mt-1 text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
          Use this one-time code at checkout in our shop — it&rsquo;s tied to your account:
        </p>
        <p
          className="mt-3 inline-block rounded-xl border border-dashed px-4 py-2 font-mono text-[1.05rem] font-bold tracking-wider"
          style={{ borderColor: brand, color: PORTAL_INK }}
        >
          {reward.code}
        </p>
        {shopHref && (
          <a
            href={shopHref}
            className="mt-4 block w-fit rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            Browse the shop →
          </a>
        )}
      </PortalCard>
    )
  }

  return (
    <PortalCard>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
          💎 Your rewards
        </p>
        <p className="text-[1.3rem] font-bold tabular-nums" style={{ color: brand }}>
          {balance.toLocaleString()} <span className="text-[0.8rem] font-semibold">pts</span>
        </p>
      </div>
      <p className="mt-1 text-[0.9rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
        You earn points for keeping visits, sending friends our way, and paying online.
        {canRedeem
          ? ` You have enough for ${money(redeemValueCents)} off in our shop!`
          : ` At ${redeemPoints.toLocaleString()} points, you can trade them for ${money(redeemValueCents)} off in our shop.`}
      </p>
      {canRedeem && (
        <button
          type="button"
          onClick={redeem}
          disabled={pending}
          className="mt-4 rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          {pending ? 'One sec…' : `Redeem ${redeemPoints.toLocaleString()} pts → ${money(redeemValueCents)} off`}
        </button>
      )}
      {error && <p className="mt-2 text-[0.85rem] text-rose-600">{error}</p>}
    </PortalCard>
  )
}
