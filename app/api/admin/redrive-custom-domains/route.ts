import { NextResponse } from 'next/server'
import { eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import {
  checkCustomDomainStatus,
  requestCustomDomain,
  type CustomDomainStatus,
} from '@/lib/services/custom-domain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// One-shot re-drive of clinic custom-domain statuses onto the CURRENT driver
// (the CloudFront tenant edge, 2026-07-23). For each clinic with a
// websiteDomain whose stored status isn't already CloudFront-driven, re-run
// requestCustomDomain: with CUSTOM_DOMAIN_DRIVER=cloudfront that creates (or
// recovers) the distribution tenant and re-stamps the stored status + DNS
// records. Idempotent — already-migrated rows are skipped, and
// requestCustomDomain itself treats an existing tenant as success. Used by
// the operator during edge migrations (docs/custom-domains.md); guarded by
// CRON_SECRET like the other admin one-shots.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const rows = await db
      .select({
        organizationId: clinicProfile.organizationId,
        domain: clinicProfile.websiteDomain,
        status: clinicProfile.customDomainStatus,
        type: organization.type,
      })
      .from(clinicProfile)
      .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
      .where(isNotNull(clinicProfile.websiteDomain))

    const results: Array<{ organizationId: string; domain: string; action: string }> = []
    for (const r of rows) {
      if (r.type !== 'clinic' || !r.domain) continue
      const stored = r.status as CustomDomainStatus | null
      if (stored?.driver === 'cloudfront') {
        // Already on the new driver — reconcile against the live tenant
        // (attaches an issued cert, nudges activation, clears a stale
        // manual flag) instead of re-requesting.
        const check = await checkCustomDomainStatus(r.organizationId)
        results.push({
          organizationId: r.organizationId,
          domain: r.domain,
          action: check.ok ? `checked:${check.status.state}${check.status.error ? `:${check.status.error}` : ''}` : `check-error:${check.error}`,
        })
        continue
      }
      const res = await requestCustomDomain(r.organizationId, r.domain)
      results.push({
        organizationId: r.organizationId,
        domain: r.domain,
        action: res.ok ? `redriven:${res.status.driver ?? 'apprunner'}${res.status.error ? `:${res.status.error}` : ''}` : `error:${res.error}`,
      })
    }
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
