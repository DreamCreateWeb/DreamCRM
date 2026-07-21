# DreamCRM — Build history (session log)

The chronological record of what shipped, session by session — moved out of
`CLAUDE.md` (2026-07-02) so the working manual stays lean. Newest first.
Each entry preserves the implementation detail that was load-bearing at the
time; treat `CLAUDE.md` + the code as the source of truth for CURRENT state.

---

- **Buy-a-domain via name.com — dark build (2026-07-21).** Clinics can
  search, buy, and auto-attach a domain WITHOUT leaving the platform (owner:
  "search, buy, and attach automatically"). Ships DARK behind
  `NAMECOM_USERNAME`/`NAMECOM_TOKEN` (+ `NAMECOM_API_URL` for the
  api.dev.name.com test env, `NAMECOM_LIVE_PURCHASES=1` to arm real
  purchases — everything else = dry-run: search/pricing live, purchase
  simulated, no charge). Pieces: `lib/name-com.ts` (lazy Basic-auth v4
  client: search/checkAvailability [prices → cents], createDomain
  [price-pinned — name.com rejects a drifted quote], DNS records CRUD);
  `clinic_domain_purchase` (migration **0130**; org-scoped, partial-unique
  on live registering/active domains, dryRun flag, audit-friendly failed
  rows); `lib/services/domain-purchase.ts` — the money rails:
  premium + >$50/yr NEVER surface (`filterOffers`/PRICE_CAP_CENTS),
  re-quote at purchase (price moved → abort pre-charge), charge-then-
  register via off-session PaymentIntent on the clinic's existing
  platform-billing Stripe customer, AUTO-REFUND if registration fails
  after payment, then ZERO-TOUCH attach: `requestCustomDomain` (existing
  App Runner rails) returns the routing + ACM records and we write them
  straight into the zone we now own via the name.com API (apex routing →
  ANAME) — the clinic never sees a DNS screen; the existing /website/domain
  polling card takes over. UI: BuyDomainCard on /website/domain (search →
  offers w/ $X/yr → one confirm modal stating first-year + renewal price →
  purchase list w/ status pills; Test-mode pill while dry-run; hidden for
  the demo org). Actions owner/admin-gated + demo-blocked. Tests:
  `tests/domains/domain-purchase.test.ts` (9 rails). NOT YET BUILT:
  renewal billing cron (renewsAt is stored; charge ~30d out + release on
  decline), price margin (v1 passes name.com retail through), transfer-out
  support. TO TURN ON: mint a FRESH name.com token (one was pasted in chat
  2026-07-21 → burned, rotate it), add NAMECOM_USERNAME + NAMECOM_TOKEN to
  Secrets Manager, verify in dry-run, keep a funded card on the name.com
  account, then set NAMECOM_LIVE_PURCHASES=1.

