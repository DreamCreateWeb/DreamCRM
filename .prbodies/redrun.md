**DO NOT MERGE. THROWAWAY.** This PR exists only to make the `e2e` job run
against a deliberately broken tree, and will be closed and its branch deleted
as soon as the run reports.

It is the red run for the two tripwire assertions in #577
(`e2e/stripe-webhook-backstop.spec.ts`). The repo's rule is that a test counts
only once you have watched it fail against the real defect, in the shape it
actually had — and the browser harness needs Linux + Postgres, so this is where
that happens.

The defect reintroduced, in `lib/services/balance-payments.ts`: the balance
finalizer's lookup loses the `organization_id` half of its filter **and** the
`status === 'paid'` short-circuit — the two regressions the spec's `toBe(200)`
lines are aimed at.

Expected: `e2e` red, naming
- *a redelivery for a payment already paid changes nothing the patient sees*
- *an event naming one clinic cannot reach another clinic's payment*

and nothing else in the spec. If either comes back green, the spec is what gets
fixed, not the expectation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
