# The post-1.0 backlog

The feature-freeze catch-basin (created 2026-08-17, per docs/RELEASE.md
R0). While the release program runs, NEW FEATURE IDEAS LAND HERE — not in
the release. Defects go to RELEASE.md Part 5. Nothing here is committed;
it's the honest inventory of known deferred work, so freezing costs no
memory.

## Gated on external events (not effort)

- **Open Dental direct**: schedule-driven availability (`/schedules`) +
  real-office Customer Keys — awaits OD vendor-portal approval
  (CLAUDE.md open item 4). NexHealth already covers real-slot booking.
- **SMS honesty flip + SNS two-way wiring** — awaits the first real
  clinic's A2P carrier registration approval (CLAUDE.md open item 5).
- **Procedure-code-gated P2s** (docs/COMPETITIVE-GAPS.md): post-op
  follow-up campaigns, treatment-plan follow-ups, procedure-triggered
  consents, per-provider production analytics — need a procedure entity
  in the PMS sync that neither provider exposes yet.

## Feature ideas (deferred by the freeze)

- ~~AI Operations / conversational copilot~~ **PROMOTED out of this backlog
  2026-08-23 (owner directive): now THE DREAM TEAM program, building through
  the freeze in its own lane — spec + build log in `docs/ai-operations.md`.**

- Webhooks at scale (NexHealth push instead of cadence polling; Zernio
  review webhooks — the hourly cron covers today).
- Content-plan cards: per-piece photo slots (noted to owner 2026-08-14).
- SMS second wave: affirmative-reply-confirms ("any yes confirms"),
  waitlist SMS channel, balance-nudge SMS sibling, NPS SMS channel.
- Phones territory: missed-call text-back, voicemail drops (Weave
  parity; needs a voice provider decision).
- Apple Maps + Bing Places presence (the DESIGN.md Phase-5 limbs that
  never started; GBP shipped, these siblings didn't).
- Intake: appointment-type + annual-refresh auto-send rules (audience
  rules shipped; these didn't), an address field type (cut from v2).
- The refer-a-friend door on Growth (docs/STRUCTURE-AUDIT.md change list
  item 2 — the one never-built recommendation).
- Facebook review reply (no Zernio endpoint), per-staff booking widgets,
  patient-view audit log, 2FA, per-location booking (CLAUDE.md item 8).
- Dentistry-type site templates expansion (CLAUDE.md item 0b — design
  rails are live).
- ECS migration (App Runner closes to new customers Apr 2026 — an ops
  decision folded into RELEASE.md R3).