- **Campaigns phase 3b — the fold (2026-07-21, owner: "fold it").** The
  clinic's campaign home is now ONE surface: `/growth/outreach`. The hub
  gained (1) the **New-campaign modal in its header** (templates + To
  audiences; consumes `?prefill_audience`/`?prefill_template`/`?new=1` —
  quick-create's "New campaign" now lands `?new=1` and auto-opens), and
  (2) an **All-campaigns history section** (`#campaign-history`):
  `listCampaignsWithFunnels` (campaigns + per-campaign
  sent/opened/clicked/booked in two queries), rows → the editor, status
  pills (same tone contract as the platform list), auto-send rows marked
  "auto", 20 shown of 50 fetched. `/growth/campaigns` (list) now
  **redirects clinic → hub with prefill params forwarded** (stale queue
  CTAs still land pre-targeted); the PLATFORM tenant keeps the standalone
  list (its campaigns aren't dental outreach) and `/growth/campaigns/[id]`
  (the editor) is untouched for both. Re-pointed clinic links: queue Send
  CTAs, audiences-client Send-campaign (tenant-branched), saved-views
  promote-to-audience push, the Growth hub's separate Campaigns door
  (removed — folded into the Recall & Outreach door copy), ⌘K's Campaigns
  entry (now an alias to the hub), hub-internal links (All campaigns ↓
  anchor; empty states point at "+ New campaign"). Campaign mutations
  revalidate `/growth/outreach` alongside the old paths. Guard test
  `tests/marketing/campaigns-fold-redirect.test.ts` (clinic redirect +
  param forwarding + platform keeps list); deeplink + quick-create tests
  updated to the new targets.

- **Campaigns phase 3a — the "To" picker (2026-07-21).** The new-campaign
  modal gained an optional audience select (this tenant's saved audiences,
  source-filtered: patients for clinics, customers for the platform;
  "Choose later in the editor" stays first-class; queue-CTA prefill
  preselects). The create flow is now complete in ONE modal: start-from +
  to + name. Phase 3's REMAINING move — folding the clinic's
  /growth/campaigns list into /growth/outreach (platform keeps its list;
  ~15 link call sites + trail/global-search registries + tenant-branched
  redirect w/ prefill-param forwarding) — is scoped and DEFERRED for an
  explicit owner go-ahead, since it removes a daily surface
  (STRUCTURE-AUDIT culture: move surfaces deliberately). Phase 4 (safety
  rails: upcoming-visit suppression, cross-system frequency cap, clinic-tz
  send windows; production-value attribution) also queued.

- **Campaigns phase 2 — automation honesty (2026-07-21).** The audit's
  biggest honesty gap: the retention automations sent HARDCODED copy the
  clinic could never see or edit. Now: (1) **Editable automation messages**
  — migration **0129** adds `campaign_templates.automation_kind`; an org's
  edited copy is a custom template row tagged with the kind
  (`upsertAutomationOverride`/`deleteAutomationOverride`/
  `getAutomationTemplate` in marketing-templates.ts; overrides are excluded
  from the Start-from picker). The engine (`retention-automation.ts
  runOne`) reads `getAutomationTemplate` at campaign creation, so the next
  auto-send picks up edits automatically. New editor at
  `/growth/outreach/automations/[kind]` (subject + preview + slim TipTap
  body, Customized/Stock pill, Save + confirm-guarded "Reset to the stock
  message"; members read-only; owner/admin enforced in the actions). (2)
  **A fourth automation: new-patient welcome** — weekly key
  (`welcome:<org>:<YYYY-MM-DD Monday>`) + 7-day `lastVisitWithinDays`
  window → each new patient welcomed exactly once (the reactivation
  window≈key-period trick); `clinic_profile.welcome_auto_send_enabled`
  (0129), wired through settings/toggle-action/audience-helper/preview
  counts. (3) **Proof on the card** — `getAutomationStats` (trailing-30d
  sent + BOOKED per kind from automationKey-prefixed campaigns +
  campaign_events); each automations-card row shows "Last 30 days: 43
  sent · 6 booked" only when it actually sent (honest empty), plus the
  Customized pill and an "edit the message" link. `RetentionKind` moved to
  client-safe `lib/types/retention.ts` (service re-exports it; the toggle
  action now validates via `isRetentionKind`, unblocking 'welcome').
  Tests: automation-overrides, retention-card, retention-automation
  updated (+welcome weekly-key case, 4-count preview), dead-control
  deeplinks mock extended. NEXT: phase 3 (the one-surface collapse) +
  phase 4 (safety rails, production-value attribution).

- **Campaigns phase 1 — templates wired into creation (2026-07-21).** The
  deep-dive audit (owner asked "think through the whole campaigns feature")
  found the New-campaign "Type" select was decorative (never stored, drove
  nothing) while a REAL template system (`campaign_templates`, 4 system
  templates w/ written content + custom-template support) sat orphaned —
  the queue even emitted `prefill_template`, which the campaigns page
  silently dropped. Fixes: (1) the modal's Type select → a **"Start from"
  radio picker** (Blank + system + the clinic's custom templates w/ a
  "Yours" badge; clinic-only — platform composes from blank;
  `marketingTerminology.campaignTypes` deleted as dead config). (2)
  `CampaignInput` gained `templateId`; `createMarketingCampaign` seeds
  subject/preview/body from the org-scoped `getTemplate` (explicit input
  wins; foreign ids drop silently — no cross-org copy leak) and stamps
  `templateId` for provenance + won-back attribution bucketing. (3)
  `prefill_template` honored end-to-end (queue CTA → auto-opened modal w/
  the template preselected). (4) NEW `lib/services/outreach-tiers.ts` —
  THE tier definitions (moved out of the queue page) +
  `ensureOutreachTierAudiences` find-or-create keyed by canonical names
  (matching the demo seeder), replacing the queue's fragile name-based
  audience lookup that silently degraded the Send CTA. (5) Queue back-link
  `/marketing` → `/growth/outreach`; stale doc comments fixed
  (audiences-client "v1.1" claim, marketing-templates header). Tests:
  `create-from-template.test.ts`, `outreach-tiers.test.ts`,
  `new-campaign-modal.test.tsx`. Phases 2–4 of the campaigns plan
  (editable automation copy + per-automation booked stats; the
  one-surface collapse; safety rails + production-value attribution) are
  designed and queued — see the session plan in chat 2026-07-21.

- **Messages reply + campaign editor → widgets (2026-07-21, composer-widget
  pass #2).** The `/messages` reply composer
  (`clinic-thread-detail-panel.tsx`) had the same sprawl the social page did:
  a controls row floating ABOVE the reply box (channel `<select>`, Templates
  button, ✨ Draft, 🌐 Español, 📎 Photo, prefers chip, ⌘Enter hint), a
  detached attachment tray, then the framed box with clock + Send. Collapsed
  into ONE card: textarea on top, attachment tray inside, bottom toolbar —
  emoji drawer (caret insertion via the shared `insertEmoji` splice),
  photo icon button, templates icon popover (accessible name "Templates"
  kept — clinic-messages-ui.test pins it), violet AI Draft/Español pills,
  channel select, schedule clock popover, Send. Prefers hint + ⌘Enter moved
  to a quiet footnote under the card. ZERO handler/capability changes.
  `components/ui/emoji-picker.tsx` gained a `direction: 'up'|'down'` prop
  (top-of-card toolbars open the drawer downward). The campaign editor
  (`growth/campaigns/[id]/campaign-editor.tsx`) got the chrome-merge: the
  separate ✨ AI bar row folded INTO the formatting toolbar
  (`EditorToolbar` now takes `children`), an emoji drawer inserts into
  TipTap (`insertContent`), and the optional Preview-text field folds
  behind a "+ Preview text" affordance until it has a value. Guard test
  `tests/messaging/reply-widget.test.tsx` (anatomy, emoji insertion,
  template drop-in, schedule reveal, send-disabled rules). Also assessed
  and SKIPPED: the follow-ups quick-add + new-campaign modal (already
  compact — no sprawl to collapse; "where it makes sense" cuts both ways).

- **Social composer → the post widget (2026-07-20, composer-widget pass #1).**
  Owner's direction: "turn forms into widgets where it makes sense … collapse
  all of it into a post widget with a single text field, an image button, an
  emoji button that opens an emoji drawer, and a dropdown to select which
  social media channels to post it to — sort of how Hootsuite does it but
  better." `/growth/social`'s Composer
  (`app/(default)/growth/social/composer.tsx`) rebuilt from the stacked form
  (channel pill rows + always-visible GBP segmented control/event/offer/CTA
  grids + a hero drag-drop zone + schedule checkbox) into ONE compact card:
  channels dropdown (face = overlapping brand logos + count, full picker w/
  aria-pressed rows in a pop-in popover; amber face when zero picked),
  borderless auto-growing textarea, inline media chip (upload progress +
  cancel; thumbnail + remove once attached; the WHOLE card is the drop
  target w/ a "Drop to attach" overlay), and a bottom toolbar — emoji drawer
  (new `components/ui/emoji-picker.tsx` primitive: curated on-brand sets incl.
  the dental corner 🦷, caret-position insertion via
  `selectionStart` splice + rAF caret restore), image button, schedule clock
  toggle (reveals the inline datetime + flips the button to "Schedule post"),
  Google-options drawer button (only when a GBP channel is targeted; houses
  the post-type segmented control + event/offer/CTA fields; dot badge when
  non-default, quiet "Google: Event/Offer" pill when closed), live tightest-cap
  counter, and the Post button. ZERO capability lost — all state/handlers/
  submit input untouched; the PostPreviews WYSIWYG column unchanged. Tests:
  new `tests/social-posts/composer-widget.test.tsx` (anatomy, no-sprawl,
  emoji insertion, dropdown toggling, schedule reveal, submit rules + full
  input, offer flow) + `tests/zernio/social-post-composer.test.tsx` updated
  to the widget anatomy (same intents, new paths). Legibility floor kept
  (no sub-12px). NEXT: apply the pattern to other sprawling forms where it
  fits; the dashboard widget-registry direction stays a later, separate build.

- **Notification tray — dismiss + clear-all tools (2026-07-16).** The header
  bell (`components/dropdown-notifications.tsx`, used in the shared dashboard
  header → clinic + platform tenants; the patient portal has separate chrome)
  had no way to REMOVE a notification — read ones piled up forever, with only
  "mark all read" (which keeps them). Added: a per-item ✕ (hover-reveal,
  `stopPropagation` so it dismisses without closing the tray or navigating) and
  a footer "Clear all" (wipes the active org's tray). Service
  (`lib/services/notifications.ts`): `dismissNotifications` +
  `dismissAllNotifications` (with a `readOnly` guard so a "clear the ones I've
  seen" path can't drop an un-actioned unread alert), both scoped to
  user + active org via a shared `userOrgScope` helper. New
  `POST /api/notifications/dismiss`; both mutation routes now pass
  `session.activeOrganizationId`. Rode along: `markRead`/`markAllRead` gained
  the same org scope (they were user-only — a multi-org user's "mark all read"
  would have silenced another org's bell), and the header "(N new)" recolored
  rose → amber to match the unread badge (unread = warn/amber per
  DESIGN-SYSTEM). Guard test `tests/notifications/tray-tools.test.ts`
  (7 cases: dismiss/clear/mark all carry user + org scope, never another org;
  no-op on empty ids; readOnly keeps unread).

- **Cross-tenant isolation security sweep — three live clinics (2026-07-16).**
  Owner signed a third clinic (demo + two real orgs now share prod); asked for
  a security + bug sweep proving no clinic sees ANY of another's data. Audit
  method: verified the FOUNDATION is sound first — `getTenantContext` resolves
  the org from the server-side better-auth membership (session
  `activeOrganizationId` → member row → org), NEVER from client input, so a
  clinic cannot spoof its `organizationId`; `requireTenant/requireRole/`
  `requirePartner/requirePlan` gates confirmed. Then ran parallel read-only
  sweeps over the highest-yield leak class (IDOR: a service that queries/mutates
  by a client-supplied entity id WITHOUT `AND organizationId = ctx.org`) and
  verified every hit at source before fixing. Findings + fixes:
  - **CRITICAL — custom-domain hijack (`lib/services/custom-domain.ts`).**
    `requestCustomDomain` persisted `clinicProfile.websiteDomain = <host>` on
    every path with NO ownership check, and the column had no unique
    constraint; the middleware host→slug map was last-write-wins. Clinic A
    could claim Clinic B's live domain and serve B's real visitors A's public
    site. Fix: a cross-org conflict scan (`ne(organizationId, orgId)` over
    every clinic's `websiteDomain`) rejects a domain already connected to
    another clinic; a `.unique()` constraint on `website_domain` (migration
    **0128**) is the structural backstop; `listActiveCustomDomains()` now
    `orderBy(asc(organizationId))` so routing is deterministic first-write-wins
    even if a legacy dup slipped in.
  - **HIGH — Search Console cross-read (`lib/services/gsc.ts`).** The shared
    platform GSC property was scoped per clinic by `operator:'contains'` with a
    bare `/site/<slug>` (or `<slug>.`) substring — slug "smile" leaked
    "smiledental"'s query/click/impression data, and the slug is
    attacker-chosen at onboarding. Fix: `includingRegex` (RE2) with an ANCHORED
    regex (`^https?://[^/]+/site/<slug>(/|$)` for path sites, `^https?://`
    `<slug>\.` for subdomain sites), slug regex-escaped; new `clinicScopeLabel`
    for the human-facing display string.
  - **MEDIUM — shop variant destruction (`lib/services/shop.ts`).**
    `saveProduct`'s variant delete + the `variantsByProduct` read joined by
    `productId` alone (no org filter); a foreign product id could delete/replace
    another clinic's variants. Fix: `variantsByProduct` takes `organizationId` +
    filters on it; `saveProduct` verifies the product is owned before touching
    variants (throws "Product not found in this organization") and org-scopes
    the delete.
  - **MEDIUM (latent) — campaign events (`lib/services/marketing-campaigns.ts`).**
    `getCampaignStats`/`getRecipientBreakdown` read `campaign_events` (which has
    no `organization_id` of its own) by `campaignId` alone — safe only because
    the one caller pre-checked the org. Hardened: both take `organizationId` and
    inner-join `campaigns` filtered on it, so a foreign (guessable serial) id
    can never return another org's recipient emails; caller updated.
  - **LOW — notification bell (`lib/services/notifications.ts`).**
    `listNotifications`/`countUnread` scoped by `userId` only; a user in two
    orgs would see org A's bell while active in org B. Scoped to the active org
    (`organization_id = active OR NULL` so legacy org-less rows still show); the
    `/api/notifications` route passes `session.activeOrganizationId`.
  - Verified CLEAN at source (no change): `patient-messaging` (`assertPatientInOrg`
    gates every thread write), `patient-merge` (both patients fetched
    org-constrained up front), public intake submit (`getFormTemplate` re-checks
    org so a foreign templateId returns null), the domain.ts commerce services
    (all carry + filter `organizationId`).
  - Guard tests: new `tests/tenant-scoping/security-sweep-2026-07.test.ts`
    (anchored-regex non-substring proof for gsc, org-scoped variant
    delete + foreign-id rejection for shop, org-scoped campaign_events reads).
    The `custom-domain.test.ts` db mock updated so `.where()` is awaitable (the
    conflict scan) while still `.limit()`-terminable (the profile read).

- **Business-area verdict + polish (2026-07-12).** The workspace audit's
  third stop. Verdict: `/shop` already IS the Shopify-style workspace (one
  sidebar entry → hub with doorway cards + honest Stripe/upsell panels), and
  `/integrations` is one coherent bundle-driven catalog — no path migration
  warranted (the area map counted 15+ deep links + 9 pinned test files that
  a move would churn for zero user value). What was actually wrong, fixed:
  **Collections was hidden from its own workspace** — the AR workboard
  lived at /shop/collections but had no hub doorway card and no trail label
  (back-nav mislabeled it "Shop"). Now: a 5th doorway card with a real
  one-query aggregate (`getCollectionsSnapshot` — open-balance count +
  total, warn-toned), `'/shop/collections'` in SUBROUTE_LABELS, the
  collections page's Stripe CTA re-pointed at /shop (where the Connect
  button actually lives — it said Integrations), and the memberships page
  now says its plans power the website's /dental-plans page. Rode along:
  the Growth follow-up fixing the analytics recall-funnel link to
  /growth/outreach (it pointed at the old /marketing path — worked via the
  308 stub, but direct is right).


- **The Growth workspace — the Website playbook applied to the next area
  (2026-07-12).** Owner: "do one more pass over the website system… then
  expand out into the next part of the platform." The Growth sidebar group
  was four sibling modules (Recall & Outreach /marketing · Reviews /reviews
  · Social Posts /social-posts · Analytics /analytics) — the same
  fragmentation the Website area had. Now: ONE `growth` sidebar entry →
  `/growth` hub (doors with honest below-plan upsell cards — Recall/
  Campaigns/Audiences Premium, Reviews Pro w/ a real Google-rating stat,
  Social reflecting connected channels with a connect-prompt door, Analytics
  Premium). Clinic surfaces moved whole-directory: `/growth/outreach`
  (recall dashboard; component stays in app/(default)/marketing/ — it
  shares its data layer with the platform tenant), `/growth/outreach/queue`,
  `/growth/campaigns(+[id])` + `/growth/audiences` (serve both tenants),
  `/growth/reviews(+/received)`, `/growth/social`, `/growth/analytics`.
  Every old path is a 308 stub (param-forwarding for ?tier, campaign ids,
  prefill_audience) so the 10+ notification-email deep links
  (reviews.ts, patient-timeline, website-health, integrations catalog/
  bundles) keep working forever; `/marketing` + `/marketing/pipeline`
  remain the platform tenant's marketing home (clinic 308s to
  /growth/outreach). Plumbing: `FOLDED_AREAS` in lib/modules/index.ts
  (renamed from FOLDED_WEBSITE_AREAS, now carries recall/reviews/social/
  analytics labels for requirePlan upgrade panels), trail SUBROUTE_LABELS,
  ⌘K growth sub-page entries, and plan-derived quick-create capability ids
  ('campaigns' Premium, 'blog' Pro+) appended in dashboard-shell — which
  also fixed a latent regression where "New post" vanished from quick-create
  when the blog module folded into Website. In-context settings stayed put
  by design (review config on Reviews, retention automations + newsletter
  on the recall dashboard — that's the real-SaaS pattern, per the area map).
  ~20 pinned-path tests updated; bundles sidebar-wiring test rewritten
  (Shop is now the only bundle-gated module). Also fixed in the sweep: a
  path-rewrite tool bug that briefly corrupted the Facebook reviews URL and
  a regex literal (caught by typecheck + the reviews-helpers test before
  commit).

- **Website workspace polish — publish state on every editing surface
  (2026-07-12).** The structural audit after the Draft→Publish + gallery
  ships: the shared PublishCard now mounts on Content, Design, Templates,
  Forms, and Pages whenever unpublished changes exist (previously only the
  hub + Studio carried the state — a real SaaS shows it wherever you edit;
  source-guard test pins all five), the hub's Design card names the live-
  preview gallery, and the last two instant-live copy claims (Studio welcome
  tip, a design-panel comment) were corrected.

- **The template gallery — live previews on your own content
  (2026-07-12).** Owner: "a surface with all of the templates organized into
  their practice type with filters and categories and sorting, and iframe
  renders of each templates card." Until now template management was three
  static text cards on /website/design. New surface `/website/templates`:
  practice-type category chips + style-tag filters + a sort control
  (metadata now lives on `SITE_TEMPLATE_CATALOG` — practiceTypes/styleTags/
  bestFor, with a completeness test so no design can ship uncategorized),
  and every card carries a LIVE scaled iframe of the clinic's OWN homepage
  rendered in that template. The hard part was a side-effect-free per-card
  render: the existing preview route SETS the preview cookie (shared across
  iframes — six cards would clobber each other, last one wins, and hijack
  the owner's real preview session). Solution: a frame route
  `/site/[slug]/tf/[template]` (re-renders ClinicSitePage, the demo-brand
  pattern) + the middleware stamps an `x-dc-template-frame` request header
  for exactly that path (stripping any inbound copy) +
  `resolveActiveSiteTemplate` honors the header per-request for a verified
  editor at highest precedence — the layout's palette/fonts/chrome follow
  automatically, and the new `isFrame` flag suppresses the pageview beacon
  (cards never count as traffic), chat bubble, banners, and EditBridge.
  Cards scale the 1360px frame via ResizeObserver-measured transform,
  pointer-events-none/tabIndex −1/lazy. Preview → the editor's existing
  `?previewTemplate=` flow; Apply stages the design to the draft (publish
  makes it live). The Design page slimmed to a current-design summary + the
  gallery door; the Studio's 🎨 popover links "Browse all designs"; ⌘K gets
  a Website templates entry.

- **Draft→Publish for the clinic website (2026-07-12).** Owner: "there needs
  to be a publish/republish system so clinics can update content and finish
  before updating the live site rather than the live site showing them
  essentially work in real time." Until now every save was instantly live
  ("Saved ✓ live"). The Wix/Squarespace model shipped in one green push:
  migration **0127** adds `clinic_profile.website_draft` jsonb; the pure
  core `lib/website-draft.ts` defines WEBSITE_DRAFT_COLUMNS (content +
  presentation stage; IDENTITY — names/contact/address/hours/logo/timezone,
  plus the functional chat toggle — stays live-immediate because it drives
  booking, reminders, and the email From) with merge/split/honest-diff
  helpers; `lib/services/website-draft.ts` is the server plumbing —
  `stageWebsiteValues` atomically merges staged values SQL-side
  (`COALESCE(website_draft,'{}') || $json`) and EVERY writer routes through
  it: the Studio's writeSection, saveInlineField/copy/image (which now read
  the draft-merged map before merging), the AI edit bar (apply + its undo),
  the services picker, and the SEO-meta form. A verified editor sees the
  merged view everywhere via the overlay in `loadSite` +
  `getClinicThemeBySlug` (canEditClinic re-verified per request; the session
  lookup only happens when a draft exists) — so the Studio canvas, the
  workspace forms (`getEffectiveWebsiteProfile`), and the owner's own site
  visit all agree, with a fixed "Unpublished changes" pill
  (DraftPreviewBanner, hidden in the ?edit=1 canvas) keeping it honest.
  Publish applies the blob in one write + records ONE history entry marked
  `__publish` (undo-after-publish restores the LIVE columns); normal undo
  routes draftable columns back INSIDE the draft so undoing a staged edit
  can never accidentally publish it. Surfaces: hub PublishCard ("N
  unpublished changes" w/ per-column labels + Publish/Discard), Studio
  top-bar publish button (count refreshes after every save/AI edit/undo),
  "Saved ✓ — publish to go live" copy across Content/Forms/Design/Pages.
  The Pages manager + hub live-pills deliberately read the RAW row (a
  staged team list hasn't published /team yet). Demo resync clears stray
  demo drafts. Tests: pure-core truth table, service routing/publish/
  discard, undo routing, site-overlay gating (visitor never sees a draft),
  plus the four existing write-path suites updated through a shared
  staged-JSON unwrap helper (`tests/helpers/website-draft.ts`).

- **The Website workspace deep-carve — Content, Forms, Design, Pages, and
  the Business-profile shrink (2026-07-12).** Owner: "the website side needs
  to go much further — so many things still need their own surface… a ton of
  restructuring left to bring it up to real SaaS standards." The inventory
  agreed: the settings mega-form and the Studio were two full parallel
  editors over the same clinic_profile columns (13 pieces double-homed);
  FAQ/why-us/coloring/lead-forms/copyOverrides were modal-or-canvas-ONLY; no
  Pages surface existed (page identity scattered across 4 lists); the
  site-facing chat toggle hid in Practice → Online booking. Five green
  pushes: **P1 `/website/content`** — every website-only content piece as
  per-section plain forms riding the Studio's scoped actions (one saver, two
  doors; new `saveStory` writes tagline+about without the identity names;
  `CONTENT_SECTIONS` registry drives the rail + the hub's honest
  completeness stat). **P2 `/website/forms`** — both LeadFormBuilders w/
  Customized/standard pills, the chat toggle moved from Practice (its action
  now revalidates the public-site subtree — the bubble renders on every
  page), a latest-5 + 7-day submissions glance → /leads; the demo seeds one
  customized contact field. **P3 `/website/design`** — template cards
  (preview via the editor's new `?previewTemplate=` param — ONE preview
  path; apply behind a confirm), brand color, hero images (URL swaps thread
  the existing focal point through so they never clear an editor-set
  focus), intro video; logo deliberately stays with identity. **P4
  `/website/pages`** — `buildSitePagesIndex` unifies the 4 page lists into
  live + honest not-published-yet rows ("Add team members to publish this
  page") w/ open-in-editor (`?page=`)/view-live/manager chips; expanding a
  row edits that page's copy overrides (first non-canvas home) via
  `saveInlineField`; Search appearance moved here (SEO page keeps a #meta
  pointer; /settings/seo stub retargeted; shared `SEO_PAGE_PATHS`); demo
  seeds two hand-voiced overrides. **P5 the destructive step, last** —
  `updateClinicProfile` shrank to an identity-only payload IN LOCKSTEP with
  the panel (the old FormData-reads-everything shape meant a shrunken form
  would NULL every website column on the next identity save — the exclusion
  is now the headline regression test); `/settings/clinic` became "Business
  profile" (basics/contact/hours/logo + connections) w/ a calm pointer
  banner; settings search-index deep links repointed to
  /website/content#<section> (ClinicSettingsNav's ?sub= scrolling works on
  the new page unchanged); the hub dropped "Advanced edits" (final cards:
  Editor, Design, Pages, Content, Forms, Blog, SEO, Careers, Domain,
  Share); the retired template-footgun guard now pins the ABSENCE of any
  template handling in the identity form.

- **The Website workspace — the Shopify-style consolidation (2026-07-12).**
  Owner: "everything is so fragmented and squished into the top bar with
  weird ways to access them and their settings… consider the structure real
  platforms have, like Wix, Duda, Shopify." Ground truth agreed: 4 flat
  sidebar entries, a 13-control 48px Studio top bar, content editable in 3
  places, the custom-domain card buried behind `/settings/clinic#custom-domain`
  and absent from the whole signup journey, SEO split across `/seo` +
  `/settings/seo`. Shipped in four green pushes: **A — the hub + editor
  move**: `/website` became the workspace home (live-site card w/ real URL +
  domain-state pill, 30-day performance snapshot ported from the Studio
  popover, doorway cards w/ live stats, honest below-plan upsell cards →
  `?upgrade=`); the Studio moved to `/website/editor` with its top bar
  slimmed to pure editing controls (Exit→hub; 📊/🖨/Advanced-edits now live
  on the hub); the sidebar Website group collapsed to ONE role/plan-
  unrestricted entry (editor keeps its own owner/admin gate);
  `getModuleLabel` learned the folded sub-area names; ⌘K gained a
  `websitePages` block so nothing fell out of search. **B — the domain
  earned its place**: `/website/domain` hosts the auto-polling connect card
  (settings keeps an honest "it moved" stub at the old anchor); onboarding-
  complete + the welcome reveal now mention it; the Overview website banner
  gained two real stored-state branches (domain_failed outranks everything;
  domain_pending nudges after traffic problems). **C — the fold-in**:
  `/posts`→`/website/blog`, `/seo`→`/website/seo` (absorbing the Search-
  appearance meta editor as an anchored `#meta` section — beware: the moved
  form's `./actions` import would have silently bound to the GSC actions
  file; it now imports `./meta-actions`), `/careers`→`/website/careers`;
  route-level `permanentRedirect` stubs for every old path incl. sub-routes
  + param forwarding (`?ai=1`, `gscConnected/gscError`) — route-level
  deliberately, next.config redirects run BEFORE the middleware subdomain
  rewrite and would hijack the public clinic sites' `/careers`+`/blog`;
  platform-tenant registry paths moved too (Platform Blog + Search Console
  share these routes); GSC OAuth callback repointed directly. **D — polish**:
  hub go-live checklist (real states only: interview stamp, non-default
  template, active domain, GSC scope flowing, first post; optional rows say
  "optional"; fully-done hides), demo seeder stamps
  `onboardingInterviewCompletedAt` (insert + legacy self-heal), docs updated.
  Testing note: `expect(fn).toThrow()` mis-fires against a throwing vi.fn
  under the global `clearAllMocks` setup — the redirect-stub tests assert
  via try/catch sentinels instead.

- **Cosmetic/Luxury v2 — the charcoal-first redesign (2026-07-11).** Owner
  verdict on the design pass: "I absolutely love the pediatric one… but the
  cosmetic luxury one is rough, I don't really like that design at all."
  Pediatric locked; Cosmetic rebuilt around a simple thesis: v1 was all-cream
  and timid — luxury opens DARK. The new page: (1) a charcoal statement hero
  (`SITE_DEEP` ground) — champagne eyebrow + hairline via new
  `cosmeticAccentOnDeep()` (palette.ts: brand hue lifted toward candlelight
  until AA on the deep ground, saturation tempered 24–46 so hostile brands
  land soft), cream Fraunces-italic display headline, deepMuted statement,
  cream-pill CTA, gold-star rating badge, and the arch portrait double-framed
  by a champagne offset hairline; (2) a CREDENTIALS rule-row under the hero —
  real facts only (doctor name·title / city,state / first static stat), hidden
  below 2 items, hairline-separated microtype — the page now USES the stats
  canon field; (3) the cream middle: magazine services index (unchanged),
  then the doctor as a proper CREAM magazine profile spread — photo left in a
  hairline offset rect frame, eyebrow + display-italic bio line + rule +
  uppercase attribution right. The hero now prefers `heroImageUrl` over the
  doctor portrait so the two sections never repeat a photo; when the doctor
  photo IS the hero, her spread gracefully drops to a centered pull-quote
  (no photo dupes, no fake content); (4) exactly one dark close — the footer
  (v1.5's charcoal doctor band is gone, so dark = open + close only). Harness
  note rediscovered the hard way: `paletteCss()` returns a full `:root{…}`
  block — wrapping it in another `:root{}` silently kills every var and the
  deep ground renders as the forest-teal FALLBACK; if a cosmetic shot ever
  looks green, check the injector first. All 55 cosmetic/conformance tests +
  full suite green; no schema/copy-key changes (same 7 cosmeticHome.* keys).

- **Template design pass — Cosmetic + Pediatric earn their looks
  (2026-07-11).** Owner: "focus purely on the design and quality of the two
  new templates." Method: a real VISUAL loop — static-render both Homes with
  rich fixtures (tests/__screenshot__/render-templates.test.tsx, gitignored)
  → headless-Chromium full-page shots at 1440/390 (Google fonts load through
  the proxy; shoot script scrolls first so lazy images land) → critique the
  PNGs → redesign → reshoot. **Shared flaw fixed on both**: the standalone
  closing band + footer stacked as two giant dark slabs with duplicate CTAs —
  the closer now LIVES in the footer top (closer copy keys render there;
  chrome reads copyOverrides directly), one dark close per page.
  **Cosmetic**: hero to text-7xl w/ hairline-eyebrow + offset-hairline
  double-framed arch (anchored to the image box, not the caption); services
  became a magazine spread — sticky italic intro left, commanding numbered
  index right (2rem serif entries, hover slide); doctor band gained the
  oversized “ glyph + flanked-rule attribution; testimonials got hierarchy
  (lead pull-quote large + smaller pair under a hairline); gallery staggers
  arch/rect/rect with uppercase captions. **Pediatric**: the gray STORM
  clouds (decor inherited ink via currentColor) became explicit soft
  white/pastel clouds + four-point Sparkles; hero photo is a tilted organic
  BLOB w/ sparkle badges; wavy SVG seams frame the services band; cards went
  alternating pastel grounds w/ white emoji medallions + wobble hover; chips
  cycle 🌟🎈🌈🦖 w/ alternating tilt; testimonial bubbles grew real TAILS +
  tilt; team circles got thick pastel rings; and the coloring corner became
  the showpiece — up to 3 REAL sheets fanned like paper w/ rotation +
  hover-straighten, pulled from profile.coloringPages. All conformance/
  wiring/a11y guards stayed green through the redesign (the harness held).

- **The coloring LIBRARY — a vetted CC0 pack every clinic can use
  (2026-07-11).** Owner: "search for any open source coloring page packs…
  I want a rich library seeded in." Sourcing: a research agent evaluated
  ~70 candidates across freesvg.org + openclipart.org (both CC0/public
  domain; publicdomainvectors.org WAF-blocked), verified the per-item
  license meta on every page, sanitized each SVG (scripts / on* handlers /
  foreignObject / external hrefs / metadata stripped, viewBox ensured),
  and render-proofed them; I visually curated the final **20** from a
  contact sheet (dropped engraving-style dentists, an alphabet worksheet,
  faint sketches, non-scene doodles). Assets live in
  `public/images/coloring-library/` (under `/images/` so the middleware
  static exclusion serves them on clinic subdomains + custom domains);
  registry `lib/types/coloring-library.ts` records slug/title/sourceUrl/
  license/themes per entry (provenance — CC0 needs no attribution).
  Studio: the Coloring-pages modal gains **“Add from the library”** (grid
  picker, stable `lib-<slug>` ids so re-adds are no-ops). Demo clinic
  seeds 6 dental-forward pages (fresh-create + null-backfill self-heal,
  migration-0126-era). Guards (tests/site-templates/coloring-library.
  test.ts): registry↔asset parity both directions, kebab/unique/
  alphabetized slugs, CC0 provenance strings, per-file sanitization scan
  (no scripts/handlers/external refs — these serve from clinic ORIGINS),
  demo-seed slug validity. Rejected sources: Freepik/Vecteezy/ADA
  (non-redistributable). One gap: no balloon page — every candidate was
  pre-colored; grow the pack by dropping a sanitized CC0 SVG in the asset
  dir + one registry row (the guards enforce the rest).

- **Pediatric template + the coloring-pages canon + confirmation pass
  (2026-07-11).** Owner: "lean in to the children/playful/cartoons theme…
  the first template that's going to add new things to the system — coloring
  pages clinic staff upload and kids print or digitally color." One green
  deploy. **Canon growth (the additive-evolution path, proven)**:
  `clinic_profile.coloringPages` jsonb (migration 0126) →
  `ClinicColoringPage` type + `parseColoringPages` + `saveColoringPages`
  (undo-able) + a Studio modal (`coloring-pages-editor.tsx`, upload + name
  per sheet) → the public **/coloring** page: works on ANY template when
  content exists (notFound otherwise), grid of sheets each with 🖨️ print
  (minimal print window) and 🖍️ **color-online studio**
  (`coloring-gallery.tsx`: pointer-drawn strokes on an offscreen layer,
  line art composited on top with `multiply` so outlines survive any crayon;
  9-crayon palette, 3 brushes, eraser, start-over, save-as-PNG w/ graceful
  CORS-taint fallback; nothing persisted). **Template-declared pages go
  live**: `buildClinicNavLinks` now gates `extraMarketingPages` internally
  against SiteGates (+ profile-derived `extraGates`); all 15 shells pass the
  active template's declared pages; `SiteGates.hasColoringPages` joins the
  gate set (homepage, sitemap, Studio navigator, conformance). **Pediatric
  Play** (`templates/pediatric/`): pastel recipe (brand-hue pastel grounds,
  friendly navy ink, bouncy saturated accent, night-sky deep band), Fredoka
  runtime link, cloud/star SVG decor, rounded-card services w/ emoji,
  team circles, speech-bubble testimonials, coloring-corner teaser band,
  parent-reassurance voice, 8 `pediatricHome.*` copy keys; declares
  `/coloring` (navGroup patients, gated). **Confirmation pass** — the
  harness got teeth so "connects like modern" is proven per template:
  basic-tier Home must host the `#contact` anchor its own bookHref targets;
  Footer must carry `#site-footer-contact` (+ Header/Mobile render w/
  bookLabel); every declared extra page must map to a real route and its
  gate must hold on the empty clinic; positive preview-cookie test (stored
  modern → preview cosmetic). All three templates pass everything —
  Pediatric passed the full harness on its first run, zero template-specific
  test fixes.

- **Multi-template site system + Cosmetic/Luxury template (2026-07-11).**
  Owner: "build this properly to where I can have you build tons and tons of
  templates over time and they all connect the same effortlessly." Four green
  deploys. **Architecture (user-settled)**: shared page SHELLS (each
  `app/site/[slug]/**/page.tsx` keeps every DB read, SEO surface, and gate,
  dispatching typed props) + a TEMPLATE CONTRACT (`lib/site-templates/`:
  `SiteTemplateDef` w/ chrome, Home renderer, optional per-page overrides,
  per-template `buildPalette` recipe emitting the SAME 17 `--c-*` vars, font
  links, bookLabel, copyKeys/copyDefaults, extraMarketingPages) + pure
  RENDERERS (`components/clinic-site/templates/<id>/`). Universal content
  canon — no per-template fields, switching is instant + reversible. Fixed
  functional IA (/book /intake /shop …) + template-declarable marketing pages
  through the same `has*` gates (nav/Studio/sitemap all honor them).
  **Phase 1** (`a86310a`): registry (unknown id → modern), layout derives
  palette/fonts through the active def, owner-only preview cookie
  (`template-preview` route sets it; `resolveActiveSiteTemplate` re-gates
  with canEditClinic on EVERY request), OG pins the STORED template, and the
  settings mega-form's hardcoded `value="modern"` stomp fixed (+ guard).
  **Phase 2** (`720c0df`): all 15 subpage shells wear the active template's
  chrome + bookLabel; modern renderer moved to `templates/modern/home.tsx`
  and made pure (`appBaseUrl`/`clinicPortalSignInUrl` relocated to the
  client-safe helpers); `<EditText>/<EditImage>/<EditModal>` primitives emit
  the exact `data-edit-*` attributes (Studio editing for free, bridge
  contract untouched); field-wiring test now manifest-driven per template;
  `copyKeysForTemplate` (template voice defaults, universal clinic
  overrides); CONFORMANCE HARNESS (`tests/site-templates/conformance.test.tsx`
  + `tests/fixtures/clinic-site-fixtures.ts` empty/rich/edge) auto-enrolls
  every registered template: fixture renders, gate discipline, WCAG floors,
  tokens-only, purity source-scan. **Phase 3** (`97c8ded`): Studio 🎨 Design
  picker — preview any template on the clinic's OWN content in the canvas,
  amber Apply/Discard strip (apply = undo-able "Site design" write via the
  section rails + cookie clear); Settings shows a read-only Design row.
  **Phase 4**: the Cosmetic/Luxury template (DESIGN.md variant 2) —
  charcoal/cream fixed neutrals w/ brand-as-accent recipe
  (`cosmetic/palette.ts`, contrast toolkit now exported from
  clinic-site-theme), Fraunces italic axis, editorial Home (doctor-as-hero
  via `pickHeroDoctor`, numbered services index ≤6, pull-quote testimonials,
  charcoal consult close, `#contact` ContactForm on basic tier), "Book a
  Consultation" voice, NO pricing on Home (pinned by test), 7 `cosmeticHome.*`
  AI-targetable copy keys. Deferred, by design: base-body extraction to
  `components/clinic-site/base/` happens lazily when a template first
  overrides a subpage; shell nav wiring of `extraMarketingPages` when a
  template first declares one; presenter-mode template choice for
  prospecting demos. Pediatric is the next template (register + conformance
  auto-covers it).

- **Maintenance deep round — security, typing root-fix, dead code
  (2026-07-11).** Owner: "yes please go deeper." Three batches. **M2**
  (`8ababc8`): fixed the settings-shell test broken since the realtime era
  (mock lacked `useRouter` for `useRealtimeRefresh`) + extracted the
  next-step ladder into pure `communicatedNextStep` (lib/prospect-when.ts,
  28 tests). **M3 security** (`a3dfaf4`): `pnpm audit` 34 vulns → 5
  (remaining are dev-tooling only: vite/esbuild/launch-editor). Next
  16.0.10→16.2.10, better-auth 1.6.11→1.6.23, transitive undici/ws pinned
  via `pnpm.overrides` (pnpm v10 `update` won't move transitive pins).
  Fallout became a find: Next 16.2 auto-rewrites tsconfig to
  `moduleResolution: "bundler"`, under which `Stripe.Stripe` no longer
  exists — the old `type StripeInstance = Stripe.Stripe` in lib/stripe.ts
  had silently degraded the ENTIRE billing surface to `any`. Root-fixed
  (`type StripeInstance = Stripe`) + 18 explicit `Stripe.*` param
  annotations across billing/clinics/operations/revenue/social-billing/
  stripe-admin services. Gotcha logged: a stale `tsconfig.tsbuildinfo`
  (baked into the container image) masks type errors — cold-check with
  `rm -f tsconfig.tsbuildinfo && pnpm typecheck`. **Dead-code batch**:
  knip-verified sweep of 39 orphan Mosaic-template leftovers (retired
  calendar/tasks internals — the redirect stubs stay; unused shop-cards;
  legacy messages/inbox components; lib/services/{calendar,campaigns,
  dashboard,fintech,inbox}.ts; lib/api.ts) + 15 unused deps
  (@fullcalendar×7, chart.js + moment adapter, @tanstack/react-table,
  @radix-ui/react-popover, @dnd-kit/modifiers, date-fns, react-day-picker,
  rrule). @dnd-kit core/sortable STAY (marketing pipeline-board);
  scripts/*.mjs knip flags are false positives (Dockerfile boot). Full
  suite 4,809 tests + cold typecheck + build green per batch.

- **Maintenance cycle M1 — code health (2026-07-11).** Owner: "kick off the
  maintenance and cleanup… the full maintenance cycle." First findings pass
  over the pipeline arc. **Legibility regression fixed**: the arc (and two
  earlier features) shipped sub-12px text — text-[0.6/0.65/0.68/0.7rem] +
  text-[10/11px] across 17 files — violating the DESIGN-SYSTEM floor; all
  bumped to text-xs, AND the guard itself had a regex gap that let bare
  `0.7rem` (11.2px) through — tightened
  (tests/a11y/legibility-floor.test.ts). Root cause: per-module test runs
  (`pnpm test tests/prospecting`) skip the repo-wide guards and deploys
  don't run tests — the full-suite-before-merge rule is now written into
  CLAUDE.md conventions. **N+1s batched**: getCallList + getCallQueue each
  ran a per-prospect latest-call-outcome query (up to 200/page on
  /call-list) — now one shared DISTINCT ON batch (`latestCallOutcomes`).
  **Verified sound**: momentum "Won" (markConverted stamps outcomeAt with
  status flip; suppress + not_interested paths too). **Stale copy**: Call
  Mode metadata/comments still said "one-tap outcomes" — now keyboard +
  call windows + rehearsal booth. CLAUDE.md prospecting blurb gained the
  three finishers. Full suite: 4,803 tests.

- **Anti-cold-call finishers — three closers (2026-07-10).** Owner: "finish
  anything else you can think of… don't skip over any of the anti cold call
  features." Three green deploys. **Self-booking in outreach** (`f517f4f`):
  when `config.booking.enabled`, every outreach touch from step 2 on closes
  with the prospect's stable `/d/<token>` link ("skip the back-and-forth and
  grab a demo time directly") — the warmest prospects book themselves and
  the call never happens; touch 1 stays link-free, gated inside
  getOrCreateBookingLink, best-effort, appended post-personalization so the
  URL is never rewritten. **Best-time-to-call** (`708ee5d`):
  `callWindowScore` (lib/prospect-when.ts, pure + 6 tests) scores the
  prospect-LOCAL moment 0–3 (prime mid-morning/mid-afternoon · late-pm ·
  just-opening/lunch · early/evening/weekend; unknown tz stays neutral-good);
  getCallQueue stable-sorts within buckets so answerable calls lead; the
  dial zone shows "☀️ good time to call" / "⏳ lunch there". **🎭 Practice
  mode** (`7cc36f7`): a rehearsal booth in Call Mode — the AI answers the
  phone as THIS practice's front desk (grounded in name/city/owner + their
  call script's brush-offs), plays it guarded-but-fair, and on "End + coach
  me" returns zero-shame coaching (verdict, what worked, what to tighten,
  quoting the caller's words). lib/services/practice-call.ts (haiku, metered
  ai_practice, 24-turn zod cap, nothing stored), practice-panel.tsx chat
  booth, +7 tests (suite 247). The full anti-cold-call arsenal: hunter
  emails warm them → self-booking closes without a call → Call Mode scripts
  + warm signals + call windows + rehearsal handle the calls that remain.

- **Cockpit UI overhauls — Call Mode + the whole pipeline (2026-07-10).**
  Owner: "the UI could use an overhaul as well… I also want the same
  overhaul for the entire sales pipeline." Two green deploys, pure
  presentation. **Call Mode v2** (`3dfae55`): the flat card becomes a
  dialer cockpit — SESSION STRIP (one segment per call, filling with the
  outcome's color: emerald booked / amber callback / grays / rose pass;
  current call ring-pulses teal; final strip replays on the end screen),
  split layout (sticky dial zone: monogram, teal-gradient tap-to-call
  block w/ live pulse dot, prospect-local time, "Why this isn't cold"
  panel · numbered TELEPROMPTER 1-Open with / 2-Why them / 3-If they say /
  4-The ask), and a sticky OUTCOME DOCK with keyboard shortcuts 1–5
  (1 = demo time picker, 5 = pass-reason picker, Esc closes; silent while
  typing). **Pipeline overhaul** (`fd9832c`): the same language across
  `/platform/prospecting` — board column headers get numbered tinted stage
  circles ①→④ (the pipeline reads as the same staged flow as the call
  script), momentum-strip metrics get tinted icon circles + extrabold
  numbers, the daily briefing's next action becomes a teal-gradient hero
  band under a TODAY micro-label (white pill CTA; column counts become
  mono pills), tabs gain icons + a live tracked-count pill, and the
  prospects table gets warmth-tinted monogram tiles (hot rose / warm
  amber / cool sky) so every pipeline surface speaks one avatar language.
  **Sub-pages pass** (`39e6aa2`): every remaining page joins — call list
  (teal card monograms, violet booked-demos panel, hand-raisers label,
  warmth-tinted phone queue), demos (tinted micro-label headers + count
  pills, ≤36h violet soon-tint + prep link), communications (feed label),
  the demo prep brief REBUILT as the numbered teleprompter ①→④ via a new
  shared `<Stage>` primitive (`stage.tsx`, Call Mode deduped onto it),
  sequences (teal numbered touch circles), territory (worked-% mini
  progress bars), settings (all 8 titles → the micro-label style via the
  single SECTION_TITLE constant). Design iterated on token-accurate static
  mocks rendered w/ headless Chromium before porting.

- **Call Mode — the anti-cold-call cockpit (2026-07-10).** Owner: "where I
  struggle the most is cold calls… I hate making cold calls… I want
  everything that would help as much as possible." Two green deploys.
  **Foundation** (`0f08277`): migration 0125 `prospect.call_script` jsonb;
  `lib/types/call-script.ts` (client-safe CallScript — opener, why-them
  hook, ≤3 value points, ≤4 brush-offs w/ one-breath responses, demo ask,
  ~20-second voicemail — + junk-tolerant `parseCallScript`);
  `lib/services/call-script.ts` `getOrGenerateCallScript` (haiku, grounded
  in effectiveProductKnowledge + segmentAngle + verified gaps, cache-forever
  on the row, force regenerates, metered `ai_call_script`, fails to null);
  `getCallQueue` (hand-raisers → due follow-ups → hot phone-first, deduped,
  phone-required, cap 25, carries per-prospect email open/click warm
  signals). **Cockpit** (`68286d2`): `/platform/prospecting/call-mode` —
  one card at a time; current script loads on entry, NEXT prefetches while
  you talk (ref-guarded against StrictMode double-fetch); click-to-call
  tel: + their local time; "opened your emails 4×" warm line; one-tap
  outcomes through the existing logCallOutcome plumbing (follow-ups
  auto-schedule) with auto-advance, progress bar, end-of-session tally;
  "🎉 Demo booked" opens an inline time picker (`bookDemoForProspectAction`
  → logBookedDemo + demo_booked outcome + pre-warms the AI demo brief) so
  the slot locks while they're still on the phone; not-interested captures
  the coded loss reason for the learning loop. Entry: primary "▶ Call Mode"
  on the pipeline header + call list. Earlier same session: **AI demo
  debrief** (`66dac69`) — the deal-room follow-up drafter's "how did it go?"
  note now also has the AI read the outcome (won/undecided/pass + reason)
  as a one-click-confirm suggestion into logCallOutcome; and the **AI
  post-demo follow-up drafter** (`b4949b6`) it extends. Tests: suite 234
  (call-script parser/cache/meter 9, demo-followup 8). Note: two container
  restarts this session reverted the working tree to a stale baked-in
  clone — recovered both times via `git reset --hard origin/main` (pushed
  work was never at risk; commit early, push often).

- **Sales Pipeline UX pass — the closing cockpit (2026-07-09/10).** Owner:
  "the sales pipeline is really poor… built for selling something else" →
  "keep enhancing the UX" → north star: "what would make this better at
  closing demos and tracking them to improve the next." Shipped as a run of
  small, verified slices on `/platform/prospecting` (the Prospecting engine
  IS the sales pipeline; the old "Sales Pipeline" module was an agency
  project board — relabeled earlier). Each committed + deployed green.
  **Board polish** (`a0cc4c5`): warmth bar (hot/warm/cool of the untouched
  pool) on the Prospects headline, stage-tinted initials tiles on every card,
  violet "soon" highlight on demos ≤36h out; `getPipelineBoard` tallies the
  bands + sets a `soon` flag. **Momentum strip** (`15f34b0`): replaced the
  redundant 4-stat strip (dup'd the board) with a "This week" trailing-7-day
  FLOW row — Reached out / Replies / Demos booked / Won, each with a
  week-over-week delta chip; `getPipelineMomentum` sources it from real
  timestamps via count(*) FILTER splits. **Humanized demo times** (`9430eb9`):
  Today/Tomorrow/weekday/absolute, host-tz calendar-key day math. **Prep
  affordance** (`a7bcbbd`, redeployed `18955ac` after a transient CodeBuild
  fail): one-tap "🎬 Prep for this demo →" to the AI brief on imminent
  demos. **One visual language** (`18955ac`): extracted `prospectInitials` +
  `relativeDayTime` → `lib/prospect-when.ts` (pure, client-safe, +10 tests
  incl. the host-tz-vs-UTC late-evening edge); reused across the board, the
  Demos page (initials + relative upcoming labels; `DemoRow.relativeWhen`),
  and the Communications feed (kind-tinted tiles). **Next-step signals**
  (`47e230d`): the Communicated column now says what to DO — ⏰ Follow up · Nd
  (amber, due), 📞 Call them (teal, a reply/hand-raiser), Sent · Nd, Nd quiet
  (muted); `getPipelineBoard` pulls follow-up state + last-contact
  (GREATEST of latest sent touch or logged call) and derives it; `PipelineCard`
  gains `tone`. **Outcome nudge** (`e445dca`): every completed-demo card gets
  "🏁 Won it? Log the outcome →" so the win/loss learning loop never starves.
  **Launchpad + warmth** (`9d3b583`): momentum metrics link to their
  drill-downs; board empty-states explain the flow instead of stating absence.
  Visual iteration was done against a token-accurate static HTML mock rendered
  with headless Chromium (can't screenshot the authed admin page from CI).

- **Vision-fulfillment capstone — 4 slices (2026-07-07).** Owner: "whip the
  marketing site into shape, deepen the docs, get the other PMS integrations,
  clean the platform-admin junk — and that's the entire vision fulfilled."
  Shipped as four verified slices, each committed + deployed green.
  **A · Platform declutter** (`3f03385`): removed the generic Mosaic Calendar,
  Tasks kanban/list, and the dead Developer placeholder from the platform
  sidebar (`lib/modules/platform.ts`); the three routes now redirect (calendar
  → /appointments|/dashboard, tasks → /dashboard) so bookmarks never dead-end;
  the patient .ics calendar-FEED is a separate live system, untouched.
  **B · Other PMS integrations, honest** (`d5637bb`): real two-way Dentrix/
  Eaglesoft/Curve sync needs vendor approval we don't have, and faking it
  would blow up the "official APIs only / gaps marked" positioning — so
  instead, **demand capture**: migration 0124 `pms_interest` (one row per
  org+provider, idempotent, notify-email snapshot + notifiedAt),
  `lib/services/pms-interest.ts` (record/getRequested/getPmsDemand/
  listPending), `requestPmsAccessAction`, a "🔔 Notify me when it's ready"
  button on every roadmap PMS tile (flips to "✓ you're on the list — N
  waiting"), a founder-side PMS-demand panel on the platform overview
  (which vendor to pursue first), and enriched honest catalog copy naming
  each real integration path. Verified live end-to-end (Cedar Grove → Dentrix
  Ascend). **C · Marketing refresh** (`7955635`): /product gains a "Run the
  day" front-office section (the whole daily-ops layer had zero
  representation) + enriched bullets (NPS, loyalty, broadcast) + an "And so
  much more" breadth grid; hero/pillar copy de-number-locked; **3 new honest
  competitor comparisons** — Dental Intelligence (Modento), Podium, Tebra
  (PatientPop) — sitemap auto-indexes them. **D · Docs depth** (`1197273`):
  +12 articles (fast-pass waitlist, self-running follow-ups, intake forms,
  broadcast, NPS surveys, family access, loyalty/referrals, booking deposits,
  payment plans, memberships, collections, requesting-a-PMS, custom domains)
  — docs 16→31, all auto-indexed. The tour, the docs, the integrations story,
  and the admin surface now all match the product that actually shipped.

- **Autonomous final-polish program (2026-07-07).** Owner directive: max
  autonomy, best possible funnel/UX everywhere. Audited the entire
  buyer-facing spine (marketing → pricing → signup → onboarding →
  first-run → module layouts) and shipped what the audit actually found —
  most surfaces were already finished; the real gaps: **(1) Trial-first
  marketing** — the product has been no-card-trial-first for weeks but no
  marketing surface said so; every CTA now reads "Start your free trial",
  the homepage hero trust-row leads with "7 days of Premium free · No
  card to start", pricing gets a trial banner + a first FAQ, and a new
  homepage section ("Your first afternoon on DreamCRM") tells the honest
  4-step signup→live story. **(2) Dead-surface cleanup** — the orphaned
  Mosaic job board (/jobs, never in any module registry) is now a
  redirect to /careers, its service/types deleted. **(3) Plan bullets
  caught up with the product** — Pro gains "Google Business sync + social
  posting", Premium gains "Online balance payments + patient payment
  plans". Audit findings that needed NO work (verified healthy): signup
  form + onboarding 1–4 already trial-first with correct copy; Overview
  already has welcome modal + live activation checklist; EmptyState
  adoption complete across all day-0 modules; 404/error pages exist per
  route group; docs index + signin polished.

- **Demo v5 — all-in on the pop-out; nothing floats on the shared screen
  (2026-07-06).** Owner call after v4: "run 100% with the pop-out — no
  hovering card on the site at all." The floating presenter panel is GONE;
  the demo tab now mounts an INVISIBLE `DemoConductor`
  (`components/demo/demo-conductor.tsx`, renders null): it owns all
  presenter state (scoped session, clock, visited, notes), still answers
  the keyboard (→/n/←/digits — no Esc, nothing to hide), navigates on
  `goto`, and serves the BroadcastChannel as the state authority. The
  pop-out `/demo/script` is now the WHOLE presenter surface — the wrap-up
  (outcome buttons + auto-summarized note) moved into it; "Log & end"
  calls the end action from the popup (same-origin cookies), sends a new
  `ended{to}` command so the demo tab clears its session and lands on the
  call list, then closes itself. All three launchers pre-open the script
  window INSIDE the click gesture (popup blockers kill window.open after
  an await; `window.open('', 'dcDemoScript')` then point it at
  /demo/script once the demo cookies exist), so a demo starts with the
  script already on the second screen; the script hello-retries every
  second until the demo tab answers. The header "Presenting to X" chip is
  the only on-screen control left — it opens/refocuses the one named
  script window (blocked-popup fallback: same-tab navigate). Deleted:
  presenter-panel, beat-progress, beat-notes, gap-callouts, demo-timer
  (state protocol gains `visited`; wrap-up went props-driven). Tests
  reworked: conductor renders NOTHING + keyboard + scoped reset;
  channel contract incl. `ended` handshake; wrap-up-in-popup logging flow.

- **Demo v4 — the second-screen script + stage direction (2026-07-06).**
  The remaining flaw after v3: the presenter panel (talk tracks, ⚠ gaps,
  "their site is a DIY Wix" ammunition) rendered on the SHARED SCREEN the
  prospect watches. **(1) Pop-out presenter script** — the panel's ⧉ button
  opens `/demo/script` (chrome-less `(preview)` page, gated platform-admin
  + demo like /demo/compare) on the presenter's second screen: the full
  beat list with talk tracks/moves/gaps/notes, keyboard drive, story
  switcher, pacing clock (amber past the track's target), all synced over
  a BroadcastChannel (`lib/demo-remote.ts` — junk-tolerant protocol; main
  tab owns state, remote sends commands). On connect the main panel
  auto-collapses to the pill — the audience sees only the product.
  **(2) Stage direction** — every beat carries `moves` (▸ "what to click
  now": open a thread → AI draft; confirm an unconfirmed visit; scroll
  both compare panes), rendered in panel + remote. **(3) Land on beat 1**
  — `startBrandedDemoAction` now returns the chosen story's first-beat
  href (a website demo opens on the side-by-side, not the dashboard);
  all three launchers hard-assign it. **(4) Wrap-up notes that write
  themselves** — the outcome note pre-fills "「track」demo · N min" + the
  per-beat notes, so the win/loss review knows what actually happened;
  `logCallOutcome`'s existing follow-up ladder covers post-demo
  never-drop-a-lead. **(5) Honest pacing** — `targetMinutes` per track in
  the story picker ("7 beats · ~15 min") and the remote's clock.
  Notes/timer storage consolidated in `components/demo/presenter-session.ts`.
  Tests: `demo-remote.test.tsx` (protocol truth table + both windows over
  a fake BroadcastChannel hub: hello→state+collapse, goto/switch/note/
  wrapup drive, remote mirroring + keyboard).

- **Demo v3 — interest-driven tracks + a real ending (2026-07-06).** The
  branded demo was one hardcoded 8-beat script that never ended: the last
  beat just disabled Next, presenter state (clock/beat/notes) was global
  sessionStorage so demo #2 resumed demo #1, the skin cookie died after a
  day while demo_context lived seven (leaving an unbranded demo running
  with no prospect attached), and ending often dead-dropped on the platform
  overview. Now: **(1) Demo TRACKS** (`lib/types/demo-script.ts` registry) —
  five stories (🏛️ full platform · 🖥️ website · 📍 found-everywhere ·
  📣 social suite · 🗓️ run-the-day), each a curated beat sequence reusing
  shared beat ids so gap-ammunition callouts land in every story, each
  CLOSING on an "And so much more" beat (→ /integrations) that lands on the
  right plan-tier price (Basic $150 / Pro $250 / Premium $500);
  `suggestDemoTrack(verdict, signals, places)` picks the lead story from
  verified gaps (no/weak site → website; quiet social/reputation →
  presence; else full). **(2) Selection everywhere** — prep page gains a
  story picker (suggested preselected), `startBrandedDemoAction` takes an
  optional track (defaults to the suggestion; drawer button inherits it),
  the skin cookie carries `track`, and the presenter panel has a live
  Story switcher (discovery changed the story → switch mid-call, beat 1).
  **(3) A real ending** — past the last beat is the WRAP-UP view: elapsed +
  beats covered + the track's plan pitch, outcome buttons (🏆 won ·
  📞 follow up · not now + loss reason), note pre-filled from per-beat
  notes, and "Log & end" runs `endBrandedDemoWithOutcomeAction` (logs the
  call outcome, clears both demo cookies, hard-assigns to the call list
  with the prospect pinned); the header "Presenting to X" chip now opens
  the wrap-up instead of instantly nuking the session. **(4) Lifecycle
  fixes** — presenter sessionStorage is scoped per prospect
  (`components/demo/presenter-session.ts`; a new demo never resumes the
  last one's clock), demo_context now matches the skin's 1-day lifetime
  and carries prospectId so the end flow can never dead-end on `/`.
  Tests: `tests/demo-mode/demo-tracks.test.ts` (registry integrity — every
  story ends on "And so much more" with a price — + suggestion table) +
  the panel suite reworked for v3 (wrap-up, chip event, mid-demo track
  switch, scoped-session reset, outcome logging).

- **Staff-alert misdirection fix (2026-07-06).** Demo-day bug: the owner
  booked a fake visit with his own email mid-demo and the FRONT-DESK ping
  ("New appointment request via the website") landed in the inbox he booked
  with — his email doubles as a staff-hat account (platform admin via the
  demo-org fallback; real-world analog: a dentist-owner who is a patient of
  their own clinic). Fixed at the chokepoint + every seam: (1)
  `notifyOrgMembers` HARD-excludes `role='patient'` members in the query
  when a caller passes no roles filter (defense in depth) and gains
  `excludeEmail` — the person the alert is ABOUT is filtered from recipients
  case-insensitively, including the demo-org platform-admin fallback; (2)
  all 15 patient/public-actor notify sites now pass the actor's email:
  inbound messages + chat widget (patient-messaging), review submit +
  private feedback (reviews), NPS detractor (nps), intake submissions
  (forms), fast-pass claims (appointment-waitlist), cancel/no-show pings
  (appointments), membership joins, balance payments, booking deposits,
  shop orders, payment-plan charge events, Gmail ingest (sender never
  re-notified), portal reschedule/booking, public-site lead + booking +
  insurance-verify actions. Left alone deliberately: prospecting alerts
  (the owner IS the recipient), Stripe billing webhooks (a clinic's own
  subscription events must reach the owner), pms-sync. New guard suite
  `tests/notifications/notify-exclusions.test.ts`; the booking/messaging/
  intake test mocks now carry emails so the exclusions are pinned as
  regression tests.

- **Consolidation pass C1–C3 (2026-07-06, `5c9c856` + `b0db8b7` + this).**
  Owner-driven "shared assets over individually-set things": **C1 portal**
  — semantic tone tokens (PORTAL_ERROR/WARN/SUCCESS/DANGER, 38 raw hexes
  swept across 14 files) + the missing primitives (BrandButton gains
  onClick/disabled; new GhostButton, PortalErrorText, PortalInput/Textarea,
  PortalNotice) adopted in the newest components as exemplars; guard
  `tests/a11y/portal-tokens.test.ts` bans the meaning-hexes outside ui.tsx.
  **C2 site** — `components/clinic-site/tokens.ts` (SITE_* surface vars; 43
  files' local BG/INK consts swept; the sweep found a real drift bug — the
  header's #FEF7F1 fallback vs canonical #FAF7F2) + `DeepBand` in decor.tsx
  (the dark band + arc + grain + ripple recipe as ONE component; 4 bands
  rewritten); guard `tests/a11y/site-tokens.test.ts`. **C3** —
  `lib/brand-tint.ts` `brandTint(brand, alpha)` replaces `${brand}1F`-style
  suffix literals in shared components (12 swept; junk-safe on non-6-digit
  input). Net effect: change-once points for error/warn colors, site
  surfaces, the band signature, and brand tints — with CI guards so none of
  it erodes.

- **Visibility pass — "Where am I? What am I doing?" + "never squint"
  (2026-07-06, `7e17c3f` + `2c791d4`).** Owner-driven accessibility rules
  (partial vision), codified in DESIGN-SYSTEM.md §2.2 and enforced: **text-
  size setting** (Standard/Large/XL scales the root font-size; pre-paint
  script in app/layout.tsx + `html.dc-text-lg/.dc-text-xl` in style.css +
  `components/ui/text-size-toggle.tsx` in Settings → Account and portal My
  info; per-device by design); **12px floor swept** (116 dashboard px
  literals + the portal's sub-0.75rem class raised — worst: 10.9px mobile
  tab labels, 10.6px timestamps at ~2:1 contrast, 11.5px receipt money
  lines, 55%-opacity slot labels); **contrast raises** (KPI labels/subs,
  portal inactive tabs #8A8178→#6B635A, editor hints, dark PageHeader
  subtitle, analytics values un-hover-gated); **orientation** (sidebar
  active 15% tint + 4px bar, portal mobile active tab gets a brand pill,
  FilterChip active semibold + teal ring, tab titles on the 4 title-less
  pages, 40px collapse caret). A new CI guard
  (`tests/a11y/legibility-floor.test.ts`) bans sub-floor sizes across
  dashboard/portal/shared UI — it caught 4 stragglers on its first run.

- **Patient-portal mega-pass P1–P9 + website closers W12–W13 (2026-07-06).**
  The "serious upgrades across the board" push into the portal, scouted first
  (an Explore sweep produced the ranked top-10), then shipped as nine slices,
  each deployed green: **W12 — address in the Studio** (`02a7369`): footer
  Visit block is click-to-edit (5-field modal via `saveAddress`, rides the
  undo history, mirrors to the primary `clinic_location` row). **P1 —
  waitlist self-enroll + refer toggle** (`62ec5d8`): "Notify me if something
  opens sooner" on every portal visit card → the SAME `addToWaitlist` the
  front desk uses (`source:'portal'`, idempotent; PortalVisit gained
  providerId); two new portal flags (`waitlist`, `referrals` — the refer card
  had rendered unconditionally). **P2 — payment plans in Billing**
  (`ab8454f`): "split it into monthly payments" month-picker (server-computed
  floors), `startMyPaymentPlanAction` reuses the staff propose path then
  routes straight to /i/[token]; open-plan status card (proposed → finish
  setup; active/past_due → N-of-M + next charge); `getMyOpenPaymentPlan`.
  **P3 — in-portal survey** (`2e54ada`): `getOrCreatePortalSurvey`
  (mint-on-view, same rows/throttles as the email engine, no delay) + a 0–10
  SurveyCard on the dashboard; answers reuse recordNpsScore (detractor
  escalation intact) behind logged-in ownership checks. **Badges**
  (`4c3b7ff`): `getMyUnreadMessageCount` (mirrors the mark-read where-clause)
  → Messages badge in all three chrome spots. **Membership** (`e09a020`):
  join-our-plan upsell (cheapest-price teaser, gated on active plans) + an
  honest message-us manage line (no blind Stripe billing-portal link). **W13 —
  publish-moment newsletter nudge** (`47c3c1d`) on the blog editor. **Visit
  detail** (`1c0ab43`): /patient/appointments/[id] — VisitCard action hub +
  get-ready (pending forms; staff notes deliberately NOT exposed) + where-to-
  go; every card title links there. **Visit prep** (`ec4817b`):
  `getVisitPrep` surfaces the clinic's per-type prep copy (same resolver as
  reminders) on the detail page. **Family link requests** (`d6ec74b`):
  "Add a family member" on My info + Family — a structured ask through the
  existing message thread (no shadow approval queue). **Tokens** (`6da4a33`):
  five components' local INK/MUTED/BORDER hexes → the exported PORTAL_*
  tokens.

- **Website mega-pass W1–W6 (2026-07-05).** The "every feature surrounding the
  live website" sweep — six slices, each shipped + deployed green:
  **W1 — callouts + carry-through** (`4784127`): homepage care-callouts
  redesigned (Fraunces titles, larger gradient icon blooms w/ hover scale) and
  the signature decor (ArcDivider/Grain/Ripple) carried onto the insurance +
  payment-financing subpage deep bands. **W2 — the return path** (`cbb5540`):
  the site finally reports back — `getSitePerformance()` (30d visits + leads +
  visit→lead conversion) powers a 📊 popover in the Studio top bar (delta,
  sparkline, top pages), and the Overview trends row gains a Website-visits
  tile (7d, clinic-tz, delta vs prior week; `siteTraffic` on the Overview
  snapshot, best-effort). **W3 — Studio quick wins** (`7b72582`): a page
  navigator dropdown (gated via the new pure `buildStudioPages`; tracks the
  canvas; off-list paths read "Current page"), a desktop/phone preview toggle
  (wrapper max-width only — the iframe never remounts, mid-edit state
  survives), and a collapsible AI bar (folds to an "Ask AI" pill, persisted;
  pending-Undo amber dot). **W4 — /new-patients** (`a7c69af`): the universal
  first-visit guide (what to expect steps, bring checklist + skip-the-clipboard
  intake card on the deep band, money cards reading REAL carriers/payment
  methods, anti-shame "No judgment, ever.", first-visit FAQ + JSON-LD) — wired
  into the Patients nav (parent now lands there), Studio navigator, sitemap,
  copy-override + AI COPY_KEYS registries, and a new `new-patients` SEO key.
  **W5 — Monday website digest** (`caf5612`): the morning digest gains a
  clinic-local-Monday "Your website last week" block (visits + delta + leads +
  top pages; `getWeeklySiteDigest` + pure `buildWebsiteWeekSection`; null on
  zero-traffic day-0 clinics; fetched once per clinic, best-effort). **W6 — QR
  share cards** (`f561fab`): /website/share prints QR cards (server-side SVG
  via the new `qrcode` dep) for booking / site / Google review / patient
  portal — card list gated by `buildShareCards` so nothing dead-ends; print
  CSS keeps only the cards; linked from the Studio top bar. **W7 — lead
  channels** (`797b188`): /analytics Acquisition gains "Where website leads
  come from" — `lib/lead-channel.ts` buckets the utm/referrer attribution the
  forms already capture into owner-language channels (paid beats social;
  junk-tolerant). **W8+W9 — check-engine light + brand color in Studio**
  (`dd6cf5e`): `lib/website-health.ts` fires two floored signals (traffic
  halved vs a substantive week / real traffic but zero leads in 14d,
  null-safe) as an amber Overview banner; and the Studio top bar gains a
  Brand swatch popover (8 presets + picker + hex, strict #RRGGBB both sides)
  that saves via `saveBrandColor` and repaints the canvas live. **W10 —
  first-open welcome** (`8644d57`): a one-time Studio welcome card naming the
  editing moves (click text / hover sections / ask the AI / phone view),
  localStorage-flagged. **W11 — Studio undo history** (`41db8c2`, migration
  0123): `website_edit_history` records each save's overwritten
  clinic_profile columns (owner-readable label, newest-20 cap) via a
  best-effort hook in `writeSection` (covers inline text / images / section
  modals / brand color; the AI bar keeps its own undo);
  `undoLastWebsiteEdit` restores the head + deletes it (one-way walk back,
  no redo); ↩ Undo in the Studio top bar (server-seeded label, armed by
  every save, confirm-gated, repeatable).

- **Clinic site enhancement 5 — the design signature pass (2026-07-05).** The
  "finished gorgeous" elevation: a site-wide visual DNA layered onto the Tend
  bones via new `components/clinic-site/decor.tsx` (all server-renderable,
  aria-hidden, pointer-events-none): **RippleMotif** — the concentric-arc
  linework (born in the empty-hero placeholder) generalized into the site's
  signature, whispering behind the hero headline, across the insurance deep
  band, in the closing card's corner, and through the footer; **ArcDivider** —
  a shallow asymmetric curve so the light ground dips organically INTO the
  insurance deep band instead of a hard seam; **GrainOverlay** — feTurbulence
  noise (data-URI, no asset) at 4% overlay blend for tactile, printed-paper
  depth on the deep band + footer; **SparkleGlyph** — four-point sparkle
  separators replacing the plain dots in both marquee strips. Editorial
  typography: trust-stat numerals + testimonial quotes now carry the Fraunces
  display serif. Callout icon circles became layered blooms (radial gradient +
  hairline ring) and the icon set gained rounded caps/joins. **Forms:** one
  focus language site-wide — `.dc-field:focus-visible` (2px brand-strong
  outline, AA color) in the site layout, applied to the insurance verifier +
  contact form, replacing Tailwind's default blue ring / the verifier's white
  ring. All verified in the screenshot loop before shipping.

- **Clinic site enhancement 4 — component-quality pass (2026-07-05).** A full
  screenshot-driven review of every homepage section/card (rich + day-0 +
  violet renders, sliced into bands and critiqued individually). Fixes:
  **Insurance band** — the "Check insurance" submit painted brand-strong on
  the deep band, i.e. nearly the SAME dark color as the band behind it, and
  disappeared; it's now the white-with-ink primary (the ClosingCTA treatment,
  strongest contrast on deep for every brand) + the carriers column no longer
  sits empty against the tall form when no carriers are set (universal honest
  reassurance list — PPO accepted / we help verify / we file claims — same
  universal-default precedent as payment methods + billing FAQ). **Footer
  monogram** — a brand-strong tile on the deep band vanished for dark brands
  (same hue family); now a white tile with the deep-colored letter.
  **TeamGallery** — same unreachable-centering bug ServicePills had
  (justify-center on an overflowing scroll row) fixed with first/last auto
  margins; prev/next arrows now render only when the row actually overflows
  (ResizeObserver-measured — a 2-person team gets no orphan paging chrome);
  member titles + arrow glyphs use readableInk (raw sage failed contrast at
  12.5px). **ServicePills** arrows likewise readableInk. **Brand presence** —
  difference-checklist chips unified to the hero-pill tint (brand26/55, were
  a near-gray 14/30) and callout icon circles bumped to brand26.

- **Clinic site enhancement 3 — homepage motion pass + legal pages
  (2026-07-05).** The homepage below the fold was fully static (subpages used
  ScrollReveal; the money page never did). Now: staggered reveals on the
  trust-stat cells, both "difference" columns + checklist chips, the four
  team callouts (plus a hover shadow), the three blog cards (reveal + lift +
  shadow on the existing image zoom), and the Location/Insurance section
  headers. One interaction language everywhere: every solid CTA now shares the
  hover-lift/press treatment (replacing the old hover:opacity), and the
  "Meet our team" link uses the same arrow-gap hover as the intake link. All
  reveals ride the existing reduced-motion-safe ScrollReveal. Verified the
  derived palette on a vivid violet brand end-to-end via the screenshot
  harness. **Legal pages:** new `/privacy` + `/accessibility` on every clinic
  site (full chrome, warm plain voice), footer legal-row links, sitemap
  entries. Copy is strictly factual to what the platform does: essential
  cookies only, no ad trackers, Stripe-processed payments, first-party
  page-view counts — and the accessibility commitments (AA-checked palette,
  reduced-motion support, keyboard/focus/skip-link, labeled controls) are all
  true by construction. Tests: footer legal links (basePath-aware).

- **Clinic site enhancement 2 — trust & reviews depth + the unreachable-pills
  fix (2026-07-05).** The testimonials section now opens with the AGGREGATE:
  the same live Google rating badge as the hero (section variant) sits under
  "Why people love {clinic}", tying the individual quotes to the real overall
  number (same ≥3-review honest gate). Testimonial cards gained a decorative
  opening-quote glyph (matching the Studio empty-state preview) and a soft
  grounded shadow. **Service-pills bug:** the strip used `lg:justify-center` on
  an `overflow-x-auto` track — a centered flex row that overflows makes its
  start edge unreachable (scrollLeft can't go negative), so the first pill sat
  clipped under the prev arrow and could never be scrolled back to. Replaced
  with auto-margins on the first/last pills (centers when it fits, scrolls
  normally when it doesn't) + a hover lift on the pills.

- **Clinic site enhancement 1 — hero elevation + brand-strong CTAs + the
  dc-edit-only public leak (2026-07-04).** First slice of the public-template
  polish push, driven by a new visual-QA loop (render the template with demo
  data + built Tailwind CSS → headless-Chromium screenshots — the harness stays
  uncommitted). **Hero:** CSS-only load choreography (staggered fade-rise on
  eyebrow/lead/CTAs/rating/intake/H2; TRANSFORM-ONLY settle on the H1 + oval
  portraits so LCP paints at full opacity from frame one; all gated behind
  prefers-reduced-motion: no-preference), a ~8%-alpha radial brand wash bleeding
  from the top edge, a hairline inner ring on every OvalPortrait (photos no
  longer bleed into the cream ground), and the primary Book CTA gained a
  brand-tinted glow + hover-lift/press states. **Copy seam:** the hero lead-in
  composed "…unhurried. with no judgment, ever." (firstSentence keeps its
  period) — now strips terminal punctuation and joins with an em dash.
  **brandStrong (systemic):** new palette role — the brand darkened ONLY until
  white clears AA 4.5 (dark brands pass through verbatim; the sage default
  deepens) — and ~35 white-text-on-raw-brand fills across the template, header,
  footer monogram, chat widget, mobile actions, closing CTA, book/membership/
  services/blog/insurance surfaces now paint `var(--c-brand-strong, brand)`;
  `darkenUntilWhiteReadable` iteration cap raised 24→48 so a near-white brand
  can descend far enough. **Leak fix:** `.dc-edit-only{display:none}` lived only
  in the Studio's EditBridge bundle, which never mounts publicly — day-0 sites
  showed "+ Add a photo"/"+ Add your services" prompts to real patients; the
  rule now ships in the always-served site layout. Tests: brandStrong AA floor
  across the full brand matrix + pass-through/deepen cases.

- **Prospecting copilot v2 — whole-workspace awareness + per-prospect answers
  (2026-07-04).** The ⌘J hunt copilot now sees the features that landed after
  it. Its snapshot gained a WIN/LOSS block (won/lost/win-rate, top loss reason,
  best-converting profile, the learning-loop callouts) and a TERRITORY block
  (focus state + biggest live pools), so "how are we closing", "why do we lose",
  and "which state should I focus" are answerable. It also resolves a **named
  prospect**: pure `resolveNamedProspect` matches the query against a BOUNDED
  active set (call list + hot arrivals + phone queue — near-zero false positives
  vs a full-DB scan), and when one hits, the answer carries an "Open" + "Demo
  prep" button pair (`response.matched`, set server-side, never by the model).
  Also rounded out territory: `summarizeTerritories` now returns a
  `suggestedFocus` (enabled state with the most hot prospects, skipping the
  current focus) rendered as a one-click "Focus GA" callout, plus an
  `enableMore` nudge when few states are on. No migration. Tests: the new
  render sections, the named-prospect resolver (match/longest/generic-miss/
  punctuation), and the focus-suggestion + enable-more logic.

- **Prospecting workspace F7 — territory & coverage view + focus mode
  (2026-07-04).** The hunt had no map — no per-state read of how far discovery
  reached, how much of each pool was worked, or where the owner should
  concentrate. New `/platform/prospecting/territory` renders a coverage table:
  per-state found / worked% / hot / call-list / won / convert%, a colour-coded
  stage (`territoryStage`: idle → discovering → enriching → working → closing),
  and an insights strip that flags underworked big pools + still-sweeping grids.
  `getTerritoryCoverage(enabledStates)` merges prospect status/band counts with
  the discovery-grid progress; pure ranking/gap logic in
  `lib/prospect-territory.ts`. **Focus mode** (config `focus.state`, junk-
  tolerant, no migration): each territory row has a Focus toggle
  (`setFocusStateAction`); when set, a `FocusBanner` pins the main prospecting
  surface with a link to the state-filtered list + a one-click clear. It's an
  operator lens, not an engine change — the global send engine is untouched.
  Header gains a 🗺️ Territory button. Tests: stage ladder, ranking order,
  underworked/still-discovering gaps, and the config focus resolver. This
  closes the workspace push (F1–F7).

- **Prospecting workspace F5 — win/loss pipeline + learning loop (migration
  0122, 2026-07-04).** The engine discovered/closed but never learned from its
  own outcomes. Now every decided prospect is captured (won = converted; lost =
  not-interested/suppressed) with a stamped `prospect.outcomeAt` + a coded
  `prospect.lostReason` (`PROSPECT_LOSS_REASONS`), and it feeds back into the
  pitch. **Capture:** `markConverted` stamps a win; `logCallOutcome` takes a
  `lostReason` and the call card's "Not interested" now opens a loss-reason
  picker (`MANUAL_LOSS_REASONS`); `suppressProspect` maps its reason via pure
  `lossReasonForSuppression`; the reply-classifier's not-interested/unsubscribe
  branch stamps `replied_no`/`unsubscribed`. **Report:** `getWinLossReport({
  windowDays=90})` → won/lost/win-rate, loss-reason breakdown, per-segment
  win/loss (segment from each prospect's latest enrollment), avg touches-to-win
  (capped at 5k decided). **Pipeline panel** (`pipeline-panel.tsx`, above the
  funnel): headline W/L/rate, "why we lose" bars, win-rate-by-profile, and the
  learning callouts. **Learning loop:** pure `buildOutreachLearnings(report)`
  (gated on `LEARNINGS_MIN_SAMPLE=8`) renders a "what's converting / top
  objection" block that `runOutreach` computes once per tick and injects into
  every personalized cold email — so the machine leans into the best-converting
  profile and preempts the top objection automatically. Tests: suppression
  mapping, learnings min-sample gate + actionable-only preempt, panel
  summaries.

- **Prospecting workspace F2 — the hunt copilot (natural-language command bar)
  (2026-07-04).** A ⌘J command bar on `/platform/prospecting` that answers
  free-text questions about the hunt ("how's today going", "who to call first",
  "why isn't anything sending", "how many hot prospects") grounded in a live
  snapshot, and SUGGESTS engine actions the owner clicks to run. Safety spine:
  the AI never mutates from free text — it returns an answer + up to 3 suggested
  actions drawn from a closed registry (`COPILOT_ACTIONS`: engine on/off, live/
  dry-run, hunter on/off, and four navigations); the higher-stakes flips
  (engine-off, go-live) confirm before running. Pure `lib/prospect-copilot.ts`
  owns the contract, the action registry, the snapshot renderer, the prompt
  builder, and a tolerant `parseCopilotResponse` (drops unknown/duplicate kinds,
  caps at 3, falls back to the registry label). Server `lib/services/prospect-
  copilot.ts#runCopilot` assembles the snapshot from existing reads (config +
  `getFunnelStats` + `getHuntStats` + new `getBandCounts` + `getDailyBriefing` +
  env wiring), calls haiku (budget-metered as `ai_copilot`), and degrades to a
  plain honest fallback on any failure. `copilotAction` (platform-admin-gated,
  read-only) + `setHunterEnabledAction` back the bar; `copilot-bar.tsx` is the
  modal (⌘J / click, suggestion chips, action buttons, "never sends on its own"
  footer). No migration. Tests cover the snapshot render, prompt assembly, and
  the tolerant parser's drop/cap/fallback paths.

- **Prospecting workspace F3 — the editable "brain" + competitor battle cards
  (2026-07-04).** The whole outbound engine's product knowledge was hard-coded in
  `lib/prospect-product-knowledge.ts` (`PRODUCT_KNOWLEDGE` / `_SHORT`). This makes
  it owner-editable from Settings without a deploy. New config bag
  `ProspectingConfig.brain = { productOverride: string; battleCards: Array<{
  competitor; angle }> }` (junk-tolerant resolver: string override clamped to 12k,
  cards filtered for non-empty both-fields, competitor≤80/angle≤600, ≤20 cards; no
  migration — rides the `prospecting_config` jsonb). New pure accessor
  `effectiveProductKnowledge(brain, { short? })` — returns the owner's override when
  set (else the canonical default), with a "COMPETITIVE BATTLE CARDS" block appended
  (AI told to use only the matching card, never name-drop a rival unprompted). Wired
  into all three AI surfaces: the sonnet demo brief (`lib/demo-brief-prompt.ts` +
  `demo-brief.ts` now loads config), the haiku cold-email personalizer
  (`prospect-outreach.ts`, `brain` threaded through `personalizeTouch`), and the
  haiku reply draft (`prospect-intent.ts`, config fetched once and reused for the
  booking-link weave too). Settings UI: a "The brain" card at the top of
  `settings/settings-panel.tsx` — a monospace override textarea (blank = built-in
  default) + a repeatable competitor/angle battle-card editor with a dirty-state
  Save button (`updateBrainAction`, zod-validated). Tests: resolver defaults +
  clamp/filter/cap, `effectiveProductKnowledge` fallback/override/card-append, and
  demo-brief-prompt honoring the brain.

- **Settings overhaul — `/settings` home + retired cross-page rail + all 14 pages
  deepened (2026-07-02, PRs #481 + `85cb5f0`/`f11ffe3`).** `/settings` is now a
  **card-grid home** that IS the settings navigation
  (`app/(default)/settings/settings-home.tsx`; regrouped IA in `settings-nav.tsx`;
  deep-link search in `search-index.ts` → each result opens the right
  `?tab=&sub=` section). The sidebar has **ONE "Settings"** entry → the `/settings`
  home (`lib/modules/clinic.ts` + `platform.ts` module `path: '/settings'`); the
  avatar-menu "Account settings" and the org-dropdown "Clinic settings" / "Plan &
  billing" were removed, so the **org-switcher block is now a static label** (name +
  plan pill + amber Demo pill, no dropdown). The cross-page left **settings rail is
  retired** (`settings-sidebar.tsx` deleted); every focused page renders in a
  **centered column with a "‹ Settings" back-to-home link** baked into the shared
  `SettingsPage` (`settings-kit.tsx` — the PageHeader eyebrow IS the back link;
  centered layout in `settings-shell.tsx`). Multi-section pages keep their in-page
  nav (`settings-tabs.tsx` `SettingsTabs`, `?tab=&sub=`-deep-link-aware; the clinic
  hub uses the horizontal scrollspy `clinic/clinic-settings-nav.tsx`). **All 14 pages
  upgraded** to v2 quality (better controls, validation, sensible new settings,
  nonsensical ones removed): Clinic profile (color picker · insurance/payment
  tag-chips · copy-to-weekdays hours grid · searchable IANA timezone), Practice
  (unified save · provider validation · custom lapsed-months), Locations
  (edit-in-place · confirm-delete), Patient portal (normalized to the kit · preset
  notice windows), Search appearance (accordion · applicable-pages-only · tone
  counters), Message templates (live `{{firstName}}` preview · char counter),
  Feedback (real topic categories), Automated emails (light polish), Team (role
  explainer · Resend invite), Connected accounts (real mailbox sync-health), and
  Profile / Security / Billing / Notifications (presentation deepening — the
  better-auth / Stripe / OAuth calls are untouched). **NO migration** — every
  upgrade rides existing columns/config bags (the one newly-surfaced field, provider
  email, was already demo-seeded, so no new seeding). A maintenance pass fixed 5
  bugs: the first location saved as non-primary (disabled checkbox never submits —
  now a hidden mirror + a server-side "first location is primary" guarantee in
  `addLocation`), view-only members couldn't switch Practice tabs (the `disabled`
  fieldset also disabled the tablist — now each tab's content is gated instead), the
  custom lapsed-months value was un-typeable (min-clamp-on-keystroke → clamp on
  blur), a dead `testimonials` settings deep-link (testimonials live in Reviews now),
  and a `setInterval` shadow on the billing panel. **Loose end:** the now-unused
  `notification_prefs.push_everything` column is harmless dead data — drop it in a
  future tidy migration.
- **Reviews reorientation — Google-first auto-loop + editable automated emails
  (2026-07-01; reconstructed from git 2026-07-02).** The reviews model became ONE
  flow: visit marked completed → review request auto-sends (`markCompleted` →
  `fireReviewRequestForAppointment`, immediate + best-effort, the hourly
  `auto-send-reviews` cron as safety net; auto-send now DEFAULT-ON) → the patient
  goes straight to **Google** → synced Google reviews auto-feature on the public
  site at a per-clinic star threshold (`clinic_review_config.feature_min_stars`,
  default 4★+) with per-review hide (`platform_review.hidden_from_site`). `/r/[token]`
  is Google-first with an optional "tell us privately" path (`submitPrivateFeedback`
  — never public, FTC-clean); the first-party public-text capture was removed.
  **Reviews is now the ONLY place testimonials are managed** — the Website Studio +
  Settings→Clinic testimonial editors were deleted and `updateClinicProfile` no
  longer writes `testimonials`; `getReviewsProof` merges live featurable Google
  reviews + manual testimonials for the site. **Migration 0099.** In the same
  session: **editable automated patient emails** — Settings → Automations → Emails
  (`emails-hub.tsx`) edits the copy of the 7 transactional patient emails
  (booking confirmation / reminder / intake request / cancellation / portal invite /
  review request / contact ack; registry `lib/types/email-automations.ts`, service
  `lib/services/email-automations.ts` `renderAutomatedEmail`, only deviations stored
  in `clinic_profile.email_automations` jsonb — **migration 0100**), consumed by the
  send paths; and staff notification emails link to the patient's record.
- **Auth redesign + copy voice pass (2026-06-29).** Imageless, brand-forward
  sign-in/sign-up wizard — `app/(auth)/` pages render through a shared
  `components/auth/auth-shell.tsx` on the v2 brand (`.v2-app` scope). Plus an
  app-wide user-facing copy polish (friendly/plain/clear voice) and the clinic-site
  patient "Login" now routes to the clinic's portal, not the platform sign-in.
- **Analytics premium overhaul + Growth "proof" panels + Social-posts overhaul +
  Daily polish (2026-06-24).** (1) **Analytics** in 3 phases: an audit fix ("New
  patients" no longer inflated by PMS/CSV imports — backfill sources excluded from
  acquisition), vs-previous-window trend deltas + funnel conversion %s, and a
  scorecard hero + upgraded teal charts + drillable source bars. Gated
  premium as before; no new schema. (2) **Growth proof pattern** — operational
  numbers up top, proof drill-downs behind them: retention proof ("who came back
  and what brought them", `getRetentionAttribution`), reputation proof ("what your
  reviews put on the site", `getReviewsProof`), social proof (posts published per
  platform via `social_post_target`, `getPublishedPostCounts` — output counts,
  never fabricated reach). (3) **Social Posts overhaul**: live multi-platform
  preview studio, video uploads + generous media limits, composer/channel-selector/
  history redesign, a "Showcase" tablet-feed mock of post history, in-place channel
  connect + setup checklist, and a **comment manager** with real engagement
  (`lib/services/social-comments.ts`, demo-safe + best-effort, add-on 402/403
  surfaced as availability). (4) A Daily design/polish batch (drawer motion,
  FlashToast 6 tones, channel-tone collision fix, shared `TONE_DOT`, campaign ⌘K,
  reviews needs-reply sidebar badge, marketing perf indexes, recall honoring
  clinic cadence + PMS date).
- **Messages v2 hardening + Intake-forms v2 overhaul + Daily interlinking
  (2026-06-23).** Documented in depth on the module rows in `CLAUDE.md` (Messages,
  Intake Forms) + `docs/intake-forms-overhaul.md`. Same day: the Daily
  interlinking sprint — drillable Overview tiles, `?appt=` drawer deep-links,
  unconfirmed-48h nav badge on Appointments, shared date/birthday helpers
  (`lib/dates.ts`), `(org, created_at)` indexes (migration 0096), and the
  clinic-configurable lapsed threshold (`clinic_profile.lapsed_after_months`,
  migration 0097, default 18mo, read via `lib/services/clinic-cadence.ts`).
- **Billing depth + marketing rebrand (2026-06-22).** Escalating trial funnel +
  platform-webhook idempotency + settings depth (PR #477 — the `trial-reminders`
  cron's foundation: per-milestone reminders recorded on
  `clinic_profile.trialRemindersSent`); intake submission insights + campaign email
  preview + messages reassign/bulk (PR #476); the marketing site rebranded to the
  Dream Create teal + real logo + SEO/accessibility pass (PRs #479/#480, logo 404
  fixed by serving from the middleware-excluded `/images`).
- **CRM-depth sprint — tags/follow-ups/My Day/digest/views + a 60-PR quality wave
  (2026-06-17 → 06-19, PRs #387–#475; was undocumented).** The "connective tissue"
  build-out: **patient tags** (`patient_tag` + `patient_tag_assignment`, migration
  0077, taggable from ⌘K/appointment drawer/threads); **per-patient documents**
  (S3-backed `patient_document`, migration 0078, byte-sniffed types); **patient
  follow-ups** (`patient_followup`, migration 0079 — assignable, due-dated,
  rule_key-idempotent) + **smart follow-up rules** (balance/recall/unconfirmed
  opt-ins on `clinic_profile.followupAutomation`, swept by the hourly
  `followup-rules` cron; auto-rebook follow-up on no-show) + a `/followups` board +
  sidebar due-badge; **saved patient-list views** (`patient_view`, migration 0080,
  generic `saved-views` store with a `surface` discriminator for
  patients/appointments/leads + promote-view-to-audience); **My Day** (`/my-day`
  per-staff cockpit — my/unclaimed follow-ups, my conversations, today's schedule,
  collections nudge) + the **morning digest email** (opt-in per clinic via
  `dailyDigestEnabled`, per-staff opt-out in `staff_notification_pref` migration
  0085, idempotent via `daily_digest_log` migration 0082, daily cron); **patient
  merge** (fold a duplicate into a survivor across ~15 tables, tombstoned via
  `mergedIntoPatientId`); **birthday + reactivation auto-sends**
  (`retention-automation` — creates scheduled campaigns idempotently via
  `campaigns.automation_key`, delivered by the existing campaign cron; daily
  `retention-automations` cron); 1–2★ **review escalation** for service recovery;
  subscribable **calendar feed** (ICS, `lib/services/calendar-feed.ts` +
  `/api/calendar/[token]`); shop orders/payments **CSV exports** + agenda/leads
  CSV exports; editable message templates; bulk actions (appointments status,
  leads triage, bulk follow-ups, bulk from saved views); ⌘K depth (acts, not just
  navigates: add follow-up, tag patients; searches applicants/products/reviews/
  saved views). Then a ~30-PR quality wave: race fixes (inventory oversell,
  double-booking, coupon double-redeem, scheduled-campaign claim collision),
  correctness batches across scheduling/lead-convert/public forms/membership
  money/reviews/PMS auth, rate-limiting on public forms (`rate_limit` table),
  route error boundaries, instant loading skeletons, in-context 404s, in-app
  confirm dialogs replacing `window.confirm`, `alert()` → toasts, focus traps +
  skip links + label association (a11y), optimistic mutations
  (`useOptimisticToggle`), unsaved-changes guards, parallelized data fetches,
  lazy-loaded ⌘K + EditBridge, and a dead-code sweep (45 orphaned Mosaic
  components + unused routes removed). Settings also got its first
  tabbed-shape pass here (superseded by the 2026-07-02 card-grid home).
- **Referral partner program (2026-06-11 → 06-12, PRs #338 + #341; was
  undocumented).** The platform's growth engine: the owner recruits PARTNERS who
  refer clinics and earn a commission (default 10%, `percent_bps`) on every paid
  subscription invoice from their referred clinics. Schema
  `lib/db/schema/referrals.ts`: `referral_partner` / `referral_commission`
  (accrual ledger, unique `stripe_invoice_id` for idempotency, percent snapshotted
  at accrual) / `referral_payout` — **migration 0059** (+ 0060 invite expiry, 0061
  percent/term normalization), with `clinic_profile.referral_partner_id /
  referral_percent_bps / referral_term_months / referral_started_at` linking
  clinics to partners. Accrual is driven by the platform Stripe webhook
  (`accrueCommissionForInvoice`); payouts via **Stripe Connect Express**
  (`lib/services/referral-payouts.ts` — `ensureExpressAccount`, onboarding link,
  `payoutPartner` with an idempotency key over the claimed rows, $25 minimum).
  Surfaces: platform admin `/partners` (+ `[id]` detail, terms editor, lifecycle
  suspend/archive/conditional-delete with balance resolution), the **partner
  portal** `app/(partner)/partner` (minimal single-column, Dream Create brand),
  and the public invite-accept `app/(partner-accept)/partner/accept` (token auth,
  in the middleware allowlist). Auth: a 4th tenant persona — `requirePartner()`
  resolves `referral_partner` by `user_id` directly (NOT via `tenantType`, so a
  multi-persona user still reaches their portal); `resolvePartnerContext` derives
  `tenantType='partner'` only when no org membership takes precedence. A demo
  partner (`referral_partner.is_demo`) seeds with the demo clinic, excluded from
  real payouts/metrics.
- **Beta-launch session — first real clinic onboarded (2026-06-17, PRs #369–#385).**
  A sweep of feature work + a live onboarding-incident fix. Highlights (newest
  systems first):
  - **Integrations feature-bundle reframe — BUILT** (supersedes the "NEXT MAJOR
    WORK … NOT BUILT" section below). `/integrations` is now a menu of FEATURE
    BUNDLES a clinic activates; activating one surfaces that bundle's modules in
    the SIDEBAR as if built-in. `lib/integrations/bundles.ts` (`BundleDef` /
    `BUNDLES` / `resolveBundles` / `activeBundleIds` / `BundleSignals`) +
    `lib/services/integration-bundles.ts` (`getActiveBundlesForSidebar`) +
    `applyBundleGate` in `lib/modules` — bundle-tagged modules (Social Posts,
    Shop) appear only once the bundle is active (auto-derived from what's
    connected). Wired into `dashboard-shell`.
  - **No-card 7-day trial** (`lib/trial.ts`). EVERY new clinic — self-serve AND
    managed — starts a full-Premium, no-card 7-day trial (`subscriptionStatus=
    'trialing'`, `trialEndsAt`) so the owner can use everything from the moment
    they sign up / accept, then activate their reserved/chosen plan within the
    window. `resolveTrialState` / `hasPaidSubscription` / `trialEndDate` /
    `trialDaysLeftLabel`; a real paid sub overrides. `TrialBanner` +
    `TrialEndedWall` in dashboard-shell.
  - **Brand-derived public-site palette (PR #379).** The clinic picks ONE brand
    color and the WHOLE site palette derives from it. `lib/clinic-site-theme.ts`
    `buildClinicPalette(brand)` → a full role-based palette (bg / surface /
    border / ink / inkMuted / heading + the deep "rhythm-break" band + the bright
    announcement strip + every on-color ink) in HSL, **contrast-checked to WCAG
    AA**, with neutrals temperature-matched to the brand. The `/site/[slug]`
    layout injects it as `:root` CSS vars (`--c-bg`, `--c-deep`, `--c-strip`, …
    via `clinicPaletteCss`); every clinic-site surface reads
    `var(--c-*, <literal-fallback>)` instead of hardcoded hex. `MinimalSiteChrome`
    injects it for `/r/[token]` (outside the layout). OG image derives REAL hexes
    (Satori can't read CSS vars). NO migration. Tests `tests/clinic-site/palette*`.
  - **Service builder — full-page editor + AI + photo upload + platform default
    editing (PRs #380 / #381 / #382).** The service builder (Settings → Clinic +
    Website Studio) now edits EVERY section of a service's detail page —
    Highlights / Description / What-to-expect / FAQ, not just the body —
    (`ContentEditDrawer` in `services-library-picker.tsx`) with a "✨ Generate"
    button (calls `regenerateCustomization`, re-seeds fields in place), seeding
    from the saved AI/manual blob OR the library default (token-filled).
    `updateServiceContent(id, content)` persists the whole `customized` blob;
    `sanitizeServiceContent` (in `lib/types/clinic-content.ts`) is the shared
    bounds contract. Per-service HERO PHOTO is a real **image upload** (shared
    `ImageUploader` → S3 `service-photos`), not a URL field. PLATFORM admins can
    edit the CANONICAL library default at `/platform/service-library`
    (`updateLibraryEntry` + the `LibraryEntryEditor` drawer) — sets
    `service_library.edited_by_admin` (**migration 0072**) so the deploy-time
    `seedServiceLibrary` STOPS refreshing that row from the in-code seed (the
    dashboard edit becomes the durable default every clinic starts from). Clinics
    on the library-default (1A) path pick it up live; clinics that customized keep
    theirs.
  - **Onboarding incident — the first real clinic (PRs #384 / #385).** Three bugs
    from one chain. (1) The managed-provisioning invite is a manually-inserted
    `invitation` row, but accept used better-auth's `organization.acceptInvitation`,
    which ERRORED on it AFTER `signUp.email` had already created + auto-signed-in
    the account → an ORPHANED user (signed in, no membership). **Fix:** robust
    server-side `acceptTeamInvite(token)` (`app/(auth)/accept-invite/team-invite.ts`
    — mirrors `acceptPatientPortalInvite`: validate + bind to recipient, insert the
    `member` row directly, point the session at the org, mark accepted; idempotent;
    RECOVERS an already-orphaned user who revisits the link). (2) An org-less
    signed-in user is routed to onboarding (`dashboard-shell` → `/onboarding-01`),
    which mints a new clinic → she created a DUPLICATE. **Fix:**
    `findPendingInviteForEmail` (`lib/auth/pending-invite.ts`, **INNER JOINs the
    organization** so a dangling/deleted-org invite is ignored — no soft-lock)
    redirects an org-less user WITH a pending invite to `/accept-invite` instead;
    wired into `dashboard-shell` + `submitOnboarding` (defense in depth). (3) The
    invite email was unreadable in old Outlook (Word engine drops `<div max-width>`
    + `inline-block` buttons; the button wasn't even clickable). **Fix:**
    `authEmailShell` in `lib/email.ts` — fixed-width table + a VML roundrect button
    for Outlook + a normal `<a>` for everyone else + a VISIBLE copy-paste URL
    fallback (the manual copy is literally what rescued the first onboarding);
    applied to invite + magic-link + password-reset; user content HTML-escaped.
    Tests: `tests/onboarding/accept-team-invite` + `pending-invite-guard` +
    `tests/email/auth-email-bulletproof`.
  - **Clinic deletion completeness (migration 0071).** `membership.plan_id` FK was
    `restrict` → aborted the WHOLE org cascade when a plan had members, stranding
    the org + its slug ("deleted clinics aren't cleaned up; the slug stays taken").
    Now `cascade`; `deleteClinicAction` clears memberships up front + drops the org
    in a txn. ALL 63 org FKs verified cascade/set-null (none restrict) → a clinic
    delete is always complete (profile / members / INVITATIONS / patients / … all
    cascade). `tests/migrations/clinic-delete-cascade` + `tests/demo-mode/delete-clinic`.
  - **PHI leak fixed.** The journey/breadcrumb trail was a single global key →
    leaked demo patient names across clinics. Now scoped per user+org
    (`trailStorageKey(scope)` = `dc.trail:{userId}:{orgId}`, foreign-scope + legacy
    `dc.trail` swept on mount). `app/trail-context.tsx` + `lib/trail.ts`,
    `tests/trail/trail-provider`.
  - **Deploy-skew recovery.** A stale-chunk crash on "Open editor" + the welcome
    interview hanging on a mid-deploy skew → `ChunkReloadGuard`
    (`components/chunk-reload-guard.tsx`, mounted in `app/layout.tsx`) +
    `isChunkLoadFailure` / `isDeploymentSkewError` self-reload paths (never crash;
    reload to the fresh bundle).
  - **Website template polish + Studio AI bar (PR #378).** Every homepage section
    that used to collapse/vanish on an empty field now always-renders (brand-bloom
    placeholders or `dc-edit-only` editor prompts) so a brand-new clinic's site
    reads as finished. The Studio AI command bar lost its stuck scrollbars and
    gained plain-language starter chips ("Change my hours", "Make my intro warmer",
    …) so non-technical staff know what to ask.
  - **Test-suite audit + hardening (PR #383).** Audited the 3,300+ test suite: 0
    `.only`, 0 skips, ~0 assertion-free, all async assertions awaited, no
    tautologies — genuinely high quality. Closed 3 silent-pass `if(r.ok)`-only
    gaps; added a semantic `data-tone` attribute to `StatusPill` (restyle-proof)
    replacing brittle color-class assertions; made the demo-seeder self-heal test
    content-based instead of an exact-count. Suite at **3,354 tests**.
- **Integrations redesigned as a catalog-driven app marketplace + `/channels`
  folded in (2026-06-16, PRs #365–#368)** — `/integrations` is no longer just the
  PMS dashboard; it's a premium **app-library marketplace** that scales to
  hundreds/thousands of integrations and is the SINGLE place a clinic connects
  everything (PMS · Google Business · social · email · payments). **`/channels`
  is GONE** — its connect surface (Google Business + the social shortlist) was
  consolidated INTO `/integrations`; `app/(default)/channels/page.tsx` is now a
  permanent `redirect('/integrations')` (old bookmarks keep working) and the
  sidebar "Channels" entry was removed. **Architecture — adding an integration is
  a DATA change, not JSX:** `lib/integrations/catalog.ts` (`IntegrationDef` +
  `INTEGRATIONS_CATALOG` — PURE client-safe metadata: id, `category` from a
  `CATEGORY_META` taxonomy [pms/google/social/communication/payments/marketing/
  analytics/scheduling/forms/other], `logo` id, tagline, keywords, `availability`
  [`live`/`beta`/`request_access`/`coming_soon`], `connectKind` [`zernio`/`pms`/
  `oauth`/`external_link`/`none`], optional `minPlan`/`countsTowardSocialCap`/
  `valueLinks`/`detailHref`) + `lib/integrations/resolve.ts` (a PURE runtime
  resolver `resolveCatalog(liveState, planTier)` → per-def `IntegrationRuntime`
  status [`connected`/`needs_attention`/`available`/`at_cap`/`premium_locked`/
  `request_access`/`coming_soon`/`unavailable`] — connected state always wins;
  the page assembles a minimal serializable `LiveIntegrationState` from what it
  already loads [PMS dashboard, `getZernioConnection`, `canConnectSocialPlatform`,
  Gmail mailbox rows, Stripe Connect status] so the catalog stays free of live
  state). **Real brand logos** in `components/integrations/brand-logos.tsx`
  (trademark-accurate inline-SVG marks in brand colors + `BRAND_ACCENTS` tint
  map — Instagram/Facebook/TikTok/YouTube/LinkedIn, Google four-color G, Gmail,
  Stripe, SMS, Open Dental monogram + roadmap-PMS monogram tiles; purely
  decorative/`aria-hidden`, text label always alongside) — the single biggest
  visual upgrade (no more emoji/plug wireframe cards). **UI**
  (`integrations-library.tsx`, DESIGN-SYSTEM v2): a connected-first overview
  ("Your integrations" section at the top) + a Browse split, fast client SEARCH
  over name+keywords+category, a scrollable category-nav pill row with per-cat
  counts, a categorized grid with section headers + a live total + no-results
  state, rich cards (logo well + name + tagline + StatusPill + one action +
  hover-lift + connected handle chip + value quick-links). **Catalog content
  today** (honest — every entry is real or a clearly-labelled roadmap tile): PMS
  (Open Dental `live`/Premium + Dentrix Ascend `request_access` + Dentrix
  desktop/Eaglesoft/Curve `coming_soon`), Google Business (`live`, free, never
  counts toward the social cap), the 5 social shortlist platforms (`live`,
  `countsTowardSocialCap`), Gmail (`live`, links to `/inbox`), SMS
  (`coming_soon`), Stripe (`live`, links to `/shop`). **Detail pages:**
  `/integrations/open-dental` (the full PMS connect/sync dashboard) +
  `/integrations/google-business` (a light GBP detail). Gmail + Stripe Connect
  surface their REAL status and link OUT to their existing flows (`/inbox`,
  `/shop`) — we don't rebuild those. The social cap meter + at-cap upgrade/add-on
  CTA + the add-on management + the Zernio connect-in-new-tab / re-sync-on-focus /
  Refresh behavior all moved here intact. Server actions in
  `app/(default)/integrations/actions.ts` (`refreshChannelsAction` ≡
  `syncZernioAccountsAction`; `disconnectChannelAction`; `disconnectZernioGoogleAction`;
  `buySocialAddonAction`/`cancelSocialAddonAction` — the old Channels actions
  kept as aliases). **NO migration** (pure UI/architecture refactor over the
  existing Zernio/PMS/Gmail/Stripe state). **NOTE — the "feature-bundle" reframe
  on top of this is now BUILT (2026-06-17) — see the beta-launch session bullet
  at the top of "What's wired" (`lib/integrations/bundles.ts` +
  `lib/services/integration-bundles.ts` + `applyBundleGate`).**
- **Zernio foundation — Google Business connection (2026-06-15)** — the
  connection architecture for the Zernio × Google Business integration (full
  plan in `docs/zernio-google-integration.md`). FOUNDATION ONLY (connect /
  disconnect plumbing; review-pull, hours/location sync, and metrics are the
  NEXT PRs). Shipped: lazy client `lib/zernio.ts` (Proxy-free fetch wrapper;
  `zernioFetch` sets the Bearer from `ZERNIO_API_KEY`, base
  `https://zernio.com/api/v1`, throws status+body on non-2xx; thin wrappers
  `listProfiles` / `createProfile` / `getConnectUrl` / `listAccounts` /
  `deleteAccount`); client-safe `lib/types/zernio.ts` (15 platform slugs,
  `googlebusiness` first-class, labels/icons, `ZernioAccount` /
  `ZernioConnectionView`); schema `zernio_connection` (org PK, `zernioProfileId`,
  status, lastError, isDemo) + `zernio_account` (Zernio account id PK, platform,
  unique on org+platform+accountId) — **migration 0063**; service
  `lib/services/zernio.ts` (`ensureProfileForOrg` find-or-create idempotent;
  `getGoogleBusinessConnectUrl`; `syncConnectedAccounts` upsert+reconcile,
  best-effort `error`+`lastError` on failure, **demo connections never hit the
  network**; `getZernioConnection`; `disconnectPlatform` best-effort at Zernio +
  always drops local rows; `seedDemoZernio`). Hosted-OAuth routes
  `app/api/integrations/zernio/{connect,callback}/route.ts` (authed clinic +
  owner/admin + premium via `requirePlan`/`planAllows`; connect 302s to the
  Google consent `authUrl`; callback re-syncs → `/integrations?connected=
  googlebusiness`). UI: a **Google Business Profile card** on `/integrations`
  (DESIGN-SYSTEM v2 `.v2-panel`, teal primary, StatusPill) — connect opens in a
  NEW TAB + re-syncs on window focus + Refresh button (Zernio's default return
  is its OWN dashboard, so the focus-poll guarantees detection), connected shows
  the GBP handle + Refresh/Disconnect + an honest "what's next" tease (reviews/
  hours/metrics arrive next — we don't show data we don't pull yet). Server
  actions `syncZernioAccountsAction` / `disconnectZernioGoogleAction`. Demo
  seeds a synthetic connected GBP ("Dream Dental", fake accountId, isDemo). 55
  tests (`tests/zernio/`). **Confirmed REST shapes:** `/connect/{platform}`
  takes `redirect_url` (snake_case) + a REQUIRED `profileId`, returns
  `{ authUrl, state }`, appends `?connected=…&accountId=…&username=…` on the
  redirect; `/accounts` → `{ accounts: SocialAccount[], hasAnalyticsAccess }`
  with `profileId` either a string OR an embedded Profile object (normalized);
  `POST /profiles` returns a `{ message, profile }` wrapper.
- **Zernio Google Business reviews — pull + reply + legit AggregateRating
  (2026-06-15)** — Phase 1's review work on the Zernio foundation. REAL Google
  reviews patients left are pulled through the clinic's GBP connection (cron +
  on-demand) into a new `google_review` table (**migration 0064**, idempotent
  upsert by `(organizationId, externalReviewId)`; reviewer name/photo, integer
  star 1–5, comment (nullable — Google allows rating-only), create/update times,
  owner reply + reply time, `isDemo`). Review client wrappers in `lib/zernio.ts`
  (`listGoogleReviews` / `replyToGoogleReview` / `deleteGoogleReviewReply`) parse
  DEFENSIVELY — `normalizeStarRating` accepts BOTH numeric AND Google enum
  (`"FIVE"`) ratings, and the normalizer tolerates both field-name shapes
  (`starRating`/`rating`, `comment`/`text`, `reviewer.displayName`/`.name`,
  `reviewReply`/`reply`) so a docs/version drift can't strand us. Service
  `lib/services/google-reviews.ts`: `syncGoogleReviews` (resolve the GBP account
  via `getZernioConnection`, paginated pull, idempotent upsert, reply-field
  update; **demo connections NEVER network** — seeded rows stand; best-effort —
  API failure records nothing destructive), `listGoogleReviews`,
  `getGoogleReviewStats` (`{count, averageRating (1-dp), needsReply}` over rated
  reviews only — comment-only reviews don't drag the average), `replyToGoogleReview`
  / `deleteGoogleReviewReply` (call Zernio for real connections, persist/clear
  locally; demo-local only), `syncAllGoogleReviews` (cron sweep over connected
  non-demo GBPs). **`clinicJsonLd` now emits a legit `AggregateRating`** sourced
  ONLY from real synced Google reviews (gated to `count ≥ 1` + non-null average;
  omitted at zero — never fabricated; passed in by the `/site/[slug]` page that
  already loads clinic data). **Reviews UI:** `/reviews/received` gains a "From
  Google" section (reviewer/stars/comment/date + the clinic reply, with Reply /
  Edit reply / Delete reply owner-admin-gated server actions + "Refresh from
  Google" + a Connect-prompt empty state linking to `/integrations`); `/reviews`
  surfaces Google rating/count/needs-reply KPIs. The hand-pasted
  `clinic_review_config.googlePlaceId` is superseded by the auto-resolved Zernio
  GBP connection (column kept as a deprecated fallback — not deleted). The
  first-party "patient writes the review inside DreamCRM" flow is untouched.
  Cron `app/api/cron/sync-google-reviews/route.ts` (CRON_SECRET-gated, hourly;
  `/api/cron` is already in the middleware allowlist) — **the EventBridge rule
  `dreamcrm-sync-google-reviews` (hourly) is now LIVE in prod (PR #364),
  provisioned via `scripts/setup-cron-schedules.sh`** (which now manages 7 rules
  total). Demo seeds ~6 synthetic `google_review` rows (varied ratings incl. a 4★ + a
  rating-only null-comment + replied/unreplied) so `/reviews/received`, the
  dashboard, and the public AggregateRating all showcase populated (never
  networks; behind the real-patient guard like `seedDemoZernio`). **Confirmed
  review REST shapes:** `GET /v1/google-business/gmb-reviews?accountId=…`
  (`pageToken` paged), `POST /v1/google-business/gmb-reviews/{reviewId}/reply`
  (body `{comment}`, `accountId` query), `DELETE …/{reviewId}/reply`. 52 new
  tests (`tests/zernio/` + `tests/services/` + `tests/clinic-site/`).
- **Zernio Google Business — hours/address/phone/photos sync (2026-06-15)** —
  Phase 1's hours/location work on the Zernio foundation. PULLs a clinic's
  VERIFIED hours/address/phone/photos from their connected GBP into
  `clinic_profile` (cron + on-demand "Sync from Google"), so the public site,
  online booking, footer "open today", and `clinicJsonLd` all ride the clinic's
  real Google data automatically. **ONE-DIRECTIONAL** — Zernio is pull-only for
  listing fields, so there is NO write-back to Google. Client wrappers in
  `lib/zernio.ts` (`getGoogleBusinessLocation` + `listGoogleBusinessMedia`) parse
  DEFENSIVELY — `normalizeGbpTime` accepts Google's `"HH:MM"` strings AND the
  older `{hours,minutes}` objects (and maps the `"24:00"` end-of-day marker →
  `"23:59"`), the location normalizer maps Google's enum days
  (`MONDAY`…`SUNDAY`) → our `{ mon,…,sun }` keys, reaches through
  `{location}`/`{data}` wrappers, and tolerates every missing field; media
  extraction prefers `googleUrl` (→ `sourceUrl` → `thumbnailUrl`), skips
  `mediaFormat:'VIDEO'`. Schema columns `clinic_profile.{hours,address,phone}
  _source` (text DEFAULT `'manual'`) + `google_synced_at` + `google_photos`
  jsonb — **migration 0065** (defaults `'manual'` so no existing row is treated
  as Google-sourced until a sync runs). Service `lib/services/gbp-sync.ts`:
  `syncGoogleBusinessProfile(orgId,{force?})` — **SAFETY INVARIANT**: an
  automatic/background sync only overwrites fields whose source is `'google'`
  (reports the rest in `skippedManual`); an explicit `force` "Sync from Google"
  MAY overwrite a manual field + flips its source to `'google'`; **demo
  connections apply seeded synthetic data with NO network**; best-effort (never
  throws — returns `{ok,applied,skippedManual,photoCount,error?}`). Also
  `mapGoogleHours` (→ the EXACT existing `clinic_profile.hours` shape — all 7 day
  keys, HH:MM, widest window on split shifts; days with no Google period read as
  `{open:null,close:null}` = closed, so `getSlotsForDay` consumes it UNCHANGED,
  round-trip test in `tests/booking/gbp-synced-hours.test.ts`), `mapGoogleAddress`
  (addressLines[0]→line1, joined rest→line2, regionCode→country default US),
  `getGbpSyncState` (UI provenance), `revertFieldToManual` ("keep my version"),
  `markFieldSourceManual` (wired into `updateClinicProfile` + `saveContact` +
  `saveHours` + the inline phone save, so editing a field flips it back to
  manual — a later auto-sync respects the edit), `importGooglePhotos`
  (append-only into the curated `officePhotos`, only URLs actually in
  `google_photos` — never auto-clobbers), `syncAllGoogleBusinessProfiles` +
  `seedDemoGbpSync`. UI: a **"Sync from Google" card** on Settings → Clinic
  profile (`app/(default)/settings/clinic/gbp-sync-card.tsx`, premium +
  owner/admin via the actions in `gbp-actions.ts`) — per-field "From Google ·
  synced {date}" vs "You've customized this" indicators, a force-sync button,
  per-field "use Google's version" / "stop syncing", an import-from-Google photo
  gallery (curated set untouched), and a disconnected connect-prompt to
  `/integrations`. Cron `app/api/cron/sync-gbp/route.ts` (CRON_SECRET-gated,
  non-force so it respects manual flags; `/api/cron` already in the middleware
  allowlist — **the EventBridge rule `dreamcrm-sync-gbp` (hourly) is now LIVE in
  prod (PR #364), provisioned via `scripts/setup-cron-schedules.sh`**). Demo
  seeds the synced state +
  `google_photos` (one URL overlapping the curated gallery so the "Added" state
  shows; behind the real-patient guard, non-destructive on a hand-edited demo,
  never networks). **Confirmed REST shapes:** `GET /v1/google-business/
  location-details?accountId=…` (`regularHours.periods[{openDay,openTime,
  closeDay,closeTime}]` · `storefrontAddress{addressLines,locality,
  administrativeArea,postalCode,regionCode}` · `phoneNumbers.primaryPhone` ·
  `categories`), `GET /v1/google-business/media?accountId=…` (`googleUrl`/
  `sourceUrl`/`mediaFormat`/`locationAssociation.category`) — path follows the
  shipped reviews precedent (flat `/google-business/<resource>` + `accountId`
  query), parsed defensively against doc/version drift (see
  `docs/zernio-google-integration.md`). 62 new tests.
- **Zernio Google Business — local metrics into SEO + Analytics; PHASE 1
  COMPLETE (2026-06-15)** — the final Phase-1 Zernio surface. PULLs the clinic's
  Google Business Performance numbers (impressions / calls / direction requests /
  website clicks / bookings) + top search keywords through the Zernio GBP
  connection and surfaces them on the **SEO module** (the static "claim your GBP"
  checklist is REPLACED by a real connected-metrics card — KPIs + a top-search-
  terms list when connected; a calm connect-prompt to `/integrations` when not,
  no fabricated numbers; the GSC web-click surface stays intact) AND the
  **Analytics Acquisition band** (a "Google Business — local actions" tile beside
  the GSC clicks→leads funnel, honoring the 30/90-day toggle). Client wrappers in
  `lib/zernio.ts` (`getGoogleBusinessPerformance` + `getGoogleBusinessSearchKeywords`)
  parse DEFENSIVELY — prefer Zernio's pre-summed `total` but fall back to summing
  the daily `values` series, fold the four impression sub-series (desktop/mobile ×
  Maps/Search) into one figure, tolerate a missing metric key → 0, and merge +
  cap keywords across monthly buckets. Service `lib/services/gbp-metrics.ts`
  `getGbpLocalMetrics(orgId,{days})` → `{ connected, impressions, calls,
  directions, websiteClicks, bookings, topKeywords:[{term,count}], windowDays,
  error? }` — **demo-safe** (isDemo → seeded synthetic metrics, NEVER the
  network) + **best-effort** (no connection → `{connected:false,…zeros}`; an API
  failure incl. a 402 "Analytics add-on required" → `{connected:true,…zeros,
  error}`; a keyword-pull failure doesn't zero the performance KPIs; never throws
  so the SEO/Analytics pages always render). **Refactor:** the org→GBP-account
  resolver `resolveGbpAccount` (duplicated identically in `google-reviews.ts` +
  `gbp-sync.ts`) was FACTORED into `lib/services/zernio.ts`; all three consumers
  now import the one copy. **NO new migration** — a live pull per page load,
  exactly like `getClinicSeoPerformance` (no rollup/cache table; simplest +
  consistent with GSC). Demo: the metrics are a live compute returned whenever
  the org's Zernio connection is `isDemo` (seeded by `seedDemoZernio`), so
  `seedDemoGbpMetrics` is a documented no-op hook — the demo shows ~4,120
  impressions / 38 calls / 52 directions / 96 website clicks / 11 bookings per
  30 days (scaled to the window) + 5–8 dental top keywords ("dentist near me",
  "teeth whitening austin", …). **Confirmed REST shapes** (docs.zernio.com
  llms-full.txt + OpenAPI probe — these pages WERE readable, so confirmed not
  assumed): `GET /v1/analytics/googlebusiness/performance?accountId=…&startDate=…&endDate=…&metrics=CSV`
  → `{ metrics: { <KEY>:{ total, values:[…] } } }` (keys
  `BUSINESS_IMPRESSIONS_{DESKTOP,MOBILE}_{MAPS,SEARCH}` · `CALL_CLICKS` ·
  `WEBSITE_CLICKS` · `BUSINESS_DIRECTION_REQUESTS` · `BUSINESS_BOOKINGS` ·
  `BUSINESS_CONVERSATIONS`; data lags 2-3 days; 402 = Analytics add-on);
  `GET /v1/analytics/googlebusiness/search-keywords?accountId=…&startMonth=…&endMonth=…`
  (YYYY-MM, monthly-aggregated) → `{ keywords:[{ keyword, impressions }] }`. 30
  new tests. **→ Phase 1 of the Zernio integration (Google Business core) is
  COMPLETE** (foundation + reviews/AggregateRating + hours/location sync + local
  metrics). Next: GBP posting (Phase 2) + the full social module (Phase 3); +
  real-time review ingest via Zernio webhooks as a near-term add. See
  `docs/zernio-google-integration.md`.
- **Zernio GBP posting — Updates/Offers/Events composer + CTA + image + history;
  PHASE 2 COMPLETE (2026-06-15)** — a polished **Google Posts** surface
  (`/google-posts`, premium + owner/admin, Growth sidebar group) lets a clinic
  PUBLISH Google Business posts through the Zernio connection — **Updates /
  Offers / Events**, each with an optional CTA button + a single image — and
  keeps a post history. **Composer** (`post-composer.tsx`, DESIGN-SYSTEM v2
  `.v2-panel`, teal primary): post-type selector (Update/Offer/Event) that
  reveals type-specific fields, a live char counter to **1,500**, image upload
  via the **shared XHR helper** (`uploadFileWithProgress` → `/api/upload` → public
  S3 URL passed to Zernio, the same path the website editors use; ≤5MB JPEG/PNG),
  a CTA picker (`LEARN_MORE`/`BOOK`/`ORDER`/`SHOP`/`SIGN_UP`/`CALL` — **Book
  defaults to the clinic's `/book` URL** via `publicSiteUrl`; CALL needs no URL),
  offer fields (coupon/redeem URL/terms) when type=offer, event fields
  (title/start/end) when type=event, and **"Post to Google" + "Schedule"** (a
  future time handed to Zernio, which PUBLISHES scheduled posts ITSELF — so there
  is NO publish cron on our side). **History** (`post-history.tsx`): cards with a
  type badge, summary preview, image thumb, a StatusPill (published=ok ·
  scheduled=info · failed=urgent · draft=neutral), the published/scheduled date
  (`font-mono-num`), a "View on Google" permalink when present, and a
  confirm-then-delete. Client wrappers in `lib/zernio.ts` (`createGbpPost` /
  `listPosts` / `deletePost` + the exported `buildGbpPostOptions`) serialize/parse
  DEFENSIVELY — the GBP options (`topicType` STANDARD/EVENT/OFFER, `callToAction`,
  `event.schedule`, `offer.{couponCode,redeemOnlineUrl,termsConditions}`) ride
  several tolerant keys (`options`/`googleBusiness`/`platformOptions`) and the
  create result is parsed for the post id + any permalink (flat or per-account).
  Service `lib/services/gbp-posts.ts`: `createGbpPost(orgId, input)` (validate ·
  resolve the GBP account via `resolveGbpAccount` · **persist the row FIRST** ·
  call Zernio · on success store `zernioPostId`/`status`/`publishedAt`/`googleUrl`,
  on failure store `status='failed'`+`lastError` — **best-effort, NEVER throws to
  the UI**; **demo-safe** — `isDemo` persists a published row with a synthetic id +
  fake permalink and NEVER networks), `listGbpPosts` (history, newest first),
  `deleteGbpPost` (best-effort delete at Zernio when a post id exists + ALWAYS
  drops the local row; demo-local only), `validateGbpPostInput` (pure, exported
  for tests), `seedDemoGbpPosts`. Schema `gbp_post` (**migration 0066**) — org FK
  cascade, accountId, `zernioPostId`, postType, summary, imageUrl, ctaType/ctaUrl,
  event fields, offer fields, status, scheduledAt/publishedAt, googleUrl,
  lastError, isDemo. Server actions `createGbpPostAction` / `deleteGbpPostAction`
  (premium + owner/admin re-gated; `{ ok | error }`). Disconnected → a calm
  connect-prompt to `/integrations`; connected + no posts → a "Write your first
  Google post." EmptyState. **HONESTY (per the plan):** Google DEPRECATED per-post
  insights, so the history shows publish STATUS + a permalink, NEVER fabricated
  per-post metrics — the page points to `/seo` for location-level performance.
  Demo seeds 3 synthetic `gbp_post` rows (published Update w/ image + Book CTA,
  published Offer w/ coupon `SMILE99`, scheduled Event "Kids' Smile Day"; behind
  the real-patient guard, idempotent, never networks). 63 new tests
  (`tests/zernio/gbp-posts-*`). **Confirmed create-post REST shape:**
  `POST /v1/posts` (body `profileId` + `content`/`text` + `socialAccountIds[]`/
  `platforms[]` + `scheduledAt`/`scheduledFor` + `mediaUrls` + `publishNow`; GBP
  options under `options`/`googleBusiness`); `GET /v1/posts?page&limit&status`;
  `DELETE /v1/posts/{postId}`. **Phase 2 (GBP posting) is COMPLETE.**
- **Zernio social module — Phase 3 PR1: billing + entitlements + GBP relaxed to
  all plans (2026-06-15)** — the money foundation for the social module. **The
  billing model is now DECIDED (was "pending"):** per-plan social-connection
  entitlements + a flat per-tier Stripe add-on. **Entitlement math** (client-safe,
  `lib/types/social-entitlements.ts`): `socialConnectionLimit(plan, hasAddon)`
  (basic 0 · pro 1→3 · premium 2→5), `socialAddonAvailable` (false on basic),
  `socialAddonPriceCents` (pro 3000 / premium 2000), `GBP_ALLOWED_ALL_PLANS=true`
  — **Google Business is FREE + SEPARATE on every tier, never counts toward the
  social limit, never blocked** (owner/admin still required). "Total incl. GBP" =
  social limit + 1 (Basic 1 · Pro 2/4 · Premium 3/6). **Schema:**
  `clinic_profile.social_addon` (int, default 0) + `social_addon_since`
  (**migration 0067**) — the source of truth the entitlement reads; set by the
  Stripe webhook for real clinics, seeded directly for the demo. **Stripe add-on**
  (`lib/stripe-config.ts` — 4 env-referenced prices
  `STRIPE_PRICE_SOCIAL_ADDON_{PRO,PRO_ANNUAL,PREMIUM,PREMIUM_ANNUAL}` +
  `getSocialAddonPriceId`/`isSocialAddonPriceId`/`socialAddonConfigured`;
  **these 4 Stripe Prices are now LIVE (2026-06-16) — Social — Pro $30/$300 +
  Social — Premium $20/$200 — with their ids in `dreamcrm/app-secrets` →
  App Runner, so `socialAddonConfigured()` is true and the add-on charges.**
  They're still referenced lazily, so every consumer degrades to a disabled
  "coming soon" when the env is absent — build/tests run keyless).
  `lib/services/social-billing.ts`: `addSocialAddon`/`removeSocialAddon` (add/del
  a Stripe **subscription ITEM** at the tier+interval price w/ proration; Basic →
  "Upgrade to Pro" throw, comped/no-sub → "managed billing" throw; idempotent),
  `reconcileSocialAddonItem` (swaps a stale add-on item to the new tier price on a
  plan change), `canConnectSocialPlatform(orgId)` → `{allowed,limit,current,
  reason?}` (counts non-GBP `zernio_account` rows vs the cap — **GBP never counts**;
  **ready for PR2's connect flow, not yet wired**), `seedDemoSocialAddon`
  (patient-guarded, idempotent, NEVER touches Stripe). **Webhook**:
  `syncSubscriptionFromStripe` now resolves the plan tier from the plan item (not
  items[0], so an add-on item can't shadow it) AND sets `social_addon` 1/0 by
  detecting an add-on price among the items — keeps the flag in sync on buy /
  cancel / **plan change**, idempotent on retry; `clearSubscription` drops it.
  Server actions `buySocialAddonAction`/`cancelSocialAddonAction` (owner/admin +
  clinic, `{ ok | error }`) behind a **Settings → Billing "Social connections"
  card** (DESIGN-SYSTEM v2: shows the entitlement + add-on state — Active w/
  Cancel · Available w/ Buy $X/mo · "Upgrade to Pro" for Basic · "coming soon" if
  env unset · "managed billing" for comped). **GBP relaxed from Premium-only to
  ALL plans** (owner/admin still required) across: the connect/callback routes,
  the Integrations Zernio actions (split out of the Premium PMS `ensureClinicAdmin`
  into `ensureClinicGbpAdmin`), the `/integrations` page (no longer redirects
  below-Premium — renders the GBP card for everyone + a Premium upsell for the PMS
  body), Settings → "Sync from Google" (`gbp-actions.ts` + always-loaded card),
  `/reviews` Google actions (already plan-free), and `/google-posts` (page +
  actions). The `google_posts` + `integrations` sidebar entries lost their
  `minPlan` (visible on every tier). **Demo**: the Premium demo clinic is seeded
  `social_addon=1` (5 social slots) so PR2's UI showcases the full allotment.
  **Out-of-band Stripe setup — DONE (2026-06-16):** the 2 Products × monthly+
  annual prices (Social — Pro $30/$300, Social — Premium $20/$200) now exist in
  live Stripe and the 4 env price ids are set in `dreamcrm/app-secrets` (mapped
  into App Runner), so the add-on charges in prod. ~80 new tests
  (`tests/billing/social-*` + `tests/zernio/gbp-gate-relax`). See
  `docs/zernio-google-integration.md`.
- **Zernio social module — Phase 3 PR2: cap-aware multi-platform "Channels"
  connect (2026-06-15)** — **SUPERSEDED (2026-06-16, PR #365): the `/channels`
  page described below was folded INTO `/integrations` (the catalog marketplace)
  and `app/(default)/channels/page.tsx` is now a redirect; the underlying
  service/route/actions all live on inside the Integrations marketplace. Read the
  "Integrations redesigned as a catalog-driven app marketplace" bullet at the top
  for the current shape; the rest of this bullet is the original PR2 record.** —
  a new **`/channels`** page (clinic sidebar, Growth
  group, **NO minPlan**) was the canonical place a clinic connects its Google +
  social presence through Zernio's hosted OAuth, enforcing the PR1 plan-tier
  social-connection caps. **The dentist shortlist** — `SOCIAL_CHANNEL_SHORTLIST`
  in `lib/types/zernio.ts` = `instagram`/`facebook`/`tiktok`/`youtube`/`linkedin`
  (the ONLY social platforms surfaced — to bound Zernio's ~$6/account cost + keep
  the clinic focused; the other 9 Zernio slugs X/WhatsApp/Reddit/Telegram/Discord/
  Bluesky/Threads/Snapchat/Pinterest are deliberately hidden; widening = one
  edit) + the `CONNECTABLE_PLATFORMS` (GBP + shortlist) and `isConnectablePlatform`
  / `isSocialChannelPlatform` guards. **Generalized service** (`lib/services/
  zernio.ts`): `getPlatformConnectUrl(orgId,orgName,platform,redirectUrl)` is the
  generic connect-URL resolver (`getGoogleBusinessConnectUrl` is now a thin GBP
  wrapper over it); **`getZernioConnection` now returns ALL connected accounts in
  a new `accounts` field** (the Channels UI groups them per platform) **plus** the
  back-compat `googleBusinessAccounts` slice — so the GBP consumers
  (`resolveGbpAccount` + reviews/sync/metrics) are UNTOUCHED. `syncConnectedAccounts`
  already upserts every platform; the callback re-syncs so social accounts persist.
  **Connect route opened** (`app/api/integrations/zernio/connect/route.ts`):
  accepts any shortlisted `platform` (400 otherwise); for a SOCIAL platform it
  calls `canConnectSocialPlatform` (PR1) FIRST and, when at the cap (or Basic = 0),
  redirects to `/channels?atLimit={platform}` **instead of starting OAuth** — GBP
  stays uncapped/free; the callback + the route's error/at-limit redirects land on
  `/channels`. **UI** (`app/(default)/channels/`, DESIGN-SYSTEM v2 `.v2-panel`,
  teal, StatusPill): a Google Business row (free; connect/disconnect/refresh) + a
  Social channels section (the 5 platforms with connect / connected handle +
  Disconnect) + a **"{current} of {limit} social connections used"** meter
  (`font-mono-num`) + an upgrade/add-on CTA → Settings → Billing at the cap
  (Pro/Premium "Add more", Basic "Upgrade to Pro"). Connect opens hosted OAuth in
  a NEW TAB + re-syncs on window focus + a Refresh button (the GBP-card pattern).
  Server actions `refreshChannelsAction` / `disconnectChannelAction`
  (`{ ok | error }`, owner/admin + clinic). **`/integrations` cohesion:** the GBP
  card there is now a STATUS + "Manage channels →" link (no competing connect
  button) — `/channels` is the single connection-management surface. **Demo:**
  `seedDemoZernio` now also seeds 2 synthetic connected social accounts (Instagram
  `@dreamdental` + Facebook "Dream Dental") so Channels showcases connected social
  + a partial cap ("2 of 5 used"; patient-guarded, idempotent, never networks).
  **NO migration** (`zernio_account` already supports any platform; the entitlement
  column shipped in PR1). ~98 new/changed tests (`tests/zernio/connect-route` ·
  `service` · `google-business-card` · `channels-actions` · `channels-board`).
- **Zernio social module — Phase 3 PR3: unified multi-platform composer +
  content calendar (2026-06-15)** — the GBP-only Google Posts surface is
  GENERALIZED into a **compose-once → publish/schedule to any connected channel**
  surface at **`/social-posts`** (Growth sidebar, label "Social Posts", **NO
  minPlan**; `/google-posts` now permanently REDIRECTS here so there's exactly
  ONE composer, no dead page). **Schema:** `gbp_post` is RENAMED → `social_post`
  (the parent composed-post row) + a new `social_post_target` child table tracks
  per-channel `{platform, accountId, zernioPostId, status, googleUrl, lastError,
  publishedAt}` — **migration 0068** (rename table+index+FK, create the child
  table, BACKFILL one `googlebusiness` target per existing post so every Phase-2
  GBP post is preserved as a 1-target social post, then drop the now-redundant
  per-channel columns from the parent; the parent keeps a `status` ROLLUP +
  `publishedAt`). A GBP-only post is just a 1-target social post. **Service**
  `lib/services/social-posts.ts` (replaces `gbp-posts.ts`): `createSocialPost(orgId,
  {accountIds, …, gbpOptions})` resolves each target account, **persists the parent
  + per-target rows FIRST**, then calls Zernio **per target** (GBP → `createGbpPost`
  with the GBP options; social → the new generic `createSocialPost` wrapper, text+
  media only) so **per-target status is ISOLATED** (one channel can fail
  `status='failed'`+`lastError` while another publishes) and rolls the parent
  status up — **best-effort, NEVER throws; demo-safe** (isDemo persists published/
  scheduled rows w/ synthetic ids, never networks); `validateSocialPostInput`
  (pure; GBP-only fields — post type/CTA/event/offer — validated ONLY when a GBP
  account is targeted; the char cap is the GBP 1,500 when GBP is targeted, else a
  generous social ceiling); `getComposerChannels` (GBP first then connected
  socials, reads `getZernioConnection().accounts`); `listSocialPosts` (parent +
  nested targets); `deleteSocialPost` (best-effort delete each target at Zernio +
  always drop local rows); `seedDemoSocialPosts`. New `lib/zernio.ts`
  `createSocialPost(input)` (generic single-account POST `/v1/posts`, NO GBP
  options) alongside the kept `createGbpPost`/`listPosts`/`deletePost`. **UI**
  (`app/(default)/social-posts/`, DESIGN-SYSTEM v2 `.v2-panel`, teal): a
  **channel-picker** (checkboxes over the connected accounts w/ platform icons) +
  shared text/image (shared XHR upload → S3) + a live counter at the tightest
  cap across picked channels + **GBP-specific options shown ONLY when a GBP
  channel is selected** (Book CTA still defaults to the clinic `/book`) + Post-now/
  Schedule (Zernio publishes — no cron). The right panel is a **List ⇄ Calendar**
  toggle: the history cards carry per-channel target chips (icon + status dot +
  permalink + per-target error) + confirm-delete; the **content calendar**
  (`calendar-view.tsx`) is a dependency-free CSS-grid month view placing each post
  on its scheduled/published (→ created fallback) day w/ channel icons + a status
  dot + a click-to-open detail popover + month nav. Disconnected → a connect-prompt
  to `/channels` (now `/integrations` — Channels folded in). Server actions
  `createSocialPostAction`/`deleteSocialPostAction`
  (`{ok|error}`, owner/admin + clinic, no plan gate). **HONEST:** still no
  fabricated per-post metrics (per-post insights deprecated on Google + not yet
  pulled for the socials) — points to `/seo`; **per-platform social analytics are
  PR4**. **Demo:** `seedDemoSocialPosts` seeds a published cross-post to GBP+IG+FB
  (image + Book CTA), a published GBP Offer (coupon), a scheduled IG+FB social
  cross-post, and a scheduled GBP Event — using the demo's connected GBP+IG+FB
  accounts (from PR2); patient-guarded, idempotent, never networks. Suite +75
  social-post tests (`tests/zernio/social-posts-service` · `social-posts-action-gate`
  · `social-post-composer` · `social-post-history` · `social-post-calendar` +
  `createSocialPost` in `gbp-posts-client`). **Next: PR4 — per-platform social
  analytics + Facebook reviews** (folded into the Reviews module alongside
  Google). See `docs/zernio-google-integration.md`.
- **Zernio social module — Phase 3 PR4: per-platform social analytics + Facebook
  reviews; the FINAL PR — THE WHOLE ZERNIO INTEGRATION IS COMPLETE
  (2026-06-15)** — the last two social surfaces. **(1) Per-platform social
  analytics.** Client wrappers in `lib/zernio.ts` (`getSocialPlatformAnalytics(
  platform, accountId, {since/until|days})` + `socialAnalyticsSupported`) hit the
  per-platform `-insights` endpoints (IG `account-insights` · FB `page-insights` ·
  TikTok `account-insights` · YouTube `channel-insights` · LinkedIn
  `aggregate-analytics`), each returning the SAME `{metrics:{<KEY>:{total,
  values}}}` envelope as GBP performance — parsed DEFENSIVELY (each logical figure
  — followers/reach/impressions/engagement/profile-views/posts — tries a list of
  metric-key aliases, prefers `total`, falls back to summing `values`; followers
  take the LATEST point not the sum; a missing key → 0). Service
  `lib/services/social-metrics.ts` `getSocialMetrics(orgId,{days})` → per-connected
  -social-platform tiles, mirroring `gbp-metrics.ts` discipline EXACTLY:
  **demo-safe** (isDemo → seeded synthetic per-platform numbers, NEVER network) +
  **best-effort** (no socials → `{connected:false,platforms:[]}`; ONE platform's
  API failure → that tile reads zeros + an `error`, the OTHERS still render; never
  throws), 30/90 window threaded. Surfaced as a **"Social performance" band on
  `/analytics`** (per-platform followers/reach/impressions/engagement tiles + a
  connect-prompt to `/channels` [now `/integrations`] when nothing social is
  connected + an honest
  "couldn't load — analytics add-on required" note on a 402, never fake
  zeros-as-data). **(2) Facebook reviews into the Reviews module.** The
  `google_review` table was GENERALIZED → **`platform_review`** (added a `platform`
  column DEFAULT `'googlebusiness'` + a `recommendation_type` column for FB's
  recommend/don't-recommend model + widened the unique key to (org, platform,
  externalReviewId) — **migration 0069**, EXISTING GOOGLE ROWS PRESERVED untouched;
  back-compat `schema.googleReview`/`GoogleReviewRow` aliases kept). Client wrapper
  `listFacebookReviews` + the `normalizeRecommendation` helper in `lib/zernio.ts`
  parse the unconfirmed FB review shape DEFENSIVELY (FB Graph `positive`/`negative`
  → our enum; a legacy FB star coexisting with a recommendation is dropped, keeping
  `starRating` null). Service `lib/services/facebook-reviews.ts` mirrors
  `google-reviews.ts` (sync · idempotent upsert · demo-safe · best-effort ·
  recommend/don't tallies) scoped to `platform='facebook'`. A **"From Facebook"
  section** on `/reviews/received` shows recommendations **READ-ONLY** with a
  "reply on Facebook" link-out — **HONEST: Zernio exposes NO Facebook reply
  endpoint**, so no fake reply box. The Google path is UNCHANGED (its functions
  now filter `platform='googlebusiness'`); the public-site **AggregateRating stays
  Google-only** (`getGoogleReviewStats` is google-scoped; FB recommendations have
  no star value + aren't SEO-meaningful). The hourly review cron
  (`/api/cron/sync-google-reviews`) now sweeps BOTH platforms (returns `{ok,
  google, facebook}`). Server action `syncFacebookReviewsAction`. **Confirmed REST
  shapes:** per-platform analytics `GET /v1/analytics/{platform}/<insights>?
  accountId&since&until` (shared `InstagramAccountInsightsResponse` envelope;
  Analytics add-on gated — 402 = off); Facebook reviews — there is **NO
  Facebook-only reviews endpoint** (only GBP's `gmb-reviews`); the OpenAPI probe
  surfaced a UNIFIED `GET /v1/comments/reviews` (filterable by platform) for the
  FB+GBP inbox-review surface, but the per-FB-review field shape is NOT pinned in
  the rendered docs — so the FB wrapper hits `/comments/reviews?platform=facebook`
  + parses every field defensively + is best-effort (drift → empty, never
  destructive). **Demo:** `seedDemoFacebookReviews` seeds ~4 synthetic FB
  recommendations (3 recommend, 1 doesn't, 1 bare/no-comment; patient-guarded,
  idempotent, never networks); `seedDemoSocialMetrics` is a documented no-op hook
  (the per-platform metrics are a live compute when the connection is isDemo — the
  IG+FB accounts from PR2 — showing synthetic IG/FB followers/reach/engagement).
  ~95 new/changed tests. **→ THE ENTIRE ZERNIO INTEGRATION (Phases 1–3) IS
  COMPLETE.** Deferred niceties (non-blocking, inline-doc'd): real-time review
  ingest via Zernio webhooks (`review.new`/`review.updated`) into the
  `platform_review` upsert (the hourly cron covers it today); a confirmed Facebook
  reviews REST shape (the defensive wrapper lights up the moment Zernio pins it);
  Facebook reply support (no Zernio endpoint today — read-only + link-out). See
  `docs/zernio-google-integration.md`.
- **Website system sprint — "complete in seconds" (2026-06-12, PRs #342–#345)**
  — 4 audits + 4 build waves refined the ENTIRE clinic-website system to the
  day-0-complete model (supersedes the honest-empty framing of #304–#307 for
  everything non-trust): **(W1 floor)** `lib/services/starter-pack.ts`
  `applyStarterFloor` (idempotent, null-only) gives EVERY new clinic — both
  creation paths — a finished site instantly: starter tagline/about/3
  qualitative stats/6 persisted editable FAQ rows/payment methods/cancellation
  policy + **4 canonical core services** (library 1A token-substitution, no AI
  latency); STARTER_* constants exported for still-starter detection; empty
  hero ovals render brand-derived gradient blooms + arc motif (designed, not
  blank; with-photo path untouched). Trust surfaces (staff/testimonials/
  carriers/financing) stay honest-empty by rule. Demo renamed **Dream Dental**
  safely (slug stays `acme-dental-demo`, decoupled from name; all seeded copy
  swept; one-time isDemo-scoped force-refresh self-heal branches replace the
  live demo's old Acme content — remove after a deploy cycle). **(W2
  interview v2)** /welcome is the personalization engine: services become a
  checkbox step over the library (starters pre-checked), answers
  server-persisted (migration 0062 `onboarding_interview_draft` +
  `onboarding_interview_completed_at`), one awaited mega-call (~8–12s, stepped
  checklist UI) also writing `seo_meta.home` + `brandVoice`, then
  per-service `customizeServiceForClinic` fired non-blocking with the new
  hourly `/api/cron/customize-services` (excludes demos, 4/org/run) as the
  durable net; apply is NON-destructive (overwrites only null/still-starter;
  reports skipped); failure → floor stands, never empty; success → reveal
  screen w/ live URL ("View your site" / "Open the editor"); every cohort
  routed (accept-invite + new `/billing/activated` → /welcome on the new
  `siteNeedsPersonalization` gate — old `siteUnfilled` is always false
  post-floor). **(W3 Studio)** 25-defect fix wave: "✨ Rewrite with AI"
  finally has UI (About/Stats/FAQ modals + tagline popover; review-only,
  allowance-gated), Undo survives modal opens, dirty-close confirms, logo
  editable from the canvas (footer instrumentation incl. letter-mark add
  path), shared XHR upload helper w/ progress+cancel (staff upload failures
  were silent), inline-save failures revert the element, load-aware tours,
  AI list-merge guard, touch-device always-visible affordances, stale-tab
  fallback widened. **(W4 site polish)** `readableInk` contrast floor behind
  every brand-filled heading sitewide; /membership 308→/dental-plans;
  honeypot+time-trap+privacy microcopy on all public forms; 9 JSON-LD
  builders wired (ItemList/Person/Blog/FAQPage/Product+Offer/Breadcrumbs);
  /r/[token] reskinned to clinic brand on shared MinimalSiteChrome (also
  intake-start + site 404); teal ClosingCTA rhythm on subpages; false
  "we'll text a reminder" + hardcoded claims universalized; cart stepper +
  form ergonomics; image lazy/dims + detail-hero fetchpriority; FAQ sticky
  via --site-header-h. Suite 2402 → **2601 tests**. Deferred (inline-doc'd):
  SEO_PAGE_KEYS dental-plans key (cross-boundary into settings form);
  multi-level undo, keyboard a11y, Studio optimistic locking.
- **Design System v2 — "Instrument Panel, Liquid Soul" (2026-06-11, PRs
  #330–#337)** — the entire authenticated dashboard re-skinned + re-navigated
  to the research-backed v2 language, and the platform re-branded to **Dream
  Create** (liquid teal-gradient D mark, `components/brand/dream-create-logo.tsx`
  + dynamic favicon `app/icon.tsx`). **DESIGN-SYSTEM.md was REWRITTEN as the
  v2 binding spec** — read it before touching any dashboard UI. The shape:
  violet brand is dead → **teal brand ramp** (logo aqua #4DCDC4 → deep
  #2A7F8C) used ONLY for identity (primary actions, selection, focus, active
  nav, chart series 1 — never a status); legacy `gray-*` ramp re-tinted to
  cool-navy ink so the whole app re-temperatured in one move; resting cards
  carry **no drop-shadows** (etched `.v2-card` inset-hairline surfaces;
  shadows only on overlays); **Geist Sans** UI + **Geist Mono** numerals
  (`font-mono-num` on every KPI/money/time/count; npm `geist`, no Google
  fetch, scoped via `.v2-app` so site/portal/marketing keep their fonts);
  semantic encodings survive intact except `info` sky→**indigo** (clears the
  brand-teal collision). CSS-first motion system (tokens `--dur-*`/`--ease-*`
  + `linear()` springs; `.section-enter`, `.pop-in`, `.skeleton` shimmer,
  `.slide-up-fast`; hard never-animate list; reduced-motion global block) —
  no animation library. Two signature moments: the once-per-session
  **morning reveal** (Overview attention-card cascade + KPI count-up,
  `morning-reveal.tsx`, sessionStorage-flagged) and the ~6s **ambient
  breath** on active nav + each page's single primary (`breath` prop on
  ActionButton). **Navigation v2**: 3-state sidebar (expanded ≥xl / 64px
  icon rail lg→xl with hover-flyout labels / overlay <lg; `[` toggles,
  persisted), org-switcher block w/ plan pill + amber Demo pill, label-less
  **cockpit** (Today ⌘1 · Messages ⌘2 · Appointments ⌘3 via
  `ModuleDef.pinned`/`shortcut`), collapsible groups, Settings pinned
  bottom; **Inbox folded into Messages at nav level** (route alive; "Mailbox
  (Gmail)" tab inside /messages is its home); header `+ New ▾` quick-create
  (context-aware default, `C` opens, plan-gated; /appointments reads
  `?new=1`); the orange demo strip is dead (amber 3px hairline +
  org-switcher pill + header Exit chip); billing banners slimmed to chips;
  keyboard map `[` ⌘1/2/3 `C` `G then P/A/L`. Suite 2160 → **2262 tests**.
  Aesthetic debt deliberately left: Mosaic demo subroutes
  (`/dashboard/fintech`, `/dashboard/analytics`, `(alternative)` library,
  community pages) keep legacy styling (unreachable from clinic sidebars);
  hand-rolled overlays match v2 appearance but not the spec's scale/slide
  enter curves (needs a shared keyframe or Headless UI adoption); quick-
  create omits "Lead" (no in-app create route — no dead links by design).
- **Launch-readiness audit + fix sweep (2026-06-11, PRs #309–#324)** — a
  9-agent full-platform audit (every module traced end-to-end in code vs
  Weave/NexHealth/RevenueWell/Solutionreach/Adit/Lighthouse) found ~70 gaps;
  16 PRs closed every blocker. Suite 1583 → **2142 tests**. The big ones:
  **(money)** clinic-side patient Balance/"Shop purchases" now read
  `pms_balance_cents` + paid `shop_order` (the legacy `invoices` table no
  dental flow writes is out of the money path; clinic `/ecommerce/invoices`
  308s to `/shop/payments`); patient timeline shows orders/memberships/online
  balance payments/reviews; order/membership/balance-payment finalizers
  notify owner+admin + email the clinic; new `/shop/payments` reconciliation
  page; ⌘K searches shop orders. **(automation — EventBridge rules are LIVE
  in prod, provisioned via `scripts/setup-cron-schedules.sh`)**: pms-sync
  hourly (auto-sync toggle is real now; write-backs flush unattended; failure
  streaks email the clinic), send-reminders every 30min (migration 0055
  `reminder_settings` jsonb, default ON @ T-24h, idempotent via
  `appointment_reminder_log`, Settings → Reminders), send-scheduled-campaigns
  every 15min (editor gained "Send later"; atomic claim prevents
  double-send), auto-send-reviews hourly (rule finally created).
  **(operability)** Settings → Practice: providers CRUD + visit-type
  editor (one resolver feeds front-desk/widget/portal; migration 0054) +
  chair count (slot math blocks only when concurrent ≥ chairs — multi-op
  practices can take simultaneous bookings) + default recall interval w/
  per-patient override; front-desk booking gained provider/type/duration/
  slot-picker + walk-in mode; "Needs rebooking" recovery chip; CSV patient
  import (header auto-map + normalized dedupe) + CSV export; bulk
  "Invite to portal". **(notifications)** `notifyOrgMembers` wired into all
  formerly-silent events (bookings, portal cancel/reschedule, leads incl.
  insurance-verifier, intake submits, inbound messages, reviews, paid
  orders); patient cancellation-confirmation email; sidebar unread badges
  (`/api/nav-badges`); contact-form auto-ack to the patient.
  **(email compliance)** campaigns send from the clinic identity w/
  Reply-To, clinic postal address fail-closed, RFC-8058 List-Unsubscribe
  headers, duplicate-send claim; `patient-bulk-comms` routed through
  `deliver()` (was a dead hardcoded sender). **(billing truth)**
  Settings → Plan/Billing read org-scoped `clinic_profile` (was a stale
  user-keyed table showing "free" after payment); cross-tenant invoice
  leak deleted; persistent dunning banner on past_due/unpaid;
  `requirePlan` server-side gates (pages + shop/marketing/careers/
  integrations actions). **(custom domains v1)** Settings → Clinic
  "Custom domain" card → App Runner association via instance role
  (`APP_RUNNER_SERVICE_ARN` env + scoped IAM live) → copy-paste DNS
  records table (www CNAME + ACM validation) → status polling;
  middleware routes unknown hosts via a cached host→slug map
  (`/api/internal/custom-domains`); migration 0056; runbook
  `docs/custom-domains.md`. **(portal funnel)** magic-link no-account
  dead-end now sends a portal invite when a patient row matches;
  active-org set on sign-in (multi-clinic patients land in the right
  portal); case-insensitive linking + `createPatient` duplicate detection
  w/ "Add anyway"; clinic-branded accept-invite + magic-link emails;
  portal reschedule honors notice window on the NEW slot. **(site)**
  upload route magic-byte MIME allowlist (SVG rejected); sitemap careers
  URLs + services gating; letter-mark favicon fallback; hero LCP preload;
  COPY_KEYS 46→78 w/ drift-guard test; site-wide visitor beacon →
  `site_pageview` daily rollups (migration 0058) surfaced on /analytics +
  /seo; per-page SEO meta editor (Settings → Search appearance,
  `clinic_profile.seo_meta`); GBP setup checklist on /seo. **(booking)**
  rich post-booking screen (.ics data-URL, intake CTA, what-to-expect,
  phone-only variant), optional new-patient/insurance questions (ride
  notes), closed-window "call us" card, portal visit-type duration.
  **(PMS robustness)** first import batched + time-budgeted + resumable
  (cursor in `pms_connection.meta`, durable progress UI, cron resumes;
  budget-partials don't false-alarm), stale `running` rows reaped,
  portal-linked patients keep email/phone over PMS values, OD 429/5xx
  backoff. **(integrity)** email change verified via better-auth
  `changeEmail`; real `db.transaction()` restored in
  reschedule/convert-lead/reorder-task (stale "Neon" comments removed);
  Connect OAuth state cookie cleared path-scoped; stale pending
  memberships swept lazily. **(analytics honesty)** fabricated "Opened"
  removed (measured link-clicks only), 30/90 window threads through
  `getReviewStats`, schedule KPIs drill to real appointment filters,
  reviews link their triggering visit. Migrations 0054–0058 (0057 is the
  parallel-branch snapshot reconciliation; journal chain verified clean).
  Audit gaps deliberately NOT fixed (recorded for later): inbound-parse
  for Tier-1 email replies into /messages; recall drip sequences
  (set-and-forget); waitlist + recurring appointments; patient merge;
  tags/documents; patient-access audit log; 2FA + idle timeout;
  per-location booking; mid-life comp/suspend platform tools; ⌘K
  coverage for reviews/applicants/intake; GSC for custom domains.
- **Launch-ready signup + managed clinic provisioning (2026-06-10, PRs #302
  + #303)** — the two acquisition paths. **Self-serve:** /pricing CTAs carry
  `?plan=` → dental signup (name/email/practice/password — Mosaic Role-
  dropdown junk deleted) → 4-step wizard, all answers wired to real columns:
  (1) practice name + phone, (2) address incl. state, (3) `{slug}.dream
  createstudio.com` picker w/ live availability (`checkClinicSlug`,
  reserved-subdomain list in `lib/onboarding/slug.ts`) + brand-color
  presets, (4) plan picker (pre-seeded from the marketing pick) → Stripe
  Checkout with `allow_promotion_codes` → /onboarding-complete → /welcome AI
  interview. `submitOnboarding` honors the picked slug (suffix on race),
  writes phone/state/brandColor; planTier stays webhook-owned. **Managed
  (platform-side):** "+ Add clinic" on /ecommerce/customers (platform) —
  clinic + owner invite + reserved plan + per-clinic custom pricing as a
  real Stripe coupon (%-off / $-off · once / N-months / forever) or
  **comped** (tier granted, no Stripe). Service
  `lib/services/clinic-provisioning.ts`; migration 0053 adds
  `clinic_profile.billing_mode/pending_plan_id/pending_billing_interval/
  stripe_coupon_id/managed_note`. Owner accepts the standard invite →
  amber "finish billing setup" banner (DashboardShell, driven by
  `ctx.billingActivationPending`) → `/billing/activate` shows their
  negotiated price → checkout with the coupon **pre-applied** (no code
  typing; falls back to promo-code entry if the coupon was deleted).
  Webhook clears the pending reservation on activation. Clinics list shows
  "setup pending"/"comped" pills + Resend invite. Tests:
  `tests/onboarding/` + `tests/provisioning/`.
- **Actions-first dashboard design system (2026-06-10, PRs #290–#300)** —
  the entire authenticated dashboard (app/(default) + app/(double-sidebar))
  was migrated to a unified actions-first UI system. **Read
  [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) before touching any dashboard
  UI** — it is the binding spec (doctrine, semantic tone contract, page
  anatomy, legend requirement, migration checklist). Keystone:
  `lib/ui/encodings.ts` — single source of truth for the six semantic tones
  (ok=emerald · warn=amber=needs-OUR-action · urgent=rose · info=sky=ball-
  theirs · special=violet · neutral=gray), the canonical glyph registry
  (every ★/🎂/$/📝!/⚠️/💤/🔕/🆕/📅/⏱ with exact aria-labels + actions-first
  legend descriptions), shared aging tiers (fresh→quiet→aging→late→overdue)
  with per-module threshold helpers, and aging-legend presets. Ten shared
  primitives in `components/ui/`: PageHeader (one violet primary per page,
  top-right) · ActionButton (primary/secondary/danger/ghost; href + target
  support) · StatusPill · FilterChip (counts inside, `title` required on
  emoji) · GlyphCluster (THE glyph renderer — module-local copies deleted) ·
  **EncodingLegend** (the "Key" popover that explains every encoding a page
  uses, fed from the registry so UI and legend can't drift — mounted on
  every page with glyphs/aging/pills) · EmptyState (leads with the next
  action) · BulkBar · KpiStat (drillable numbers, full-contrast zeros) ·
  FlashToast. Readability floor: nothing below text-xs (12px), no
  gray-400 meaningful text, tabular-nums on numbers. Semantic fixes baked
  in: leads Contacted amber→sky, order fulfillment ball-in-court tones,
  lifecycle pill de-collision, channel chips labeled (channel-meta.tsx).
  Known cosmetic loose ends: EncodingLegend lacks a dedicated "channels"
  section (channel rows ride the pills slot); a sub-12px hint inside the
  Website Studio video modal + editor-kit micro-text were out of light-touch
  scope. Tests: `tests/design-system/` guards the registry + primitives.
- **Global ⌘K command palette** — the unification layer. The Mosaic header's
  fake search stub (hardcoded template links) was replaced with a real,
  org-scoped palette: ⌘K/Ctrl+K anywhere in the dashboard (or the header
  button, which now shows the shortcut). Empty query = launcher (plan-gated
  quick actions: Add a patient (`/patients?new=1` opens the add modal),
  today's agenda, edit website, preview portal + a Go-to page index from
  `getVisibleModules` + settings subpages). Typing searches patients
  (name/email/phone), upcoming visits (by patient name → agenda pre-filtered
  `?q=`), leads, message threads (→ `/messages?thread=`), and pages; platform
  tenants search clinics instead. Service `lib/services/global-search.ts`
  (ILIKE w/ escaped wildcards, LIMIT-capped, parallel; `likePattern` exported
  for tests), action `app/(default)/search/actions.ts`, UI
  `components/search-modal.tsx` (debounced, grouped, full keyboard nav).
- **Platform marketing site v2 — multi-page B2B SaaS site** at the root of
  `www.dreamcreatestudio.com` (route group `app/(marketing)/`, shared
  header/footer chrome in `components/marketing/`). Deliberately NOT the warm
  Tend-style language clinics get — ink/white/violet-600 (the product's own
  accent), Inter, dense SaaS register (the buyer is a practice owner, not a
  patient). Pages: **/** (hero w/ CSS dashboard+portal mocks, consolidation
  table, 8 pillar cards, comparison teaser, pricing teaser, dark CTA),
  **/product** (8 anchor-linked deep-dive sections w/ sticky in-page nav:
  website/booking/portal/messages/reviews/recall/shop/integrations),
  **/pricing** (plan cards + a full tier matrix mirroring the REAL module
  gating + pricing FAQ), **/compare** + **/compare/[vendor]** (5 data-driven
  pages from `lib/marketing/comparisons.ts`: Weave/NexHealth/RevenueWell/
  Solutionreach/Adit — each leads with the vendor's honest strengths, then
  ours, then a 12-row feature matrix; all competitor claims hedged
  "reported" + dated disclaimer; our SMS row is honestly 'no' until Phase B
  ships), **/docs** + **/docs/[slug]** (16 repo-checked help articles in 4
  categories, `lib/marketing/docs.ts`, accurate to the shipping product),
  **/blog** + **/blog/[slug]** (the PLATFORM org's posts through the SAME
  blog system clinics use — `lib/services/marketing-blog.ts`; 3 launch posts
  seed idempotently-by-slug via the resync-demo deploy hook; prose styling
  via @tailwindcss/typography). Root `app/sitemap.ts` + `app/robots.ts`
  (marketing pages; authenticated paths disallowed). Middleware publics:
  `/` (exact), /product, /pricing, /compare, /docs, /blog, /sitemap.xml,
  /robots.txt. **Dashboard blog manager moved `/blog` → `/posts`** to free
  the public path (sidebar, hints id stays 'blog', editor/calendar/preview
  links + revalidatePaths all renamed); the posts manager + actions now
  ALSO allow the platform tenant (new 'Platform Blog' entry in
  `lib/modules/platform.ts`) so marketing posts are authored in-app.
- **Staff tutorial system** (migration 0052, `staff_onboarding` per org+user) —
  three layers, per-staff-member dismissals, clinic tenants only (works in
  demo mode so it's showcasable): (1) **first-run welcome modal** on the
  Overview (one screen explaining the 5 sidebar sections — deliberately not a
  multi-step tour, those get skipped); (2) **Getting-started checklist** on
  Overview — completion is DERIVED from live org data (logo/hero set, staff
  added, hours set, >1 member, patient exists, Gmail connected, portal
  settings saved, review config exists, PMS connected, shop product exists)
  so it ticks itself and can't lie; plan-tier-filtered via the same
  basic<pro<premium ordering as the sidebar; collapsible, dismissible,
  auto-hides when all done; (3) **per-module hint banners** on first visit to
  12 module pages (patients/appointments/leads/intake-forms/marketing/reviews
  /analytics/blog/seo/careers/shop/integrations) — one warm orientation line +
  dismiss, self-gating server component `components/onboarding/module-hint.tsx`
  (skipped on the two-pane inbox/messages + full-canvas /website). Defs in
  `lib/types/onboarding.ts`, service `lib/services/staff-onboarding.ts`,
  actions in `app/(default)/dashboard/onboarding-actions.ts`.
- **Patient Portal v2 — clinic-branded, research-grounded, clinic-customizable**
  (migration 0051). The portal moved OUT of the Mosaic admin shell into its own
  route group `app/(portal)/patient/*` (same `/patient/*` URLs) with warm
  clinic-branded chrome: `#FAF7F2` ground + clinic `brandColor` accent + clinic
  logo + Fraunces display headings (runtime `<link>`, same as the public site),
  mobile bottom tab bar (≤4 primary + More sheet) + slim desktop header, footer
  with hours/phone/address. Patients feel they're inside their CLINIC's brand,
  not dental software (the Tend/One Medical research recipe). **Features**
  (research-ranked): state-aware next-visit card (CTAs mutate: Confirm → Add to
  calendar (.ics route w/ 24h alarm) → Directions → Reschedule/Cancel),
  self-serve **reschedule + cancel** with a clinic-set notice window (inside
  the window → "call us" + tel link), confirm sets `confirmedVia='portal'`,
  booking with clinic-restricted visit types + min-notice + a Tend-style
  comfort question (lands in appointment.notes), recall nudge via the shared
  `derivePatientRecallStatus`, pre-visit form task strip, Forms page (pending
  vs done, reuses IntakeFormRunner), Billing (PMS balance w/ honest framing +
  **online balance payments via Stripe Connect direct charge** — new
  `patient_balance_payment` table, idempotent finalize on the return page +
  an `/api/webhooks/stripe-connect` branch on `metadata.kind='balance_payment'`;
  the front desk posts payments to the PMS ledger; membership card w/ benefit
  usage; merged payment/order history), Records (visit history, forms on file,
  insurance w/ "we'll verify" caveat, HIPAA records-rights blurb), Messages
  (warm reskin of the unified thread), Profile (single-column inputs +
  marketing-email opt-in toggle w/ audit timestamps + sign out), **Family
  access** — `patient.guardian_patient_id` self-FK (one-level tree enforced in
  `updatePatient`), guardian sees dependents' visits + books for them
  (`getAccessiblePatientIds` scopes every read/mutation), staff link guardians
  via the patient Edit modal (`listPatientOptions` picker). **Magic-link
  sign-in** (better-auth `magicLink` plugin, `disableSignUp: true`, 15-min
  expiry, "Email me a sign-in link" on /signin) — portals die on passwords;
  dental visits are ~6mo apart. **Customization**
  (`clinic_profile.portal_settings` jsonb → `lib/types/portal.ts`
  `resolvePortalSettings` merges partials over defaults, so new settings never
  need a backfill): Settings → **Patient portal** (`/settings/portal`,
  owner/admin save gate) with per-feature toggles where OFF = the surface
  disappears entirely (no dead links — beats RevenueWell's documented
  dead-link toggle), bookable-type pills (procedure visits excluded by default
  — the wrong-type schedule-buster fix), booking/reschedule notice-hour
  inputs, welcome headline (`{firstName}` token) + welcome message +
  dismissible announcement bar + after-visit care note (shows ~7d post-visit),
  team-photos toggle, and **"Preview as a patient"**
  (`/settings/portal/preview` in its own `(preview)` route group — watermarked
  static replica w/ a sample patient + the clinic's real saved settings; no
  competitor ships this). Payments toggle defaults OFF + requires an active
  Connect account. Nav derives from settings via `buildPortalNav`. The portal
  layout also fixed a latent redirect loop (a patient member with no linked
  patient row now gets a help screen instead of `/` ↔ `/patient/dashboard`
  ping-pong). Demo: `DEMO_PORTAL_SETTINGS` (announcement + welcome + aftercare
  copy) + **Lily Lopez** (Emma's 9-year-old dependent with an upcoming
  cleaning + booked-by-mom note) seeded fresh + self-heal. Services:
  `lib/services/portal-settings.ts`, `lib/services/balance-payments.ts`, the
  portal-v2 block in `lib/services/patient-portal.ts`; components in
  `components/patient-portal/`; patient-side actions in
  `app/(portal)/patient/actions.ts`.
- **Patient-facing email sender identity (Tier 1 + Tier 2)** — clinic→patient
  email comes FROM the clinic, not "Dream Create". `lib/email-identity.ts` (pure:
  `ClinicSender`, `clinicSenderFrom`, `formatFromHeader`, `deliverableReplyTo`) +
  `lib/services/clinic-sender.ts` (`getClinicSenderIdentity(orgId)` +
  `listClinicGmailAccounts`). **Tier 1 (default, zero-config):** `"Acme Dental"
  <{slug}@dreamcreatestudio.com>` (display name = clinic, address on the verified
  platform domain → no per-clinic DNS), Reply-To = the clinic's contact email
  (skipped when non-deliverable, e.g. the demo's `*.example`). Name precedence:
  `clinic_profile.email_sender_name` → display name → org name → default.
  **Tier 2 (one-click upgrade):** clinic connects Google (the existing
  `/api/oauth/gmail/start` Inbox OAuth) and picks it in `/settings/clinic` →
  patient email sends AS their real address via the Gmail API
  (`clinic_profile.email_sending_account_id`, migration 0049); `deliver()` routes
  Gmail and FALLS BACK to Tier 1 on any Gmail failure. Threaded through every
  patient-facing send: intake, booking confirmation, patient message, portal
  invite, review request, appointment reminder/reschedule. Editable field:
  Settings → Clinic Profile → "Email sender name" + "Send patient email from".
  Migrations 0048 (`email_sender_name`) + 0049 (`email_sending_account_id`).
- Auth (sign-in/up/reset, sign-out) with timeout + hard-reload to avoid
  cookie races on the next request
- Onboarding 01→02→03→04 (`sessionStorage` draft → plan picker →
  org+member+clinic_profile + Stripe Checkout)
- Tenant-aware sidebar across all three route groups
- All Mosaic template pages CRUD-wired to DB (customers, orders, invoices,
  tasks, calendar, campaigns, forum, feed, meetups, jobs, inbox, messages,
  shop/cart/pay, settings panels, fintech, analytics)
- Stripe admin UI (subscriptions table + plans CRUD) for platform admins
- Vercel security headers, function timeouts, image remotePatterns
- **Public clinic websites** at `{slug}.dreamcreatestudio.com` (modern
  template — hero / about / hours / services / contact / footer; +/book
  page for pro/premium tiers). Subdomain rewrite in middleware.ts.
- **Clinic site editor** at /settings/clinic — display name, tagline,
  about, full address, contact, brand color, 7-day office hours editor,
  template selector. /settings/locations for multi-location practices.
- **Stripe → clinic_profile** sync: webhook now writes plan_tier /
  stripeSubscriptionId / subscriptionStatus to clinic_profile (org-keyed)
  with 3 fallback paths to resolve the org.
- **Accept-invite flow** at /accept-invite?token=… — token validation,
  sign-up-or-sign-in toggle, auto-accept on submit, patient.userId linkage
  via link-patient.ts.
- **Patient portal** at /patient/* — dashboard with upcoming appointments,
  appointments list (upcoming + history), book a visit (server action,
  future-time validation), profile editor (name/contact/DOB/address),
  bills placeholder. Patient sidebar auto-selected by DashboardShell when
  ctx.tenantType==='patient'. `/` redirects patients to /patient/dashboard.
- **Clinic profile editor enhancements**: logo + hero image uploaders
  wired to Vercel Blob, editable services list (replaces hardcoded 4),
  staff editor with headshot uploads and bios. Modern template renders
  all of it (logo → header letter-mark fallback; hero image with gradient
  overlay; configurable services strip; Meet The Team section that
  auto-hides when empty).
- **Vitest test suite** (2142 tests as of PR #324) covering middleware, billing sync,
  site rendering, server actions, invite-details, link-patient, patient
  booking, profile updates, services/staff JSON parsing, Gmail webhook
  auth gate, tenant-scoping on ecommerce services, demo-mode actions
  and seeder, modern-template (warm-neutral palette, anti-shame voice,
  numbered service pillars, sticky mobile bar), content sections
  (stats / testimonials / office tour), SEO (publicSiteUrl + Dentist
  JSON-LD branches), booking slot picker (open/closed days, overlap
  math, status filtering, freshness check, race-condition guard),
  intake forms (slug collision, default flag enforcement, archive,
  submit, seed idempotency, by-slug + get-default), clinic overview
  (hero / attention cards / today's chair / glyph matrix / trend tiles
  / activity feed), patients module (glyph cluster render + cap, detail
  header / needs-attention / timeline filter pills / pill count badges,
  bulk-email skip/send/error rules), appointments module (agenda
  rendering / contextual empty states / inline confirm button on
  scheduled rows only / bulk-send bar reveal / appointment glyph cluster
  / groupByDay date-grouping + today-tomorrow labels + totals math /
  computeAging tier transitions T-72h→T-12h→red / rescheduleAppointment
  transaction integrity + provider/location/type preservation + backref
  to original, booking widget tags appointment.source='booking_widget'
  + patient portal tags 'portal'), leads module (convertLeadToPatient
  lifecycle bridge + dedupe-by-phone/email + idempotent re-convert +
  single-vs-multi-word name split / list-view chip count badges +
  contextual empty states + aging-color border + fresh-call-now
  badge + converted-patient backlink / public contact form persists
  lead row even when email is misconfigured + captures UTM attribution).
- **Platform admin "view as clinic" demo mode** — `demo_context` cookie
  carries `{orgId, role, patientId?}`; `getTenantContext` synthesizes a
  clinic/patient context from it when the real user is `platformAdmin`.
  Enter via "View as" button on the clinics list page or "Create demo
  clinic & view" empty-state button (seeds Acme Dental Demo with
  patients, appointments, customers, orders, invoices, tasks, products).
  Sticky amber banner shows on every page while in demo mode; Exit
  button clears the cookie. Real session is untouched throughout.
  `enterDemoMode` auto-self-heals the Acme demo (bumps brandColor,
  backfills stats/testimonials/officePhotos, seeds default intake form)
  whenever the platform admin enters it, so the demo always showcases
  the latest template.
- **Modern Family/Wellness clinic site template** (`/site/[slug]`) —
  Tend-inspired composition (see `components/clinic-site/modern-
  template.tsx`). Warm off-white palette (`#FAF7F2` bg, `#1C1A17` ink,
  `#FFFFFF` surface, `#E8E2D9` border), clinic brand color drives all
  CTAs + accent treatments. **Typography: Fraunces serif display
  headings** in brand color (H1 + every section H2) loaded by
  `app/site/[slug]/layout.tsx` via runtime `<link>` tag (NOT
  `next/font/google` — build env doesn't reliably reach Google Fonts,
  see "Build vs test" gotcha below); Inter for body.
  **Composition top-down**:
  (1) brand-colored announcement strip with rotating-style chips
      (tagline · "No judgment, ever" · "Same-week visits");
  (2) floating white pill-shaped sticky nav (rounded-full container
      with backdrop blur, NOT edge-to-edge — warm page color shows at
      viewport edges);
  (3) centered hero: 12-col grid 3/6/3 with display-serif H1 in brand
      color, organic blob photos flanking on desktop (asymmetric
      border-radius, no SVG mask — left blob = heroImageUrl, right blob
      = officePhotos[0]), Book + phone pill CTAs side-by-side;
  (4) pill-shape service carousel right under the hero (horizontal
      scroll on mobile, wrap on desktop, each links to #services);
  (5) stats trust card (soft white card with vertical dividers between
      stat items, brand-color 40-48px numerals);
  (6) services as soft cream tiles with hover lift (still 01/02/03
      numbered — our signature vs Tend's icons);
  (7) team grid (4:5 portraits, gradient initial chip fallback that
      strips honorifics + post-nominals — `Dr. Jane Lee → JL`,
      `Maria Vega, RDH → MV`);
  (8) testimonials → **static 3-card grid (≤3 featured)** OR
      **continuous looping marquee (>3 featured)** with seamless loop,
      pause-on-hover, prefers-reduced-motion fallback;
  (9) about, office-tour gallery (captions always render, alt fallback),
      hours+location (`id="hours"` anchor);
  (10) booking CTA section, then 4-column footer (Brand · Explore ·
       Patients · Today) with live "Open today · 9 AM – 5 PM" / "Closed
       today" blurb; bottom bar carries © · Staff login · DreamCreate
       attribution.
  Plus a floating phone-circle CTA pinned bottom-right (desktop) and
  the existing sticky Book+Call bar (mobile). "Book a Visit" copy is
  universal across tiers; basic tier routes Book to `#contact`.
  Editable via `/settings/clinic` (services, staff, stats, testimonials,
  office photos, hours, brand, logo/hero uploads, accepted insurance
  carriers).
  **(11) Location section** — between testimonials and the clinical-team
  trust grid: "Come meet us at {addressLine1}" with a keyless Google Maps
  iframe (`https://www.google.com/maps?q=...&output=embed`, no API key
  required) and a "Get directions" CTA deep-linking into
  `google.com/maps/dir/?api=1&destination=...` (opens in a new tab).
  Address citation prefers `primaryLocation.addressLine1` over the
  profile-level field — same precedence as the Hours+Location card and
  the JSON-LD builder. Hides cleanly when the clinic has no address at
  all. **(12) Insurance section** — forest-teal `#36514c` full-width band
  (same hue as the footer + testimonial cards) right after Location. Left
  column: "Our insurance carriers" checklist sourced from the new
  `clinic_profile.accepted_insurance_carriers` jsonb column (migration
  0038, `string[]`); falls back to "call to verify" copy when the column
  is empty. Right column: "Check your insurance" verifier form (email +
  phone + optional carrier dropdown) — on submit, creates a `lead` row
  scoped to the org with `sourcePage: 'insurance_verifier'` so the
  request lands in the existing /leads triage queue with the same aging
  + status treatment as contact-form leads. **NOT** an actual eligibility
  check (no payer-API hookup); the success message tells the patient
  we'll be in touch within one business day so expectations stay honest.
- **SEO foundations for clinic sites** — `publicSiteUrl()` canonical
  URL helper (custom domain or subdomain). `clinicJsonLd()` builds a
  schema.org `Dentist` payload (name, address with primary-location
  preference, OpeningHoursSpecification per open day, AggregateRating
  when stats include a reviewy stat, priceRange). Rendered as
  `<script type="application/ld+json">` in the initial HTML.
  Per-clinic `/sitemap.xml`, `/robots.txt`, and a dynamic OG image
  via Next.js `ImageResponse` (hero-photo overlay or warm copy-primacy
  fallback). `generateMetadata` on `/` and `/book` outputs proper
  title / description / canonical / OG / Twitter / favicon.
- **Real online booking with slot picker** at `/site/[slug]/book` —
  `lib/services/booking.ts` exposes `getAvailableSlots(orgId, date)`
  (30-min grid within clinic hours minus existing appointments,
  cancelled/no_show appointments don't block, past slots filtered)
  and `isSlotAvailable(orgId, startTime)` (race-condition guard called
  before INSERT). UI: 14-day date strip, slot grid with strike-through
  for taken slots, 3-step form (date · time · contact). Patient lookup
  by email OR phone, default endTime = start + 30 min. Universal
  "Book a Visit" copy; basic-tier routes to contact-form anchor instead
  of `/book`.
- **Intake forms** — schema (`form_template` + `form_submission`,
  migration 0017), service in `lib/services/forms.ts` (CRUD +
  `seedDefaultIntakeForm` for new clinics), discriminated-union
  `FormField` type covering text/textarea/email/tel/date/select/radio/
  checkbox/yes_no/signature. Admin UI at `/intake-forms` (list + create
  + builder page with sections + fields, drag-up/down reorder, type
  picker, options editor, required/help/placeholder, archive). Public
  fill at `/site/[slug]/intake/[formSlug]` (warm-neutral template,
  `noindex` meta, required-field validation client + server). Booking
  confirmation email now includes amber "Fill out your intake form"
  block when clinic has a default template. `DEFAULT_INTAKE_TEMPLATE`
  (opinionated standard dental new-patient: demographics, insurance,
  medical, dental history, anti-shame anxiety question, HIPAA,
  signature) seeded for the demo clinic + as the "+ New Form" starting
  point.
- **Morning-huddle Overview module** at `/` (routes to `/dashboard`,
  branches to `ClinicOverview` for clinic tenant). Research-grounded
  in the dental "morning huddle" pattern: six things to action, every
  number drillable. `lib/services/clinic-overview.ts` returns a single
  snapshot (today's chair with per-patient flags, unconfirmed-next-48h,
  intake submissions last 7d, outstanding balances, trend tiles, recent
  activity feed). Per-row glyphs on today's chair: new-patient ★,
  birthday 🎂, balance $, missing-intake 📝!. Three honest "Coming
  soon" placeholders at the bottom (Reviews, SMS replies, Website leads)
  — sets expectations rather than fake-it placeholders for the
  PMS-owned KPIs we deliberately don't show (production $, AR aging,
  case acceptance %, hygiene reappt %).
- **Patients module v1** at `/patients` — dental `patient` table, not
  generic `customers`. Research-grounded as a *relationship record*, not
  a clinical chart (no charts/perio/procedure/claims/Rx — those live in
  the PMS). `lib/services/patients.ts` returns rows with derived columns
  (last visit, next visit, recall status, outstanding balance, lifetime
  value, last contact, source) and a per-row glyph flag set (newPatient
  ★ / birthday 🎂 / $ balance / 📝! missing-intake-before-next-visit /
  ⚠️ unconfirmed-next-48h / 💤 lapsed / 🔕 opted-out). Filter chips
  (All / New / Recall due / Lapsed / Has balance / Missing intake /
  Birthday this month / Source) + fuzzy search across name/email/phone
  + sortable columns. Bulk email send via Resend (`lib/services/
  patient-bulk-comms.ts`) skips no-email/archived patients, personalizes
  with first name, errors don't abort the batch. Detail page at
  `/patients/[id]` — sticky header with lifecycle pill + all-glyphs +
  4-stat strip (last visit / next visit / balance / LTV) + primary CTAs
  (Send message / Book / Send intake / Edit). Left identity rail
  (contact / personal / insurance / portal). Center timeline merges
  appointments + messages + form submissions + invoices + notes +
  "patient added" floor, filtered by tab pills (All / Appointments /
  Messages / Forms / Billing / Notes) with count badges. Right column:
  "Needs attention" panel (per-patient version of the Overview pattern
  — only renders when there's something actionable) + append-only
  relationship-notes panel (separate `patient_note` table, soft-delete
  via `deleted_at`). Migration 0018 added `patient.source / lifecycle /
  first_seen_at / last_activity_at`, the `patient_note` table, and
  `customers.patient_id` FK (replaces brittle email-based joins).
  `/ecommerce/customers` clinic branch 308s to `/patients`; clicking a
  patient name on Today's chair in Overview jumps to their detail page.
  Booking action + invite-accept set `source` on insert; demo seeder
  backfills mixed sources for the 15 seeded patients.
- **Appointments module v1** at `/appointments` — dental `appointment`
  table (NOT the generic `calendar_events`/Mosaic FullCalendar, which
  was previously mis-pointed in the clinic sidebar). Research-grounded
  as a *relationship view of the schedule* — not a PMS scheduler. No
  operatories, no production $, no procedure codes, no claims, no
  charting. The PMS still owns the visit. **Agenda list is the default
  view** (vertical scroll grouped by day, today pinned, sticky day
  sub-header with `N booked · M confirmed · K still need a text`).
  Filter chips in two rows: date window (Today / Tomorrow / This week
  / Next 14 days / All upcoming / Past 30 days) + needs-attention
  (Unconfirmed / Needs intake / New patients / Has balance / Lapsed
  rebooking / Cancelled / No-show), plus staff + booking-source
  dropdowns (Public booking widget / Patient portal / Front desk /
  Phone / Recall campaign / Invite — auto-hides when org has none) +
  fuzzy search across patient name / email / phone / notes. Glyphs travel from
  Patients (★/🎂/$/📝!/⚠️/💤/🔕) plus 3 appointment-scoped (⏱ reminder
  sent recently, 🆕 booked just now, 📅 rescheduled). Aging-color left
  border on unconfirmed rows drifts T-72h → T-12h (Pipedrive-rotting
  borrow). Each row clicks into a right-side drawer with patient header
  + lifecycle pill + all glyphs + 4-stat patient context + primary
  actions (Mark confirmed / Send reminder email / Reschedule / Mark
  completed / Mark no-show / Cancel) + reminder-activity audit stripe.
  Reschedule sub-drawer reuses `lib/services/booking.ts` slot-availability
  guards + sends a "we moved your time" email when the notify-patient
  checkbox stays checked. The original row is kept as `cancelled` with
  the new row's `rescheduledFromAppointmentId` pointing back — full audit
  trail. Bulk-select + sticky bulk-send bar for emailing multiple
  reminders at once. "Book appointment" CTA on the patient detail page
  opens an in-place drawer with date/time/type/notes form (no navigation
  away from the patient page). `/calendar` 308s to `/appointments` for
  clinic tenants; platform org keeps the generic FullCalendar for product
  planning. Migration 0019 added `appointment.confirmedAt / cancelledAt
  / completedAt / noShowedAt / confirmedVia / rescheduledFromAppointmentId
  / source / providerId`, the new `clinic_provider` table (CRM-side
  staff label, NOT a clinical provider record — no NPI/license/
  signature), and the new `appointment_reminder_log` table (one row per
  reminder send, with reply audit columns). Demo seeder pump: 17
  curated appointments (vs. random) covering every glyph state,
  2 clinic_provider rows (Dr. Reyes + Maria Vega RDH) attached to every
  appointment, 4 reminder log entries (one with a reply from Sophia),
  Aiden's 💤 lapsed-rebooking, Emma's 🆕 just-booked, Mia's 📅
  rescheduled-with-phantom-cancelled-source.
- **Website Leads v1** at `/leads` — turns the public-site contact-form
  pipeline from "fire-and-forget email" into a tracked triage queue.
  New `lead` table (migration 0020) carries contact info, source
  attribution (sourcePage / referrer / utm_source/medium/campaign
  captured client-side at submit), lifecycle (`new` → `contacted` →
  `converted` or → `archived`), audit timestamps, and a soft pointer
  `convertedToPatientId` linking to the patient row created on convert.
  Status filter chips with count badges, fuzzy search, aging-color left
  border that drifts green (under 1h) → red (over 72h) so untouched
  leads visibly rot. Right-side drawer with one-click Mark Contacted /
  Convert to Patient (creates patient with `source='lead_form'`, dedupes
  by phone/email, transactionally flips the lead) / Archive (with reason
  picker). The convert action lands the user on the new patient's
  detail page so they can book the first appointment immediately.
  Source-attribution surfaces in both the row card (UTM campaign tag)
  and the drawer (full breakdown). Overview "New leads" attention card
  replaces the prior coming-soon placeholder. Demo seeder pump: 6
  curated leads (fresh / aging / stale-red / contacted / converted-to-
  Emma-Lopez / archived-spam) covering every lifecycle state.
- **Gmail push notifications via Google Pub/Sub** — `users.watch()` is
  registered when a mailbox is connected; Gmail publishes change events
  to `projects/dreamcrm-496717/topics/gmail-watch`; the push subscription
  POSTs to `/api/webhooks/gmail` (OIDC-verified); `processHistoryEvent`
  diffs from the stored historyId via `users.history.list` and ingests
  new messages. A daily Vercel cron at 04:00 UTC renews any watch that
  expires within 36h (`/api/cron/gmail-watch-renew`). Existing polling
  (auto-sync on page load + Refresh button) remains as a fallback path.
- **Recall & Outreach v1 (Phase A — email-only)** — turns the existing
  platform-tenant Marketing module into a dental-shaped recall + nurture
  engine for clinic tenants. Schema (migration 0021): `patient` gains
  `marketing_email_opt_in` + `marketing_sms_opt_in` (+ timestamps + source)
  with email default-on, sms default-off per TCPA; `audiences` and
  `campaigns` gain a `recipient_source` discriminator (`'customers'` for
  SaaS leads, `'patients'` for dental); `audiences.patient_filter` jsonb
  holds the patient-specific filter shape (lifecycles, recallStatuses,
  lastVisit windows, hasOutstandingBalance, birthdayThisMonth,
  hasUnconfirmedNextHours, requireEmail/SmsOptIn, includeArchived);
  `campaign_events` gains `patient_id` + `booked_appointment_id` +
  `booked_at` columns + a `'booked'` event type for outcome attribution;
  new `campaign_templates` table (system + per-org); new
  `clinic_sms_config` table (empty stub for Phase B Twilio); new
  `'twilio_sms'` channel enum value (no-ops with a clear error in Phase A).
  `lib/services/marketing.ts` `resolveAudience` dispatches between
  `resolveCustomerAudience` and `resolvePatientAudience` based on
  `recipientSource`; the patient resolver mirrors `listPatients` derived
  logic (recall status, lapsed cutoff, balance join) so audience previews
  match what the front desk sees on the patients page. Send orchestrator
  (`lib/services/marketing-send.ts`) handles both recipient shapes —
  tags emails with `patientId` or `customerId` so the Resend webhook +
  tracking pixel + unsub route can attribute back to the right source.
  Unsubscribe + hard-bounce + complaint all flip
  `patient.marketing_email_opt_in=0` (alongside the existing customer
  opt-out). Three system templates seed idempotently on first read:
  Reactivation, Birthday, New-patient welcome (warm-neutral voice, no
  marketing-bro vocabulary, all include the `{{firstName}}` token).
  `patient.flags.optedOut` now reads from the new column → 🔕 glyph
  fires correctly on the patients list. Demo seeder pump: opt-in
  distribution across the 15 personas (13 opted-in, 2 opted-out for the
  🔕 glyph; 2 also sms-opted-in for the Phase B audience), 4 patient-
  source audiences (Recall due / Lapsed lifecycle / New patients 60d
  / Birthday this month), 3 campaigns (1 sent with realistic event funnel
  ending in Aiden\'s booked attribution / 1 scheduled / 1 draft).
  Self-heal block in `enterDemoMode` tops up legacy demos with all of the
  above on next platform-admin "View as clinic" entry. Phase B (Twilio)
  layers SMS sends + STOP-keyword opt-out + inbound replies onto these
  foundations without another migration.
- **Patient Communications v1** — Front-style unified inbox replacing the
  generic Mosaic chat for clinic tenants. Schema (migration 0022):
  `patient_thread` (one per organization+patient, enforced unique) +
  `patient_message` (channel: `in_app` | `email` | `sms` + direction +
  body + audit timestamps + externalId for Gmail/Twilio back-ref).
  Service (`lib/services/patient-messaging.ts`) merges
  `patient_message` rows + existing `email_message` rows (patientId FK
  populated on Gmail ingest) into a unified ThreadMessage stream — no
  double-write, no backfill drift. UI at `/messages` for clinic:
  two-pane layout with top filter bar (status / assignment / unread-
  only with live counts), 22rem thread list with aging-color rot border
  on inbound-unanswered (emerald < 4h, amber < 24h, rose > 24h
  mirroring Leads), channel-colored bubble stream, reply composer
  pinned bottom with channel picker auto-defaulting to the patient's
  historical preferred channel (≥3 inbound with ≥70% share → shows a
  "{Patient} prefers {channel}" label next to the picker), falling back
  to the most recent inbound channel otherwise, then in-app +
  template dropdown (3 canned: confirm visit / treatment follow-up /
  quick scheduling question) + ⌘+Enter to send. Sticky thread header
  with snooze (4h / tomorrow / next week) / archive / reopen + assign
  + patient link. Demo seeder pump: 5 curated threads covering every
  state (Mia happy-path closed-loop email+in-app; Marcus RED ROT 72h
  unanswered 2-unread; Sophia recently closed; Aiden SNOOZED post-
  rebooking; Emma AMBER ROT 16h inbound). Patient timeline integration
  also pulls `patient_message` + `email_message` rows inline, with
  message-kind events linking to `/messages?thread=<id>`. Platform
  tenant keeps the generic Mosaic chat surface (different mental model).
- **Website Studio — full in-place "navigate-the-canvas" editor** (PRs
  #199–#212). Per DESIGN.md "the website is the trunk", `/website` opens
  the clinic's REAL public site full-screen in an editable canvas (no CRM
  chrome) — they edit by hovering and clicking the site itself, live.
  Evolved from the original three-pane editor (#199 + #200) into a true
  WYSIWYG surface: #202 full-screen foundation + inline tagline → #203
  demo-mode gate fix → #204 section modals + image replace + hover "Edit"
  → #205 hero-image/intro-video fixes → #207 navigate-the-canvas → #208–#212
  per-page instrumentation. **How it works**: the authed shell
  (`app/(default)/website/website-studio.tsx`) hosts an `<iframe>` of
  `/site/[slug]?edit=1`; the public site mounts an **EditBridge**
  (`components/clinic-site/edit-bridge.tsx`) — gated owner/admin + `?edit=1`
  by `EditBridgeGate` in the shared `app/site/[slug]/layout.tsx` (auth via
  `lib/clinic-site-edit.ts::canEditClinic`, demo-mode aware) — that turns
  every `data-edit-*`-tagged region into an affordance and `postMessage`s
  intents to the shell. **Inline text** (tagline, clinic name) edits in
  place (contentEditable → `saveInlineField`); **images** click-to-replace
  ("📷 Replace photo"); **sections** hover → "✎ Edit {label}" → a modal
  reusing the existing editor + its **scoped** `website-actions.ts` save →
  canvas reloads the CURRENT page. **Navigate-the-canvas**: internal
  `/site/…` links navigate with `?edit=1` preserved, so editing spans
  Home → About → Services → … without leaving the canvas (hash links
  scroll; external/tel/mailto suppressed; nav dropdowns still work).
  **Coverage**: Home (tagline · clinic name · hero image · intro video
  upload-or-URL · trust stats · testimonials · services via the embedded
  library picker), About (about · team · office photos), FAQ, Insurance
  (carriers), Payment & Financing (methods · financing · cancellation),
  and footer **Office Hours** on every page. Editors: `faq-editor.tsx` +
  new `hours-editor.tsx` in `app/(default)/website/` + reused
  `settings/clinic/*-editor.tsx`; shared parsers in
  `lib/clinic-content-parse.ts`. A **stale-tab fallback** renders "refresh
  to edit" when a `/website` tab predates a deploy that added new section
  types (the shell JS lags the freshly-server-rendered iframe). Ownership
  framing throughout — the anti-lock-in wedge from the dental-website
  research (Officite ToS: site *"owned by us"*; ProSites *"cone of
  silence"*). `/settings/clinic` remains a deep-edit fallback. **Loose
  end:** the Phase-2 per-section "✨ Rewrite with AI" buttons lived on the
  old three-pane panels and are NOT yet re-wired into the Studio modals —
  the infra (`ai-website.ts`, allowance, `ai_usage_counter`) is intact;
  the buttons just need re-adding per copy-heavy modal.
- **Website Editor — AI copy assist + tier-baked allowance** (PR #200) —
  per-section **"✨ Rewrite with AI"** on the four copy-heavy sections
  (Hero tagline · About · Stats · FAQ; Services already had their own AI
  via `service-library-ai.ts`). `lib/services/ai-website.ts` orchestrates
  one `runClaudeJson` structured-output call per section, reusing the
  exported `CORE_VOICE_RULES` (anti-shame, **no fabricated numbers /
  prices** — stats are qualitative only, cost answers are estimate-first).
  The generated copy is RETURNED to the editor to fill the fields for
  review — **never auto-saved** (the clinic reviews, tweaks, clicks the
  normal Save). **Monetization decision (research-grounded, see below):
  a tier-baked monthly allowance, NOT a credit currency.** Manual editing
  and the (future) onboarding draft are always free and never count; only
  an on-demand rewrite does. `AI_REWRITE_ALLOWANCE` (lib/types/ai-website.ts)
  = Basic 15 / Pro 50 / Premium 200 per month, plain-language ("✨ N AI
  rewrites left"), **fails safe** — when spent, the buttons gate gracefully
  ("edit freely; they reset on the 1st") and it NEVER auto-charges. The
  meter is a per-org/per-month `ai_usage_counter` table (migration 0042,
  atomic `INSERT … ON CONFLICT DO UPDATE count+1`). Cost reality: a rewrite
  is pennies of Sonnet tokens vs a $99–199/mo sub, so the allowance is an
  abuse guardrail + upgrade lever, not cost-recovery — deliberately
  generous so the "pay to edit my own content" resentment never triggers.
  `/settings/clinic` stays as a deep-edit fallback (retire in a follow-up).
  **Built for the original three-pane editor (#200); the in-place Website
  Studio that replaced it has NOT yet re-wired these per-section "Rewrite
  with AI" buttons into its modals — infra intact, buttons pending** (see
  the Website Studio bullet's loose end). The same `ai-website.ts` is the
  generation engine reused by the conversational AI onboarding interview
  (Phase 3 — see "What's NOT yet wired").
- **Reviews & Reputation v2** — Post-visit review collection where the
  **patient writes the review inside DreamCRM**, the text persists,
  staff just toggles featured/unfeatured on the public site. Patient
  email/SMS link → `/r/<token>` → form with optional 1-5 stars + 2000-
  char textarea → submit captures the review. After submit, optional
  CTAs surface ("Also share on Google / Healthgrades / Facebook / Yelp")
  so the SEO play stays — but DreamCRM now owns the text.
  Schema (migration 0023 + 0035): `clinic_review_config` (per-org
  platform IDs, 365-day default rate limit, NPS toggle off, auto-trigger
  toggle off) + `review_request` (status funnel `pending → sent →
  clicked → completed | skipped | failed`, signed opaque token, optional
  rating, **`review_text` column added by 0035** carrying the patient's
  actual words). Service (`lib/services/reviews.ts`):
  `createAndSendReviewRequest` validates rate-limit + config + opt-in
  and emails via Resend; `submitReviewText({token, text, rating})` is
  the PRIMARY completion path (text-first); `recordReviewCompleted` is
  the secondary platform-tap path; `featureReviewAsTestimonial({orgId,
  patientId})` sources the quote from `review_request.reviewText` (staff
  can't put words in the patient's mouth — throws "has not submitted a
  review" when no text exists); `unfeatureReviewTestimonial` removes
  the linked entry; `listFeaturedTestimonialPatientIds` + `listReviews
  Received` drive the dashboards.
  UI: `/reviews` morning-huddle dashboard (Sent · Opened · Reviewed ·
  Ready-to-ask KPIs + platform-mix breakdown + Ready-to-ask one-click
  send list + recent activity table with ✓ Featured pills + "Browse
  received reviews →" CTA when there are completions + inline config
  panel). `/reviews/received` (new) — read-only review cards with the
  patient's actual quote in an italic blockquote, star rating, one-
  click "Feature on website →" / "Remove from website" toggle. Staff
  CANNOT edit the patient's words. Reviews where the patient went
  straight to a third-party platform without leaving a copy here get a
  calm "no text to feature" message and no Feature button.
  `clinic_profile.testimonials` JSON gains optional `patientId` link so
  featured testimonials know which CRM patient they're tied to;
  privacy-first display label denormalized at feature time (`"First L."`
  + city). Public clinic site testimonials section flips between static
  3-card grid (≤3 featured) and a looping marquee (>3 — see Public
  site composition below).
  Research-grounded: Google primary (~80% of dental review value),
  Healthgrades > Facebook for healthcare reputation, **Yelp opt-in
  only** (Yelp filters solicited reviews → prompts hurt more than help;
  Birdeye/Weave/Swell all exclude). **No NPS gating** — same prompt to
  every recipient, FTC-clean per the 2024 Fake Reviews Rule ($53k per
  violation; Podium is the cautionary tale). 365-day rate limit
  matches NiceJob lockout dialed conservative for dental visit cadence.
  Auto-trigger 24h after `appointment.status='completed'` is v1.1
  scaffolded (handler exists, needs EventBridge schedule rule). Demo
  seeder pump: 7 completed reviews (Mia / Liam / Charlotte / Emma /
  Noah / Mason / Ava) with full text in `review_text` (`DEMO_REVIEW_
  TEXTS` map is the single source of truth) + 5 pre-promoted as
  testimonials (`DEMO_FEATURED_PATIENT_IDXS = [0, 2, 6, 7, 11]`); the
  other 2 stay unfeatured as live CTA targets on `/reviews/received`.
  Self-heal block backfills `review_text` on legacy demos seeded before
  migration 0035 + relinks testimonials to real patients.
- **PMS Integrations v1 (Open Dental, two-way)** — the orbital layer
  wrapping the clinic's existing PMS. Schema (migration 0033):
  `pms_connection` (per-org: provider, status, AES-encrypted Customer
  Key, sync direction, auto-sync, last-sync audit) + `pms_entity_map`
  (durable 1:1 PMS↔DreamCRM link by externalId, origin pms/dreamcrm,
  content hash for skip-on-unchanged) + `pms_sync_run` (inbound audit
  header w/ per-entity counts) + `pms_write_op` (outbound audit + retry
  queue — the "every record we created in your PMS, via the API" log) +
  `patient.pms_balance_cents`/`pms_balance_updated_at`. Provider
  abstraction in `lib/services/pms/`: a `PmsProviderClient` interface
  (read + write), `open-dental.ts` real adapter (REST, auth header
  `ODFHIR {DeveloperKey}/{CustomerKey}` — Developer Key is a platform
  env secret `PMS_OPEN_DENTAL_DEVELOPER_KEY`, per-office Customer Key
  pasted by the clinic + stored encrypted), `demo.ts` DB-backed sandbox,
  `sync.ts` engine (pull→reconcile via entity-map w/ email/phone dedupe→
  upsert + write a sync_run; queue/flush/retry write-backs). **Two-way**:
  imports patients/appointments/providers/balances; pushes
  DreamCRM-originated bookings (widget / portal / front-desk /
  reschedule) into Open Dental — `queueAppointmentWriteBack` enqueues a
  `pms_write_op` on booking (best-effort, never blocks the booking),
  flushed via the API on the next sync. Source of truth = PMS for edits;
  DreamCRM pushes only the records it originates (sidesteps bidirectional
  merge for v1). **Positioning is sanctioned + audit-clean**: official
  API only, every write lands in the clinic's Open Dental Audit Trail —
  the explicit opposite of the direct-DB scrapers Open Dental publicly
  warns its customers against (NexHealth by name). UI at `/integrations`
  (morning-huddle): trust banner, status hero + Sync-now/direction/
  auto-sync/disconnect controls, KPIs, transparent fixed field map,
  what-we-sync / never-touch scope card, inbound sync log + outbound
  write-back log; unconnected state shows the Open Dental connect form
  ($30/mo office API fee surfaced honestly) + an honest catalog of the
  others (Dentrix Ascend = request-access pending HSOne approval;
  Dentrix desktop / Eaglesoft / Curve = roadmap, need a signed local
  agent per office). Client-safe catalog/labels/field-map in
  `lib/types/pms.ts`. **Validated against Open Dental's hosted developer
  sandbox** (shared test DB at `api.opendental.com` — no office install,
  no $30/mo fee): read shapes, `DateTStamp` delta + `Offset/Limit`
  pagination, and writes (createPatient; createAppointment **requires an
  `Op`/operatory**). Still unit-tested with a mocked `fetch`; the demo
  provider exercises the engine end-to-end. **Phase 0 hardening shipped
  (sandbox-driven):** `DateTStamp` high-water delta for appointments +
  paginated `/patients/Simple` (which carries `EstBalance`, unlike the
  plain `/patients` list) for bulk balance import; appointment write-back
  now sends a clinic-default operatory (auto-picked from `/operatories`,
  prefer web-sched, stored in `pms_connection.meta`); office-local
  wall-clock datetimes converted against the clinic's IANA timezone
  (`lib/services/pms/datetime.ts`, dependency-free `Intl`); provider role
  defaults to `dentist` (OD `Specialty` is an office-specific numeric
  DefNum, not a portable label). Open Dental also supports sanctioned
  webhook **Subscriptions** (`POST /subscriptions`) for near-real-time —
  a Phase 2 add-on that needs an office-side service; v1 is `DateTStamp`
  polling (zero office install). **Phase 1 status (as of 2026-05-28):
  4 of 5 items shipped; #5 (schedule-driven availability) is blocked on
  OD vendor portal access — see the "OD vendor portal approval"
  priority item below for the full unblocking workflow.** (1)
  **cancellation/reschedule write-back** — cancel/no-show/reschedule on
  our side now PUTs `AptStatus=Broken` to OD (verified vs sandbox) so the
  old slot stops reminding (the #1 clinic complaint from the research);
  new `pms_write_op.operation='update'` + `status='skipped'` (supersedes
  a still-pending create on book-then-cancel-before-sync); triggers wired
  into `cancelAppointment`, `markNoShow`, `rescheduleAppointment(original)`.
  (2) **Recall sync** — migration 0034 added `patient.pms_recall_due_at`
  + `pms_recall_interval`; the OD adapter `listRecalls` pulls `/recalls`
  paginated (no `DateTStamp` support there) and reconciles the soonest
  active due date per patient; a shared
  `lib/services/recall-status.ts::derivePatientRecallStatus` helper now
  drives the recall pill on the patients list AND the recall audience in
  Recall & Outreach — **preferring the PMS due date when present**,
  falling back to the appointment-derived heuristic otherwise.
  (3) **Sync-health alerts** — addresses the #1 reliability complaint in
  the research (syncs silently stop). New `lib/services/pms/health.ts`
  computes an `IntegrationsHealth` snapshot per org from
  `pms_connection.{lastSyncAt,lastSyncStatus,lastError}` + the last 5
  `pms_sync_run` rows; surfaces `ok | never_synced | stale | partial |
  errored | repeated_failure` with `info | warn | error` severity. A
  proactive warn/error attention banner now renders on the **Overview**
  (just above the existing attention-cards row) and on the
  **Integrations page** (above the status card), with severity-colored
  styling and an "Open Integrations" CTA on Overview. Thresholds:
  staleness fires after 36h with no successful sync (auto-sync-only —
  manual-only clinics are silent), repeated-failure fires at 3+
  consecutive non-success runs. No new schema — read-only over what we
  already capture. Deterministic pure helper `deriveIntegrationsHealth`
  is unit-tested across every branch.
  (4) **CommLog mirroring** — the top "I wish it did this" from the
  integrations research. Every DreamCRM-originated patient message
  (booking confirmation / appointment reminder / reschedule notice /
  review request / intake form send) is now mirrored as a CommLog entry
  in Open Dental's chart via `POST /commlogs` (verified vs sandbox: 201
  with `Note / Mode_ / SentOrReceived / CommDateTime / PatNum`), so the
  front desk sees the full comms history without leaving OD. Mirrors
  ride the same `pms_write_op` queue + flush as appointment write-backs:
  `queueCommLogWriteBack` enqueues on the send path (best-effort, never
  blocks the send), and `retryPendingWrites` dispatches via
  `processCommLogWriteOp`. Skips silently if patient isn't mapped (front-
  desk-added patients with no PMS link) or the connection isn't two-way.
  Wired into 5 send sites: `reviews.ts::createAndSendReviewRequest`,
  `appointments/actions.ts` (reminder + reschedule notification),
  `site/[slug]/actions.ts` (public booking confirmation),
  `patient-intake-send.ts`. Marketing campaign sends + Patient
  Communications in-app replies are intentionally skipped in v1
  (campaigns would flood OD's chart; in-app reply has no email/SMS hop
  to log). Client-safe `WRITE_OP_ENTITY_LABELS` adds the "Comm log"
  label so the Integrations write-back log renders the new rows
  alongside appointment writes. Demo seeder pump: 3 commlog write-op
  rows (2 success, 1 pending) so the write-back log demos every state.
  No new schema — `pms_write_op.entityType` is `text` and already
  accepts the new value.
  (5) **Schedule-driven availability — BLOCKED on OD vendor approval.**
  The booking slot picker (`lib/services/booking.ts`) currently
  subtracts existing `appointment` rows from clinic hours but doesn't
  respect provider out-of-office blocks, lunch breaks, time-off, or
  operatory-level limits. Fix is reading OD's `/schedules` resource
  (provider blocks + clinic schedule entries) and intersecting it with
  the slot generator. Same Phase-0 discipline as the rest of the
  integration (validate every endpoint shape against a live office
  before shipping) means we can't merge until we have a Customer Key
  against a real office — OD's shared sandbox doesn't carry per-office
  provider schedules to validate against. Unblocks the moment vendor
  approval lands; no DreamCRM code is written against `/schedules`
  until then. See the "OD vendor portal approval" priority item for
  the workflow.
  Demo seeder pump: a sandbox "Open Dental
  (Sandbox)" connection +
  entity maps over the 15 patients / 17 appointments / 2 providers + 3
  sync runs + a write-back log covering every state (2 pushed-success /
  1 errored-will-retry / 1 pending-next-sync) + PMS balances on a few
  patients; self-heal seeds it on legacy demos (and re-activates the
  sandbox if a platform admin disconnected it mid-session).


---

# Historical epics + migration records

## Tend-clone service library + Patients dropdown + About dropdown (Checkpoints 1A + 1B + 2 + 3)

Per DESIGN.md "the website is the trunk" + the Tend.com aesthetic, every
clinic gets a full per-service detail page, not just a card on the strip
under the hero. The catalog is platform-owned (every clinic starts from
the same canonical content), customized per clinic at render.

**Schema:**
- `service_library` (migrations 0039 + 0040) — platform-owned canonical
  catalog. Columns: `slug` (unique), `name`, `category` (core | special),
  `icon`, `shortDescription`, `heroBullets[]`, `body`, `processSteps[]`,
  `faq[]`, `relatedSlugs[]`, `origin` (platform | clinic), `status`
  (active | pending | archived), `submittedByOrgId` FK, `reviewNotes`,
  + `idx_service_library_status`. 17 canonical entries
  (`SERVICE_LIBRARY_SEED` in `lib/services/service-library-seed.ts`).
- `clinic_profile.services` jsonb — each `ClinicService` row links to a
  canonical entry via `librarySlug`; the clinic can override `photoUrl`
  + `offer` (promo ribbon), and (1B) carries an optional `customized`
  blob with per-clinic AI-rewritten copy.

**Checkpoint 1A (shipped):** `/services` + `/services/[serviceSlug]`
render Tend-style detail pages using canonical content + `{clinic}` /
`{city}` token substitution. Nav builds Core/Special dropdowns from the
clinic's library-linked services (`buildClinicNavLinks` in
`lib/clinic-site-helpers.ts`). The resolver (`resolveClinicServices`)
returns `EnrichedService[]` with hero bullets, body, process steps, FAQ,
related-services slugs — all token-substituted.

**Checkpoint 1B (shipped):**
- **Per-clinic AI customization** — `lib/services/service-library-ai.ts`
  `customizeServiceForClinic(library, clinic)` calls Anthropic Sonnet
  4.6 via `runClaudeJson` (tool-use structured output, the same pattern
  as `lib/services/ai-blog.ts`). Generated **at selection time** (when
  the clinic picks a service in the settings picker), persisted on
  `clinic_profile.services[i].customized` (`{ heroBullets, body,
  processSteps, faq, generatedAt, modelId }`), regeneratable from the
  picker UI. The detail-page resolver prefers `customized` when present
  + linked to the matching library slug; falls back cleanly to the 1A
  token-substitution path when missing or malformed. Tight system prompt
  pins voice rules + the **no-fabricated-pricing** promise (cost FAQs
  describe the estimate-first process, never invent dollar figures).
- **Clinic-submitted entries** — `vetAndCleanNewService(submission,
  existing)` runs a 3-way Sonnet decision (invalid / duplicate / new)
  via the same structured-output path. Duplicates point at an existing
  slug (e.g. "Zoom Whitening" → "Teeth Whitening"); new entries arrive
  as a clean full `ServiceLibraryEntry` shape. Defense-in-depth: the
  service rejects hallucinated existing-slugs that don't actually exist
  in the supplied list, and treats "new" entries colliding with an
  existing slug as a duplicate. `submitNewLibraryEntry` lands accepted
  new entries as `origin='clinic'`, `status='pending'`,
  `submittedByOrgId=orgId`. **Submitting clinic uses immediately** —
  `listLibraryForPicker(orgId)` + `getLibraryEntryBySlug(slug, orgId)`
  both honor "active OR my-own-pending"; other clinics' pickers don't
  see it until a platform admin approves.
- **Picker UI** (`/settings/clinic`) — `services-library-picker.tsx`
  replaces the old free-text editor. Selected services list with per-row
  Regenerate-with-AI / Edit-copy / Photo+offer / Remove + up-down
  reorder buttons. "+ Add a service" drawer lists library entries by
  category with search, plus a "Can't find your service?" submission
  form that surfaces duplicates / rejections / success states inline.
  Per-row "Customized ✨" / "Library default" pills make the state of
  each row visible at a glance.
- **Platform admin review surface** — `/platform/service-library` (gated
  to `tenantType === 'platform' && role in [owner, admin]`). Three tabs:
  Pending (action queue), Active (cleanup → archive), Archived (audit
  trail). Each row expands to show the full canonical preview (hero
  bullets, body, process, FAQ); pending rows carry Approve / Reject
  controls with required reviewer notes. Sidebar entry in
  `lib/modules/platform.ts`.
- **Demo seeding** — `lib/services/demo-clinic.ts` carries hand-written
  per-service `customized` blobs in `DEMO_CUSTOMIZED` keyed by slug
  (Acme-flavored rewrites, no fabricated prices, structural counts
  match the canonical seed). Skips the Anthropic API entirely on every
  resync (resync runs on every deploy via
  `scripts/resync-demo.mjs`). Self-heal block backfills missing
  `customized` blobs onto legacy demos so they showcase the 1B path on
  next deploy without losing real-clinic data.
- **Tests** — `tests/services/service-library-ai.test.ts` (18 tests
  covering customization success / parse-failure / vet new+duplicate+
  invalid / hallucinated slugs / slug collisions),
  `tests/services/service-library.test.ts` (extended for the customized
  resolver branch + malformed-blob fallback),
  `tests/services/service-library-admin.test.ts` (approve / reject
  status transitions + DB error paths),
  `tests/services/service-library-submit.test.ts` (submit-new end-to-
  end with mocked AI + DB),
  `tests/demo-mode/demo-services-customized.test.ts` (every Acme service
  has a customized blob matching the canonical process/FAQ counts, no
  $-figure anywhere).

**Checkpoint 2 (shipped):** Patients nav dropdown — three new public pages
matching Tend's `/insurance` · `/payment-financing` · `/dental-plans`
structure, adapted for single-clinic multi-tenant. `buildClinicNavLinks`
emits a new "Patients" parent with **Insurance** + **Payment & Financing**
children always (universal fallbacks render even when the clinic hasn't
configured the underlying fields), plus a third **Dental Plans** child
only when the clinic has ≥1 active membership plan. Gating mirrors the
existing `hasBlog` pattern: each calling page loads
`listActivePlans(orgId)` alongside its other parallel data fetches and
passes `hasDentalPlans` into `buildClinicNavLinks`.
- **New schema (migration 0041):** `clinic_profile.payment_methods` jsonb
  (clinic-set list, null = render `DEFAULT_PAYMENT_METHODS` fallback) +
  `financing_partners` jsonb (`Array<ClinicFinancingPartner>` —
  `{id, name, description?, applyUrl?, logoUrl?}`, null/empty = section
  hides entirely — we don't push patients to financing the clinic
  doesn't actually partner with) + `cancellation_policy` text (longform
  prose, null = section hides — no fake dollar fees). Client-safe types
  + `DEFAULT_PAYMENT_METHODS` in `lib/types/clinic-content.ts`;
  `JsonClinicFinancingPartner` server-side type in
  `lib/db/schema/platform.ts`.
- **`/insurance`** (`app/site/[slug]/insurance/page.tsx`) — the standalone
  deep version of the homepage Insurance section. Hero + 4-bullet
  "We're here to help" grid + carrier list & verifier band (reuses the
  same `clinic_profile.accepted_insurance_carriers` data + the existing
  `InsuranceVerifierForm` client component, no fork) + chartreuse-card
  logo marquee + 2-column in-network vs out-of-network process steps
  (universal honest copy) + forest-teal "No dental insurance?"
  cross-link to `/dental-plans` (auto-hides when no active membership)
  + HSA/FSA + final-bill explainer + FAQ accordion filtered to
  `category === 'Insurance'` (4 universal fallbacks when none authored)
  + closing CTA.
- **`/payment-financing`** (`app/site/[slug]/payment-financing/page.tsx`)
  — Hero + 3-step "Honest billing, every visit" explainer (NO
  marketing pitch about a bill-pay integration we don't actually
  ship; describes how billing works rather than promising online pay)
  + pill grid of payment methods (`payment_methods` field or
  `DEFAULT_PAYMENT_METHODS`) + forest-teal HSA/FSA band + financing
  partners cards (hides entirely when `financing_partners` is null/empty)
  + cancellation policy soft-card (hides when null — no fake fees)
  + FAQ accordion filtered to `category === 'Billing'` (4 universal
  fallbacks) + closing CTA.
- **`/dental-plans`** (`app/site/[slug]/dental-plans/page.tsx`) —
  **re-render** of the membership flow with Tend's "Dental Plans" nav
  voice (NOT a 308 redirect to `/membership` — keeps the URL stable,
  preserves canonical metadata, avoids URL flicker mid-load).
  Imports the existing `MembershipJoin` client component directly so
  the Stripe Checkout flow has one source of truth; `/membership`
  remains the canonical implementation for the join action. Hero +
  plan cards + 3-bullet "Why patients choose this" reassurance band
  (No deductibles · No annual maximums · No claim forms) + closing
  CTA. `notFound()`s when `getShopConfig.membershipEnabled === false`
  or `listActivePlans(orgId).length === 0`.
- **Settings editor** (`app/(default)/settings/clinic/`) — new textarea
  for payment methods (newline-separated, same pattern as accepted
  insurance carriers), `FinancingPartnersEditor` repeater component
  ({name, description, applyUrl, logoUrl} rows with add/remove), and a
  cancellation-policy textarea. All three flow through the existing
  `updateClinicProfile` server action with null-on-empty parsers.
- **Sitemap** updated to include `/insurance` + `/payment-financing`
  always (they render universal defaults when underlying data is null),
  + `/dental-plans` only when active membership plans exist.
- **Demo seeding** — `lib/services/demo-clinic.ts` seeds Acme with
  `DEMO_PAYMENT_METHODS` (5 entries matching `DEFAULT_PAYMENT_METHODS`),
  `DEMO_FINANCING_PARTNERS` (CareCredit + Sunbit — the two most common
  in US dental, `applyUrl` points at each company's homepage NOT a
  hotlink-protected affiliate URL), and `DEMO_CANCELLATION_POLICY`
  (warm 2-3 sentence policy, no specific dollar amounts). Self-heal
  block backfills all three fields onto legacy demos when null
  (existing demos that have hand-edited any of these stay untouched).
- **Tests** —
  `tests/clinic-site/insurance-page.test.tsx` (hero copy / carriers
  render / "call to verify" fallback / verifier form present /
  dental-plans cross-link gating / in-vs-out-of-network steps /
  Insurance-filter FAQ / universal default FAQ fallback / basic-tier
  Book CTA routing),
  `tests/clinic-site/payment-financing-page.test.tsx`
  (DEFAULT_PAYMENT_METHODS render / clinic-set methods replace
  defaults / financing partners hide-when-empty + render-when-set /
  cancellation policy hide-when-null + render-when-set / Billing-
  filter FAQ / universal default FAQ fallback),
  `tests/clinic-site/dental-plans-page.test.tsx` (Tend-voice H1 /
  plan cards from `listActivePlans` / 404 when no plans / 404 when
  membership disabled / reassurance band),
  `tests/clinic-site/site-header.test.tsx` extended with a
  "Patients dropdown" describe block (parent + children structure /
  Dental Plans gating by `hasDentalPlans` / child hrefs route under
  basePath / desktop toggle renders / mobile sub-nav renders all
  three children),
  `tests/demo-mode/seeder.test.ts` extended to verify the new
  self-heal columns + the no-overwrite guarantee.

**Checkpoint 3 (shipped):** `/team` index + per-staff detail pages +
About-dropdown consolidation. Per Tend's "Meet Our Dentists" pattern, the
flat About/FAQ/Blog top-level nav collapses into a single **About**
dropdown carrying About · Meet Our Team · Blog · Careers · FAQ. FAQ and
Blog are NO LONGER top-level — they live only inside About.
- **New routes:**
  - `app/site/[slug]/team/page.tsx` — Tend's `/dentists` pattern. Hero
    ("Meet the team at {clinic}" with the first sentence of `about` or a
    universal warm intro), 1/2/3-column responsive grid of oval-portrait
    cards (matching the homepage clinical-team band), each with title +
    name + "More →" link to the per-person detail page. Empty-staff
    state renders a "coming soon" placeholder rather than 404 (so direct
    nav hits don't break), but the nav dropdown only surfaces the link
    when `staff.length > 0`. SiteHeader + footer + closing CTA band
    match every other clinic page.
  - `app/site/[slug]/team/[staffSlug]/page.tsx` — per-staff detail page.
    2-col hero (oval portrait + copy block: eyebrow / back-to-team /
    H1 name in Fraunces brand color / title+credentials line / bio /
    Book CTA labeled "Book with {firstName}" stripping honorifics).
    Specialties pill list (forest-teal accent, only renders when set),
    "Outside the office" fun-fact card (only renders when present),
    closing CTA band. Resolves staffSlug against an explicit
    `staff.slug` override OR `kebab(staff.name)` fallback — explicit slug
    is checked first so renaming a staff member doesn't break links if
    they set a stable slug. `notFound()` on unknown slug. Emits Person
    JSON-LD (`@type:'Person'`, `worksFor:{@type:'Dentist', name:clinic}`)
    for people-search SEO.
- **Type changes (NO migration — `clinic_profile.staff` is jsonb):**
  `ClinicStaff` in `lib/types/clinic-content.ts` adds 5 optional fields
  — `slug?` (URL override), `credentials?` ("DDS · 12 years experience"),
  `specialties?` (string[]), `funFact?` (single-line humanizing detail),
  `bookHref?` (per-staff booking URL override). All optional; detail page
  renders gracefully when absent.
- **Shared slug helper:** `staffSlug({slug?, name})` in
  `lib/clinic-site-helpers.ts` — explicit-override-then-derived. Re-used
  by the /team index (per-card link), the [staffSlug] resolver
  (param-to-staff match), and the sitemap.xml route (per-staff URL).
- **Nav restructure:** `buildClinicNavLinks` signature gains `hasTeam?:
  boolean` + `hasCareers?: boolean` (mirror the existing `hasBlog` +
  `hasDentalPlans` pattern, default false). About is now the canonical
  dropdown parent — children in Tend's order: About → Meet Our Team
  (gated `hasTeam`) → Blog (gated `hasBlog`) → Careers (gated
  `hasCareers`) → FAQ (always — universal defaults render even when
  the clinic hasn't authored items). FAQ + Blog removed from top-level.
- **All 11 SiteHeader call sites threaded** with the two new booleans —
  page wrappers do the loads in parallel (`Promise.all`):
  `getOpenJobs(orgId)` for Careers (returns `length > 0`), plus
  `(profile.staff ?? []).length > 0` for Team (no extra DB call — staff
  already loaded with the profile). Each call site is the page that
  matters: `app/site/[slug]/{about,book,careers,careers/[jobSlug],
  dental-plans,faq,insurance,page (home → ModernTemplate wrapper),
  payment-financing,services,services/[serviceSlug]}/page.tsx` plus
  `components/clinic-site/modern-template.tsx` (sync, receives
  `hasTeam` + `hasCareers` as props from the home wrapper).
- **Settings editor** (`app/(default)/settings/clinic/staff-editor.tsx`)
  — surfaces all 5 new fields per staff row: slug (text, placeholder
  shows the auto-derived kebab), credentials (text), specialties
  (textarea, newline/comma split), funFact (text), bookHref (text,
  optional). All flow through the existing `updateClinicProfile` server
  action (jsonb column accepts the extended type as-is).
- **Demo seeding** — `DEMO_STAFF` in `lib/services/demo-clinic.ts` carries
  5 staff (lead dentist with explicit slug + cosmetic dentist with
  derived slug + 2 hygienists + office manager) — each with credentials,
  specialties, fun-facts to exercise every code branch on the detail
  page (Dr. Reyes has all fields populated; Maria has bio+credentials+
  specialties; Casey has bio+funFact but no specialties; Renee has
  credentials+specialties but no funFact). Self-heal block backfills:
  (1) replaces null / empty / all-legacy-minimal staff arrays with
  DEMO_STAFF wholesale; (2) targeted in-place upgrade — for each
  stored entry whose new optional fields are ALL absent, looks up by id
  and backfills from DEMO_STAFF; entries with ANY new field set are
  treated as clinic-edited and skipped.
- **Sitemap** — `app/site/[slug]/sitemap.xml/route.ts` emits `/team`
  (when staff exists) + one URL per staff member with the resolved slug.
- **Tests** —
  `tests/clinic-site/team-page.test.tsx` (H1 / each staff renders /
  More links use explicit + derived slug / empty-staff renders
  placeholder not 404 / hero subhead pulls about first sentence /
  fallback warm copy when about is null / chrome present),
  `tests/clinic-site/team-staff-page.test.tsx` (resolves by explicit
  slug / derived slug / renders credentials+specialties+funFact /
  hides those sections when absent / per-staff bookHref override /
  Book label strips honorific / Back-to-team href / Person JSON-LD
  worksFor:Dentist / notFound on unknown slug / notFound on empty
  staff list),
  `tests/clinic-site/site-header.test.tsx` extended with an "About
  dropdown" describe block (universal floor About+FAQ children render
  always / Team/Blog/Careers gate correctly on their booleans / About
  dropdown toggle renders / mobile sub-nav renders all children /
  FAQ+Blog NO LONGER top-level),
  `tests/demo-mode/seeder.test.ts` extended (self-heal patch carries
  DEMO_STAFF when null + skips staff overwrite when clinic-edited).


### Website-quality sweep 2026-06-10 (PRs #304–#307) — what shipped + loose ends

A fresh-clinic QA pass (three user-reported bugs → adversarial sweep of the
Tend template, Website Studio, and day-0 provisioning). **Shipped:** phantom
`DEFAULT_SERVICES` fallback deleted everywhere (services come from the library
or don't exist; honest public empty states + `dc-edit-only` Studio add-prompts
— that CSS class is THE pattern for editor-only affordances); "Why us" media
no longer mirrors the hero (office-photos-only, distinct from the right hero
oval — homepage can't show the same photo twice); stale `?reveal=` scroll
hijack consumed in EditBridge; AI-tour vs manual-save race (cancelTour in
persist); instant image preview via fixed `setImage`; paste-as-plain-text in
inline editing; **fresh clinics now seed Mon–Fri 9–5 default hours**
(`lib/onboarding/defaults.ts` — booking read "closed every day" before) + the
standard intake form in BOTH creation paths; welcome interview persists
`differenceChips` (was dropped) + is re-enterable from the Getting-started
card while the site is unfilled; null-guards (`todaysHoursLabel`,
`resolveClinicServices`); `tests/studio/field-wiring.test.ts` parses the real
registries so template↔studio↔actions wiring can't silently rot; new
`tests/day0/` integration suite.

**Flagged, not fixed (small, non-blocking):** clinic sitemap omits
`/careers` + `/careers/[jobSlug]` URLs (SEO-completeness); `/services` stays
in the sitemap when a clinic has zero services (renders the honest empty
page); `copy:home.closerTitle` + `copy:home.contactEyebrow` are inline-
editable but missing from the AI bar's `COPY_KEYS` (AI can't target them);
the welcome interview holds answers in client state only (refresh mid-
interview loses progress; re-entry banner mitigates).

### Maintenance session 2026-06-09 — what shipped + what's still open

A bug-hunt + email-deliverability session shipped PRs **#265–#276** (all merged
to main, all green). Highlights:
- **Email now works end-to-end via Resend** (#273 + an ops fix): the prod
  `RESEND_API_KEY` was a dead key — swapped to the working account's key in
  Secrets Manager; `deliver()` now surfaces Resend's `{error}` return instead of
  reporting false success. **Per-clinic sender identity Tier 1 + Tier 2**
  (#274/#275/#276) — see the What's-wired bullet.
- **Bug-hunt fixes:** auth/role-gating (#265: email-bind patient invites, gate
  marketing actions, org-check patient notes); appointment lifecycle (#266:
  reschedule keeps duration, terminal-state guards, reminders skip confirmed,
  slot pre-open overlap); Stripe membership period-end silently null (#267);
  shop oversell + atomic coupon burn (#268); `/messages` email channel actually
  delivers now (#269); reviews submit status-gate + feature-exact-review (#270);
  PMS sync hardening (#271: high-water skip, overlap guard, family-phone dedupe,
  patient-map recovery); intake form picker (#272).

**Clinic timezone — DONE (#278, migration 0050).** `clinic_profile.timezone`
(null = `CLINIC_DEFAULT_TZ` = America/New_York) + `lib/clinic-timezone.ts`.
`getSlotsForDay` generates the booking grid in the clinic zone (accepts a
date-only `YYYY-MM-DD` key — the booking form now sends the patient's calendar
day — or a Date → clinic-local; open/close resolved via the DST-aware
`lib/services/pms/datetime.ts` `parseOdDateTime`); appointment-time emails
(booking confirmation / reminder / reschedule) render in the clinic zone via
`ClinicSender.timeZone`; Settings → Clinic Profile has a Timezone picker. So
booking slots + emails are now timezone-correct (no longer UTC).

**Still open (priority order):**
1. **ROTATE / REVOKE SECRETS shared in chat (compromised) — user's action
   item.** Running list (newest first; all were pasted into a transcript):
   - **Stripe restricted key `rk_live_…`** — created the 4 social add-on prices
     this session. **REVOKE it now** (Stripe Dashboard → Developers → API keys);
     it's no longer needed (the add-on prices are created + their ids are in
     Secrets Manager).
   - **AWS access key `AKIA53LCNZ3YTC3H5M55`** — ACTIVE; used this session for
     the Secrets Manager + App Runner + EventBridge ops (add-on price ids + the
     two Zernio cron rules). **Rotate it** now that it's in a transcript.
   - **AWS access key `AKIA53LCNZ3Y2IP4CWFS`** — a dead/stray key (confirmed
     `InvalidClientTokenId`); **delete it** in IAM (no rotation needed).
   - **AWS access key `AKIA53LCNZ3Y66OJGLOI`** — pre-existing standing item;
     rotate.
   - **Resend key `re_BZDw…`** — now the live prod key; pre-existing standing
     item: create a fresh one in Resend, swap it into `dreamcrm/app-secrets`,
     redeploy; also delete the dead `re_T8fyc…`.
2. **Lower-severity audit findings — mostly CLOSED by PR #324 (2026-06-11):**
   Connect OAuth state cookie delete-path ✓; orphan `pending` membership sweep ✓;
   real `db.transaction()` restored in reschedule/convert-lead/reorder-task ✓.
   Still open: platform Stripe webhook idempotency ledger (dup
   owner-notifications on retries); review auto-send timing anchored to
   `completedAt` vs visit time.
3. **Patient email replies don't loop back into `/messages`** for arbitrary
   addresses — inbound email is only ingested via the Gmail integration. With
   Tier 2 (clinic's connected Gmail = the sender), replies to that mailbox DO
   surface; for Tier 1 (platform domain) they go to the clinic's contact email,
   not back into the thread. A dedicated inbound-parse path is the full fix.

### Tend-clone epic — DONE (Checkpoints 1A/1B/2/3 shipped this session)

The full Tend-style site structure is live, minus multi-location pages.
PRs: #184 (services library + Core/Special nav), #186 (AI customization
+ clinic submissions + admin review), #187 (Patients dropdown + 3 new
pages), #188 (Team page + About dropdown). The "Tend-clone service
library" subsection below covers the full design; the "Public clinic
surfaces also live" list above enumerates every public route.

**Loose ends for v1.1** (not blocking — system works as-is):
- Per-staff individual booking widgets via `ClinicStaff.bookHref` — type
  is wired and rendered on the detail page CTA, but we don't yet have
  a per-provider booking experience inside `/book`; the override
  currently points patients to the same booking page
- `service_library` AI-submitted pending entries currently render their
  AI-generated content with NO admin edit pass (admin approves or
  rejects; editing the cleaned content pre-approval is v1.1)
- Per-page SEO controls in the Website Editor — still v1.1

### Website Editor epic — Phases 1 + 2 + in-place Studio shipped; Phase 3 (AI onboarding) in progress

Research-grounded overhaul of the `/website` editor (deep research this
session on dental website vendors, patient expectations, and AI-copy
pricing — full reports in chat history). Key findings that shaped it:
the clinic pain that matters is **lock-in + powerlessness** (you don't own
the site, must email an agency to change a word — Officite ToS / ProSites
"cone of silence"), **AI copy is whitespace in dental** (no vendor ships
it), and **metering edits to your own content is the #1 AI backlash
trigger** (Canva/Cursor/Notion). So: own-it + edit-it-yourself framing,
AI as a free-feeling accelerant, manual editing always free.

- **Phase 1 (PR #199, shipped)** — section editor + live preview + FAQ
  editor (see "Website Editor v2" under What's wired).
- **Phase 2 (PR #200, shipped)** — per-section "Rewrite with AI" + the
  **tier-baked allowance** monetization model (Basic 15 / Pro 50 /
  Premium 200 rewrites/mo; NOT a credit currency; fails safe; never
  auto-charges). See "Website Editor — AI copy assist" under What's wired.
- **Phase 2.5 — in-place Website Studio (PRs #202–#212, shipped)** — the
  three-pane editor was REPLACED by a full-screen WYSIWYG canvas: the
  clinic edits its real `/site/[slug]` inside an `<iframe>`, hovering and
  clicking the site itself, navigating page-to-page in edit mode. Inline
  text + image/video replace + per-section modals (reusing the existing
  editors) + footer hours, across Home + every content subpage. See the
  "Website Studio" bullet under What's wired for the full mechanism +
  coverage. **Carry-over:** Phase-2's per-section "Rewrite with AI" buttons
  aren't re-wired into the Studio modals yet (infra intact).
- **Phase 3 (IN PROGRESS) — the conversational AI onboarding
  interview**: a brand-styled streaming chat shown post-checkout (onboarding
  creates a near-empty `clinic_profile`, so `/onboarding-complete` →
  a new `/welcome` step is the insertion point) that asks ~6–10 warm
  questions then drafts the WHOLE site copy (tagline, about, service
  selection + customization, stats, FAQ) in one pass, free + uncounted,
  then drops the clinic into the in-place Studio to refine. Reuses
  `lib/services/ai-website.ts` + `service-library-ai.ts`.

### Public-site polish reconciliation (PRs #190–#198 — were undocumented)

The #189 doc sweep predated these; captured here for honesty:
- **#190–#192** — shared public-site primitives added: `components/clinic-site/`
  `closing-cta.tsx`, `scroll-reveal.tsx`, `numbered-steps.tsx`; subpage
  refinement sweep (scroll reveals + ClosingCTA across the subpages).
- **#193** — **replaced the sticky mobile Book+Call bar with corner
  floating CTAs** (`site-mobile-actions.tsx`) + dropdown hover-bridge.
  ⚠️ This diverges from DESIGN.md's "sticky bottom CTA bar" pattern — a
  deliberate change; DESIGN.md's mobile-pattern note should be updated to
  match (or the decision revisited) next time that doc is touched.
- **#194–#196** — mobile responsiveness pass + About-page polish + hamburger
  drawer nav + stats 2×2 + tighter form cards + day-picker breakout.
- **#197–#198** — **intake self-signup flow** (`app/site/[slug]/intake-start/`)
  routed through `www` so auth + cookies + portal share an origin; nav-logo
  cleanup; day-picker arrows.

### AWS migration — DONE (see "Vercel → AWS migration" below for status)

The Vercel → AWS migration is complete: the app runs on App Runner + RDS +
S3 + SES, canonical at https://www.dreamcreatestudio.com. Remaining loose ends
(SES production access, optional Bedrock, moving the domain off Replit, the
eventual App Runner → ECS move) are tracked in that section.


## Vercel → AWS migration (LARGELY COMPLETE)

**Status:** the app runs on **AWS App Runner** (`us-east-1`) from an **ECR**
image, on **RDS Postgres** (private/VPC), with **S3** storage and **SES** email
live. Canonical domain **https://www.dreamcreatestudio.com**.

**Done:** containerized (Dockerfile + standalone output) → ECR → App Runner;
RDS via node-postgres; S3 storage (`STORAGE_DRIVER=s3`); SES email
(`EMAIL_DRIVER=ses`, domain verified + DKIM + DMARC); security headers moved
into `next.config.js`; VPC NAT egress route + free S3 gateway endpoint;
CloudWatch alarms + SNS + 30-day log retention; RDS hardening (deletion
protection, storage autoscaling, Performance Insights); ECR lifecycle policy;
third-party secrets recovered from Vercel into Secrets Manager; Stripe webhook
repointed to the App Runner domain; `www` made canonical with `app.`/bare
redirecting to it.

**Remaining:** SES production access (appeal pending AWS review); optional AI →
Bedrock (needs the Bedrock Anthropic use-case form + quota bump); move the
domain off Replit so the bare apex can point straight at AWS and the Vercel
redirector can be retired; SMS (future). **App Runner is closing to new
customers (Apr 2026)** — existing workloads keep running + patched, but plan an
eventual move to **ECS** (Express Mode or Fargate+ALB), which also unblocks a
static-IP/apex without the redirect workaround.

**Original plan + inventory below (kept for reference):**

**Strategic decision driving the migration**: consolidate every PHI-
touching dependency under the single AWS Business Associate Agreement
(BAA) instead of stitching together per-vendor BAAs (Twilio + Resend +
Anthropic + Vercel + ...). One BAA, one bill, one IAM policy surface —
materially simpler HIPAA posture for the clinic-tenant data model.

That means the migration replaces *both* Vercel infra surfaces *and*
the third-party integrations that aren't AWS-native. Inventory below.

### Third-party services → AWS replacements

| Current | Use in DreamCRM | AWS replacement | Migration shape |
|---|---|---|---|
| **Resend** | Transactional sends (password reset, invite, review request); marketing campaign sends in Recall & Outreach; FROM `Hello@DreamCreateWeb.com` | **AWS SES** (Simple Email Service) | Swap `lib/email.ts` + the Resend client in `lib/services/marketing-send.ts` + `lib/services/reviews.ts`. SES needs verified domain identity + DKIM + per-region quota request out of sandbox. Bounce/complaint webhook becomes SNS → Lambda → `/api/webhooks/ses` (replacing the Svix-signed Resend webhook). Open/click tracking moves to SES configuration sets (event publishing → SNS → our existing campaign_events ingest) |
| **Twilio** (planned Phase B — never shipped) | SMS sends for Recall, Patient Communications, Reviews; inbound webhook + STOP keyword handling | **AWS End User Messaging SMS** (formerly Pinpoint SMS) | Drops the never-shipped Twilio integration entirely. Build the lazy Proxy client as `lib/aws-sms.ts` (not `lib/twilio.ts`). A2P 10DLC registration is still required (5-14 business day carrier approval — AWS submits the brand + campaign on your behalf, same regulatory clock). Inbound SMS publishes to SNS → our webhook. **Schema columns named `twilio_*` in `clinic_sms_config` get repurposed**, not renamed (column name is just a string; we keep `twilio_phone_number` storing the AWS origination identity to avoid a migration). Channel enum value `'twilio_sms'` stays for backwards-compat; surface it as just "SMS" in UI |
| **Anthropic API (direct)** | Claude Sonnet calls in `lib/services/ai-marketing.ts` (campaign draft + improve copy) and any other AI surface | **AWS Bedrock** with Anthropic models | Swap the `@anthropic-ai/sdk` import for `@aws-sdk/client-bedrock-runtime`. Same model family available (Claude Sonnet 4.x / Opus 4.x). Caching + thinking features map across. Auth becomes IAM instead of `ANTHROPIC_API_KEY` |
| **Vercel Blob** (`lib/blob.ts`, `@vercel/blob`) | Logo / hero / staff headshot / office photo / intake-form-attachment uploads. ~10 call sites | **AWS S3** + signed PUT URLs | Single-file swap inside `lib/blob.ts` keeps call sites unchanged. Use S3 presigned URLs for browser-direct uploads (skip the `app/api/upload` round-trip if we want), or keep the upload API and have it `PutObject` to S3 |
| **Stripe** | Checkout + Customer Portal + subscription billing + future Connect (Shop Phase 3) | **No change** — stays Stripe | No AWS equivalent for card processing. Stripe has a healthcare BAA; sign it alongside the AWS BAA |
| **Gmail OAuth** | Staff connects their workspace Gmail for the Inbox module (reading clinic-bound email, sending replies). Also a marketing-send channel in Recall & Outreach | **No change** — stays Gmail OAuth | Cannot replace; it's the clinic's own mailbox. Note that with SES on outbound, the Gmail-send option in Recall becomes the "send from my own mailbox" option, and SES becomes the "send branded blast" option (current Resend tradeoff just with SES on the branded side) |
| **Neon Postgres** | Primary DB | **No change** — Neon stays | Already us-east-aligned with where we'll likely land on AWS. Connection string moves to Secrets Manager; otherwise no app-side change. If we ever want everything inside one BAA, RDS Postgres is the migration target — but Neon's serverless model is a real ops win and they have a separate BAA |

### Vercel infra surfaces → AWS

| Vercel surface | What it does | Likely AWS replacement |
|---|---|---|
| **Build + deploy** | Git-push auto-deploy from `main` | CodePipeline + CodeBuild → ECS Fargate, OR App Runner, OR Amplify Hosting |
| **Serverless functions** | Next.js API routes + Server Actions run as Vercel functions | Same code on Lambda (via SST / OpenNext / Amplify) or containerized on Fargate |
| **Edge runtime** | `middleware.ts` runs at edge | CloudFront Functions (limited) or Lambda@Edge |
| **`vercel.json` function timeouts** | Per-route `maxDuration` overrides (Stripe webhook 30s, upload 60s, Gmail watch renew 60s) | Lambda timeout settings per function |
| **`vercel.json` cron** | `0 4 * * *` runs `/api/cron/gmail-watch-renew` | EventBridge Scheduler → Lambda invocation, OR EventBridge + ECS Fargate task |
| **`vercel.json` headers** | Security headers (HSTS, X-Frame-Options, etc.) on all routes | CloudFront response-headers policy, OR set in `next.config.ts` |
| **Speed Insights + Web Analytics** | Vercel-managed RUM + page-view analytics | CloudWatch RUM, or self-host Plausible/PostHog |
| **`next/image` optimization** | Automatic image optimization on Vercel CDN | `next.config.ts` `images.loader: 'custom'` pointing at a Lambda + CloudFront image pipeline, OR pre-process at upload time and skip runtime optimization |
| **`next/og` `ImageResponse`** | Dynamic OG image rendering for clinic sites at `/site/[slug]/opengraph-image` | Runs on any Node runtime; works on Lambda + container deploys. Confirm Edge runtime isn't required |
| **Domain config** | apex `dreamcreatestudio.com` + wildcard `*.dreamcreatestudio.com` + auto SSL | App Runner custom-domain associations (apex+www, `app.`, and `*.` wildcard) w/ App-Runner-managed ACM certs; DNS (CNAMEs) at name.com. Wildcard live as of 2026-05-28 |
| **Subdomain rewrite in `middleware.ts`** | `{slug}.dreamcreatestudio.com` → `/site/{slug}` | Same code works wherever middleware runs; verify Lambda@Edge / CloudFront Functions compatibility |
| **Env var management** | Encrypted envs per project + per env target | AWS Secrets Manager (PHI-touching secrets) OR Systems Manager Parameter Store (config), surfaced into Lambda env vars or container task definitions |
| **Webhook endpoints registered with vendors** | Stripe + Gmail Pub/Sub all point at `dreamcreatestudio.com/api/webhooks/*` | Same URL post-migration (domain stays). New: `/api/webhooks/ses` for SES bounce/complaint events; `/api/webhooks/aws-sms` for inbound SMS. Rotate **every** signing secret as part of the cutover |
| **Migration bootstrap pattern** | One-shot `/api/admin/bootstrap` route + `ADMIN_BOOTSTRAP_TOKEN` env + paired cleanup PR | Same pattern works post-migration; only the env-set/delete API endpoints change (Vercel API → AWS Secrets Manager `PutSecretValue` / `DeleteSecret`) |

### Pre-migration code hygiene

Already done (no action needed):
- All current migrations applied to prod through 0023 at AWS-cutover time (`_dreamcrm_migrations_applied` ledger reflected 0000–0023 then); subsequent migrations 0024–0041 have been auto-applied on deploy via `scripts/db-migrate.mjs` (note: 0033 + 0034 land with the OD epic merge; 0035 adds `review_request.review_text`; 0036 adds `clinic_profile.faq`; 0037 adds `clinic_profile.difference_video_url`; 0038 adds `clinic_profile.accepted_insurance_carriers` powering the public Insurance section + verifier form; 0039 adds the platform-owned `service_library` table powering the Tend-clone services-library checkpoint; 0040 adds `service_library.submitted_by_org_id` + `review_notes` + `idx_service_library_status` for the AI submission → admin review workflow; 0041 adds `clinic_profile.payment_methods` + `financing_partners` + `cancellation_policy` for the standalone /payment-financing page; 0042 adds the `ai_usage_counter` table — per-org/per-month tally behind the Website Editor's tier-baked AI-rewrite allowance)
- Bootstrap route + middleware allowlist removed after every migration apply (latest cleanup: PR #108). Note: the **public-path allowlist in `middleware.ts`** also needs to cover any new `/api/admin/*` route guarded only by `CRON_SECRET` — PR #185 fixed a regression where `/api/admin/resync-demo` was silently 302'd to /signin (added in #176 but never added to the allowlist), which silently broke every auto-resync since.
- 1224/1224 tests passing, typecheck clean
- No uncommitted changes on `main`
- Twilio integration was never shipped — no code to remove, just a never-built Phase B plan replaced with AWS SMS

To-do in the AWS migration session (rough order):
1. Decide on the deploy shape (SST / OpenNext / Amplify / containerized Next.js standalone build) before changing any code
2. Sign the AWS BAA, request SES sandbox-exit, kick off A2P 10DLC registration (5-14 business days — start early)
3. Audit `next.config.ts` for Vercel-specific settings
4. Swap `lib/blob.ts` → S3, `lib/email.ts` + send-paths → SES, `lib/services/ai-marketing.ts` → Bedrock. Each is a single-file (or small-fan-out) change; type-compat shims recommended so call sites stay the same
5. Build `lib/aws-sms.ts` for Phase B SMS, wire the inbound webhook
6. Move the Vercel cron to EventBridge
7. Wire CloudFront + Route 53 + ACM for the domain
8. Rotate every webhook signing secret post-cutover (Stripe, Gmail Pub/Sub, new SES, new AWS SMS)

---

## 2026-07-04 (latest) — Prospecting daily workspace F4: the deal room

Every prospect drawer now has a "💰 Deal room": the crawl fingerprints the
orbital-layer tools the practice already runs (`lib/prospect-vendors.ts` — a
registry of real dental vendors: NexHealth/LocalMed/Zocdoc booking,
Podium/Birdeye/Weave reviews+messaging, RevenueWell/Solutionreach marketing,
PBHS/ProSites site hosts, …), stored on `enrichment.vendors`. The pure
`consolidationEstimate` turns detected tools into the pitch math — what they
likely pay across them (~$X/mo), the DreamCRM plan tier that replaces the
stack (marketing/recall or 3+ categories → Premium; booking/reviews/forms →
Pro; site-only → Basic), and the monthly + annual savings (floored at 0,
labelled an estimate not a quote). No competitor tools detected → the honest
industry-context line. Re-enrich backfills vendors on existing prospects.
Vendor detection + consolidation math are unit-tested.

## 2026-07-04 — Prospecting daily workspace F6: never-drop-a-lead follow-ups

A logged call outcome that isn't terminal now schedules the next nudge:
callback → +1 day, voicemail/no-answer → +2 days (pure `followUpForOutcome`,
migration 0121 adds `prospect.next_follow_up_at` + `follow_up_reason`);
terminal outcomes (demo_booked/won/not_interested) clear it. `getDueFollowUps`
surfaces what's now due, and the daily briefing gives it a prominent amber
strip + moves it high in the next-action ladder (a promised callback beats
fresh hand-raisers). So a warm prospect can't go cold because a follow-up
slipped. Cadence + due-label + the ladder branch are unit-tested.

## 2026-07-04 — Prospecting daily workspace F1: the morning briefing

Turning the prospecting home into a daily sales cockpit. `getDailyBriefing`
(a thin aggregator over the existing call-list / meetings / phone-queue reads
+ a new `getRecentHotArrivals`) composes the owner's morning: today's booked
demos, who to call first (with the "why" from intent), the phone-first queue,
and what hot prospects entered overnight — then a pure `chooseNextAction`
priority ladder (booked demo > warm hand-raiser > cold call > go-live nudge >
"the machine is hunting") gives ONE clear next action. Rendered as a hero +
four glanceable columns above the hunt panel. The ladder is unit-tested. Also
fixed a papercut: opening/closing a prospect drawer no longer scrolls the list
back to the top (scroll={false}).

## 2026-07-04 — Prospecting AI: product-knowledge grounding

Every prospecting AI surface (cold email, reply draft, pre-demo brief) was
asked to SELL DreamCRM while knowing only a one-line description of it — so
objection responses and pitches stayed generic or invented facts. Added
`lib/prospect-product-knowledge.ts`: one canonical, grounded source of product
truth (what it is, the 5-6-vendor consolidation wedge, real per-plan pricing
$150/$250/$500 + 7-day trial, differentiators, WHO it's for, and — critically
— the honest limits: not a PMS, SMS not live yet, Open-Dental-only sync, plus
an objection→response playbook). A full version feeds the sonnet demo brief; a
condensed version feeds the haiku cold email + reply draft; a `segmentAngle`
helper gives the per-segment lead. All three prompts now open with it and are
told to never exceed it (so the AI says "no SMS yet" honestly instead of
implying otherwise). Tests guard the pricing/positioning/honest-limits from
drift + confirm injection. This one file is now THE place to update as the
platform evolves. (Also fixed a latent `matchAll` tsc error in the
cron-parity test.)

## 2026-07-04 — Prospecting revolutionary pass P3: the branded close

The close made seamless. Two safe, high-leverage wins (no new migration).

- **Brand-carry on conversion.** The demo already themes the practice site in
  the prospect's own brand color/logo; now when they convert, that captured
  brand (`enrichment.themeColor` → `usableBrandColor`, `iconUrl`) seeds the
  NEW clinic's `clinic_profile.brandColor` + `logoUrl` via `createManaged
  Clinic`'s new optional `brand` input. The clinic boots in the brand we sold
  them (owner can change it in Settings). Best-effort — a bad/absent color
  just seeds null.
- **Booking link woven into the AI reply draft.** When self-booking is on, an
  interested/question reply's draft (the one the owner sends from his own
  inbox — still never auto-sent) now carries the prospect's own
  `/d/<token>` link, so a single reply moves them straight to a booked demo.
  Interested replies (no AI draft) get a ready one-liner with the link.

**Deliberately deferred: the auto-send AI SDR.** An engine that auto-answers
question-replies itself (multi-turn, capped, off by default) is the natural
next step, but auto-sending AI email to real dental practices is the single
highest-risk action in the system and the send path (Resend/Gmail +
List-Unsubscribe + CAN-SPAM footer via `renderOutreachEmail`) needs
extracting into a shared `sendProspectEmail` helper first. Left as the clear
next slice rather than shipped half-verified — the reply loop stays
human-approved (the owner sends), which the booking-link draft already makes
one-click.

## 2026-07-04 — Prospecting revolutionary pass P2: the self-booking close

The Hunter's other big leak was the interested→booked drop-off: a reply that
said "interested" handed off to a human call list and stopped — there was no
way for a prospect to book the demo (`demo_booked` was just a note logged
afterward). P2 lets an interested prospect book the meeting THEMSELVES.
Migration 0120 (`prospect_meeting`).

- **Pure availability** (`lib/prospect-booking.ts`, fully tested):
  `generateDemoSlots` builds weekday business-hour slots in the host's
  timezone (DST-correct via clinicDayStart), `days` out, at a cadence,
  excluding anything inside the lead time or already booked (no double-
  booking, owner-wide). Plus `isSlotAvailable` (the server-side booking
  guard), `groupSlotsByDay`, and `googleCalendarLink` (a universal add-to-
  calendar template URL — no OAuth).
- **The public booking page** (`/d/<token>`, token-IS-auth — the /r /w /c /b
  pattern, added to middleware PUBLIC_PATHS): a Dream Create-branded page
  where the prospect picks a slot shown in THEIR OWN timezone, enters name +
  email, and books — or sees their confirmed time with reschedule/cancel.
- **The service** (`lib/services/prospect-meetings.ts`): `getOrCreateBooking
  Link` (stable per-prospect link the owner pastes into a reply),
  `listAvailableSlots`, `bookMeeting` (re-validates the slot is still on offer
  + unbooked, so two prospects can't grab the same time), `cancelMeeting`,
  `getUpcomingMeetings`, and `runDemoReminders` (24h-out reminder, wired into
  the outreach cron). Booking emails both sides a confirmation with the
  add-to-calendar link; the owner also gets a bell + forced email.
- **Owner surfaces:** a "📅 Booking link" button on every call card (mints +
  copies the prospect's link), a "📅 Booked demos" panel on the call list
  (upcoming meetings in the host tz), and a Settings toggle (ships OFF —
  booking a demo emails the owner). Config `booking` block (hostTimeZone,
  window, cadence, lead time) resolves with defaults, no backfill.

## 2026-07-04 — Prospecting revolutionary pass P1: the reachability engine

The Hunter's #1 leak was reachability: email came from a single homepage
`mailto:`, was never verified, and the highest-value segment (no-website
practices) was un-emailable by construction — the hottest leads rotted as
dead rows. P1 closes that. Migration 0119 (`prospect_contact`).

- **Multi-contact model.** `prospect_contact` keeps EVERY address a practice
  exposes (info@, drjane@, office@) — role, source, MX status, rank, primary
  flag — instead of the old write-once single email. `prospect.email` stays
  the one send target the outreach engine reads; the sync just keeps it
  pointed at the best deliverable contact.
- **Deeper extraction.** `lib/prospect-signals.ts` now scrapes page-text
  addresses (not just `mailto:` links — many sites print info@ next to a
  contact form) with an asset-false-positive gate (`logo@2x.png`), and the
  crawl hops the contact page PLUS up to two team/about pages (where a named
  dentist's personal address lives), merging every find.
- **Email intelligence** (`lib/prospect-email.ts`, pure + fully tested):
  syntax/junk/disposable gating, role inference (owner-name match → office →
  billing → generic), and a deterministic send-preference rank so a verified
  drjane@ beats a verified info@, and invalid/disposable are floored so they
  can never become primary.
- **Deliverability pre-check** (`lib/services/prospect-email-verify.ts`): a
  live MX lookup (`node:dns`) — MX present → valid, none → invalid (won't
  deliver), DNS error → unknown (fail-open; the bounce watchdog is the
  backstop). No SMTP probe. Per-domain cached across a batch. This kills dead
  addresses BEFORE the first send instead of after the watchdog trips.
- **The orchestrator** (`lib/services/prospect-contacts.ts`):
  `syncProspectContacts` classifies + verifies + ranks + upserts every
  discovered address and re-points `prospect.email` at the best deliverable
  one — never stomping a human-pinned (manual) address. Enrichment calls it
  after the crawl; a bounded self-heal backfill in the enrich cron gives
  pre-existing prospects contact rows without a re-crawl.
- **The phone queue** (`getPhoneQueue` → call-list `📵 Phone-first queue`):
  enriched hot/warm prospects with no deliverable email surface as a
  call-first list with the reasons they scored and a one-tap dial — the
  un-emailable hottest segment turned into live cold calls instead of dead
  rows.
- **UI:** the drawer's single Email line became a full Contacts panel (verify
  badges, role, ★ send target, pin/remove/re-verify, "add the email you found
  on the call"). Pure layers (email intel, signal extraction, contact sync)
  tested; suite green but for the pre-existing my-day flake.

## 2026-07-04 — Prospecting all-in: The Hunter

Closing every human-in-the-loop gap so the engine hunts autonomously and the
owner only does the call + the close. Migration 0118 (segment/replyDraft/
entityPhase — all three ship in P1). 3 phases.

1. **Phase 1 — Release the hunter**: `autoEnroll`/`watchdog`/`digest` added
   to ProspectingConfig (junk-tolerant resolver + a pct() variant so the 0.3%
   complaint threshold isn't rounded away; ships autoEnroll OFF, watchdog +
   digest ON). `lib/prospect-segment.ts` (pure router: no website →
   no_website, quality<40 → weak_website, else weak_presence). Two new seeded
   sequences (oseq_no_website, oseq_weak_presence) alongside the default,
   which self-heals to segment 'weak_website'; `ensureAllSequences` replaces
   the bare default seed everywhere. enrollProspect routes to the
   segment-matched sequence when no id is passed (active-or-paused, default
   fallback) and returns {ok, sequenceId}. `runAutoEnroll` in the outreach
   cron (after intent+rollup, before sends): enrolls enriched+emailed
   prospects in the configured score bands, hottest-first, daily-capped
   ('auto_enroll' counter), runs even in dry-run; known-contact enroll
   failures disqualify (drain the pool). Settings hunter card (toggle/bands/
   cap + today's count); sequence segment badges. (`2c66814`)
2. **Phase 2 — Alarm bells + guard rails**: `lib/prospect-deliverability.ts`
   (pure watchdog math: below minSends never trips, strict `>` at the
   threshold, bounce + complaint paths). Watchdog hook in runOutreach (only
   when the sender resolves live + not already tripped): counts real sends +
   bounce/complaint events over a 72h window → assessDeliverability → on a
   breach flips config.dryRun on, stamps watchdog.trippedAt/reason, and
   forceEmail-alerts platform admins; setDryRunAction(false) clears the trip.
   Call-list alerting in prospect-intent applyClassification: interested/
   question replies notifyOrgMembers (bell + forced email, w/ phone) +
   fire-and-forget demo-brief pre-warm; promoteProspectByEmail gets parity;
   engagement rollup emits ONE aggregate bell per run (soft signal). AI reply
   drafts for 'question' replies (haiku, stored on prospect.reply_draft,
   metered ai_reply_draft, cleared on outcome) surfaced as a copy-to-clipboard
   "✉️ Suggested reply" block on the call card ("you send from your own inbox
   — we never auto-send"). Settings watchdog tripped banner.
3. **Phase 3 — More prey, full instruments**: NPI-1 solo-dentist discovery —
   `normalizeNppesResult` is now mode-aware (an NPI-1 record has no org name;
   the provider IS the practice → name "Dr. First Last, DDS", self as
   authorized official), and `searchNppesOrgs` takes an `enumerationType`.
   Discovery runs a single-row two-phase cursor on
   `prospect_discovery_task.entity_phase`: the org pass (NPI-2) exhausts →
   flip to the individual pass (NPI-1) with a fresh cursor (NOT done);
   individual exhaustion → done; `splitTask` seeds zip5 children with the
   current phase; the idle-run block self-heals states discovered before
   NPI-1 by flipping done/org tasks back to pending/individual — so the whole
   backlog gets the solo-dentist sweep with no migration. Roughly 3-4× the
   discoverable universe. `getHuntStats` (shared by the digest + the cockpit):
   last-24h sends/dry-run drafts, opens/clicks/replies, new call-list
   arrivals, today's auto-enrolls, and the 3 hottest prospects. The daily hunt
   DIGEST (`lib/services/prospecting-digest.ts`, pure builder + runner wired
   into the daily-digest cron): one email to platform owner/admins —
   "The hunt: 42 sent · 3 replies · 2 for your call list" — with the outreach
   line, new call-list names + intent, auto-enroll count, a deliverability
   health line, and the funnel snapshot; daily_digest_log idempotency; skips
   quietly when nothing happened; toggle in Settings. Per-touch sequence stats
   (`listSequencesWithStats`: each step gains sent/uniqueOpens/uniqueClicks,
   the sequence gains replies + reply-rate) rendered in the editor
   ("Touch 2 · day 3 — 120 sent · 38% open · 6% click", raw counts below 10
   sent). And the hunt COCKPIT (`hunt-panel.tsx` above the funnel): last-24h
   tiles + engine-status pills (engine on/off, dry-run vs LIVE, watchdog
   healthy/TRIPPED, sender, hunter on) + a "hottest right now" list linking
   straight to the call card.

## 2026-07-03 — Demo system all-in (the demo is a MIRROR)

Going deep on presenter mode: the prospect spends the demo looking at THEIR
OWN practice running better. Three slices.

1. **Phase 1 — Brand capture + chrome depth**: the crawler now also captures
   `theme-color` (normalized hex, raw honest value), the best square brand
   mark (apple-touch-icon > link rel=icon > og:image, absolutized, https
   only) and og:site_name (ProspectCrawlSignals — jsonb, no migration).
   New pure modules: `lib/demo-gaps.ts` (beat↔gap keyword router +
   deterministic signal triggers — demo ammunition) and
   `lib/demo-skin-build.ts` (buildDemoSkin composition w/ usableBrandColor
   white/black rejection, officialFirstName, 2KB cookie cap w/ fixed drop
   order; buildDemoCompareUrl same-origin). DemoSkin grew websiteUrl/
   weaknesses/officialFirstName (parse-validated). Chrome: prospect logo in
   the sidebar org tile (onError → initial fallback), demo hairline in the
   prospect's brand color (`--demo-accent`, amber fallback), header
   "🎬 Presenting to X" chip REPLACES Exit-demo during branded demos and
   ends the demo → call list w/ the prospect pinned for outcome logging
   (endBrandedDemoAction). Manual "↻ Re-enrich" per prospect
   (reEnrichProspect — any status, never demotes pipeline-forward rows,
   budget-gated). (`56c6ee6`)
2. **Phase 2 — AI demo prep brief**: `prospect.demo_brief` jsonb (migration
   0117); `lib/demo-brief-prompt.ts` (pure {system,user} builder — verified
   signals + benchmarks + the real beat-id list); `lib/services/
   demo-brief.ts` (SONNET one-pager, owner-initiated, cached forever,
   regenerate overwrites; zod-validated, invented beat ids filtered, AI
   failure → null + zero writes; metered `ai_brief`);
   `lib/types/demo-brief.ts` parseDemoBrief junk-tolerant reader.
   Printable prep page `/platform/prospecting/demo/[id]`: numbers vs
   typical (rating/reviews/score KpiStats), demo ammunition grouped by the
   beat where each gap lands, walk-up story (crawl chips + captured brand
   swatch + crawl age), AI one-pager (opening line blockquote, beat
   emphasis w/ exactly-one-LEAD pills, land-these-points, objections +
   one-breath responses, the ask). Entry links from the drawer + call
   cards; "🎬 Start branded demo" is the page's primary action. (`551e0b3`)
3. **Phase 3 — Presenter panel v2 + the compare moment**: beats gained
   narrative groups (Open/Run/Grow/Close) + an 8th `compare` beat +
   {firstName} substitution. Panel rewrite (components/demo/): glassy dark
   w-96 w/ accent top trim, group label ("Grow · beat 6 of 8"), segmented
   click-to-jump beat progress (accent fill, visited mix), demo timer
   (sessionStorage epoch), per-beat notes (sessionStorage), ⚠ gap callouts
   (groupGapsByBeat over skin.weaknesses — THIS prospect's gaps inline
   under the talk track of the beat they land on), "↗ their current site",
   digit-key 1-N jump (derived from registry length), motion-safe beat
   transition, End-demo form; beat index persists so a mid-demo reload
   resumes. Compare moment: `/demo/compare` ((preview) chrome-less
   pattern, triple-gated) — LEFT their real site (server-side XFO/CSP
   pre-check via pure lib/frame-embed.ts; blocked/unreachable → the
   "indictment card": gap chips + anti-shame copy + open-in-new-tab),
   RIGHT the demo site re-themed in their brand via
   `/site/[slug]/demo-brand?brand=rrggbb` (demo slug only, strict hex,
   noindex, page-level clinicPaletteCss overrides the layout's :root —
   same-origin path-based iframe so the global XFO passes untouched).

## 2026-07-03 — Prospecting engine (Dream Create's own outbound growth)

The platform org gets a lead-generation system: every US dental clinic is
publicly findable (NPPES NPI registry) with rich quality signals, so the
loop is discover → enrich/score → AI outreach → intent → the owner's call
list → convert via createManagedClinic. Plan: 5 phases, each a deployed
slice. Schema `lib/db/schema/prospecting.ts` (migration 0116) is
PLATFORM-GLOBAL (no organizationId — precedent service_library; access only
via requirePlatformAdmin actions + CRON_SECRET crons). Naming rule:
"prospect" everywhere ("lead" = clinic patient-leads).

1. **Phase 1 — Discovery + browse**: all prospecting tables in one migration
   (prospect, discovery tasks, outreach sequence/enrollment/touch-log/event,
   suppression, call log, config singleton, counters); `lib/nppes.ts` (free
   CMS API, defensive parse, dental-taxonomy 1223* enforcement, dedupe hash
   phone+address); `lib/types/us-geo.ts` (state→zip3 grid — NPPES caps
   skip at 1200 so tasks iterate state × zip3 and split to zip5 at the cap —
   + state→IANA tz); `prospect-discovery.ts` resumable task engine;
   `prospect-discovery` cron (6h); `/platform/prospecting` (funnel KPIs,
   filterable table) + `/settings` (kill switch, dry-run, state rollout
   grid, budget meters, env-readiness cards). Ships OFF: killSwitch +
   dryRun both default true. (`baf0342`)
2. **Phase 2 — Enrichment + scoring**: `lib/google-places.ts` (Places API
   New, lazy key, tight field mask = cheap SKU, null on any error);
   `lib/prospect-signals.ts` (pure regex extractor: SSL/viewport/copyright/
   booking markers/social links/builder fingerprints/mailto discovery — an
   email only ever comes from the clinic's own site, never guessed);
   `lib/prospect-scoring.ts` (deterministic ladder: no website 90–100 hot ·
   bad site 65–89 · decent-site gaps 40–64 · dialed-in <40; AI judges the
   website, pure math decides the score) + heuristicVerdict AI fallback;
   `prospect-enrich.ts` orchestrator (Places → robots-respecting crawl +
   contact-page email hop → haiku verdict via runClaudeJson → score; budget
   soft-pause, CLOSED_PERMANENTLY → disqualified, errors → back to pool);
   `prospect-enrich` cron (30m); server-rendered prospect drawer
   (?prospect=<id>: enrichment, verdict, score reasons, outreach history,
   call log, suppress action). (`3355e73`)
3. **Phase 3 — Outreach engine (dry-run-safe)**: the compliance-critical
   drip (`lib/services/prospect-outreach.ts`): default 4-touch sequence
   (day 0/3/8/15, deterministic-id seed), AI personalization (haiku
   rewrites the skeleton around the prospect's VERIFIED gaps, <130 words,
   template-merge fallback never blocks), personal-looking render (no
   marketing shell) w/ tracked links + pixel + CAN-SPAM postal footer +
   one-click unsub; tokens.ts extended (pr/tl payloads, c optional) with
   track/unsub routes + Resend webhook branching to outreach_event +
   permanent suppression; send-time guards (suppression + isKnownContact
   fail-closed), prospect-local business-hours weekday window, warm-up
   daily cap (start→+increment/week→ceiling), atomic per-touch claim
   (unique enrollmentId+stepNumber), paused sequences hold in place;
   engine runs FULLY in dry-run (channel='dry_run' log rows) until
   OUTREACH_EMAIL_FROM / OUTREACH_GMAIL_ACCOUNT_ID exist AND dryRun is
   off — never sends from dreamcreatestudio.com; `prospect-outreach` cron
   (30m); sequence manager UI (edit touches, pause-all) + drawer
   enroll/stop. (`badf1c8`)
4. **Phase 4 — Intent + call list + convert**
   (`lib/services/prospect-intent.ts`): inbound mail on the outreach Gmail
   account matches prospects by sender email (only outreach-touched ones) →
   haiku triage {interested/question → stop sequence + call_list w/ AI
   summary + talking points · not_interested/unsubscribe → stop + permanent
   suppression · out_of_office → paused_ooo +7d w/ auto-resume ·
   wrong_person → disqualified}; per-message idempotency via
   outreach_event.meta.emailMessageId; wired as a best-effort hook in
   mailbox processHistoryEvent AND a sweep in the outreach cron (intent
   runs BEFORE sends so an overnight reply stops today's touch);
   engagement rollup (click, or 3+ opens → engaged; never overrides reply
   states); promoteProspectByEmail('demo_request') helper for future warm
   signals (no marketing-site demo form exists today). Call-list UI
   (/platform/prospecting/call-list): freshest signal first, tel: links,
   AI summary + talking points inline, one-tap outcomes (not_interested
   retires the prospect), inline convert form → createManagedClinic
   (reserved plan + negotiated coupon + owner invite) + markConverted
   linkage. (`f0cc7d6`)
5. **Phase 5 — Presenter mode** (zero DB writes; the demo seeder is
   untouched): `demo_skin` cookie ({prospectId, clinicName, city,
   brandColor?, logoUrl?}) set by "🎬 Branded demo" in the prospect drawer
   (rides enterDemoMode's self-heal; exitDemoMode clears it);
   `readDemoSkin(ctx)` (lib/demo-skin.ts) returns it ONLY for
   platformAdmin + isDemo w/ defensive parse — a stale cookie can never
   brand a real clinic; dashboard-shell overrides the sidebar org name +
   sets a --demo-accent var, Overview huddle title shows the prospect's
   name; presenter panel (components/demo/presenter-panel.tsx) — floating
   keyboard-driven script (→/n/←/Esc) over a typed 7-beat registry
   (lib/types/demo-script.ts) w/ {clinicName}/{city} substitution +
   sessionStorage visited checkmarks. Post-signup activation checklist
   already existed (GettingStarted) — no work needed.

## 2026-07-03 — Billing adjustments: Stripe Tax + 1% platform fee + reprice

Three user-directed billing changes in one slice (migration 0115):

1. **Stripe Tax on platform subscriptions** — both platform checkouts
   (`createCheckoutSession` in lib/services/billing.ts + the managed-clinic
   activation checkout in lib/services/clinic-provisioning.ts) now send
   `automatic_tax: { enabled: true }` + `billing_address_collection:
   'required'` + `customer_update: { address: 'auto', name: 'auto' }` +
   `tax_id_collection`. In-place plan swaps try the update WITH
   `automatic_tax` and retry without when the older subscription's customer
   lacks a tax address (never blocks a plan change). **Ops prerequisite:**
   activate Stripe Tax in the dashboard, add state registrations, set the
   SaaS tax code on the products — until then `automatic_tax` computes $0.
2. **1% platform fee on every Connect money path** —
   `shop_config.platform_fee_bps` default 0 → 100 (+ backfill UPDATE for
   existing rows, migration 0115). One shared helper `platformFeeCents()`
   (lib/types/shop.ts — clamps, never exceeds the amount). Wired as
   `application_fee_amount` into balance payments, booking deposits, and
   payment-plan installment charges; membership subscriptions use
   `application_fee_percent`. Shop checkout already honored the column.
   Per-org override stays possible by editing the row.
3. **Reprice: $150 / $250 / $500 (annual $1,500 / $2,500 / $5,000)** —
   PLANS in lib/stripe-config.ts + every display site (marketing pricing/
   home/compare/docs/blog CTA, OG image, comparisons registry, launch blog
   post, demo partner-commission seed, platform-metrics tiles now derive
   from getPlanById). **Ops prerequisite:** create six NEW Stripe Prices and
   swap the `STRIPE_PRICE_{STARTER,PROFESSIONAL,ENTERPRISE}_{MONTHLY,ANNUAL}`
   values in `dreamcrm/app-secrets`, then redeploy — existing subscriptions
   keep their old price (beta lock-in via coupons on top). DSO/multi-location
   pricing intentionally deferred to the future DSO portal.

## 2026-07-02 — Unblocked-P3 sweep + the finishing pass CLEARED

The tail of the competitive program plus the whole FINISHING.md punch list,
each slice deploy-verified. Migrations 0111–0114. Suite → 4,371.

**P3 slices (COMPETITIVE-GAPS now has NO buildable open items — only
📵 SMS-blocked, post-OD, and partnership rows remain):**
1. **Preferred-language sending** (`1b9dced`) — patient.preferred_language
   ('es'), Edit-modal picker, auto-stamp when intake is filled in Spanish
   (only-when-null), "Prefers Spanish" chip + one-tap 🌐 Español composer
   translate (shares the AI-draft allowance).
2. **Patient-thread urgency triage** (`1b9dced`) — two-stage classifier
   (EN+ES clinical-distress keyword screen → AI confirm w/ six-word reason;
   fail-open), urgent threads pin first w/ 🚨 pill + header banner, staff
   reply clears (lib/services/thread-triage.ts).
3. **NPS surveys** (`de0d809`) — opt-in (nps_enabled, now real), one-question
   email 3 days post-visit → public /n/[token] (0–10 + comment, POST-recorded),
   180-day/per-visit throttles, detractor escalation, "Patient pulse" section
   on /reviews (lib/services/nps.ts; migration 0112).
4. **Loyalty program** (`90205a6`) — opt-in points ledger (kept visits /
   converted referrals / online payments; daily idempotent unique-source
   sweep, demo-skip), portal rewards card redeems threshold → single-use
   patient-bound shop coupon (rollback-safe), patient-record panel w/
   owner/admin adjust (lib/services/loyalty.ts; migration 0113).
5. **Arrival flow, lean** (`90205a6`) — arrived→seated timestamps on today's
   live visits (drawer "In office" row; 🚪/🪑 pills on agenda + My Day).
6. **Documented skips**: team chat (Slack wins), review-site steering (moot,
   Google-first), competitor benchmarking (no honest data source), virtual
   check-in (SMS-blocked).

**Finishing pass — punch list CLEARED (migration 0114):**
- Class 1 done: follow-up rule/rebook due dates + labels now clinic-tz;
  cancel/no-show + new-booking notification date labels tz'd; global-search
  visit dates tz'd; lib/utils formatters marked CLIENT-ONLY; portal message
  timestamps decided (browser tz for chat moments).
- Class 2 done: patient.is_demo_persona column (seeder writes + self-heals);
  dead notification_prefs.push_everything dropped w/ its banner code.
- Class 3 done: window labels verified explicit; confirmed-definition
  decided + documented; /followups "🔔 N due now" pill (matches the badge);
  guardian visit naming was already shipped.
- Class 4 done: reviews staff-wide access decided (ensureClinicStaff); OD
  detail page member view is now read-only (no sync/disconnect/key-entry).
- Class 5 done: GBP preferred-location column + picker (resolveGbpAccount
  honors it); billingActivationPending dropped; membership fallback ordering
  deterministic; Gmail watch-lapse strip in /inbox.

## 2026-07-02 (later) — Module-deepening program: all P1 vendor gaps + first P2 wave (13 slices)

Working docs/COMPETITIVE-GAPS.md top-to-bottom in one autonomous run — every
slice a full vertical (schema+migration → service → UI → settings → demo seed
→ tests) pushed to main and verified deploy-green individually. Suite grew
4,200 → 4,338. Migrations 0101–0110.

1. **Fast-pass waitlist auto-fill** (`e2719bf`) — appointment_waitlist +
   offers; cancellation auto-offers freed slots; first-click-wins claim at
   /w/[token] via the advisory-lock insert; drawer + panel + persona seed.
2. **Booking deposits** (`ad66e5a`) — per-visit-type depositCents (default
   $0), Connect direct charge at public booking (fail-open, book-first),
   auto-confirm on payment, Shop → Payments reconciliation + CSV, drawer pill.
3. **Reminder journeys** (`a88483f`) — multi-touch touchOffsets (default
   72h+24h, per-touch idempotency + 20h min-gap), confirmed-vs-unconfirmed
   copy variants, one-click email confirm at /c/[token] (confirmedVia
   'email'), per-visit-type prepInstructions, add-to-calendar save-the-date.
4. **Billing outreach** (`3c0e817`) — email-to-pay: /b/[token] public pay
   landing (live PMS balance, partial pay), single + bulk staff sends,
   balance_pay_link editable copy, opt-in automated cadence
   (balance_outreach jsonb; threshold/cadence/90-day cap) on the daily cron.
5. **Tomorrow audit** (`04b0288`) — lib/services/patient-audit.ts live
   per-patient prep list (unconfirmed/intake/balance/deposit/unreachable/
   new/lapsed-returning/birthday) on My Day + the morning digest.
6. **Use-your-benefits automation** (`13b1299`) — third retention automation
   (Oct–Dec, insured + noUpcomingVisit audience filters, monthly key).
7. **Website chat bubble** (`5cb0d95`) — 'Message us' on every public clinic
   page → inbound /messages thread (channel=email), spam-guarded,
   chat_widget_enabled toggle (default ON) in Settings → Practice.
8. **Reviews star-gate + AI replies** (`38aa108`) — opt-in star triage on
   /r/[token] (FTC-clean: same public links for every rating, low ratings
   lead with private feedback) + metered AI reply drafts for Google reviews.
9. **No-show rebook note** (`1ebe96e`) — warm patient email on no-show
   (no_show_rebook key, plan-gated rebook button).
10. **Intake kiosk mode** (`a7e8020`) — ?kiosk=1 locked tablet fill mode
    w/ auto-reset; 'Kiosk ↗' launcher on /intake-forms.
11. **Family/household card** (`d0a2278`) — getFamilyForPatient from portal
    guardian links, card on the patient record.
12. **Blog-powered newsletter** (`a40498a`) — one-click draft campaign from
    the latest published blog posts (review-before-send).
13. **Refer-a-friend program** (`db900d2`) — patient_referral_link (one share
    link per patient, migration 0109) minted lazily from the portal home's
    "Share the love" card (native share sheet / clipboard); /book?ref=<token>
    stamps referred_by_patient_id once on NEWLY created patients (org-scoped,
    self-referral + overwrite guarded, best-effort); Referrals card on the
    patient record shows both directions; Sophia→Emma demo seed + demoref
    cleanup-sweep entry.
14. **Family reminder consolidation** (`c8f4af3`) — runDueReminders buckets due touches
    by (recipient inbox, clinic-local day): several same-day family visits →
    ONE household email w/ per-visit inline confirm links (generated copy;
    timing/on-off still reminder_settings); email-less guardian-linked
    dependents now remind via the guardian's inbox (previously silent);
    per-appointment log rows keep touch idempotency; authEmailShell button
    made optional for button-less notices.
15. **Broadcast messaging** (`8f99d42`) — "📣 Broadcast" in the /messages top bar
    (owner/admin): quick segments w/ live counts (visits today/tomorrow/7
    days clinic-local; all active opt-in), each recipient emailed via
    sendMessageToPatient so the message lands in their thread and replies
    return to the inbox; 500-recipient cap points bigger sends at the
    campaign rails (lib/services/broadcast.ts + lib/types/broadcast.ts).
16. **Collections board** (`5461104`) — /shop/collections honest AR workboard: open
    PMS balances desc w/ dunning state (latest pay-link status, last online
    payment), per-row send-pay-link, header stats incl. clinic-local
    month-to-date collected; My Day Balances stat + payments page link
    here; explicit no-fake-aging deferral note
    (lib/services/collections.ts).
17. **Payment plans w/ card-on-file autopay** — payment_plan (migration
    0110): propose from the Collections board (2–12 months, $100/$25
    floors, one open plan per patient) → public /i/[token] accept via
    Connect Checkout SETUP mode → first installment charges off-session on
    accept, rest on the daily retention tick (runDuePlanCharges); each
    charge records a patient_balance_payment row; declines → past_due w/
    3-day retries ×3 then parked; plans table + cancel on the board; demo
    plan on Marcus (no Stripe ids, cron-proof) + cleanup entry
    (lib/services/payment-plans.ts).

New conventions minted: token-IS-auth public pages live at single-letter
roots (/r /w /c /b) + middleware PUBLIC_PATHS; new automated emails join the
EMAIL_AUTOMATION_SPECS registry (union + spec + hub renders free); new AI
surfaces meter via lib/services/ai-usage.ts kinds; demo money/dunning records
seed persona-anchored with `*_demo`/`demo*` markers + cleanup-sweep entries.

Remaining in COMPETITIVE-GAPS: only the P3/📵 tail (SMS-gated + post-OD +
partnership items) — every P1 and P2 vendor gap is shipped.

## 2026-07-13 — Deep purpose-audit vs competitors (docs/STRUCTURE-AUDIT.md)

Full three-stage audit before any further module work: (1) inventoried every
clinic-dashboard feature + setting by purpose (15+ purpose areas, exact
placement); (2) benchmarked how NexHealth / Weave / RevenueWell /
Solutionreach / YAPI / Adit / Birdeye / Podium / Dental Intelligence /
Kleer / BoomCloud / Pearly / Wix / Squarespace / Shopify structure the same
purposes; (3) synthesized purpose-by-purpose verdicts. Result: the house
pattern (behavior config in-feature, copy+timing in the Automations hub,
account-wide config in pinned Settings) matches the strongest cross-vendor
norms — 15 of 17 purpose areas verdict "keep". The 4 adjustments shipped:

1. Booking-split bridge: Practice→Online booking ⇄ Portal→Booking now
   cross-link (verified the two homes are semantically real — portal rules
   are consumed only by portal surfaces — so a merge would be wrong).
2. Refer-a-friend Growth door: ReferralProgramCard on the outreach hub
   (live org-wide pulse via new getReferralProgramStats in
   lib/services/patient-referrals.ts; demo org already seeds attribution).
3. Appointments header action now deep-links the reminder-journey card
   (?email=appointment_reminder) instead of only the confirmation email.
4. Chat-widget action moved next to its route
   (app/(default)/website/forms/actions.ts); dead chatWidgetEnabled field
   dropped from getPracticeSettings.

## 2026-07-13 (later) — Internal-structure conformance pass

Second depth level of the structure audit: two exhaustive module-internals
sweeps (Daily group; Growth/Website/Business/Settings) against a fixed
conformance checklist (cross-route action seams, list spines, config
placement + deep links, back paths, header convention, orphans, hub parity,
upsell honesty). Verified conforming with no change: Automations deep-link
pattern (all 5 modules), list spines (orders/campaigns/leads/patients/
appointments/messages), hub↔sub-page parity on all three workspaces, zero
orphan pages, honest upsell doors. Fixes shipped:

1. Action-home seams (the chat-widget class, 3 more): agenda's
   `bulkCreateFollowupsForPatientsAction` → appointments/actions.ts;
   `setFollowupRuleAction` + `setDigestEnabledAction` → new
   followups/actions.ts; `saveReminderSettingsAction` → the Emails hub's
   actions.ts (was on the /settings/reminders redirect stub, revalidating
   the stub path).
2. Back-path class (11 pages): Growth first-level sub-pages (outreach,
   campaigns, reviews, social, analytics) adopt the workspace breadcrumb
   eyebrow (`‹ Growth`); website/blog + seo + careers adopt `‹ Website`
   like their siblings; shop memberships/coupons/collections get
   `← Back to Shop`; audiences' back link is tenant-aware
   (/growth/outreach for clinics).
3. Eyebrow convention: growth/analytics ("Practice · date"),
   website/seo ("Search · date"), inbox settings ("Daily · Inbox"),
   growth/social, both integration detail pages, website/share — all now
   follow the group-or-breadcrumb convention; Growth + Website hubs gain
   the same eyebrow the Shop hub already had.
4. FINISHING.md Class 6 opened: public-site booking ignores the portal
   notice windows (decide: apply or relabel "portal only").

## 2026-07-14 — Structure pass 3: other tenants + Class 6 closed

Extended the conformance sweep to the PLATFORM tenant, patient PORTAL,
partner portal, auth + onboarding (two more checklist audits; token-IS-auth
pages, portal nav parity, chrome consistency, tenant branching all verified
conforming). Fixes: clinic-referral assign/clear actions moved next to their
only UI (ecommerce/customers/[id]/actions.ts — partners keeps the shared
terms action); platform /marketing eyebrow → "Platform · …"; /website/blog
eyebrow tenant-branched (platform admins authoring the marketing blog no
longer get a clinic-workspace breadcrumb); PortalBackLink now renders
next/link (client nav) and the intake page uses it instead of a hand-rolled
link. FINISHING Class 6 CLOSED: getSlotsForDay/isSlotAvailable take an
optional minNoticeHours; public slot list + submit and the portal slot list
pass the clinic's "Earliest online booking" value (staff paths omit it —
walk-ins unaffected); settings copy says "website and portal"; notice-window
tests in tests/booking/availability.test.ts.

## 2026-07-14 (later) — Inbound email replies → /messages (shipped dark)

Open item #3 closed in code: Tier-1 patient replies can now land in the
patient's /messages thread instead of only the clinic's own inbox.
`INBOUND_REPLY_DOMAIN` (unset = old behavior) flips Tier-1 Reply-To to
`{slug}@{domain}`; Resend Inbound webhooks `email.received` into the existing
svix-verified /api/webhooks/resend; `lib/services/inbound-reply.ts` routes:
known patient → recordInboundMessage (email channel, quoted history stripped
via `lib/inbound-email.ts` pure helpers, Resend email_id as externalId for
replay-safe dedupe); unknown sender → forwarded verbatim to the clinic's
inbox; foreign/junk → ignored. Gmail Tier-2 untouched (transport ignores
Reply-To). Owner runbook (MX + Resend inbound domain + secret) in
docs/inbound-email.md. Also: session-start hook now self-heals the recurring
container stale-snapshot revert (fetch + hard-reset to origin/main when HEAD
is strictly behind).

## 2026-07-14 (later) — Tenant-voice pass: platform surfaces stop sounding like a clinic

Owner feedback: shared surfaces leaked clinic voice to the PLATFORM tenant.
Full sweep of every platform-reachable surface; verified clean voice on the
dedicated platform components (overview, clinics, pipeline, partners,
prospecting, invoices, SEO manage, settings home/nav, messages, shell
chrome). Fixed the 8 leak sites on SHARED surfaces: blog manager (subtitle,
legend, "Coming next" module name), blog editor (post-publish nudge,
email-to-patients buttons, AI-draft voice/placeholder, cover-alt example —
new isPlatform prop), blog calendar (subtitle, ideas modal — isPlatform
threaded), campaign editor (Gmail-channel help + scheduler timezone label —
new recipientNoun/orgNoun), audiences (empty state uses the branched
leadsLabel; back button says "← Sales pipeline" for platform),
Settings→Team subtitle, Settings→Notifications (alerts description +
pause-all note now use the platform register). Convention reinforced:
any surface serving two tenants must branch every reader-addressed string.

## 2026-07-14 (later) — Payments workspace: the money split (redesign pass 1)

Owner-sanctioned structure redesign. Money management left Shop:
new /payments workspace (Business group, wallet icon, same premium +
payments-bundle gates) — hub with the money KPI story (Outstanding → To
reconcile → Payment plans → Recurring MRR) + Stripe status, doors into
/payments/online (was /shop/payments), /payments/collections
(was /shop/collections), /payments/memberships (was /shop/memberships);
all old paths 308. Shop hub is pure commerce now (Orders + Coupons doors,
catalog, storefront/loyalty config; the Recurring KPI stays as a drill into
Payments). ~30 files re-pointed (overview cards, My Day, patient detail,
email deep links, services' linkPaths, trail, ⌘K entries, demo seeds);
tests split (shop-client suite trimmed to commerce, new
tests/payments/hub-doors.test.tsx carries the money-door assertions).
Considered + rejected: Leads → Growth (it's a daily triage queue with a
live sidebar badge — recorded in docs/STRUCTURE-AUDIT.md Stage 4).

## 2026-07-14 (later) — Polish tail: review auto-send freshness floor

Closed CLAUDE.md open item #6: the auto-send sweep was already anchored to
`completedAt`, but had NO lower bound — flipping auto-send ON (or a long
cron outage) would have blasted review requests for months-old visits. The
candidates query now carries a 7-day ask-while-fresh floor
(completedAt ≥ now−7d), covering every real safety-net case (48h max delay
+ missed ticks) while making stale asks impossible. Also verified
`push_everything` was already dropped (0114) and de-staled the open-items
list.

## 2026-07-14 (later) — Email delivery receipts in /messages

Prompted by the first REAL beta interaction (a staff email reply to a
patient appointment request): "did it actually reach them?" is now
answerable in-app. Staff→patient thread emails carry patientMessageId +
organizationId Resend tags (deliver() gained a tags param; the message id
is minted BEFORE delivery); the existing svix webhook maps
email.delivered → deliveredAt, email.opened → readByPatientAt
(+deliveredAt backfill), email.bounced/complained → meta.deliveryFailed +
ONE staff bell ("Your message to {patient} didn't get through") via
recordPatientMessageReceipt (idempotent set-once, replay-safe). The thread
receipt UI is channel-aware: in-app Delivered/Read, email
Delivered/Opened, red "⚠ Not delivered" on failure. Gmail Tier-2 sends
stay at "Sent" (no Resend events — honest). Owner dashboard steps (webhook
event subscriptions + domain open-tracking toggle) appended to
docs/inbound-email.md.

## 2026-07-17 — Design System v3: "Cute Dream, Living Data" (foundation)

The owner compared the dashboard to Dental Intelligence's portal and named
the real gap: theirs felt ALIVE (data everywhere) and premium; ours wore an
austere instrument-panel skin that argued with the product's warm voice —
and the owner hates green/teal, loves blue/bubbles/shadows/rounded/cute.
Direction was prototyped as an interactive mockup (light + "dream at
night" dark, palettes CVD-validated), approved on the big screen, then
shipped as the v3 foundation in one pass:

- **Token layer** (`app/css/style.css`): every v2 token NAME kept, values
  moved — sky-blue canvas/surfaces, blue-lean ink, bubble radius scale
  (8/12/16/22/pill), soft dream-blue shadows (+ new `--shadow-card`; cards
  FLOAT — the etched inset-ring doctrine retired), blue focus ring, new
  `--spring-pop` overshoot, "dream at night" dark world, blue aura.
- **The ramp trick, one level up:** the brand ramp rides the `teal-*`
  variable names; re-pointing it to the dream-blue ramp (500 #4C7DF0 /
  400 #7CA5FF / 700 #2F52B3) reskinned all 151 teal-consuming dashboard
  files in one move. Gray ramp re-tinted blue-cool the same way.
- **Fonts:** Nunito (variable 200–1000, latin + latin-ext) self-hosted in
  `public/fonts` + `@font-face`; leads `--font-sans-dashboard` with Geist
  fallback; Geist Mono stays for numerals.
- **Encodings** (`lib/ui/encodings.ts`): info indigo→violet (indigo is
  unreadable next to a blue brand), special violet→fuchsia; flash-toast
  edges follow; 4 color-literal tests updated (the data-tone-asserting
  tests survived untouched — the semantic contract doing its job).
- **Primitives:** ActionButton primary/breath = gradient bubble w/ glow
  (white text both themes); tenant-sidebar active = full gradient pill
  (rounded-full, white ink, glow; left-bar retired) w/ active-aware kbd
  hints.
- **Doctrine:** DESIGN-SYSTEM.md rewritten as v3 — actions-first, the
  six-tone contract, legibility floor, and motion architecture survive;
  new laws: soft-reads-friendly (float, bubbles), EVERY NUMBER WANTS A
  HEARTBEAT (living-data law w/ per-surface budget), instant-first kept.
  Mascot (SVG tooth) sanctioned in exactly two homes: empty states +
  schedule-gap cards. tokens.test.ts guard re-pinned to v3 values.

NEXT (the module "alive" pass, by class): sweep modules for lingering local
card recipes/indigo literals, then add law-7 heartbeats (sparklines/rings/
deltas from real columns) surface by surface. Overview first.

## 2026-07-18 — v3 module sweep (part 1+2): tone literals + floating cards + first heartbeat

The rebrand's module-by-module pass, run as two parallel scoped sweeps over
disjoint file lists + one vertical slice:

- **Indigo out (17 files):** every dashboard `indigo-*` literal re-toned to
  the v3 registry (info→violet; Premium tier badge + follow-up intent dot →
  fuchsia/special so tiers/dots stay distinct). Comments + one test name
  de-staled; the data-tone-asserting tests needed nothing — the semantic
  contract held.
- **Cards float (27 of 33 files):** local `bg-white dark:bg-gray-800
  shadow-sm rounded-xl` recipes → `.v2-card`; modal/popover panels →
  `rounded-[var(--r-lg)]`; 6 files deliberately untouched (upload buttons,
  highlight rings, thumbnails, hairline sub-sections — not cards).
  Lingering follow-up noted: pipeline-board line ~261 rounded-lg card
  recipe.
- **First law-7 heartbeat:** `getClinicOverview` computes
  `trends.bookingsPerDay14` (bookings CREATED per clinic-local day — same
  semantics as the tile, clinic-tz buckets); `KpiStat` gained the `spark`
  slot (aria-hidden decoration, ≥2 points, hidden <480px); the Overview
  Bookings tile wears it. Primitive test pins render/no-render.

Full suite 5,096 green + prod build green. NEXT heartbeats (each needs its
real series/ring — no fake content): Overview confirmed-today ring,
Patients/Leads/Payments hub tiles, platform overview.

## 2026-07-19 — Heartbeats round 2 (law-7 pass, four surfaces)

Four vertical slices, three by parallel scoped agents + one keystone:
- **ProgressRing primitive** (components/ui/progress-ring.tsx — fills once
  on mount, % text, required aria label, hides at max≤0, reduced-motion
  snaps; doctrine inventory row + tests) worn by the Overview "Today's
  chair" header: "N appointments · M confirmed" + ring (completed counts
  as confirmed).
- **Payments hub**: `getCollectedPerWeek8` (paid balance payments, 8
  DST-safe clinic-local weeks) → To reconcile tile spark; tz-boundary +
  ORG_A/ORG_B tests.
- **Platform overview**: Active Clinics tile wears the EXISTING
  `getClinicGrowth(12)` series (reuse over duplication); demo-exclusion
  now pinned by test.
- **Leads**: `getLeadsPerDay14` (clinic-local days) → "Last 14 days"
  sparkline beside the filter chips; hidden when <2 active days; UTC-trap
  test (10 PM Chicago lead lands in the clinic's day, not UTC's).

Full suite 5,109 green + prod build green.

## 2026-07-19 (later) — v3 heartbeats round 3: Patients · Growth hub · Messages

Same playbook, three parallel slices + shared precedent from rounds 1–2:
- **Patients**: `getNewPatientsPerWeek12` (Overview acquisition semantics —
  firstSeenAt, no archived, backfill sources excluded; the constant
  re-homed to pure-leaf `lib/patient-acquisition.ts` to break an
  analytics↔patients import cycle, re-exported for existing importers);
  spark at the end of the filter row, Leads-mirrored.
- **Growth hub**: `getReviewsReceivedPerWeek8` bucketing platform_review by
  reviewCreatedAt (posted-on-platform time — a backfill sync can't lie);
  SectionCard spark slot; rides the Reviews door's isPro gate; hub test
  pins EXACTLY ONE spark per page (the law-7 budget, machine-enforced).
- **Messages**: `getMessagesPerDay14` (patient_message in+out, clinic-local
  days) as the "14-day pulse" in the clinic thread-list header; platform
  client-messaging untouched (tenant-voice honored).
All series: DST-safe clinic-tz boundaries (the walk-back pattern), one
org-scoped range scan, JS bucketing, honest-empty (hidden without ≥2
signal-bearing points). Full suite 5,127 green.

Remaining heartbeat candidates (round 4+): Followups board, Shop hub,
Intake forms, My Day. Post-redesign roadmap seeded: action-links coverage
audit (every number drillable) + the widget-registry direction (Overview
as a composition of registered widgets).

## 2026-07-19 (later) — The wide wave: heartbeats complete + action links pass 1 + marketing re-tint

Six parallel slices ran the remaining rebrand rounds in one wave:
- **Heartbeats round 4** (finishes law-7 coverage of the daily surfaces):
  Follow-ups completed/wk (completedAt + status='done'); Intake forms
  completed/wk (submittedAt IS completion — no draft state); My Day's
  PERSONAL pulse ("follow-ups you closed", org+user-scoped via
  completedBy, bar variant, warm no-shame voice); Shop paid-orders/wk on
  the Paid-orders tile (test harness sharpened to assert bound drizzle
  Params — substring SQL checks were passing vacuously).
- **Action links pass 1**: platform tiles → customers/invoices/metrics;
  platform attention rows honor service hrefs (self-links skipped); chair
  header counts → today's agenda. Audit: all other scoped surfaces were
  already drillable. Deferred (need service work): platform ActivityRow
  has no href field; three attention hrefs point at the overview itself;
  PMS-demand counts have no drillable surface.
- **Marketing re-tint**: React DreamCreateLogo lockup replaces both teal
  .webp imgs (footer forces white ink via --brand-ink override); CTA glow
  + hero dot-grid + OG accent re-tinted hue-for-hue; fictional clinic-mock
  palette + third-party brand colors deliberately untouched; JSON-LD
  Organization.logo re-pointed to a freshly rendered
  /images/dream-create-logo-blue.png (512px transparent raster of the
  Dream Bubble).
- Plus the logged pipeline-board straggler → v2-card.

Heartbeat coverage is now: Overview (pulse+ring) · My Day · Messages ·
Patients · Follow-ups · Leads · Intake · Growth · Payments · Shop ·
platform cockpit — the living-data law holds on every daily surface.
NEXT: action-links pass 2 (the deferred service-level hrefs), then the
widget-registry groundwork (Overview as a composition, zero visual
change).

## 2026-07-19 (later) — Marketing truth pass: one price + honest screenshots

The marketing site was selling a product it no longer resembled, at prices
Stripe never charged (the 2026-07-02 reprice's Stripe-side step never
happened — code said $150/250/500, live Stripe still $50/150/200). Owner
decision: retire tiers from marketing entirely.
- **One plan**: $500 struck → $200/mo "Founding practice rate" (never the
  word "beta" — a test enforces it); monthly/annual toggle ($2,000/yr = 2
  months free); rate-lock promise; tier matrix → everything-included
  checklist; homepage/docs/comparisons/blog/JSON-LD all single-price.
  ⚠️ IN-APP BILLING STILL THREE-TIER — alignment pending the owner
  creating the $200/$2,000 Stripe prices; then onboarding/billing collapse
  to the single plan (Premium under the hood, gates untouched).
- **Mocks tell the truth**: DashboardMock + chrome mocks restyled to v3
  (sky canvas, floating cards, gradient pills, one sparkline heartbeat);
  BookingMock un-blued to the fictional clinic's sage (it was riding
  teal-* classes — clinic-branded surfaces must not wear our brand);
  PortalMock already correct. Key discovery: the token-ramp re-point
  already recolored every teal-* class in the mocks — the work was
  structural.

## 2026-07-19 (later) — Marketing positioning: identity first

Owner call: "consolidation" demoted from site identity to down-funnel
evidence. Homepage hero/meta/OG now claim the category ("the
patient-relationship platform for dental practices") + the v3 feeling; the
consolidation-math table moved to /compare ("The math, if you're
counting"); new /why manifesto page (6 beliefs, anti-shame voice) added to
nav + MARKETING_PUBLIC_PATHS; tenets section links to it. Doctrine
recorded in DESIGN.md (Positioning 2026-07-19): outbound leads with
savings, the website leads with identity. Blog savings-campaign articles
deferred to an owner/DB session (marketing blog content lives in the DB).

## 2026-07-19 (later) — Mock truth pass 2 + NexHealth trash-talk retired

Owner review of the live homepage: the mocks still undersold the real v3
product. Both rebuilt BY HAND against real screenshots (rendered +
screenshot-verified via a standalone react-dom/server + Tailwind-CLI +
chromium harness): DashboardMock now mirrors the real Overview (correct
post-consolidation sidebar IA w/ pinned cockpit + [D]reamCRM mini-lockup,
white attention CARDS w/ big numbers + action links, chair card w/
confirmed ring, mono trend tiles w/ booking pulse); PortalMock re-executed
at the real portal's polish (floating warm cards, date-chip hero visit
card, membership progress, honest tab bar) keeping the fictional clinic's
sage brand. ALSO: all vendor-shaming about direct-DB sync removed
(NexHealth compare rewritten to scope/terms differences + a genuine
compliment; 'Official APIs only' tenet → 'Audit-clean sync' self-posture;
/why + docs echoes softened) — we may ride NexHealth's Synchronizer soon,
and the copy no longer throws stones at infrastructure we'd be renting.

## 2026-07-20 — Action links pass 2: platform hrefs + module sweep + drill-downs

The deferred service-level items from pass 1, closed: platform attention
items stop self-linking (projects → the pipeline board, signups → the
clinic detail); ActivityRow gained href and every platform feed row opens
its object; the Needs-Attention tile anchors to its list; getPmsDemand
returns WHICH clinics wait (pending-first) behind an expandable row. The
four round-4 modules swept: coupons' patient names → /patients/[id],
intake templates' submission stats → /intake-forms/[id]#submissions (anchor
added); My Day/Followups/Shop were already model citizens. Bonus close:
TopProduct resolves variantId → still-existing productId so Best-seller
rows link to the product editor (deleted products stay plain text). Four
honest dead ends needing new params/routes logged as FINISHING Class 6.

## 2026-07-20 (later) — Class 6 closed the day it opened

All four action-link dead ends resolved: /shop/orders gained a first-class
Unfulfilled view (?fulfillment=unfulfilled) the hub's To-fulfill tile
deep-links; catalog Products/Live tiles ACCEPTED unlinked (▣ — adjacency
is the explanation); new /intake-forms/submissions cross-template index
(anonymous-safe, clinic-tz, never fetches the data jsonb) behind the
Completed heartbeat; /followups gained ?closedBy=me (server-resolved to
ctx.userId, done-only, completedAt-desc — the heartbeat's exact math) with
a "Closed by you" board section, linked from My Day's personal pulse. The
action-links phase is COMPLETE: every dashboard stat opens the view that
explains it, or carries a recorded acceptance. Full suite 5,167 green.
