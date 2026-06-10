# DreamCRM — Design Charter

This is the durable strategy + design-principles document for the platform.
Re-read it before designing any new module. It captures the decisions we've
made about *what we're building, who for, and how* so future sessions don't
re-derive them from scratch.

---

## What we're building

A unified **CRM + CMS + commerce + portal** platform for dental clinics, sold
as the **operating layer that wraps a clinic's existing practice management
system (PMS)**.

The clinic's public website is the foundation. Every other module bolts onto
it. Sold at $200/mo (eventually ~$400/mo) by replacing 5–6 separate vendor
subscriptions a typical clinic juggles today.

We are **not (yet) a PMS**. We do not manage treatment plans, charts,
procedures, insurance claims, encounter notes, lab orders, or any other
clinical workflow. We are deliberately the **relationship layer** — leads,
bookings, intake, communications, portal, marketing, products, reviews —
sitting on top of whatever PMS the clinic already runs.

The shape we're building can grow into a PMS years from now. That is not the
goal today. Today's goal is to be the world's best patient-relationship
platform for dental clinics, period.

---

## Why this works

Research findings (full reports in chat history; key data points pinned here):

- A typical dental clinic runs **5–10 separate software tools** at
  **$800–$2,000/mo** in software spend, climbing past $3,000/mo with IT and
  marketing.
- The **PMS layer** (Open Dental, Dentrix, Eaglesoft, CareStack) is sticky:
  $5K–$20K and 12–16 weeks to switch, insurance claims don't transfer,
  imaging in proprietary formats. **No clinic is switching their PMS for us.**
- The **orbital layer** (website, booking, comms, forms, reviews, portal,
  marketing) is *not* sticky. Clinics consolidate vendors in this layer
  routinely; switching costs are weeks not months, no claims to rebuild.
- **74–83% of dental practices have NO online booking at all.** Greenfield.
- The clinics that do have booking (NexHealth, Modento, LocalMed) are locked
  in by PMS-integration depth, not by love of the booking tool.
- Adit's documented "save your practice up to $12,000/year" consolidation
  pitch is industry-validated.
- "Dental-only specialization" is a primary trust signal; generic CRM/website
  tools get dismissed quickly.

**Our wedge**: replace 5–6 logos in the orbital layer for $200–400/mo, save
~$1,000/mo of vendor fees, keep using the PMS the clinic's team already knows.

**Our competitive landscape**: orbital-layer vendors — Weave, Modento,
NexHealth, Adit, RevenueWell, Solutionreach, LocalMed, Lighthouse, PBHS,
ProSites — not the PMS incumbents. Open Dental's published third-party vendor
list is the actual map.

---

## What we're not (out of scope, deliberately)

To prevent scope creep, these are explicitly NOT in v1 or v2:

- Treatment plan management
- Tooth charting / odontogram
- Procedure code catalog (CDT) + per-procedure fees
- Insurance claim submission / EDI / clearinghouse
- Encounter / SOAP notes
- Lab order tracking
- Multi-PMS clinical data sync
- Real e-prescribing (refill *requests* are a form; actual prescribing is
  regulated and out of scope)
- Generic / multi-industry positioning — every default optimizes for dental

---

## Strategic principles

These shape every decision. Re-read before any module design.

1. **Wrap, don't replace.** Every module integrates with the PMS the clinic
   has, including offering embed slots for tools they refuse to switch from
   (NexHealth booking widget, third-party form vendors, etc.). Open Dental and
   Dentrix integrations are non-negotiable trust signals on the near-term
   roadmap even if we don't ship them in module #1.

2. **The website is the trunk.** Every patient-facing module (booking, shop,
   forms, portal, reviews) lives as a *surface* on the clinic's branded site,
   not a standalone destination. The CRM side is the staff cockpit; the
   website side is the patient storefront. Both are the same product.

3. **"What do clinics want" beats "what should we propose."** Research clinic
   preferences before deciding any module's shape. Bias toward what serves
   them, not what's clever for us. Run a focused research pass before
   designing any module.

4. **Dental-only specialization is a feature, not a constraint.** Defaults,
   copy, illustrations, examples, integrations — every surface visibly
   dental. Generic-looking platforms get dismissed.

---

