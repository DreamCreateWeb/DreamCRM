# The Onboarding Overhaul — research foundation

**Status: RESEARCH (2026-08-05). No code yet.** Owner ruling: this is a
PROJECT, not a sweep — "your current research just told me we need to make
this a project."

**The triggering incident.** Two beta clinics, same product. All About
Smiles' Google Business Profile "Website" button points at their DreamCRM
site → steady traffic in the CRM. Mammoth Spring's does not → zero traffic,
ever. Nothing in the product detects, prevents, or even *knows about* this
difference. The owner's ask: make GBP connection a required onboarding
step, and reshape onboarding/setup generally.

The research below says the incident is one symptom of a structural
problem: **onboarding collects identity and writes a website, then hands
the clinic a pile of dismissible checklists for everything that actually
produces patients.** The doctrine (DESIGN.md → The North Star) already
names the fix: the employee's first week, not a better wizard.

This document has six parts: (1) the internal audit, (2) the GBP/vendor
landscape, (3) competitor + activation research, (4) design implications,
(5) proposed project shape + open questions, (6) owner rulings
(2026-08-07) + the top-down design conversation.

---

## Part 1 — What onboarding actually is today (internal audit)

### 1.1 The flow

- **Signup** (`app/(auth)/signup`) → 4-step wizard, all state in
  `sessionStorage` until the final submit (`lib/onboarding/storage.ts`).
  Collects: practice name, phone, address, slug, brand color. Step 4 adds
  the browser-sniffed timezone. `submitOnboarding`
  (`app/(onboarding)/actions.ts:145-346`) creates org + membership +
  `clinic_profile`, starts the no-card 7-day trial, seeds the default
  intake form, Mon–Fri 9–5 hours, and the starter floor (tagline, about,
  stats, FAQ, 4 core services).
- **`/welcome` AI interview** — 7 fixed questions → ONE structured AI call
  → tagline/about/chips/stats/FAQ/SEO written non-destructively; selected
  services stored; per-service AI rewrites fire in the background.
- After that: **eleven-task dismissible checklist** on the Overview
  (`lib/services/staff-onboarding.ts`), **five-row go-live checklist** on
  the Website hub (`app/(default)/website/page.tsx:135-183`), the SEO
  health score, the integrations page pills, and a PMS-only health banner.
  Five readiness surfaces; none share a source of truth.

### 1.2 The checklists lie (verified defects)

| Defect | Where | Reality |
|---|---|---|
| `connect_pms` ticks on row EXISTENCE, not health | `staff-onboarding.ts:206` | A PMS connection in `status:'error'` shows green while the health banner on the same page shows it broken |
| `connect_social` conflates GBP with social | `staff-onboarding.ts:177-186` | Connecting GBP ticks "Connect your social channels" with zero social accounts; Growth hub simultaneously says "0 social channels connected" |
| `set_hours` / `portal_setup` are null-checks | `staff-onboarding.ts:199,204` | `{}` counts as done |
| The go-live GSC row is UNACHIEVABLE with a custom domain | `website/page.tsx:165` vs `lib/services/gsc.ts:297-300` | Completing optional row 3 (domain) makes required row 4 permanently false — every custom-domain clinic is capped at 4/5 forever |
| Two "personalized" predicates disagree | `website/page.tsx:144` vs `starter-pack.ts:307-313` | Hub row shows done while the Overview shows "Let's build your website" on the same refresh |
| Whole checklist dismissible forever | `clinic-overview.tsx:255-257` | One click hides 11 undone tasks permanently, per staff member |
| Overview health banner is PMS-only | `lib/services/pms/health.ts:47-54` | GBP `error`, Gmail `error`, Stripe `restricted`, SMS `rejected` never reach the dashboard |
| Dead plan-filtering comment | `website/page.tsx:135-137` | Says "rows a plan doesn't cover are omitted"; the spread is unconditional (no-plan-gating era) |

### 1.3 The GBP blind spot (the Mammoth Spring gap, precisely)

- We never parse the listing's website field. `GbpRawLocation`
  (`lib/zernio.ts:363-392`) has no `websiteUri`; `normalizeLocation` never
  reads one — although Zernio's own docs for `location-details` say the
  response includes "hours, description, phone, **website**, categories,
  services" (`docs/zernio-google-integration.md:243-244`). The field is
  almost certainly on the wire, unparsed.
- Zernio is **pull-only for listing fields** — the only GBP writes are
  review replies and posts (`lib/services/gbp-sync.ts:26-27`,
  `docs/zernio-google-integration.md:455-461`). We could not fix the
  button even if we detected the mismatch.
- GBP clicks arrive untagged: no UTM builder exists anywhere in the GBP
  path, so a listing click classifies as generic `'search'`
  (`lib/lead-channel.ts:42-58`). `websiteClicks` (the GBP metric) is never
  joined to the leads it produced — the All About Smiles effect is only
  visible by anecdote.
- **Net: a clinic can be 5/5 and 11/11 with GBP "Connected" while Google
  sends every click to their old Wix site, and every surface reads
  healthy.**

### 1.4 Booking readiness: the ghost schedule (verified end to end)

`self_booking_enabled` defaults true (`platform.ts:340`). The moment the
subdomain resolves, `/book` renders the REAL slot grid: 5 default visit
types × 16 slots/day from the seeded Mon–Fri 9–5 — hours the clinic never
confirmed, in a timezone sniffed from the signer-upper's browser, into
`chairCount:null` → 1 implied chair, with zero provider records (nothing
creates `clinic_provider` rows outside the demo seeder and PMS import —
`lib/services/providers.ts:9-13`).

A real patient can complete that booking. They get a confirmation email,
then the 72h and 24h reminders. The dashboard shows the row with **no
anomaly marker** — no provider attribution is normal-looking because the
provider column is hidden when no providers exist
(`agenda-view.tsx:402,633`). The clinic's one signal is a single
new-booking email/bell at booking time.

Also verified: the "any availability?" fallback banner uses different
rules (no duration, no notice window) than the grid itself
(`app/site/[slug]/book/page.tsx:171`) — a seam bug independent of this
project.

### 1.5 The first week, hour by hour (what the machine does to a day-0 org)

- **The only autonomous actor in week 1 is `customize-services`**: the
  4 starter services get AI rewrites in the first hourly tick, recording
  ONE `service_copywriting` ledger row — which is load-bearing: it makes
  `actions7 >= 1`, so the Guardian classifies the org `healthy` and the
  first Monday standup email is non-quiet. **The owner's first "Your week
  with DreamCRM" email reports the machine rewriting its own starter
  pages.** If AI were unconfigured, the Guardian's `brandNew` branch
  (`lib/guardian.ts:245-259`, 14-day grace) still keeps it off the alarm
  list — silent-new-clinic is handled by design, twice over.
- `generate-proposals` scans the org hourly and files ZERO all week —
  every generator gates on source data a day-0 clinic lacks (reviews,
  inquiries, ≥8–10 reachable recall patients, connected channels). The
  Approval Inbox — the product's soul — is **structurally empty for the
  entire first week.** The aha moment never arrives from inside the
  product; it has to come from a patient acting.
- Emails the owner receives in week 1: welcome (T+0), per-booking
  notifications, the first Monday standup, then trial reminders at ~day 4
  ("3 days left"), ~day 6 ("last day"), day 7+ ("ended"). No digest
  (default off).
- Sync crons (PMS/GBP/reviews/SMS) never touch the org — connection-gated.

### 1.6 The trial wall's sharp edges

