/**
 * Where the Stripe Connect callback lands the clinic (docs/ACTIVATION.md
 * S5): the door that sent them. An allowlist — the value rides the OAuth
 * state, which the nonce cookie authenticates but anyone can shape — so
 * an unknown value falls back to the shop, where the flow has always
 * returned. Client-safe and pure: the routes and the Payments door both
 * read it, and the service module stays server-only.
 */
export const CONNECT_BACK_PATHS = { shop: '/shop', payments: '/payments', integrations: '/integrations' } as const
export type ConnectBack = keyof typeof CONNECT_BACK_PATHS

export function resolveConnectBack(raw: unknown): ConnectBack {
  // `Object.hasOwn`, not `in`: an inherited name ('constructor') must not pass an allowlist.
  return typeof raw === 'string' && Object.hasOwn(CONNECT_BACK_PATHS, raw) ? (raw as ConnectBack) : 'shop'
}
