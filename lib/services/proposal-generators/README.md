# The generator lane (ML-11)

One file per NEW proposal generator: `lib/services/proposal-generators/<capability>.ts`
(`import 'server-only'`, exporting `generate<Capability>Proposals`). The driver list in
`lib/services/proposal-generators.ts` (`makeOrgPass`) imports it and gains ONE line —
still sequential, in that same list, never a parallel driver.

A slice that ships a generator lands, together:

- the generator file here, and its `STEP_FAILURE` entry beside the driver list;
- the executor file in `lib/services/proposal-executors/<capability>.ts`, as one `case`
  in `executeProposal` (plus its `demoLedgerSummary` line);
- the deletion of the capability's key from `PREVIEW_CAPABILITIES` in `lib/autonomy.ts`
  — that one deletion is the release to every clinic's roster;
- if the lane is meant to be grantable, its key in `GRANTABLE_CAPABILITIES` — never before
  the executor exists (a grant runs through `executeProposal`'s switch);
- if the lane is meant to run on its own (post_visit_care, membership_rescue, order_update,
  consent, listing_watch), its `defaultTrust` flips `'ask'` → `'auto'` together with its
  ledger writer — `tests/journey/spine.test.ts` holds every auto capability to one, and a
  preview key is never auto (`tests/journey/capability-registry.test.ts`).

The capability itself, its specialist seat, its icon, its standup noun, its send-window
and booking-button memberships are already registered (ML-11). Nothing existing moves
into this directory.
