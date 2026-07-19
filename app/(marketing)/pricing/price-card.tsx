'use client'

import { useState } from 'react'
import Link from 'next/link'

/**
 * The single-plan price card with a monthly/annual toggle.
 *
 * Framing rules (owner-set, 2026-07-19): ONE plan, everything included.
 * The list price ($500/mo) shows struck through next to the founding rate
 * ($200/mo). Never the word "beta" — the platform is finished software
 * that keeps growing, and the copy must read that way ("every module is
 * live today; new ones land on the same rate").
 */
const LIST_MONTHLY = 500
const RATE_MONTHLY = 200
const LIST_ANNUAL = 5000
const RATE_ANNUAL = 2000 // 2 months free — the long-standing convention

export function PriceCard() {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const monthly = interval === 'monthly'
  const list = monthly ? LIST_MONTHLY : LIST_ANNUAL
  const rate = monthly ? RATE_MONTHLY : RATE_ANNUAL

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-teal-200 bg-white p-8 text-center shadow-[0_2px_6px_rgba(76,125,240,0.06),0_18px_44px_rgba(76,125,240,0.14)]">
      <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1" role="group" aria-label="Billing interval">
        <button
          type="button"
          onClick={() => setInterval('monthly')}
          aria-pressed={monthly}
          className={`rounded-full px-4 py-1.5 text-[0.85rem] font-semibold transition ${
            monthly ? 'bg-teal-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval('annual')}
          aria-pressed={!monthly}
          className={`rounded-full px-4 py-1.5 text-[0.85rem] font-semibold transition ${
            !monthly ? 'bg-teal-500 text-white shadow' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Annual <span className={!monthly ? 'text-teal-100' : 'text-teal-700'}>· 2 months free</span>
        </button>
      </div>

      <p className="mt-6 text-[0.8rem] font-bold uppercase tracking-wider text-teal-700">
        Founding practice rate
      </p>
      <p className="mt-2 flex items-baseline justify-center gap-3">
        <span className="text-[1.4rem] font-semibold text-gray-400 line-through decoration-2" aria-label={`Regular price $${list.toLocaleString('en-US')} per ${monthly ? 'month' : 'year'}`}>
          ${list.toLocaleString('en-US')}
        </span>
        <span className="text-[3.2rem] font-extrabold tracking-tight text-gray-950">
          ${rate.toLocaleString('en-US')}
        </span>
        <span className="text-[1rem] font-medium text-gray-500">/{monthly ? 'mo' : 'yr'}</span>
      </p>
      <p className="mt-1 text-[0.9rem] text-gray-600">
        Every module included. Your rate stays locked for as long as you&apos;re with us.
      </p>
      <p className="mt-1 text-[0.8rem] text-gray-500">
        Month-to-month, no contract, no setup fee.{' '}
        {monthly ? 'Prefer annual? Two months free.' : `That's $${Math.round(RATE_ANNUAL / 12)}/mo, billed yearly.`}
      </p>
      <Link
        href="/signup"
        className="mt-6 inline-block rounded-full bg-teal-500 px-8 py-3 text-[0.95rem] font-bold text-white shadow-[0_8px_20px_rgba(76,125,240,0.35)] transition hover:bg-teal-600"
      >
        Start your 7-day free trial
      </Link>
      <p className="mt-2 text-[0.78rem] text-gray-500">No card required to start.</p>
    </div>
  )
}
