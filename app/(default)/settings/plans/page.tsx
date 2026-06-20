import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Settings → Plan and Settings → Billing were merged into one subscription
 * surface (the audit's "two pages, same job" split). This route now redirects
 * to /settings/billing, preserving `?upgrade=<module>` so requirePlan's
 * higher-tier prompt still lands on the plan grid. Kept as a redirect so every
 * existing `/settings/plans` link (sidebars, integrations CTAs) keeps working.
 */
export default async function PlansSettings({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string }>
}) {
  const { upgrade } = await searchParams
  redirect(upgrade ? `/settings/billing?upgrade=${encodeURIComponent(upgrade)}` : '/settings/billing')
}
