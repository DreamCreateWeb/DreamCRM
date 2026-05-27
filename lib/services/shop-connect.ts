import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'

/**
 * Stripe Connect (Standard) onboarding for the Shop. Each CLINIC connects its
 * OWN Stripe account via OAuth (mirrors the Gmail/GSC code-exchange pattern),
 * so shop revenue is paid out to the clinic's bank — the platform only
 * facilitates and can take an optional application fee at checkout.
 */

const OAUTH_AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize'

export function shopConnectConfigured(): boolean {
  return Boolean(process.env.STRIPE_CONNECT_CLIENT_ID)
}

export function getConnectAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? '',
    scope: 'read_write',
    redirect_uri: redirectUri,
    state,
    'stripe_user[business_type]': 'company',
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

/** Exchange the OAuth code for the connected account id. */
export async function exchangeConnectCode(code: string): Promise<string> {
  const res = await stripe.oauth.token({ grant_type: 'authorization_code', code })
  const accountId = res.stripe_user_id
  if (!accountId) throw new Error('Stripe did not return a connected account id')
  return accountId
}

/** Persist (or refresh) the connected account + its capability status. */
export async function saveConnectedAccount(organizationId: string, accountId: string): Promise<void> {
  const acct = await stripe.accounts.retrieve(accountId)
  const charges = acct.charges_enabled ?? false
  const payouts = acct.payouts_enabled ?? false
  const status = charges ? 'active' : 'pending'
  await db
    .insert(schema.shopConfig)
    .values({
      organizationId,
      stripeAccountId: accountId,
      stripeAccountStatus: status,
      chargesEnabled: charges ? 1 : 0,
      payoutsEnabled: payouts ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: schema.shopConfig.organizationId,
      set: {
        stripeAccountId: accountId,
        stripeAccountStatus: status,
        chargesEnabled: charges ? 1 : 0,
        payoutsEnabled: payouts ? 1 : 0,
        updatedAt: new Date(),
      },
    })
}

/** Re-pull capability status from Stripe (e.g. when the /shop page loads), so
 * a clinic that finished onboarding flips from 'pending' to 'active' without a
 * manual reconnect. No-op when not connected. */
export async function refreshConnectStatus(organizationId: string): Promise<void> {
  const [row] = await db
    .select({ accountId: schema.shopConfig.stripeAccountId, status: schema.shopConfig.stripeAccountStatus })
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  if (!row?.accountId || row.status === 'active') return
  try {
    await saveConnectedAccount(organizationId, row.accountId)
  } catch {
    // Stripe unreachable / account deauthorized — leave status as-is.
  }
}

export async function disconnectShopStripe(organizationId: string): Promise<void> {
  const [row] = await db
    .select({ accountId: schema.shopConfig.stripeAccountId })
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  if (row?.accountId && process.env.STRIPE_CONNECT_CLIENT_ID) {
    try {
      await stripe.oauth.deauthorize({ client_id: process.env.STRIPE_CONNECT_CLIENT_ID, stripe_user_id: row.accountId })
    } catch {
      // Already deauthorized or unreachable — clear our side regardless.
    }
  }
  await db
    .update(schema.shopConfig)
    .set({ stripeAccountId: null, stripeAccountStatus: 'none', chargesEnabled: 0, payoutsEnabled: 0, updatedAt: new Date() })
    .where(eq(schema.shopConfig.organizationId, organizationId))
}
