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
