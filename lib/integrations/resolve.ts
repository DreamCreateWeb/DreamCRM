/**
 * Runtime status RESOLVER — maps the PURE catalog (`catalog.ts`) onto the live
 * org connection state to produce a per-integration runtime status. Client-safe
 * + a pure function, so it's unit-testable and the catalog stays free of any
 * live state.
 *
 * The page assembles a small `LiveIntegrationState` from what it already loads
 * (PMS dashboard, Zernio connection, the social cap, Gmail/Stripe Connect
 * status) and hands it here; the resolver returns a `ResolvedIntegration` per
 * def carrying the status + the connected account's handle (when any). The card
 * renders from `{ def, runtime }` — it never re-derives status.
 *
 * Adding the 500th integration doesn't touch this file UNLESS it introduces a
 * new `connectKind` — the existing kinds (`zernio`/`pms`/`oauth`/`external_link`/
 * `none`) cover today's catalog and the resolver degrades safely for unknown
 * state (an undefined connect map entry → "available").
 */

import type { IntegrationDef } from './catalog'
import { INTEGRATIONS_CATALOG } from './catalog'

/**
 * The live connection state the page assembles for the resolver. Deliberately
 * minimal + serializable — each field is something the page already loads.
 */
export interface LiveIntegrationState {
  /** Whether the clinic's plan includes the Premium PMS integration. */
  pmsEligible: boolean
  /** Whether Zernio is enabled on this DreamCRM instance. */
  zernioConfigured: boolean
  /** Per-integration-id live connection facts. Absent id = not connected. */
  connections: Record<string, IntegrationConnectionFact | undefined>
  /** Social-connection cap (from `canConnectSocialPlatform`). */
  socialCap: { allowed: boolean; limit: number; current: number }
}

/** A single integration's live connection facts (only the connected/errored
 *  ones need an entry; everything else is implicitly not-connected). */
export interface IntegrationConnectionFact {
  /** True when this integration is actively connected. */
  connected: boolean
  /** True when the connection is in an error/needs-attention state. */
  errored?: boolean
  /** Display handle for the connected card (e.g. "@dreamdental"). */
  handle?: string | null
  /** Display title for the connected card (e.g. "Dream Dental"). */
  title?: string | null
  /** True when this is the demo/sandbox connection (no-network). */
  isDemo?: boolean
}

/**
 * The runtime status of an integration for the current clinic:
 *   - `connected`      — actively connected (card shows handle + manage/disconnect).
 *   - `needs_attention`— connected but errored (card shows the urgent pill).
 *   - `available`      — connectable now (card shows the connect affordance).
 *   - `at_cap`         — connectable but the social cap is full (card shows the
 *                        upgrade/add-on CTA instead of connect).
 *   - `premium_locked` — gated behind a plan the clinic doesn't have.
 *   - `request_access` — needs vendor/partner approval (labelled tile).
 *   - `coming_soon`    — genuinely planned, not yet connectable (labelled tile).
 *   - `unavailable`    — connectable kind but the instance isn't configured
 *                        (e.g. Zernio off) — a calm "not enabled" state.
 */
export type IntegrationRuntimeStatus =
  | 'connected'
  | 'needs_attention'
  | 'available'
  | 'at_cap'
  | 'premium_locked'
  | 'request_access'
  | 'coming_soon'
  | 'unavailable'

export interface IntegrationRuntime {
  status: IntegrationRuntimeStatus
  /** True when actively connected (connected or needs_attention). */
  connected: boolean
  /** Connected handle, when any. */
  handle: string | null
  /** Connected title, when any. */
  title: string | null
  /** True when the connection is the demo/sandbox one. */
  isDemo: boolean
}

export interface ResolvedIntegration {
  def: IntegrationDef
  runtime: IntegrationRuntime
}

/** Plan ordering for the minPlan gate. */
const PLAN_RANK: Record<string, number> = { basic: 0, pro: 1, premium: 2 }

/** Whether `plan` meets `min` (e.g. premium meets a 'premium' minPlan). */
function planMeets(plan: string, min: string): boolean {
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[min] ?? 0)
}

/**
 * Resolve a single def against the live state. Pure + deterministic. The
 * precedence is deliberate:
 *   1. CONNECTED state always wins (connected / needs_attention) — even for a
 *      premium-gated integration, we never hide a live connection.
 *   2. else availability lifecycle: coming_soon / request_access short-circuit.
 *   3. else plan gate (premium_locked).
 *   4. else connectability: unavailable (instance not configured) → at_cap
 *      (social cap full) → available.
 */
export function resolveIntegration(
  def: IntegrationDef,
  state: LiveIntegrationState,
  planTier: string,
): ResolvedIntegration {
  const fact = state.connections[def.id]
  const connected = !!fact?.connected
  const handle = fact?.handle ?? null
  const title = fact?.title ?? null
  const isDemo = !!fact?.isDemo

  const base = { handle, title, isDemo }

  // 1. A live connection always wins.
  if (connected) {
    return {
      def,
      runtime: { status: fact?.errored ? 'needs_attention' : 'connected', connected: true, ...base },
    }
  }

  // 1b. Not connected but in an error state (e.g. a GBP connection that
  //     dropped, or a restricted Stripe account) — surface needs_attention so
  //     the clinic sees the problem on the browse card, but it's NOT "connected"
  //     (it stays in the browse grid with a re-connect affordance).
  if (fact?.errored) {
    return { def, runtime: { status: 'needs_attention', connected: false, ...base } }
  }

  // 2. Lifecycle states that aren't connectable.
  if (def.availability === 'coming_soon') {
    return { def, runtime: { status: 'coming_soon', connected: false, ...base } }
  }
  if (def.availability === 'request_access') {
    return { def, runtime: { status: 'request_access', connected: false, ...base } }
  }

  // 3. Plan gate (e.g. Open Dental on Premium). PMS-kind uses pmsEligible; a
  //    generic minPlan uses the plan rank.
  if (def.connectKind === 'pms') {
    if (!state.pmsEligible) {
      return { def, runtime: { status: 'premium_locked', connected: false, ...base } }
    }
  } else if (def.minPlan && !planMeets(planTier, def.minPlan)) {
    return { def, runtime: { status: 'premium_locked', connected: false, ...base } }
  }

  // 4. Connectability.
  //    Zernio-kind integrations need the instance configured.
  if (def.connectKind === 'zernio' && !state.zernioConfigured) {
    return { def, runtime: { status: 'unavailable', connected: false, ...base } }
  }
  //    A social-cap integration is blocked when the cap is full.
  if (def.countsTowardSocialCap && !state.socialCap.allowed) {
    return { def, runtime: { status: 'at_cap', connected: false, ...base } }
  }

  return { def, runtime: { status: 'available', connected: false, ...base } }
}

/** Resolve the whole catalog against the live state. */
export function resolveCatalog(
  state: LiveIntegrationState,
  planTier: string,
  defs: readonly IntegrationDef[] = INTEGRATIONS_CATALOG,
): ResolvedIntegration[] {
  return defs.map((def) => resolveIntegration(def, state, planTier))
}

/** Count of actively-connected integrations across the resolved catalog. */
export function connectedCount(resolved: readonly ResolvedIntegration[]): number {
  return resolved.filter((r) => r.runtime.connected).length
}
