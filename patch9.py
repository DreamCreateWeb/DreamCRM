import io

# ── N1: the plan-swap leg gets its own try and its own sentence ──────────────
p = 'app/(default)/settings/actions.ts'
s = io.open(p, encoding='utf-8').read()

old = """import { billingActionFailure, type BillingActionState } from '@/lib/services/billing-action-error'
"""
new = """import { billingActionFailure } from '@/lib/services/billing-action-error'
import { PLAN_CHANGE_UNCONFIRMED_MESSAGE, type BillingActionState } from '@/lib/types/billing-action'
"""
assert old in s
s = s.replace(old, new, 1)

old = """ * Note the shape of the try: it wraps the Stripe/DB leg ONLY, and every
 * `redirect()` sits outside it. A redirect inside the try would be caught as a
 * failure, and the clinic would be told checkout could not start while it in
 * fact could — the navigation simply never happening.
 */"""
new = """ * Note the shape of the trys: they wrap the Stripe/DB legs ONLY, and every
 * `redirect()` sits outside them. A redirect inside a try would be caught as a
 * failure, and the clinic would be told checkout could not start while it in
 * fact could — the navigation simply never happening.
 *
 * And note that there are TWO of them rather than one (Sentinel's N1 on #663),
 * because the two legs have different things to say about money. Opening a
 * Checkout session has charged nothing. The in-place swap has already called
 * `stripe.subscriptions.update(…, proration_behavior: 'create_prorations')` by
 * the time its sync-back can throw, so a clinic whose swap committed and whose
 * sync failed must not be told "nothing has been charged" — that is a false
 * statement about their money on the one path where money has actually moved.
 */"""
assert old in s
s = s.replace(old, new, 1)

old = """  let destination: string
  try {
    // A clinic that ALREADY has a live subscription changes plan in place
    // (price swap + proration) — Checkout would mint a SECOND subscription and
    // the old one would keep billing. Checkout is only for the first purchase.
    const changedInPlace = await updateSubscriptionPlan({
      organizationId: ctx.organizationId,
      planId,
      interval,
    })
    if (changedInPlace) {
      revalidatePath('/settings/billing')
      destination = '/settings/billing?checkout=success'
    } else {
      const session = await createCheckoutSession({
        organizationId: ctx.organizationId,
        email: ctx.userEmail,
        name: ctx.organizationName,
        planId,
        interval,
      })
      if (!session.url) {
        return { error: 'We couldn’t start checkout just now — please try again in a moment.' }
      }
      destination = session.url
    }
  } catch (err) {
    return billingActionFailure('settings.checkout', err)
  }
  redirect(destination)"""
