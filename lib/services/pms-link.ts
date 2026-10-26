import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { describePmsConnectStatus, pmsVendorLabel } from '@/lib/pms-connect'
import type { PmsLink } from '@/lib/pms-link'

/**
 * THE ONE READ behind lib/pms-link.ts — shared by the Overview, My Day, the
 * agenda, the Payments hub and Collections, so "is a PMS feeding us" can
 * never be answered two ways on two pages.
 *
 * Connected = a `pms_connection` row that is not `not_connected` (the same
 * line lib/services/pms/health.ts draws — sync health is a separate
 * question). Pending = a `pms_connect_request` still on Dream Create
 * (`requested` / `scheduled`, S4). Best-effort: a failed read answers
 * `none`, the readiness resolver's posture (grade as if nothing is bound
 * rather than invent a connection) — the callers only ever swap an
 * all-clear sentence for "balances come from your practice software",
 * never a number.
 */
export async function getPmsLink(organizationId: string): Promise<PmsLink> {
  try {
    const [conn] = await db
      .select({ status: schema.pmsConnection.status })
      .from(schema.pmsConnection)
      .where(eq(schema.pmsConnection.organizationId, organizationId))
      .limit(1)
    if (conn && conn.status !== 'not_connected') return { kind: 'connected' }

    const [req] = await db
      .select({
        status: schema.pmsConnectRequest.status,
        vendor: schema.pmsConnectRequest.vendor,
        vendorName: schema.pmsConnectRequest.vendorName,
      })
      .from(schema.pmsConnectRequest)
      .where(eq(schema.pmsConnectRequest.organizationId, organizationId))
      .limit(1)
    if (req && (req.status === 'requested' || req.status === 'scheduled')) {
      const vendorLabel = pmsVendorLabel(req.vendor, req.vendorName)
      const described = describePmsConnectStatus(req.status, vendorLabel)
      return { kind: 'pending', vendorLabel, pill: described.pill, sentence: described.sentence }
    }
    return { kind: 'none' }
  } catch {
    return { kind: 'none' }
  }
}