## Visual + interaction principles

5. **Modern healthcare DTC, not clinical medical.** Warm off-whites + earth
   tones + candid real-staff photography. Reference: **hellotend.com** —
   currently the only dental brand operating at modern healthcare DTC level.
   Avoid: saturated corporate medical blue, pure white, stock smile-women,
   "Welcome to our practice" boilerplate.

6. **Action at a glance.** Every entity card — patient, appointment,
   treatment plan, invoice, message, task — communicates its required next
   action without a click. Patterns borrowed from Linear (Triage), Front
   (open vs. archived), Intercom (waiting since), Pipedrive (rotting deals).

7. **Ball-in-court is first-class.** Every entity has an implicit owner of
   the next action — us or them. Show signals (aging, warnings, counts) only
   when the ball is on our side. Quiet when waiting on the patient.

8. **Aging is visible.** Pipedrive "rotting" pattern: cards drift from green
   → amber → red as inactivity grows. Treatment-plan-presented-30d-unsigned,
   balance-over-30d, no-future-appointment all get this treatment.

9. **Office-manager UX is the moat.** Every screen ruthlessly simple for
   daily users. The CareStack failure mode ("tries to accomplish too much on
   any given page," "too many steps to do one thing") is the anti-goal. If
   a non-technical person can't do the common task in one click without
   training, redesign.

10. **Anti-shame voice is category-defining for dental.** Tend's "no
    judgment, ever" line is the single best example of voice in this
    category. Bake into default template copy.

---

## Engineering principles

11. **Vertical slices, not horizontal layers.** Each module ships
    schema + service + UI + tests in one PR. No mock-data UI work — it lies
    about data shape and creates rework.

12. **Tenant scoping is non-negotiable.** Every read filters by
    `organizationId`, every insert sets it, every test pins WHERE-clause
    org-id literals. See `tests/tenant-scoping/` for the regression pattern.

13. **Every new feature has audit-log coverage.** Inbox audit log
    (`inbox_action_log`) is the prototype. PHI-adjacent mutations get the
    same treatment so we can answer "who did what when" cleanly.

14. **Server-only services in `lib/services/`** marked `import 'server-only'`.
    Client-safe types live in `lib/types/`. Server actions live next to the
    route as `actions.ts` (user) or `admin-actions.ts` (platform-admin).

15. **Tests before merge, every time.** Vitest suite runs in <20s; no excuse
    to skip.

---

## Visual design language

### Typography
- Geometric/humanist sans for everything (Inter, GT America, Söhne, or similar)
- Two-weight contrast: 700 display + 400 body
- Display 48–64px desktop / 32–40px mobile; tight letter-spacing -0.01 to -0.02em
- Body 16–18px, line-height 1.55, paragraphs capped ~65ch
- Optional serif-italic single accent word in headlines (cosmetic variant)

### Color
- Background: warm off-white (`#FAF7F2`–`#F5EFE7`), never pure white
- Text: warm dark ink (`#1C1A17` / `#1F2937`), never pure black
- Brand accent (clinic-customizable): sage `#9CAF9F`, dusty blue `#7C9CB8`,
  or terracotta `#D4A284` — premium-warm presets
- CTA pop: coral `#E87B5E` or warm amber `#F0A658`
- Forbidden defaults: corporate medical blue (`#0066CC`-style), pure white,
  pure black

### Photography
- Real staff. No stock smile-women. Template intentionally degrades visibly
  without real photos so clinics are forced to upgrade.
- Candid, mid-laugh, eyes-on-eyes, domestic lighting
- Interior architecture photography gets equal weight to people shots
- Clinical close-ups (teeth, gloves, injections) only on service detail
  pages — never homepage

### Motion
- Subtle fade-and-rise on viewport entry (8–16px translate, 400–600ms ease-out)
- Hover scale 1.02–1.03 on cards
- Hero crossfade 6–8s on multi-photo heroes
- `prefers-reduced-motion` respected globally — all entrance animation off
- Forbidden: parallax, autoplay video with sound, cursor effects, WebGL heroes

### Performance bar
- Lighthouse mobile 90+ across the board
- LCP <2.5s, CLS <0.1, INP <200ms (Core Web Vitals "Good" at p75)
- Hero image preloaded with explicit dimensions
- AVIF with WebP fallback; `next/image` everywhere
- Font preload + `font-display: swap`

### Accessibility
- WCAG 2.2 AA contrast (4.5:1 body, 3:1 large text)
- Color always paired with shape, icon, or text — never alone
- Skip-link + visible focus rings on every interactive
- Tap targets ≥44×44px on mobile

### Mobile-first patterns
- Sticky bottom CTA bar: **Book** (brand color) + **Call** (tel: link),
  visible after first scroll, on every public-facing page
- Hamburger drawer nav with grouped services, Book pinned to drawer top
- One-handed reach: primary CTAs in lower third of viewport
- Single-column forms, 56px input height, native input types
  (`type="tel"`, `inputmode`, `autocomplete` hints), inline validation
- Maximum 4 fields on booking; longer intake forms post-booking

### Copy voice
- Short declarative + concrete promise
- First-person plural ("we")
- Numbers when possible
- Acknowledge friction explicitly
- Avoid: "patient-centric," "world-class," "state-of-the-art,"
  "compassionate care," "Welcome to our practice," "Schedule an
  Appointment" (use "Book Now"/"Book a Visit"/"Book a Consultation")

---

## Website templates

Three variants cover ~90% of premium dental positioning. Default install is
**Modern Family/Wellness**; others are clinic-switchable settings.

| Variant | Use case | Visual cues | Booking copy |
|---|---|---|---|
| **Modern Family/Wellness** *(default)* | General practices, family, hygiene-led | Warm cream + sage/dusty-blue accent + coral CTA; geometric sans 2-weight; lifestyle real-staff photos | "Book a Visit" |
| **Cosmetic/Luxury** | Cosmetic specialists, veneers, aesthetic | Charcoal/black + cream; serif italic display accents; magazine-rhythm layout; doctor-as-hero; no pricing surfaced | "Book a Consultation" |
| **Pediatric** | Kids' dentistry | Soft pastels + bright accent; illustration + photo blend; rounded sans, larger scale; parent-focused | "Book a Visit" |

All variants share: real-photo requirement, 4–6 service maximum on homepage,
sticky mobile booking bar, off-white background tokens, 2-weight typography
contrast, anti-shame voice slot in hero.

### Homepage section order (default Modern Family/Wellness)

1. Header — logo + slim nav + persistent **Book Now** + tel: phone
2. Hero — one viewport: photo, headline, subhead, primary CTA. Nothing else.
3. Stat anchors — 3–4 numbers ("8,000 five-star reviews," "Insurance
   accepted," "Same-week appointments")
4. Services — 4–6 numbered pillars (01/02/03), image-on-top cards
5. Meet the team — consistent-crop headshot grid, hover for bio
6. Testimonials — 2–3 long-form quotes with photo + first name + neighborhood
7. Office tour — interior gallery, architectural-photo treatment
8. (Optional) Membership / pricing transparency
9. Booking CTA section — second strong reminder
10. Footer — hours, map, contact, social, secondary nav
11. Sticky mobile bar — Book + Call

---

## Patient portal design principles

Research-grounded (2026-06 deep-research pass: ONC/HINTS federal portal data,
JMIR dental-portal study, Baymard, Tend/One Medical/Oscar design teardowns,
competitor customization docs). Durable rules for anything patient-facing
behind a login:

1. **The portal wears the clinic's brand, not ours.** Same warm-neutral
   ground + brand accent + display serif as the clinic's public site.
   A patient should never feel they left their dentist's world for
   "dental software." (Tend NPS 85 vs industry ~1 is the business case.)
2. **Every visit is a cold start.** Dental patients show up ~2×/year.
   Passwordless re-entry (magic link / OTP), task-first landing, zero
   reliance on the patient remembering anything.
3. **The next-visit card is the anchor object.** State-aware CTA on the
   card itself (confirm → fill intake → directions → reschedule), max 2-3
   verbs on the home screen, everything else behind a tab.
4. **Self-reschedule matters more than self-book.** It's the #1 gap in
   the best dental apps and the #1 clinic pain (cancellations). Always
   paired with a clinic-set notice window — inside it, route to the phone.
5. **Honest numbers or no numbers.** Balance shown with its as-of date and
   PMS framing; insurance shown with a "we'll verify" caveat; never an
   eligibility promise we can't keep. Cost surprise is dentistry's #1
   one-star theme — transparency is the moat.
6. **Toggles hide, never disable.** A feature a clinic turns off leaves no
   dead link, no greyed button (RevenueWell's documented dead-link toggle
   is the anti-pattern). Clinic customization = feature switches + notice
   windows + voice (welcome/announcement/aftercare copy) + preview-as-patient.
7. **Humans are one tap away on every screen.** Phone number visible
   everywhere; "Message us" framed as reaching the front desk. 70% of
   portal non-users prefer talking to a person — the portal routes to
   humans, it doesn't replace them.
8. **Real faces, anti-shame voice.** Provider headshots on visit cards,
   "no judgment" cancellation copy, plain words ("A few questions before
   your visit", never "Intake Form Submission").

## Module roadmap

Phased by what unlocks the most platform value with the least dependent work.
**Vertical slices**: each module ships schema + service + UI + tests in one PR.

### Phase 1 — The trunk
**1. Website / CMS** — three template variants; page editor; brand
   customization; blog scaffolding; SEO meta + sitemap + structured data;
   sticky mobile CTA bar; preview/publish workflow. Everything else attaches
   here.

### Phase 2 — Patient surfaces (the orbital-layer replacement story)
**2. Patient portal core** — login, appointments view, profile, balance.
   Lives at `{slug}.dreamcreatestudio.com/portal`.
**3. Online booking** — native widget (4-field mobile-first, deposit
   collection via Stripe, reminders via Twilio, intake prefill) + embed
   wrapper for clinics on NexHealth/Modento/LocalMed.
**4. Patient communications** — Twilio SMS + email, two-way, threaded by
   patient.
**5. Intake forms** — builder, e-signature, attach-to-appointment, prefill
   on next visit, portal surfacing.
**6. Reviews & reputation** — post-visit Google/Yelp/Facebook review prompts.

### Phase 3 — The differentiator
**7. Shop / discounts / birthday benefits** — selling dental products via the
   clinic's branded site with Stripe Connect; birthday-triggered coupon
   codes; loyalty mechanics. **The move no orbital-layer competitor ships.**
**8. Marketing deepening** — recall, birthday, reactivation triggers,
   segments, campaign automation (current `marketing` module gets the
   automation layer added).

### Phase 4 — Integration & cockpit
**9. PMS integrations** — Open Dental first (open API, friendly vendor
   list), Dentrix second. Run as parallel research/spike track from Phase 1
   onward so the integration architecture is anticipated in earlier modules.
**10. Patients module refinement** — unified cockpit view of all the data
    captured across modules: source attribution, lifetime engagement, last
    contact, balance, lifecycle stage. Naturally rich because earlier
    modules feed it.

---

## PMS integration architecture (Open Dental first; wrap, never replace)

Verified against Open Dental's live API sandbox + competitor/clinic research.
This is the durable shape; `CLAUDE.md` tracks what's shipped.

**Positioning (research-corrected).** Clinics don't consciously value the
official-API-vs-database-scraping distinction — they value *behavior*: it
doesn't break, no duplicate patients, no reminders to cancelled patients, it
doesn't die silently. The official API is *how we earn that reliability*
(survives OD version updates, can't corrupt the DB, OD will actually support
it, and OD publicly warns customers off the DB-scrapers — NexHealth, Adit).
Audit-cleanliness is the trust layer, not the headline. Be honest:
near-real-time on OD needs an office-side service (eConnector + OD API Service)
like every competitor — but via OD's *sanctioned* webhook Subscriptions, in the
Audit Trail, not a DB-scraping agent. The polling tier needs zero office
install (at the cost of lag). Never claim "real-time, no footprint."

**Layered architecture.** Connectors (per-PMS `PmsProviderClient` + a capability
model) → normalization (provider-agnostic DTOs) → sync engine (reconcile via a
durable entity-map + dedupe + content-hash; high-water `DateTStamp`; write-back
queue `pms_write_op` + retry; sync-health monitor) → modules. Ingress tiers:
Phase-1 scheduled `DateTStamp` delta polling (no office install); Phase-2 OD
webhook Subscriptions → `/api/webhooks/pms/[provider]`. The connector interface
+ capability flags are the seam that lets a new PMS slot in without touching the
engine.

**Entity scope (relationship layer only; clinical stays in the PMS).**

| Entity | Direction | Notes |
|---|---|---|
| Patients | two-way | PMS owns edits; we originate. Dedupe email/phone → name/DOB |
| Appointments | two-way | originate + **write back cancels/reschedules** |
| Providers / Operatories / Appt types | import | mapping + write targets (Op is required on writes) |
| Schedules / blockouts | import | real availability + which Op to write into |
| Recalls | import | feeds Recall & Outreach from the PMS's own recall engine |
| CommLogs | two-way | mirror our sends into OD's communication log |
| Balances | import | per-patient (absent from the list endpoint) |
| Procedures / claims / payments | **never** | clinical/financial boundary (payments only for a future text-to-pay) |

**Failure modes we design against** (from clinic reviews of
NexHealth/Weave/Modento): duplicate patients (strict match keys + entity-map);
reminders to cancelled patients (cancel/reschedule write-back + PMS-status
wins); silent sync stops (sync-health monitor + proactive alert — visible
status is itself the differentiator); stale availability (schedule-aware
booking); breaks-after-update (official API + version-pinned behavior); TZ
offsets (`AptDateTime` is office-local wall-clock with no timezone — store +
convert in the clinic's timezone).

**Multi-PMS roadmap.** Open Dental direct (wired). Dentrix Ascend direct next
(cloud REST, ~$47/mo/loc, no agent). Dentrix desktop / Eaglesoft / Curve via an
**aggregator connector** (Kolla at the low end, NexHealth for real-time) — one
integration for the painful long tail vs. per-PMS partner gates (~$3–5k
Eaglesoft PIC, etc.). Aggregators implement the same `PmsProviderClient`.

**Phasing.** Phase 0 correctness (`DateTStamp` delta + Offset/Limit pagination,
Op via schedules + default-op config, clinic-TZ datetimes, provider role via
`/definitions`, per-patient balance). Phase 1 depth (schedule-driven
availability, recall sync, cancel/reschedule write-back, CommLog mirroring,
sync-health alerts). Phase 2 real-time (webhook Subscriptions). Phase 3
multi-PMS.

**API facts (verified).** REST `api.opendental.com/api/v1` (the `ODFHIR` auth
scheme is a misnomer — not FHIR; the real FHIR endpoint is legacy/abandoned).
Permission tiers per location: Free read-only (1 req/5s), $30/mo writes (no
payments), $35/mo payments. Throttle is per CustomerKey (429 on over-limit);
Remote caps ~1000 elements/page → Offset/Limit loop. Developer Key is a
platform secret; per-office Customer Key (~15-min activation).

---

## Discipline / process

Before designing any new module:

1. **Research pass** — focused, agent-driven, on what dental clinics
   currently use, complain about, and want in this area. Capture verbatim
   quotes where possible.
2. **Scope confirmation** — is this a clinical problem (out of scope) or a
   relationship problem (in scope)?
3. **Competitive identification** — which orbital-layer vendor are we
   displacing? How are we materially better?
4. **Principles check** — does the proposed design pass the principles
   above? Specifically: wrap-don't-replace, website-as-trunk, action-at-a-
   glance, office-manager-UX.
5. **Design brief** — written, in conversation, with concrete proposed
   layout. Iterate on the brief before any code.
6. **Vertical slice PR** — schema + service + UI + tests.
7. **Demo against Acme Dental Demo** — the seeded clinic, viewable by
   platform admin via `View as` button. Real artifact for review.

When in doubt:
- Reference **hellotend.com** for dental visual + voice direction
- Reference **Linear / Front / Notion** for interaction patterns
- Reference **Open Dental's third-party vendor list** for competitive landscape
- Re-read this document

---

## Living document

This file is the durable source of truth. Update it when:
- A principle gets refined or added
- A module ships and the roadmap shifts
- Research changes our understanding of clinic preferences
- We decide something we'd otherwise re-derive next session

Don't update it for transient implementation details — those go in
`CLAUDE.md` or commit messages.