new = """  // A clinic that ALREADY has a live subscription changes plan in place
  // (price swap + proration) — Checkout would mint a SECOND subscription and
  // the old one would keep billing. Checkout is only for the first purchase.
  let changedInPlace: boolean
  try {
    changedInPlace = await updateSubscriptionPlan({
      organizationId: ctx.organizationId,
      planId,
      interval,
    })
  } catch (err) {
    return billingActionFailure('settings.plan-swap', err, PLAN_CHANGE_UNCONFIRMED_MESSAGE)
  }
  if (changedInPlace) {
    revalidatePath('/settings/billing')
    redirect('/settings/billing?checkout=success')
  }

  let destination: string
  try {
    const session = await createCheckoutSession({
      organizationId: ctx.organizationId,
      email: ctx.userEmail,
      name: ctx.organizationName,
      planId,
      interval,
    })
    if (!session.url) {
      return { error: 'We couldn’t start checkout just now — please try again in a moment.' }
    }
    destination = session.url
  } catch (err) {
    return billingActionFailure('settings.checkout', err)
  }
  redirect(destination)"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('N1 ok')

# ── N2: the client call sites keep a catch for transport-level failures ──────
p = 'app/(default)/settings/billing/subscription-panel.tsx'
s = io.open(p, encoding='utf-8').read()

old = """    startTransition(async () => {
      // A RESOLVED result is always a failure — the success path redirects, so
      // this only lands when checkout refused. The old `catch (err) =>
      // err.message` rendered the production digest ("An error occurred in the
      // Server Components render") instead of the sentence (DREAMCRM-97).
      const r = await startStripeCheckout(planId, interval)
      if (r?.error) {
        setFeedback({ error: r.error })
        setPendingPlan(null)
      }
    })"""
new = """    startTransition(async () => {
      // A RESOLVED result is always a failure — the success path redirects, so
      // this only lands when checkout refused. The old `catch (err) =>
      // err.message` rendered the production digest ("An error occurred in the
      // Server Components render") instead of the sentence (DREAMCRM-97).
      //
      // The catch still earns its keep even though the action handles its own
      // Stripe/DB leg (Sentinel's N2 on #663): a transport-level failure —
      // offline, a 500, `requireTenant` throwing — rejects the promise, and an
      // unhandled rejection inside `startTransition` escalates instead of
      // showing anybody anything. It no longer renders `err.message`, which is
      // the digest; it says the written sentence.
      try {
        const r = await startStripeCheckout(planId, interval)
        if (r?.error) setFeedback({ error: r.error })
      } catch {
        setFeedback({ error: BILLING_UNAVAILABLE_MESSAGE })
      } finally {
        setPendingPlan(null)
      }
    })"""
assert old in s
s = s.replace(old, new, 1)

old = """    startTransition(async () => {
      const r = await openBillingPortal()
      if (r?.error) setFeedback({ error: r.error })
      setActiveAction(null)
    })"""
new = """    startTransition(async () => {
      try {
        const r = await openBillingPortal()
        if (r?.error) setFeedback({ error: r.error })
      } catch {
        setFeedback({ error: BILLING_UNAVAILABLE_MESSAGE })
      } finally {
        setActiveAction(null)
      }
    })"""
assert old in s
s = s.replace(old, new, 1)
assert "BILLING_UNAVAILABLE_MESSAGE" in s
# add the import beside the other action imports
old = """  startStripeCheckout,
"""
new = """  startStripeCheckout,
"""
assert old in s
marker = "} from '@/app/(default)/settings/actions'"
assert marker in s
s = s.replace(marker, marker + "\nimport { BILLING_UNAVAILABLE_MESSAGE } from '@/lib/types/billing-action'", 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('N2 panel ok')

p = 'components/ui/billing-dunning-banner.tsx'
s = io.open(p, encoding='utf-8').read()
old = """    startTransition(async () => {
      // openBillingPortal redirects on success and RETURNS its refusal on
      // failure (DREAMCRM-97). This banner deliberately swallows that refusal:
      // it is a one-line non-interactive strip with nowhere to put a sentence,
      // and the same button with the same message sits on Settings → Billing,
      // which is where the refusal is shown.
      await openBillingPortal()
    })"""
new = """    startTransition(async () => {
      // openBillingPortal redirects on success and RETURNS its refusal on
      // failure (DREAMCRM-97). This banner deliberately swallows that refusal:
      // it is a one-line non-interactive strip with nowhere to put a sentence,
      // and the same button with the same message sits on Settings → Billing,
      // which is where the refusal is shown.
      //
      // The catch is for the case the action cannot answer at all — offline, a
      // 500, `requireTenant` throwing. This strip renders on EVERY staff page
      // (dashboard-shell), so an unhandled rejection here escalates across the
      // whole app; a silent no-op was its shipped behaviour and stays it.
      try {
        await openBillingPortal()
      } catch {
        // Nothing to surface from a non-interactive banner.
      }
    })"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('N2 banner ok')

# ── N4: the stale docblock beside the platform-ops flip ──────────────────────
p = 'app/(default)/ecommerce/customers/admin-actions.ts'
s = io.open(p, encoding='utf-8').read()
old = """ * only, OFF by default. Flipping to two_way lets the sync queue push
 * DreamCRM bookings + cancellations into the practice's PMS; flipping back
 * to import stops all writes (queued ops simply wait). The bind pins
 * 'import', so nothing writes until a human deliberately throws this."""
new = """ * only, OFF by default. Flipping to two_way lets the sync queue push
 * DreamCRM bookings + cancellations into the practice's PMS. The bind pins
 * 'import', so nothing writes until a human deliberately throws this.
 *
 * FLIPPING BACK TO import DOES NOT MEAN "queued ops simply wait" — that
 * sentence was here and it was false (DREAMCRM-97). `syncPms` gates the
 * write-back flush on `syncDirection === 'two_way'` and that is its only call
 * site, so neither the hourly cron nor "Sync now" drains an import-only
 * connection: whatever is already queued is STRANDED until somebody flips it
 * back. The clinic-facing toggle (`setSyncDirection`,
 * `lib/services/pms/connection.ts`) now counts what the flip stranded and says
 * so; this ops-side flip writes the column directly and still says nothing.
 * Routing it through `setSyncDirection` is the obvious next step and was left
 * out of DREAMCRM-97's scope deliberately — different surface, its own
 * provider/status filters, and a human on both ends of an ops flip."""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('N4 ok')

# ── N5: the attempt-cap assertion stops matching `<=` ────────────────────────
p = 'tests/integrations/sync-direction-strand-warning.test.ts'
s = io.open(p, encoding='utf-8').read()
old = """    expect(sql).toMatch(/"attempts" </)"""
new = """    // `< $n`, not `<= $n`: the looser `/"attempts" </` this started as also
    // matched an `lt` → `lte` mutation, which silently re-includes the ops
    // sitting exactly AT the cap — the rows door 1 of the ledger entry is
    // about. Sentinel's N5 on #663.
    expect(sql).toMatch(/"attempts" < \\$/)"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('N5 ok')
