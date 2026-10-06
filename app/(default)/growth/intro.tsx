import { count, eq } from 'drizzle-orm'
import { getTenantContext } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { getRecallStats } from '@/lib/services/recall-stats'
import { getZernioConnection } from '@/lib/services/zernio'
import GrowthIntroCard from './growth-intro-card'

/**
 * THE GROWTH DOOR (docs/ACTIVATION.md S5). The recall engine is the door:
 * the card shows what it does and what to know, then THE FACTS the engine
 * needs with a door for each — patients loaded, Google connected, and
 * the live "N due and reachable" the first invitation would go to — and
 * one button. Nothing is required to turn it on; the facts say what the
 * first win needs. Best-effort reads: an unreadable fact reads as unknown.
 */
export default async function GrowthIntro() {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') return null
  const [[{ n: patientCount } = { n: 0 }], zernio, recall] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, ctx.organizationId))
      .catch(() => [{ n: 0 }]),
    getZernioConnection(ctx.organizationId).catch(() => null),
    getRecallStats(ctx.organizationId).catch(() => null),
  ])
  const gbp = zernio?.status === 'connected' ? (zernio.googleBusinessAccounts[0] ?? null) : null
  return (
    <GrowthIntroCard
      orgName={ctx.organizationName}
      canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      patientCount={Number(patientCount)}
      google={gbp ? { name: gbp.displayName || gbp.username || 'your listing' } : null}
      dueReachable={recall ? recall.recallDueReachableCount : null}
      marketable={recall ? recall.marketableCount : null}
    />
  )
}
