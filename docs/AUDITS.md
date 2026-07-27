# Phase Audit Certificates

Every transformation phase (and any major feature slice) ends with the
**phase-audit workflow** (`.claude/workflows/phase-audit.js`) run in rounds
until DRY: **two consecutive rounds with zero confirmed defects and zero
in-phase depth gaps**. The machine, per the owner's standard (2026-07-27):

- **Perfection chamber** — independent lens auditors (semantics,
  completeness, codebase law, doctrine, failure modes, test adequacy) file
  DEFECTS; three adversarial skeptics try to refute each; majority-confirmed
  defects must be fixed before dry.
- **Depth chamber** — "would it make sense to add more?" Depth auditors
  (pinnacle, front-desk) file PROPOSALS; three value judges triage each into
  *in-phase gap* (blocks dry — the phase isn't honestly done without it),
  *backlog* (the owner's menu below), or reject.

Each certificate records: rounds, findings found → confirmed → fixed →
rejected, the backlog harvest, and the dry declaration.

---

## The depth backlog (the owner's menu)

Proposals judged real-but-future-scope land here, newest first. The owner
promotes items into phases; nothing here is a commitment until he does.

*(empty — populated by audits)*

---

## Certificates

*(newest first)*
