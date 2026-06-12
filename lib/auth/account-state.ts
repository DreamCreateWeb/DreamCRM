'use server'

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema/auth'
import { normalizeEmail } from '@/lib/contact-normalize'

/**
 * Account-state resolution for the accept / sign-in surfaces.
 *
 * One email = one better-auth user across ALL personas (platform / clinic
 * staff / patient / partner). Before an accept page (or any "create your
 * account" surface) renders, it must know which of three worlds the invite
 * email lives in, so it shows the RIGHT affordance instead of blindly
 * offering "create account" (which then fails "user already exists" for an
 * email that already has a user — the founder's Bug 2):
 *
 *   - 'none'      → no user account → create-account form.
 *   - 'password'  → user exists WITH a credential (account row,
 *                   provider_id = 'credential', non-null password) → they can
 *                   sign in with a password. Show sign-in-first.
 *   - 'magic-link'→ user exists but has NO credential row (e.g. a patient who
 *                   only ever used magic-link sign-in, or a partner/staff who
 *                   was provisioned without a password) → password sign-in
 *                   would dead-end. Show "email me a one-time link" instead.
 *
 * Determined off better-auth's `account` table: the credential provider stores
 * `provider_id = 'credential'` with the hashed password in `password`. A user
 * with at least one such row can sign in with a password.
 */
export type AccountState = 'none' | 'password' | 'magic-link'

export interface AccountStateResult {
  state: AccountState
  /** The matched user's id when one exists (else null). */
  userId: string | null
}

/**
 * Resolve the account state for an email. Never throws — any DB hiccup yields
 * a safe `{ state: 'none', userId: null }` so callers degrade to the
 * create-account path (which then surfaces a friendly "sign in instead" if a
 * user does in fact exist), rather than crashing the accept page.
 */
export async function resolveAccountState(rawEmail: string): Promise<AccountStateResult> {
  try {
    const email = normalizeEmail(rawEmail)
    if (!email) return { state: 'none', userId: null }

    const [u] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(sql`lower(${schema.user.email}) = ${email}`)
      .limit(1)
    if (!u) return { state: 'none', userId: null }

    // Does this user have a usable password credential? better-auth's
    // email/password provider writes provider_id = 'credential' with the hash
    // in `password`. A null/blank password (or no row) means password sign-in
    // would fail — route them to magic-link instead.
    const [cred] = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(
        sql`${schema.account.userId} = ${u.id} and ${schema.account.providerId} = 'credential' and ${schema.account.password} is not null and ${schema.account.password} <> ''`,
      )
      .limit(1)

    return { state: cred ? 'password' : 'magic-link', userId: u.id }
  } catch (err) {
    console.warn('[auth] resolveAccountState failed', err)
    return { state: 'none', userId: null }
  }
}