At day 7 `TrialEndedWall` replaces `children` for EVERY dashboard route
(`dashboard-shell.tsx:174-183`) — deliberate, checkout is inline. But
nothing outside the shell is gated: **the public site keeps serving and
taking bookings, reminders keep sending, campaigns/automations keep
running, the standup keeps emailing staff who cannot open the dashboard —
and the Guardian stops watching expired orgs entirely**
(`guardian.ts:504-511`). The staff are locked out while the machine keeps
talking to their patients. The "ended" email's "your website is safe"
undersells it: the site isn't preserved, it's LIVE and booking into a
schedule nobody can see.

### 1.7 What we already know vs what we ask

The prospecting pipeline holds, per prospect: practice name, full address,
normalized phone, the owner dentist's NAME (NPPES authorized official), a
DERIVED IANA TIMEZONE, website URL, `googlePlaceId` + rating + review
count, verified email + provenance, brand color (`theme-color`), logo
(icon crawl), `og:site_name`, social handles, incumbent vendors, and an AI
gap analysis (`lib/db/schema/prospecting.ts:46-150`).

`convertProspectAction` carries over **two fields** — brand color and logo
(`admin-actions.ts:586-595`). `CreateManagedClinicInput`
(`clinic-provisioning.ts:32-50`) physically cannot accept phone, address,
timezone, website, place id, or the owner's name. Consequences: a
converted California practice runs every slot window, reminder, and
standup on `America/New_York`; `/book` hides the "call us" fallback (no
phone) precisely when the schedule is a ghost; the GBP/reviews connection
must be re-established by hand although we already resolved the place id.

Self-serve asks for what it could know (address → timezone), seeds what it
should ask (hours), and never asks what only the clinic knows (chairs,
providers, "are these hours real?").

### 1.8 People models (three, disconnected)

