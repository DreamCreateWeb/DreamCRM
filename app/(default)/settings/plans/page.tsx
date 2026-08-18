import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Settings → Plan and Settings → Billing were merged into one subscription
 * surface (the audit's "two pages, same job" split). This route redirects to
 * /settings/billing so every existing `/settings/plans` link (sidebars, old
 * emails, bookmarks) keeps working. The old `?upgrade=<module>` passthrough is
 * gone with requirePlan itself (the NO-PLAN-GATING convention) — there is no
 * upgrade prompt to land on anymore.
 */
export default function PlansSettings() {
  redirect('/settings/billing')
}
