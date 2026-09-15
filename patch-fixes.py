# -*- coding: utf-8 -*-
import io

# ---- BLOCKING 1: register the new tree-wide guard on the intake list ----
p = 'scripts/review-gate.mjs'
s = io.open(p, encoding='utf-8').read()
OLD = u"""      'tests/clinic-site/jsonld-escaping.test.ts',"""
NEW = u"""      // A NEW CLASS rather than another instance of an existing one: it holds
      // the product at zero for a DORMANT TABLE in BOTH directions, and the
      // read half is the novel part — every other scanner here bans a way of
      // writing something, this one also bans reading `billing_profiles`,
      // because a read is what would give the rows the retired Plans UI left
      // behind a meaning they never had.
      'tests/billing/no-billing-profiles-write.test.ts',
      'tests/clinic-site/jsonld-escaping.test.ts',"""
assert OLD in s, 'intake list'
s = s.replace(OLD, NEW, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)

# ---- NOTE 1: the stale sibling comment on the balance path ----
p = 'lib/services/balance-payments.ts'
s = io.open(p, encoding='utf-8').read()
OLD = u""" * DELIBERATELY NARROWER than `discardUnstartedOrder`'s
 * (`lib/services/shop-checkout.ts`), which also demands
 * `stripe_checkout_session_id IS NULL`. That extra predicate stops the shop
 * from cleaning up its own `!session.url` path — the id was stamped one line
 * earlier, so the delete matches nothing and the phantom order survives.
 * There is no coupon reservation keyed off this row, so nothing here needs
 * to distinguish \"never written\" from \"deleted\", and the narrower scope
 * closes that case instead of reproducing it."""
NEW = u""" * THE SHOP NOW MATCHES THIS, and the paragraph that used to explain the
 * difference is retired with it. This path was deliberately built without
 * `stripe_checkout_session_id IS NULL` (DREAMCRM-20) because that predicate
 * stops a cleanup reaching its own `!session.url` case — the id is stamped one
 * line before the throw, so the delete matches nothing and the phantom row
 * survives. `discardUnstartedOrder` carried it and was stranded by it exactly
 * that way; DREAMCRM-58 dropped it there too. Both money paths now scope the
 * same: org + this exact row + `status='pending'`, leaning on \"no URL was ever
 * handed out\" for the rest. Read that function's doc comment for the fuller
 * argument — it has a coupon reservation to re-earn and this path does not."""
assert OLD in s, 'balance comment'
s = s.replace(OLD, NEW)
io.open(p, 'w', encoding='utf-8', newline='').write(s)

# ---- NOTE 3: name the residual in the shop doc comment ----
p = 'lib/services/shop-checkout.ts'
s = io.open(p, encoding='utf-8').read()
OLD = u""" * survives. Same choice, same reason, as
 * `discardUnstartedBalancePayment` (DREAMCRM-20)."""
NEW = u""" * survives. Same choice, same reason, as
 * `discardUnstartedBalancePayment` (DREAMCRM-20).
 *
 * Name what retiring that phrase costs, since it was gesturing at something
 * real: on the `!session.url` path we now delete a row whose session id IS
 * stamped, so a session that somehow got paid would leave
 * `finalizeOrderFromSession` finding no order and returning null — money on
 * the clinic's connected account with nothing behind it. That needs a payable
 * session nobody can reach, because the URL never leaves this function. A
 * guaranteed phantom order on every no-URL checkout is the worse trade than an
 * orphan that requires an impossible precondition, and it is the trade this
 * takes deliberately."""
assert OLD in s, 'shop doc'
s = s.replace(OLD, NEW)
io.open(p, 'w', encoding='utf-8', newline='').write(s)

# ---- NOTE 2: the vacuous assertion ----
p = 'tests/shop/checkout-stripe-outage.test.ts'
s = io.open(p, encoding='utf-8').read()
OLD = u"""    // The claim, the id-stamp, then the release.
    expect(eqCalls.some((c) => c.col === 'usedOrderId')).toBe(true)
    expect(isNullCols).toContain('usedAt')
  })"""
NEW = u"""    // `eq(usedOrderId, …)` appears ONLY in releaseSingleUseCoupon, so it is
    // the line that bites. (An `isNull(usedAt)` assertion would not: the
    // claim on this same test's happy path already satisfies it, so it would
    // pass with the release never reached.)
    expect(eqCalls.some((c) => c.col === 'usedOrderId' && c.val === orderIdOf(state.deleteWheres[0]))).toBe(
      true,
    )
  })"""
assert OLD in s, 'vacuous assertion'
s = s.replace(OLD, NEW)

HELPER = u"""/** Every condition the cleanup DELETE was scoped by, flattened. */"""
NEW_HELPER = u"""/** The order id the cleanup DELETE was scoped to — what the release must name. */
function orderIdOf(clause: unknown): unknown {
  return deleteConditions(clause).find((c) => c.col === 'id')?.val
}

/** Every condition the cleanup DELETE was scoped by, flattened. */"""
assert HELPER in s
s = s.replace(HELPER, NEW_HELPER, 1)

# `deleteConditions` reads every captured WHERE; let it take one when asked.
OLD_FN = u"""function deleteConditions(): Array<{ col: unknown; val: unknown }> {
  const out: Array<{ col: unknown; val: unknown }> = []
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o._kind === 'eq') out.push({ col: o.col, val: o.val })
    if (Array.isArray(o.conds)) o.conds.forEach(walk)
  }
  state.deleteWheres.forEach(walk)
  return out
}"""
NEW_FN = u"""function deleteConditions(only?: unknown): Array<{ col: unknown; val: unknown }> {
  const out: Array<{ col: unknown; val: unknown }> = []
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o._kind === 'eq') out.push({ col: o.col, val: o.val })
    if (Array.isArray(o.conds)) o.conds.forEach(walk)
  }
  if (only === undefined) state.deleteWheres.forEach(walk)
  else walk(only)
  return out
}"""
assert OLD_FN in s
s = s.replace(OLD_FN, NEW_FN)

# The balance-payment test's comment about the shop is now one revision behind.
OLD_BP = u"""    // the throw. discardUnstartedOrder dropped it too (DREAMCRM-58), so the
    // rule is now the same on both: scope by org + this exact row + pending,
    // and lean on \"no URL was ever handed out\" for the rest."""
NEW_BP = u"""    // the throw. discardUnstartedOrder dropped it too (DREAMCRM-58), so the
    // rule is now the same on both: scope by org + this exact row + pending,
    // and lean on \"no URL was ever handed out\" for the rest. The source
    // comments on both functions say so; this asserts it of the code."""
assert OLD_BP in s
s = s.replace(OLD_BP, NEW_BP)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
