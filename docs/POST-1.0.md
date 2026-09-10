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
- **The daily metrics snapshot** — one per-day history series behind the
  numbers the KPI tiles already show. Recorded here 2026-09-10 under
  bias-to-action, from the DREAMCRM-14 planning meeting: it is NEW DATA
  MACHINERY (a stored series, a writer, a retention policy), not
  presentation, so the freeze puts it here rather than in a UI batch.
  What it unblocks, all currently DEFERRED in docs/UI-BEST-VERSION.md for
  exactly this reason: the Overview's two spark-less trend tiles · the
  recall funnel heartbeats (`getRecallStats` keeps no weekly history) ·
  the analytics page's sixteen heartbeat-less KPIs · the outstanding-
  balance heartbeat · Overview MRR + Needs-Attention (`getMrrSnapshot` is
  a point-in-time tier count) · the demo-prep KpiStats · the lead-count
  KPIs on the marketing home. Seven punch-list entries, one blocker.
  NOT unblocked by it: the prospecting Hunt panel, which needs an HOURLY
  aggregate — `HuntStats` stores 24h totals.
- **The deferred IA change list** (docs/STRUCTURE-AUDIT.md) — reclassified
  2026-09-10 from floating deferrals to scheduled post-1.0 work, same
  meeting, same reason: these are information-architecture changes, which
  the UI-quality program has no mandate to make and keeps correctly
  punting. The remainder is the change list's item 2 (the refer-a-friend
  door on Growth — the one never-built recommendation; items 1, 3 and 4
  shipped) plus the platform settings taxonomy: two tiles, with Service
  Library / Blog / Prospecting settings unlinked from Settings because
  those areas keep their own in-module doors by design. Decide the
  taxonomy once, post-1.0, rather than re-litigating it every batch.
- Facebook review reply (no Zernio endpoint), per-staff booking widgets,
  patient-view audit log, 2FA, per-location booking (CLAUDE.md item 8).
- Dentistry-type site templates expansion (CLAUDE.md item 0b — design
  rails are live).
- ECS migration (App Runner closes to new customers Apr 2026 — an ops
  decision folded into RELEASE.md R3).