`member` (auth; owner/admin/member/patient, ad-hoc role checks in 78
files, `requireRole` has zero call sites) · `clinic_provider` (a "with
Dr. X" label — no day-0 seeding, no link to booking) · `clinic_profile.staff`
jsonb (the public /team page — not linked to providers). No operatory
model; `chair_count` is a single integer concurrency limit.

---

## Part 2 — The GBP write-access landscape (external research, Aug 2026)

Full sourcing in the research transcript; key claims verified against
Google's current docs.

### 2.1 The native Google Business Profile API does exactly what we need

- `PATCH mybusinessbusinessinformation.googleapis.com/v1/locations/{id}`
  with `updateMask=websiteUri` (also `regularHours,phoneNumbers`) sets the
  listing's website button. One OAuth scope:
  `https://www.googleapis.com/auth/business.manage`. Acts as a Google USER
  who is an owner/manager of the (verified) listing — per-clinic OAuth
  token (our existing Zernio-style model) or Dream Create's account added
  as a manager (the agency model). Service accounts are unreliable
  here — treat as unsupported.
- **The gate: new GCP projects get ZERO quota** on all GBP APIs until a
  manual "Basic API Access" application is approved
  (developers.google.com/my-business/content/prereqs). Requirements that
  matter for us: apply from a domain-matched OWNER email
  (dustin@dreamcreateweb.com-class, not gmail), Dream Create must have its
  OWN verified GBP that is 60+ days old with a website on it, and the use
  case must be CONCRETE ("dental practice CRM syncing each clinic's own
  verified listing with the clinic's explicit OAuth consent"), not
  "multi-tenant platform" — generic pitches are a known rejection pattern.
  Timeline: officially ~2 weeks; observed 4 days–6 weeks, with
  silent-limbo reports. Approval is per GCP project, non-transferable.
- Post-approval quotas are a non-issue at our scale: 300 QPM, Update
  Location 10k/day, and a hard "10 edits/min per listing" cap.
- Known seam: approval sometimes lands with 0 quota still on the Account
  Management API — needs a follow-up ticket.

### 2.2 Deep links: there is no field-level deep link

The old `business.google.com/dashboard/l/{id}` / `edit/l/{id}` patterns
died with the standalone dashboard; merchants now edit in-SERP ("New
Merchant Experience"). Reliable links to hand a clinic:
`https://www.google.com/search?q=my+business` (signed in → Edit profile →
Contact → Website), `https://business.google.com` (single listing), or
`business.google.com/manage/` (multi-location). The guided fix must
narrate those three clicks; it cannot jump to the field.

### 2.3 UTM tags in the website field

Allowed and standard practice. 2025 consensus pattern:
`?utm_source=google&utm_medium=organic&utm_campaign=gbp-listing`
(+`utm_content=website-button`) — keeps GA4 classification sane while
letting OUR `classifyLeadChannel` gain a real GBP bucket. Cautions: any
edit can trigger an automated listing re-review (suspension anecdotes are
re-review side effects, not a UTM ban), and Google occasionally strips
query params from the field — ALWAYS re-read after writing, and the target
URL must not redirect through anything that drops the query string.

### 2.4 Vendors who already hold write access

| Vendor | Embeddable API | Cost order | Tiny volumes? |
|---|---|---|---|
| Yext | Yes (white-label reseller) | $199–999/loc/yr list; $1–3k/loc/yr observed for small deals | Served, expensive |
| Uberall | Yes (powers HighLevel's listings) | Enterprise quote-only | Not below ~50–100 locations |
| Synup | Yes (white-label/agency) | ~$35/mo/location | Yes — best shape fit if we buy |
| BrightLocal | API = citation building + monitoring, not continuous GBP write-sync | one-time per location | Yes |
| Whitespark | No public write API | ~$20/mo/loc managed service | Yes (service, not API) |

Rule of thumb: much of what these vendors sell is "we already hold the
Google approval." A direct approval costs $0/location forever and
front-loads the gate risk.

### 2.5 RESOLVED (2026-08-05, live API probe): Zernio ALREADY HAS THE WRITE

Probed with our own API key against docs.zernio.com's published OpenAPI
spec (`https://docs.zernio.com/api/openapi`, v1.0.4):

- **`PUT /v1/accounts/{accountId}/gmb-location-details`**
  (`updateGoogleBusinessLocationDetails`): body requires `updateMask`;
  **`websiteUri` is a first-class field**, alongside `regularHours`,
  `specialHours`, `profile.description`, `phoneNumbers`, `categories`,
  `serviceItems`. Spec text: "This endpoint proxies Google's Business
  Information API locations.patch, so any valid updateMask field is
  supported." Optional `?locationId=` targets a specific location.
- The GET twin now accepts `readMask` (incl. `websiteUri`) and returns a
  derived `location` block with `placeId`, `reviewUrl`, `mapsUri`,
  `isVerified` — Phase A's parse is a readMask addition, not archaeology.
- **`docs/zernio-google-integration.md`'s "pull-only / no write-back"
  limitation is STALE** — Zernio shipped listing writes after that doc was
  written. Note also the spec's path shapes are newer
  (`/v1/accounts/{accountId}/gmb-…`) than the ones `lib/zernio.ts` calls
  (`/google-business/…?accountId=`); the old paths still serve prod today,
  but new wrappers should follow the published spec.
- **Consequences:** Phase D is NOT approval-gated — no Google application,
  no Yext/Synup purchase. The Google Basic-Access application drops to
  optional vendor-independence insurance. Residual unknown: whether our
  Zernio plan gates this endpoint behind an add-on (their analytics 402
  precedent) — unknowable without a real write, and the honest first write
  IS the fix (setting Mammoth Spring's websiteUri, owner-approved), which
  reports any 402/403 visibly.

---

## Part 3 — How the vertical onboards + what the activation literature says

### 3.1 Competitors (2024–2026)

- **Nobody in dental does pure self-serve onboarding.** Every vendor puts
  a named human in the loop: NexHealth mandates three calls (kickoff /
  customization / training) even while claiming "go live in days"; Weave
  runs a $750-setup-fee, 2–6-week implementation gated on phone porting;
  Birdeye charges $500–1,500 for what is essentially a 90-minute
  connect-your-profiles Zoom; Curve runs full data-conversion white glove;
  Archy productized it ("a few hundred dollars," ~2 weeks, "we do the
  final conversion while your practice is closed"); Kleer launches in 15
  minutes because the vendor pre-builds everything and only asks pricing
  questions.
- **The universal hard gate is the PMS connection**, always scheduled with
  humans. Claimed time-to-live is "days"; lived reality is 2–6 weeks, and
  the stretchers are external dependencies (porting 5–10 business days,
  image conversion up to 2 months) — the good vendors NARRATE the waits.
- **The #1 review complaint is not onboarding — it's the cliff after it.**
  "Support disappears once you're paying" recurs verbatim across Weave,
  Podium, Solutionreach, RevenueWell reviews.
- **GBP-as-onboarding is nearly unclaimed.** Only the reputation players
  (Birdeye, Podium) make GBP connection a first-session step; only Birdeye
  actively manages/syncs the listing as a product; **no competitor found
  manages the GBP website link as an onboarding artifact.** Open ground.
- Setup fees are normal in the vertical ($500–1,500). Kleer is the $0
  exception (monetizes per member).

### 3.2 Activation literature

- **Reforge frame**: setup moment (collect ONLY the must-have facts) → aha
  moment (first experienced value) → habit moment. Elena Verna: "the
  biggest mistake is stopping activation efforts at the set-up moment."
- **Benchmarks**: median SaaS activation ~25–30%; onboarding checklist
  completion across 188 SaaS companies: **average 19.2%, median 10.1%.** A
  clinic-owned checklist will sit ~80–90% unfinished. A checklist can be a
  progress DISPLAY; it cannot be the ENGINE.
- **Empty states are the onboarding surface** — and the strongest variant
  for a done-for-you product is an empty state that is never empty: the
  machine already drafted the thing ("here's what I prepared — approve or
  fix").
- **Progressive setup**: ask for each fact at the moment it unblocks the
  next visible piece of work, not everything on day 1.
- **Concierge economics**: human white-glove pencils out above ~$25k ACV;
  DreamCRM's ~$6k ACV forbids it. Mangomint (salon vertical, 110% NRR)
  treats deployment as the product; Tidemark's frame: the winning vertical
  SaaS move is "HANDLING onboarding instead of selling onboarding
  software," with AI absorbing the toil. Superhuman's playbook (do it live
  for every user, then productize what the calls taught) is the same move.
- **Synthesis**: dental SMBs genuinely need white glove (Part 3.1 proves
  it — every competitor supplies humans and charges for them), human white
  glove is uneconomic at our price, and the resolution is exactly the
  North Star: **the AI employee performs the implementation-specialist
  role** — does the setup, asks only judgment questions, reports what it
  did, and never rolls off the account (attacking the vertical's
  loudest complaint).

---

## Part 4 — Design implications (what the research demands)

1. **One readiness resolver.** Like the journey resolver: ONE module
   answers "can this practice receive patients yet, and through which
   doors?" — facts graded by HEALTH, not row-existence. Every surface
   (Overview, Website hub, integrations, Guardian) consumes it; the five
   contradicting surfaces collapse into displays of one truth.
2. **The checklist inverts: it is the MACHINE's to-do list.** "Found your
   Google profile ✓ · Wrote your services pages ✓ · Waiting on carriers
   for texting (their queue, not yours) · 2 questions only you can
   answer." The clinic-facing residue is exactly the Reforge setup moment:
   facts only the clinic can supply.
3. **Setup is progressive and event-driven, not a day-1 wall.** Each ask
   arrives when it unblocks visible work (chairs/hours confirm → booking
   goes live; GBP connect → listing truth + reviews engine start).
4. **Booking must not be live on unconfirmed facts.** The ghost schedule
   is the anti-doctrine: the machine claimed hours on the clinic's behalf
   and let real patients rely on the claim. Booking readiness = confirmed
   hours + chairs (+ optionally providers) or explicit owner override;
   until then /book runs request-mode, which already exists.
5. **GBP is a day-one onboarding object, in three stages.** (a) NOW:
   parse `websiteUri` from the listing pull, diff against
   `publicSiteUrl()`, guided fix card with the exact URL (UTM-tagged) +
   the three-click path, auto-verified on the next hourly sync, narrated
   in the ledger; re-read after every write (Google strips params).
   (b) IN PARALLEL: file the Google Basic-Access application (owner
   action; costs calendar time, not money) and ask Zernio whether a
   location-PATCH is on their roadmap. (c) LATER: with write access, the
   machine fixes the button itself and keeps hours/phone/website in sync
   — the Birdeye product, delivered by the employee, at $0 marginal cost.
6. **Attribution completes the loop.** The UTM-tagged listing URL gives
   `classifyLeadChannel` a real GBP bucket, so "your Google profile sent
   you N patients this month" becomes a standup sentence — the proof that
   the required step was worth requiring.
7. **The waits are narrated, Archy-style.** PMS approval, A2P carrier
   review, domain verification, GBP API approval — honest "their queue,
   not yours" status lines, with everything the machine is doing
   meanwhile listed alongside.
8. **The aha is the first Approval-Inbox yes — manufacture it in week 1.**
   Today the inbox is structurally empty for seven days. The first-week
   generators should run on what EXISTS at day 0: the machine's own setup
   work filed as visible, approvable artifacts (e.g. "I found your Google
   listing — is this you?" / "Here are your hours as Google states them —
   confirm and booking goes live"). Setup asks ARE proposals; the inbox is
   the onboarding surface.
9. **Conversion carries everything we know.** `CreateManagedClinicInput`
   grows phone/address/timezone/placeId/website/owner-name; the prospect's
   derived timezone must never again be discarded for Eastern. Same for
   GBP-first setup: one connect can prefill hours, phone, address, photos
   (the pull already exists — `gbp-sync.ts` — it's just never reached in
   week 1).
10. **Trial-wall honesty.** Staff locked out while the machine talks to
    patients is a decision, not an accident — but it must be a DECIDED
    decision: either pause patient-facing automation at expiry, or tell
    the owner the truth ("your site is live and taking bookings you can't
    see") in the ended email. Current copy claims less than reality.

## Part 5 — Proposed project shape

**Phase A — GBP listing truth (independent, ships first).** Parse
`websiteUri` into the GBP pull + store; pure `listingPointsAtUs()`
(slug domain OR custom domain, tolerate scheme/www/trailing-slash + our
own UTM params); the guided fix card (Overview + integrations detail) with
auto-verification and ledger narration; the UTM channel in
`classifyLeadChannel` + lead-channel surfaces; Guardian/readiness fact.
Also: the owner files the Google Basic-Access application + the Zernio
write-endpoint ask (template below).

**Phase B — the readiness resolver.** `lib/readiness.ts` (pure grading) +
service; health-graded facts replace every existence-check; the five
surfaces become views of it; the impossible GSC row and the conflations
die; connected-but-broken integrations reach the Overview.

**Phase C — onboarding as the employee's first week.** Wizard stays thin;
day-0 asks become proposals in the Approval Inbox (confirm hours →
booking live; chairs; "is this your Google listing?"); booking
request-mode until confirmed; GBP-connect prefill; conversion carries the
full prospect dossier; the machine's own setup checklist replaces the
dismissible one; waits narrated.

**Phase D — GBP write-back via Zernio (UNGATED as of §2.5).**
`PUT /v1/accounts/{accountId}/gmb-location-details` with
`updateMask=websiteUri` — the machine fixes the button itself, with
re-read-after-write (Google strips params), `listing_sync` ledger
narration, and the standing keep-in-sync watch. The honest first write is
Mammoth Spring's own websiteUri, owner-approved — it verifies our plan
isn't add-on-gated AND fixes the incident in one move. Phases A and D may
merge: detect → propose ("your Google listing points at the old site —
fix it?") → the machine writes → verifies on the next sync. The
detect-and-guide card remains the fallback for a 402 or an unverified
listing. Google's native API application drops to OPTIONAL
vendor-independence insurance.

**Open questions for the owner**
1. ~~Ask Zernio for a write endpoint?~~ RESOLVED — it exists (§2.5).
2. File the Google Basic-Access application anyway as vendor-independence
   insurance? (Free, 1–6 weeks, needs Dream Create's own 60+-day verified
   GBP; recommended: yes, low effort, hedges Zernio risk.)
   **Owner update 2026-08-05: Dream Create has NO GBP yet** — the 60-day
   clock hasn't started. Plan: create it now (business.google.com/add;
   service-area business, honest category, complete profile), verify
   (expect video verification for a SAB), and ALIGN THE DOMAIN PAIR first
   — the application wants applicant-email domain ↔ GBP website domain to
   match. Recommended pair: GBP website = www.dreamcreatestudio.com +
   a Google account on that domain (apex inbound email is already live);
   the alternative is keeping everything on dreamcreateweb.com, viable
   only if a real site lives there. Verified this week → eligible ~Oct 10,
   2026. None of this blocks Phases A–D (the Zernio path needs no
   application).
   **Mammoth Spring note:** they lost their Google credentials (recovery
   in progress) — so FIRST check whether their org ever connected GBP to
   DreamCRM: an existing Zernio OAuth token lets the machine fix their
   website button without their login. If no token, their recovery is the
   gate, and the moment they're back in, connecting GBP to DreamCRM comes
   first so the fix never again depends on remembered credentials. A
   plan-gating probe that needs no one's recovery: write All About
   Smiles' websiteUri to its CURRENT (already-correct) value — proves the
   endpoint on our plan with zero visible change; caveat: any edit can
   trigger an automated listing re-review, so this is an owner call.
3. Should booking ship request-mode-by-default for new clinics until hours
   are confirmed (recommended), or stay live with an "unconfirmed hours"
   override?
4. Trial expiry: pause patient-facing automation, or keep it running and
   say so honestly?
5. Setup fee: the vertical charges $500–1,500 for humans; do we want
   "white-glove included, done by the machine" as explicit positioning
   (recommended: yes, it's the differentiator, priced at $0)?

**Seam bugs found during research, worth fixing regardless** (log in
FINISHING.md when picked up): the `/book` fallback-banner rule mismatch
(`app/site/[slug]/book/page.tsx:171` ignores duration + notice); the
"ended" trial email claiming less than reality (§1.6); the dead
plan-filter comment (`website/page.tsx:135-137`); `requireRole` having
zero call sites while 78 files hand-roll the check.

---

## Part 6 — Owner rulings (2026-08-07) + the top-down design phase

Rulings from the owner, superseding the corresponding open questions in
Part 5:

1. **Trial expiry: kill everything.** "If they don't pay they don't just
   get the tools for free." At expiry the machine stops too — patient-
   facing automation, the public site's booking, all of it (final shape of
   "kill" to be specified in the design conversation — e.g. whether the
   site itself stays up as a brochure or goes dark). This resolves §1.6:
   the current staff-locked-out-while-the-machine-keeps-running state is
   NOT the decided behavior.
2. **Booking request-mode vs live is the CLINIC's choice, not a platform
   default.** The owner's framing is a design law for the whole overhaul:
   "these types of things are exactly why we're doing the onboarding
   overhaul — clinics choose before it goes live." Onboarding's job is to
   surface each such choice at the right moment; the machine may
   recommend, never decide.
3. **AI-driven onboarding: yes, explicitly.** The owner has seen it
   elsewhere and wants it ("it's wonderful").
4. **PMS strategy: NexHealth Synchronizer** (not yet wired in) is the
   intended universal PMS bridge, replacing the one-PMS-at-a-time direct
   integration path. Clinics on an unsupported PMS export their patient
   list and import the CSV (the importer exists). Design implication: the
   PMS step in onboarding must be designed for the Synchronizer shape
   (one connection covering many PMSes) with CSV import as the honest
   fallback, and must narrate the wait while the Synchronizer deal/wiring
   is pending.
5. **GBP connection economics:** Zernio charges ~$6/mo per connected
   location. Trivial at 2 clinics; a real line item at scale — batch
   pricing or the native Google path (the Basic-Access application) is
   the long-term hedge. Also: All About Smiles' GBP is NOT urgent to
   connect — their listing already points at the domain we built on, and
   traffic is strong. Mammoth Spring is still recovering their Google
   login (owner followed up 2026-08-07). Dream Create's own GBP gets
   created ~2026-08-08, starting the 60-day clock for the Google
   application.
6. **Next slice REDIRECTED: design before code.** The owner rejected
   jumping straight to the Phase B readiness resolver. The next unit of
   work is a research-backed TOP-DOWN DESIGN CONVERSATION (owner +
   assistant) settling what onboarding IS: the full inventory of what
   wants to be set up (GBP + website button, social connections, website
   template + content, platform settings, PMS via Synchronizer / CSV
   import, hours/chairs/providers, payments, SMS registration, team,
   forms, automations, domain, …), what the machine does alone vs what
   the clinic must answer, in what order, and what gates go-live. The
   readiness resolver and the rest of Phases B–D get re-scoped from the
   outcome of that conversation.

### Round 2 rulings (2026-08-07, overnight)

7. **Entry doors: Path B (self-serve) is the ONE flow.** Managed
   provisioning = the owner fills in the clinic + first user, the
   platform sends an invite, and accepting the invite drops that user
   into the SAME self-serve machine-led onboarding. One flow, two doors.
   Both ship "sooner rather than later," self-serve polished first.
8. **Go-live is ONE BIG LEVER.** Website + booking + everything public
   flips on together, only when the clinic pulls it — "there's too much
   on the website that could go wrong if it has false information." This
   supersedes today's live-at-subdomain-resolution behavior and the
   two-door (site now, booking later) design sketch in Part 4 §3-4. The
   machine prepares everything behind the curtain; the clinic inspects
   and flips.
9. **NexHealth Synchronizer is LIVE ACCESS, not a deal** — the owner has
   already signed up and holds an API key (arriving ~2026-08-07 morning;
   assistant reminder armed). Build the PMS step around it.
10. **SMS starts registering IMMEDIATELY at onboarding** and is a
    standard feature, not an add-on — pending the cost analysis (below),
    with guardrails instead of an upsell: the plan includes a monthly
    segment budget; marketing sends stop at the budget (transactional
    reminders keep going); usage is visible.
11. **Onboarding is machine-only, with a human escape hatch at every
    step** — an always-visible, one-tap support path, but no human
    required to complete setup. Ruling amendment (2026-08-07): the
    surface says **"Reach Support"** — never the owner's name. DreamCRM
    presents as a platform, not a freelancer; that support currently
    routes to the owner is an implementation detail the clinic never
    sees. This is a COPY LAW for every onboarding/support surface.

### SMS unit economics (verified 2026-08-07, AWS End User Messaging US)

Per-segment outbound 10DLC: **$0.00883** ($0.00581 base + $0.00302
carrier). Fixed per clinic: number $1/mo + campaign $2/mo (low-volume) or
$10/mo (standard); one-time brand $4 + campaign vetting ~$15; T-Mobile's
$50 campaign registration currently waived. The owner's nightmare case
(200 texts/day × 30 days = 6,000 segments) = **~$53/mo** — real but
bounded; a REALISTIC clinic month (reminder fallback for the
no-email minority + one or two campaign blasts, GSM-7 single-segment law
holding) = **$5–25/mo all-in**. Conclusion: include SMS in the plan from
the jump; cap the aggregate with a monthly included segment budget
(~2,000 segments ≈ $18 worst-case marginal cost) enforced on MARKETING
sends only; the per-patient frequency cap (0143) already bounds spam;
surface usage honestly. Overage behavior (pause vs metered) is a later
call — at 2 clinics it cannot matter yet.

### Build log

- **Phase B slice 1 — the readiness resolver (truth layer) — SHIPPED
  2026-08-07** (deployed as 3f01f3a): pure `lib/readiness.ts` (facts
  graded ready/attention/waiting/todo/na, anti-shame copy, optional
  semantics, `hoursLookSeeded`) + `lib/services/readiness.ts` (one-pass
  loader over the healthiest signal each subsystem exposes; per-load
  degradation, null-is-never-all-set). Surfaces became views: the 11-task
  activation checklist ticks on HEALTH (broken PMS ≠ done, GBP ≠ social,
  `{}` ≠ configured, untouched hours seed ≠ set); the Website hub's
  custom-domain Search-Console row is omitted rather than
  forever-unfinished and its personalize row rides THE one predicate; the
  Overview banner surfaces every broken subsystem (GBP website button,
  dropped inbox, restricted Stripe, ghost-schedule booking-on-unconfirmed-
  hours, SMS brand_action_needed) instead of PMS only. The ghost schedule
  now at least ALERTS (the lever that prevents it ships in the go-live
  slice). Next slices in the green-lit order: the go-live lever →
  setup-as-Inbox-cards → the invite door → NexHealth + SMS kickoff.

- **The GO-LIVE LEVER — SHIPPED 2026-08-07** (deployed as d2bc1b6;
  migration 0147 `clinic_profile.site_live_at`, every EXISTING clinic
  grandfathered live in the same migration — verified post-deploy: the
  demo site serves its real homepage). While un-pulled: visitors get a
  branded coming-soon page from the ONE choke point every public page
  renders through (`app/site/[slug]/layout.tsx` via the pure
  `shouldShowComingSoon` — editors and gallery frames exempt, so preview
  and the template gallery work pre-live); robots.txt disallows all; the
  sitemap 404s; and `submitBookingRequest` refuses directly-invoked
  bookings (the layout gate can't stop a hand-crafted POST). The Website
  hub grows the lever card — fed by the readiness resolver, listing
  attention/open/waiting HONESTLY but never blocking the pull ("clinics
  choose") — plus a quiet reversible "Take site offline" in the utility
  footer, and the header button says "Preview site" pre-live instead of
  "View live". Readiness grades booking 'na' behind the lever (the ghost
  schedule is impossible until live). The demo seeder self-heals
  `site_live_at` so a fresh demo org never pitches "Coming soon".

- **SETUP ASKS AS INBOX CARDS — SHIPPED 2026-08-07** (deployed as
  087f4c9; Phase C slice 1, "setup asks ARE proposals"). Three ask-first
  capabilities — `setup_hours` / `setup_chairs` / `setup_booking_mode` —
  registered non-grantable (facts only the clinic knows, no cadence to
  hand over), filed by `generateSetupProposals` as the FIRST generator
  step (the manufactured week-1 aha: a day-0 org's first hourly tick puts
  the employee's questions in the inbox). AI-free, file once ever
  (unbucketed sourceKeys), no expiry — questions wait, work drafts don't.
  The seeder now stamps `hoursSource='seeded'` so "our guess" is a fact,
  not a shape-heuristic ('confirmed' = the card's approve; readiness
  trusts seeded < manual/confirmed/google, with the shape fallback for
  legacy rows). The approve API grew a structured `payload.answer`
  channel (pre-claim write, subject-edit pattern; never stashes
  originalBody); executors carry live staleness (a fact set elsewhere
  retires the card, never overwrites a human's value — except booking
  mode, where re-answering is deliberately last-write-wins like the
  Settings toggle it mirrors). The Inbox renders per-ask affordances:
  hours = "Yes — that's my week" + a "Fix them instead" settings link;
  chairs = a number field; booking mode = a two-option radio,
  requests-first recommended. The invalidation sweep retires
  answered-elsewhere cards each tick. Suite 6,380 → 6,395.

- **THE INVITE DOOR — SHIPPED 2026-08-07** (deployed as 8f1ee9e). The
  §1.7 conversion gap closes: `CreateManagedClinicInput` grew an
  operational `dossier` (phone, address, IANA timezone validated via Intl
  — an unknown zone is dropped, never stored — and the Google place id,
  which seeds `clinic_review_config`'s writereview link before the owner
  ever logs in), and `convertProspectAction` now maps the WHOLE prospect
  record instead of two fields. A converted California practice no longer
  runs its reminders on America/New_York; /book's call-us fallback has a
  phone from day one. The Path B routing already existed
  (accept-invite → /welcome for owners whose site needs the AI pass) and
  the setup cards + go-live lever apply to managed orgs automatically, so
  the invite → machine-led-setup flow is now end-to-end: provision →
  invite → accept → AI interview → setup cards in the inbox → go-live
  lever. Suite 6,395 → 6,398. NOT yet carried: the manual add-clinic
  form has no address/phone inputs (the dossier's main source is prospect
  conversion; form fields are a later nicety).

### §2.6 — NexHealth Synchronizer install reality (researched 2026-08-08)

The owner's suspicion was correct: there is NO one-click OAuth for
server-based PMSes. The Synchronizer is a Windows service installed ON THE
PRACTICE'S SERVER (same machine as the PMS database). How it gets there
depends on the PMS:

- **Dentrix / Eaglesoft / Open Dental (server-based): SELF-INSTALL.** The
  DEVELOPER (us) creates an Institution + Sync in the NexHealth developer
  portal, gets a unique product key + installer link, and the installer is
  run on the practice's server with admin rights — by us on a remote
  session, by the practice's IT, or by NexHealth's Integrations Team
  remoting in via ConnectWise. Practice prerequisites: admin PMS login,
  antivirus not blocking, ports 4506/4505/443 open. Keys are single-use
  once an install completes.
- **Other on-prem systems: NEXHEALTH INSTALLS.** Scheduled through the
  portal; allow up to 72 business hours.
- **Cloud PMSes (Denticon, Ascend, Curve…): no server install.** NexHealth
  wires the backend from submitted credentials + a Chrome extension on
  each workstation (practice IT installs those).

**Fees:** practices pay nothing ("no setup fee, no subscription").
Developers pay NexHealth's API pricing — NOT public; whatever the owner's
signup agreement says governs (check the developer portal / agreement).
**Sandbox:** each developer org gets one sandbox key + a demo practice;
our PRODUCTION key verified live but holds ZERO institutions (probe
2026-08-08) — the demo practice rides the sandbox key, which we need from
the portal to build against.

**Design implication:** the "connect your practice software" step is a
REQUEST-AND-NARRATED-WAIT flow (the §3.1 finding again — the PMS connect
is the universal hard gate, always with humans in the loop), not an OAuth
button: clinic tells us their PMS → we create the institution+sync in the
portal → the install happens (us remote / their IT / NexHealth's team,
72h) → our app polls /locations until data flows → sync binds and the
wait-card retires. Sources: the installation guide, the
institutions/syncs/locations doc, and the server-based help article at
docs.nexhealth.com / help.nexhealth.com.

- **NEXHEALTH SYNCHRONIZER, WIRED IN — SHIPPED 2026-08-08** (deployed as
  bda4a1a; §2.6's engine half). `lib/nexhealth.ts` (lazy client: token
  mint/cache with 401 re-mint, defensive pagination with a runaway
  backstop, sandbox/production switch — BOTH keys platform-level App
  Runner secrets, mapped into the service config same deploy) +
  `lib/services/pms/nexhealth.ts` implementing the existing
  `PmsProviderClient`, so the whole audited sync engine (entity map,
  content-hash skip, health monitor, hourly cron, readiness) drives it
  unchanged. READ-ONLY v1: `connectNexHealth` pins syncDirection
  'import'; write-backs are typed refusals; recalls honestly [] (no
  endpoint — probed 404). Status mapping validated LIVE against the
  sandbox demo practice (104 patients / 353 appointments, Dentrix
  shapes) via a key-gated vitest suite (CI skips; run locally with
  NEXHEALTH_SANDBOX_API_KEY). Scope rides pms_connection.meta
  {subdomain, locationId, env} — no migration, no per-org secret. The
  integrations page keys the PMS card by PROVIDER (a bridge connection
  never lights Open Dental); the clinic-facing catalog card is
  request-access with the Reach Support copy law; the platform bind
  card lives on /ecommerce/customers/[id] and validates against the
  live API before saving. REMAINING for the next slice: the clinic-side
  request-and-narrated-wait flow (PMS picker card → ops queue → honest
  "their queue, not yours" status), appointment-type name resolution,
  and write-back (booking insert) once the read path has run against a
  real practice.

### §2.7 — NexHealth unit economics + the owner's three rulings (2026-08-08)

**Pricing (owner-confirmed from the portal): $0.10/API call ·
$0.03/webhook · free tier 30,000 calls + 10,000 webhooks per month
(account-wide).** Current usage: 2/30,000 — zero exposure while nothing
real is bound.

**The math on the CURRENT adapter shape (hourly full polling)** — a
1,500-patient practice ≈ 8 patient pages + 2 appointment pages + 1
provider call ≈ 11 calls/hour ≈ **~7,900 calls/practice/month**. Beyond
the free pool that is **~$790/practice/month** — 16× the planned $50
add-on. UNSHIPPABLE to a real practice as-is; the free tier hides it for
only ~3-4 practices.

**The target shape (the "sync economics" slice, REQUIRED before the
first real binding):**
- Appointments: poll every 2h with a NARROW window (yesterday → +14d,
  usually 1 page) ≈ 360 calls/mo.
- Patients: full reconcile DAILY (not hourly — charts change slowly; the
  operational day rides appointments) ≈ 250 calls/mo.
- Providers/locations: weekly ≈ 5/mo.
- **≈ 600-700 calls/practice/month** → the free pool carries ~45
  practices at $0; beyond it ≈ **$60-70/practice/month at list price** —
  roughly breakeven against a $50 add-on, and the point where a NexHealth
  volume-pricing conversation happens (list rates are the
  pay-as-you-go tier; the account page links a Billing upgrade).
- **A hard per-org METER + circuit breaker** (mirrors ai_usage): every
  NexHealth call counted per org per day; a per-practice daily budget
  (default ~60 calls ≈ 1,800/mo ceiling ≈ $75 worst case — inside the
  owner's stated $60-70 tolerance); the breaker pauses that org's sync at
  budget + files a Guardian-visible engine failure, so ONE practice can
  never run the bill (a stuck pagination loop is the nightmare case: the
  MAX_PAGES backstop caps a single run, the meter caps the day).
- Webhooks ($0.03/event) are NOT an automatic win: a high-churn office
  (~150 events/day) costs ~$135/mo in webhooks alone vs ~$65 polled.
  Evaluate selectively (appointment events only) where 2h freshness isn't
  enough; the 10k free pool covers early experiments.

**Owner rulings recorded:**
1. PMS sync is the #1 retention/selling feature — celebrate accordingly.
2. **Synced data must flow through the ENTIRE platform** — every slot
   that can hold a synced fact must fill cleanly. Riding the existing
   provider interface means patients/appointments/providers/balances
   already reach the patients list, timeline, agenda, collections,
   recall, journey stages, and the readiness fact — but this ruling
   demands a SYNC COMPLETENESS AUDIT slice: map every NexHealth field →
   platform slot, verify each end-to-end (the sandbox demo practice is
   the fixture), and close gaps (appointment-type names, operatory →
   chair signals, provider records → booking attribution).
3. Planned pricing: **$50/mo PMS add-on**; tolerable variance $60-70 for
   an outlier practice; never unbounded — the meter above is the
   enforcement, not hope.

- **DEMO ↔ SANDBOX RAILS — SHIPPED 2026-08-08** (deployed as 880b077;
  owner ruling: the Dream Dental demo becomes NexHealth's sandbox
  practice — living test bed for cost tuning, the completeness audit's
  fixture, and a demo where the PMS sync is REAL). Two rails shipped
  ahead of the binding: (1) `deliver()` drops RFC 2606/6761-reserved
  addresses (example.com/.net/.org/.edu + .test/.invalid/.example/
  .localhost) at the ONE delivery choke point — the sandbox's 104
  @example.com patients can never be mailed, and the prod Resend-422
  seam bug (2026-08-07 boot logs) is dead; (2) `connectNexHealth`
  refuses a non-sandbox env on a demo org (the documented exception to
  isDemo-never-networks: the SANDBOX is a fake-patient test service).
  Verified safe: the demo resync only touches provider-'demo'
  connections, so the binding survives every deploy; the hourly
  pms-sync cron picks the binding up automatically. Test fixtures using
  @example.com moved to a non-reserved stand-in (the guard broke them —
  correct behavior, stale fixtures; ALSO the session's process note: a
  red suite reached main because a push was chained before the results
  were read — twice now; pushes are no longer chained with checks).
  BINDING IS AN OWNER CLICK: Platform → Clinics → Dream Dental →
  NexHealth card → subdomain `dream-create-demo-practice` · location
  `353605` · Sandbox ✓ → Bind + test. Note the binding REPLACES the
  demo's simulated 'demo' PMS connection (the crafted write-op showcase
  rows freeze in place; real sandbox sync takes over) — reversible by
  disconnecting and re-entering the demo, which re-activates the
  simulated one. BOUND BY THE OWNER 2026-08-08; the first
  import ran clean the same hour (cron fired manually: scanned 1 /
  succeeded 1 / failed 0 against org_cef2cf2ce26d) — the demo clinic is
  now a LIVE NexHealth-synced practice and the standing test bed.

- **NEXHEALTH COST ENGINEERING — meter + breaker + delta sync + cadence
  — SHIPPED 2026-08-10** (§2.7's three rulings made mechanical; migration
  0148 `pms_api_usage` (org, UTC day, calls) unique-keyed upsert). Four
  layers, cheapest lever first: (1) **DELTA SYNC** — `updated_since` is
  verified server-side filtering (probed both directions against the
  sandbox 2026-08-08), so `listPatients`/`listAppointments` now forward
  the engine's high-water mark and a quiet hour costs ~3 calls returning
  nothing instead of a full multi-page pull; appointments keep the wide
  schedule window (90d back / 365d forward) and let `updated_since` do
  the filtering; cold start (no mark) is the one intentional full pull.
  The provider interface grew `listPatients(opts?: { since })` — OD and
  demo ignore it unchanged (OD has no list-side DateTStamp filter; the
  content-hash skip already absorbs its full pulls). The mark is safe as
  a patient watermark because patients complete strictly before the
  appointment phase advances it. (2) **THE METER** — `lib/services/pms/
  api-meter.ts`; every outbound HTTP request (401-retry included)
  increments the (org, day) counter BEFORE the request goes out via the
  client's `onCall` hook, so a crashed run can never under-report.
  Metering never throws — it must not break the call it measures.
  Sandbox is metered (the counters are the tuning instrument) but free.
  (3) **THE BREAKER** — `assertPmsApiBudget` at the top of every list
  operation, production-only: at the daily budget (default 60 calls/day,
  `NEXHEALTH_DAILY_CALL_BUDGET` to override) the sync throws
  `PmsApiBudgetExceededError` and fails LOUDLY — the cron's failure path
  alerts the clinic and the Guardian sees a broken engine — instead of
  the bill saying it quietly. An unreadable meter fails OPEN: spend
  protection must not also take the sync down. Worst month at the
  default budget ≈ 1,800 calls ≈ $180 at list — bounded and visible,
  and only past the 30k/mo free pool, which absorbs the early fleet
  entirely. (4) **CADENCE** — the hourly cron now skips NexHealth orgs
  whose last sync landed under 105 minutes ago (`shouldSkipForCadence`),
  landing them on every OTHER tick (~2h): with deltas the cost is
  per-RUN, so halving cadence halves the steady bill. 105 not 120 so
  EventBridge jitter can't stretch an org to 3h. OD keeps hourly (free
  calls); manual "Sync now" is a different path and is never gated.
  Projected steady state: ~12 runs/day × 3 calls (providers + patients
  delta + appointments delta; the ~hourly token mint is shared
  platform-wide, not per-org) ≈ 36/day ≈ 1,080/practice/month — the
  30k/mo free pool carries ~27 steady practices before the first billed
  call. Past the pool a practice runs ~$108/mo at list, which is ABOVE
  the $50-70 comfort band — the recorded plan for that day, in order:
  (1) webhooks ($0.03/event, near-zero polling — the real fix), (2)
  volume pricing, (3) stretch cadence to 3h (~$72). Not pre-solved now
  because at 2 practices the bill is $0 and freshness on the #1 feature
  wins. The
  platform bind card now shows the month's call count. Tests:
  tests/pms/api-meter.test.ts (upsert shape, never-throws, breaker
  at-budget + fail-open, env override) · tests/pms/nexhealth-metering.
  test.ts (delta pass-through, breaker-before-HTTP, sandbox exemption,
  hook wiring) · cadence pins in tests/automation/pms-sync-failure-
  streak.test.ts.

- **SYNC COMPLETENESS, PASS 1 — SHIPPED 2026-08-10** (owner ruling: "if
  our platform has a slot for that information, it needs to show up
  there, and it needs to do so cleanly"). Live sandbox inventory first
  (full record dumps + endpoint probes; artifacts informed the map):
  the patient record carries gender, guarantor_id, unsubscribe_sms,
  preferred_language/locale, chart_id, billing_type; appointments carry
  appointment_type_id, operatory_id, checkin/checkout/cancel timestamps;
  /appointment_types (names + minutes + bookable flags), /operatories
  (chairs), /insurance_plans, /availabilities (provider schedules!),
  /payments + /charges (empty in sandbox), /webhook_endpoints all exist;
  /insurance_coverages, /guarantors, /documents do NOT (coverage rides
  the patient record via include[] — VERIFIED on the LIST endpoint, so
  insurance costs ZERO extra calls). What now fills, each into its
  existing slot: **insurance** (carrier / member id / group #) onto the
  patient's insurance columns — PMS-wins-when-present, absent never
  wipes what the front desk typed; **visit types** through a day-cached
  appointment-type name map (~1 extra call/day, not per sync) onto the
  visit-type vocabulary via keyword mapping, unknown names honestly
  'other', absent keeps the row's current type; **provider roles** from
  nexhealth_specialty (dentist/hygienist/assistant, unknown →
  specialist); **preferred language** (Spanish detection, token-safe so
  'Estonian' ≠ es); **PMS "do not text"** → a STANDING opt-out through
  the consent spine's recordSmsOptOut (the only lawful writer), applied
  once, never opting anyone IN, and only START clears it after; **PMS
  guarantor → portal guardian for MINORS ONLY**, only into an empty
  slot, never adult-to-adult (the guardian slot grants portal
  visibility — a consent question for adults, so deliberately not
  automated); **chair count** from active operatories fills an EMPTY
  clinic_profile.chairCount (never overwrites; retires the setup_chairs
  ask as answered-elsewhere; zero steady-state calls once filled). The
  patient/appointment content hashes grew the new fields (one-time full
  update pass per fleet, then delta-quiet). No new tables, no new
  columns — every fact landed in a slot that already existed. NOT
  pulled yet, recorded for later passes: gender (no platform slot),
  /availabilities → booking slots (the OD-blocked schedule feature could
  work TODAY through NexHealth — flagged as its own slice),
  payments/charges (empty fixtures; revisit when a real practice syncs),
  webhooks (the at-scale cost fix). Cost shape unchanged: ~3 calls per
  delta run + ~1/day for the type map; operatories only while chairs
  unknown. LIVE suite extended (types resolve, opt-outs + insurance
  survive normalization, chairs=2 — the sandbox's OP3 is inactive and
  the honest count is the active ones).

- **TEXTING KICKOFF + THE INCLUDED SEGMENT BUDGET — SHIPPED 2026-08-10**
  (ruling #10 made mechanical; the last green-lit item of the approved
  build order). Three pieces. (1) THE BUDGET STOP: the plan includes
  `INCLUDED_MONTHLY_SEGMENTS` = 2,000 segments per rolling 30-day window
  (env-overridable; ≈ $18 worst-case marginal at AWS's per-segment
  price); `deliverSms` refuses MARKETING sends past it with the typed
  `over_budget` refusal at the one choke point no campaign path can
  route around — and transactional reminders NEVER see the check,
  because a budget must not silence a practice talking to its own
  patient about their own visit. The marketing-send loop treats
  over_budget as org-level and stops burning the batch. An unreadable
  counter fails OPEN (same posture as the PMS meter). (2) USAGE
  HONESTY: `getSmsUsage` + the line on /integrations/sms — "N of 2,000
  included segments used this month", with the 80% nearing note and the
  at-cap explanation (marketing pauses, reminders keep going). (3) THE
  DAY-0 CARD: `setup_texting` joins the setup asks (registered
  ask-first, NOT grantable, in SETUP_CAPABILITIES) — filed once-ever
  while the driver is live and no registration exists, because the
  carriers' review takes WEEKS and every day the question waits is dead
  air later. The card carries the carriers' one form (EIN · business
  type · contact at the practice — the same four fields as
  /integrations/sms) as a JSON answer; the executor hands it to
  `startSmsRegistration`, the SAME single entry the settings form uses,
  so demo-refusal/driver-gate/validation live once. Already-started
  elsewhere retires the card (never a second carrier filing); the sweep
  retires it when the settings form answers first. Field issues come
  back as one readable line. Remaining from ruling #10: nothing — the
  overage behavior (pause vs metered past the included budget) stays an
  explicitly-deferred owner call, currently PAUSE by construction.

- **THE KILL — trial expiry shuts everything down — SHIPPED 2026-08-10**
  (owner ruling: "when a free trial ends, we kill everything for that
  clinic"; until now only the dashboard walled and the site, portal,
  booking and every engine kept running for free, forever). One resolver
  (`lib/services/billing-state.ts` — `listShutDownOrgIds` /
  `isClinicShutDown`), one rule: `resolveTrialState(...).expired`, the
  dashboard wall's own, so the wall and the kill can never disagree.
  FAIL-OPEN everywhere: an unreadable database shuts down nobody. What
  dies: the PUBLIC SITE (coming-soon for EVERYONE — editors and gallery
  frames included; robots.txt disallows; sitemap 404s), BOOKING (both the
  direct action and the request form refuse a hand-crafted POST too), the
  PATIENT PORTAL (calm phone-first notice in the clinic's own palette —
  the machine's quarrel is with the practice's bill, never the patient,
  so no billing words appear), and every OUTBOUND ENGINE: visit + forms
  reminders, review auto-asks, retention automations, the daily digest,
  the proposal generators (cards would sit invisible behind the wall
  while drafts spend AI money), and the metered PMS SYNC (NexHealth
  polls are real dollars on a dead account). Scheduled campaigns AND
  scheduled patient messages stay PARKED, not cancelled — excluded from
  the claim itself, so paying releases them untouched on the next tick.
  DELIBERATELY NOT killed: patient payment-plan charges (money patients
  owe the practice through Stripe Connect — a contractual flow between
  them, not our feature to switch off), internal-only bookkeeping
  (follow-up rules, loyalty accrual — invisible, free), and the Guardian
  (already billing-aware). Reactivation is just paying: every gate reads
  live state, nothing is deleted, the machine wakes on the next tick
  after Stripe says active. Tests: tests/billing/shutdown.test.ts (who
  is dead, who is alive, fail-open) + the shutDown cases in
  tests/clinic-site/go-live-gate.test.ts.

### §2.8 — Write-back research (2026-08-11, BEFORE any code — owner
directive: "if our app has any issues and we push that into the clinic's
live PMS, we could get scorched")

Verified against docs + LIVE sandbox probes (probe records created and
cancelled same-minute; the "Writeback Proof" test patient remains in the
sandbox and will appear in the demo org via sync — harmless, and a
standing proof of the loop):

1. **POST /appointments** requires patient_id + provider_id + start_time;
   `operatory_id` REQUIRED when the location maps bookings to operatories
   (ours does — most Dentrix shops do); `appointment_type_id` OPTIONAL —
   and a WRONG type for the operatory is REFUSED ("not configured for the
   requested slot") while a typeless write is accepted. `note` ≤128 chars
   lands in the EHR. `notify_patient=false` always — WE own patient
   comms; their notifications double-text.
2. **NexHealth's server is itself a guard**: a second booking into the
   same operatory+time is REFUSED ("this time is no longer available") —
   double-book protection under our own slot math. Required-field and
   type-pairing validation likewise server-side, with readable errors.
3. **POST /patients** requires provider_id + first/last + EMAIL + DOB +
   PHONE — the exact missing-required-field hazard the owner named. A
   DreamCRM patient lacking any of these CANNOT be written; the design
   answer is a typed, visible refusal naming the missing fields, never
   invented data. `return_existing_if_match=true` makes creation
   dedupe-safe server-side (200 + existing chart instead of a duplicate).
4. **Writes are ASYNC into the PMS**: a 201 means NexHealth accepted it
   (foreign_id null, foreign_id_type "nex"); the Synchronizer inserts it
   into the practice's system later — offices power servers off nightly/
   weekends, so hours-long write downtime is NORMAL. The
   `appointment_insertion` webhook fires complete/failed;
   GET /sync_status reports read/write health per install (empty on the
   sandbox — no real Synchronizer behind it).
5. **PATCH /appointments/{id}**: vocabulary is confirmed / cancelled /
   checkin_at / times / operatory / note — NO no_show or completed.
   CANCEL works even before the appointment reaches the PMS; CONFIRM is
   refused until synced ("not synced with the PMS and/or a live client")
   — a WAITING state, not a failure, and the queue must not burn retry
   attempts on it.
6. **GET /appointment_slots** returns their real bookable slots WITH the
   operatory to book into — the pre-write validator (and the foundation
   of the future booking-from-real-schedules slice).

**The safety design (v1):** appointments only — create + cancel (+
confirm when synced); no patient demographic edits, no no_show/completed
(no API vocabulary). Per-clinic write switch OFF by default
(syncDirection stays 'import' at bind; an explicit platform-ops toggle
flips 'two_way' per practice). Before every create, validate the slot
against THEIR slot engine (/appointment_slots) and take the operatory
from the matching slot — if their schedule says the time isn't open, we
REFUSE to push and say so, because "our app disagrees with their PMS" is
exactly the scorching scenario; the honest failure lands in the write-op
log. Omit appointment_type_id entirely in v1 (typeless is legal; wrong
is refused). New-patient writes ride return_existing_if_match and
refuse with named missing fields — and the LIVE suite caught that the
flag only works under the v3 API header (`Nex-Api-Version: v3.0.0`);
under the legacy v2 Accept header it is silently ignored and a
duplicate ERRORS. Writes therefore speak v3 (reads stay on v2, the
shapes the whole import pipeline is validated against), with a belt:
the duplicate error names the existing chart id, and the adapter
recovers it instead of failing into a retry loop. The queue's existing hardening
(idempotent retries, orphan-id recovery, cancel-supersedes-create,
6-attempt cap, audit payloads) carries over; two NEW typed states:
WAITING (PMS offline / not-yet-synced — retries without burning
attempts) and NOT-SUPPORTED (no_show/completed — op marked skipped, not
error). Cancels are exempt from the daily call budget (compliance-
critical: the #1 integration complaint is reminders to already-cancelled
patients); creates are not. The DEMO org is the proving ground: its
binding writes into the sandbox, so the full loop can be demonstrated
with zero real-world risk before any live practice flips the switch.

- **WRITE-BACK v1 — SHIPPED 2026-08-11** (research-first per the owner
  directive; §2.8 above is the full research record + safety design).
  What shipped: `nexWrite` (POST/PATCH transport, metered, 401-retry,
  v3 header, API error text preserved verbatim for the audit trail) +
  `listAppointmentSlots` (their real bookable slots, with operatory);
  adapter `createPatient` (named-missing-fields refusal, dedupe via
  return_existing_if_match + the recover-the-named-id belt) /
  `createAppointment` (slot-validated against THEIR engine, operatory
  from the matching slot, typeless in v1, notify_patient=false, 128-char
  note) / `updateAppointment` (cancel only; confirm-not-synced → WAITING;
  no_show/completed → NOT-SUPPORTED); the queue's two new lanes
  (`settleWriteFailure`: WAITING retries without burning attempts —
  practice servers sleep nightly; NOT-SUPPORTED parks as skipped); and
  the per-clinic WRITE-BACK SWITCH on the platform bind card (OFF by
  default; bind still pins 'import'; flipping to two_way is a deliberate
  platform-ops act). LIVE-verified end-to-end on the sandbox: existing
  chart reused, booking placed into a real open slot, cancelled, plus
  the double-book refusal and the operatory×type validation observed
  first-hand. NOT in v1, recorded: appointment_insertion webhook
  confirmation (rides the webhooks slice), confirm write-back queueing
  (the queue never files 'confirmed' ops today), patient demographic
  edits (deliberately never), commlog (no endpoint — typed skip). Next
  human step: flip the demo org's switch and make a portal booking to
  watch the loop live, sandbox-side, before any real practice.
