# The executor lane (ML-11)

One file per NEW proposal executor: `lib/services/proposal-executors/<capability>.ts`
(`import 'server-only'`, exporting `execute<Capability>(p, payload, saidYes)` → `ExecResult`).
The switch in `executeProposal` (`lib/services/proposals.ts`) imports it and gains ONE
`case` (plus one `demoLedgerSummary` line). Nothing existing moves into this directory.

Laws every executor inherits (the Phase-2/3 audits, unchanged):

- the ledger-boundary law — an approved yes narrates ONCE, under the proposal's capability;
- live staleness at the tap; an unreadable check never vetoes an explicit human yes;
- patient mail waits for daylight when the machine sends on its own
  (`PATIENT_INBOX_CAPABILITIES`);
- a capability in `BOOKING_BUTTON_CAPABILITIES` MUST append the button its card discloses
  (route through the campaign protocol or the inquiry shell);
- grantable only once the `case` exists — the default branch refuses the rest.
