# §1. Scope is frozen until 1.0

*`dreamcrm-conventions` §1. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

- `docs/RELEASE.md` is the program of record. Work comes from it and from your
  assigned issue — not from ideas you had while reading the code.
- Feature freeze is in effect: no new product scope until 1.0.
- A good idea that is out of scope goes to `docs/POST-1.0.md` via an issue
  comment, never into code.
- Behavior-preserving refactors (god-file splits, extractions) happen only when
  the assigned issue asks for them.

## The Part 5 defect ledger: one defect, one entry, one verdict

`docs/RELEASE.md` Part 5 is the defect ledger. Each entry describes exactly one
defect and carries exactly one verdict. If what you are about to write up is
really two defects, **split it on contact** — before the entry is written, not
after someone tries to close it.

A bundled entry cannot be closed honestly: half of it is fixed and half is not,
so its verdict has to hedge, and the ledger stops telling anyone what is actually
outstanding. Splitting costs a minute at write time; unbundling costs a
rediscovery.

**A fix that is written is not a fix that has landed, and the entry has to say
which.** Rio's intake, 2026-09-14. An entry reads `OPEN` only while nothing has
been done about it. A fix that exists but has not merged reads **`FIXED —
awaiting merge (#<pr>)`**, naming the PR. Reconcile the entry when that PR lands
on `main`, not when the code is written.

Two facts were wearing one word. `:386` read `OPEN` while its fix was already
live on `main`, and other entries read `OPEN` with fixes sitting on unmerged
branches — so the ledger could not tell anyone apart "nobody has started this",
"somebody has fixed this and it is one merge away" and "this shipped and the
ledger is behind". Those three call for three completely different next actions,
which is the entire job of a defect ledger.

Reconciling at merge rather than at write time is §3's "Delivered means merged"
pointed at the ledger, and it costs nothing extra: the merge commit landing on
`main` is the only event here that is not a guess, and you already confirm it
before writing a delivery summary. Do both in the same breath.

**There is a third verdict — `STRUCK BY DECISION` — and it is how an item stops
being carried.** Quinn's intake, 2026-09-15 (#582 / DREAMCRM-48, `5265325f`;
the worked example is the 20s vitest stall-detector tail). An item that has
reached a planning meeting twice and been deferred both times is not a backlog
entry any more, it is a habit — so the meeting either does it or strikes it, and
carrying it a third time is neither. A strike is a ledger entry like any other
and it owes two things the other verdicts do not:

- **The evidence that striking is safe, gathered before the strike rather than
  asserted.** The vitest entry names 200 Actions runs over a dated window and
  the three places a timeout could have shown up — including `tz-canary`,
  checked separately because `continue-on-error` means a red canary never shows
  up as a failed run. "Nothing has ever hit it" is a claim you go and check.
- **The named condition that reopens it.** One vitest timeout in `test`,
  `nightly-test` or `tz-canary` puts that item back, and the entry says so. A
  strike with no reopen condition is a deletion wearing a verdict.

Striking is only available where the item is genuinely not a check: a timeout is
a HANG detector, not an assertion, so raising it relaxes nothing and lowering it
tightens nothing. **Do not read this verdict across to anything that grades
something** — striking a ledger item that asks you to shrink an axe ceiling or
tighten a contrast rule is §2's "never weaken a failing test" with extra steps.

**A ledger entry about PUBLISHED COPY quotes the string as it appears on the
LIVE PAGE, and names where it was observed.** Neon's intake, 2026-09-23. The
launch-post entry described what the registry held; the visitor was still
being shown an older price. Both statements were true and only one of them was
about the defect, because a published page is a RENDER of a source and the two
come apart exactly when something is wrong — which is the only time a ledger
entry gets written.

So an entry about copy the public can read owes three things, and a description
of the source is not a substitute for any of them:

- the **string as observed on the live page**, quoted, not paraphrased and not
  read out of the config it is supposed to come from;
- **where it was observed** — the URL and the section, so the next reader
  stands where you stood;
- **when**, since a published page changes under you and a cache does not care
  what merged.

The source is welcome beside those and is usually the fix. It is not the
finding. This is §10's measured-hex rule pointed at copy instead of colour: a
measurement is a fact and an attribution is a guess, and on a surface where
caching, revalidation or a CDN is in play the attribution is the part most
likely to be wrong.
