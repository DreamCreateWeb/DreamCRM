# Intake Forms overhaul — research + plan

Status: **10 of 11 phases SHIPPED** (1A field types · 2A conditional logic · 3A
insurance-card OCR · 2C return-visit pre-fill · 3B AI pre-visit summary · 4A
honest OD mirror · 2B smart auto-send · 4B Spanish · 1B forms-completion
reminders). **Deferred:** 2D form packets (a multi-form bundle/flow — lower
value because DreamCRM's single comprehensive default template already covers
intake+insurance+medical+consent in one form; build if a clinic wants split
forms). Grounded in a deep-research pass on NexHealth (the
category leader for dental digital forms) + the competitive set (Modento/Dental
Intelligence, RevenueWell, Weave, Adit, Yapi, Dentrix Ascend, Open Dental
eForms). This doc is the durable reference for the multi-PR build; CLAUDE.md is
updated as phases ship.

## Why overhaul

DreamCRM's Intake Forms v1 is solid (templates with sections, drag-reorder
builder, the field types text/textarea/email/tel/date/select/radio/checkbox/
yes_no/signature, required+help+placeholder, e-signature, public no-login fill,
booking-confirmation send, default template, submissions on the patient
timeline, the 📝! missing-intake glyph). But against best-in-class it's missing
file/photo upload, insurance-card capture, conditional logic, rules-based
auto-send, completion-status triage + reminders, return-visit pre-fill, kiosk
mode, Spanish, and any PMS chart mirror.

## What the research established (high-confidence, mostly from NexHealth's own
## Help Center + API docs)

- **~17 builder components** incl. file upload, address (Google autocomplete),
  signature, **insurance**, payment; **conditional logic**; per-field required/
  validation; layout blocks (content/columns/panel/logo). Template library
  (intake / medical history / HIPAA / **insurance verification w/ card photos**)
  + self-serve "digitize my PDF".
- **Smart auto-send rules** by appointment type / procedure / new-vs-returning /
  age / **recurrence (medical history every 12 months)**; a completion dashboard
  with 1-click reminder nudges.
- **Patient UX**: SMS/email after appointment confirmation, no app/login, any
  device, **iPad kiosk** mode, auto-reminders for outstanding forms,
  **returning patients get pre-filled medical history**, **Spanish**.

### The write-back truth (our wedge)

NexHealth markets "data auto-syncs to your chart, no manual entry," but their
own docs admit it's a **leaky hybrid**:
- Structured write-back is a **narrow fixed set** (name/address/email/DOB/phone +
  medical *alerts* chosen from dropdowns). Everything else is a **PDF in the
  document center**.
- **Typed** free-text allergies/meds/conditions often **live only on the PDF**
  (eCW/athena/Cloud9); Dentrix Ascend/Denticon **never sync meds**; Eaglesoft
  med-history fields **can't be edited** in NexHealth.
- **Insurance/eligibility = PDF only** (no structured insurance fields written).
- Sync **fails often enough to ship a manual-recovery flow** ("Sync failed" →
  download PDF → manual upload → "Mark as synced").
- Mechanically it's a **local Windows agent** or a **Chrome extension on every
  workstation** — the DB-adjacent access Open Dental warns about.

**DreamCRM's structural advantage:** the submission lands **natively on the
patient record** — no re-keying, no "lives only in a PDF" failure mode, because
the CRM *is* the record. Our Open Dental path is the **official API** (audit-
clean), the opposite of NexHealth's DB-bypass reputation. So our OD mirror is an
honest *"a copy in your PMS chart"* nicety, never a claim of deep structured
field sync.

### Table stakes vs differentiators vs white-space

- **Table stakes**: pre-visit send by text/email, no-login any-device fill,
  template library + drag builder, **kiosk/iPad**, e-signature, **insurance/ID
  photo capture**, HIPAA, automatic import into the record.
- **Differentiators** (only a few): conditional/skip logic; in-chart clinical
  alerts on submitted allergies/meds; rules-based auto-send; recurring/annual
  update cadence; Spanish; pre-fill from prior submission.
- **Open white-space (nobody in dental does it well)**: **insurance-card OCR
  auto-fill** (everyone only stores the image) and **AI medical-history
  flagging**. These are our headline bets — we already have Claude + the upload
  path.

### Pitfalls to avoid (straight from user complaints)

1. **Invisible completion status** — the #1 forms complaint ("staff couldn't
   tell if forms were done before the visit"). → Make status impossible to miss.
2. **Partial write-back that silently drops typed data.** → Native record +
   honest mirror; never drop data.
3. **Rigid editing** ("trouble making corrections"). → Flexible builder + edit.
4. **Reminders fire for cancelled appointments.** → Tie reminders to live
   appointment state.

## Plan (decided: full build — Phases 1–4; card OCR = build it; native record +
## honest OD mirror)

### Phase 1 — table stakes + the #1 pitfall fix
- New field types: **file/photo upload**, **insurance-card capture (front/back)**
  (reuse hardened `/api/upload` → S3 + `uploadFileWithProgress`), **number**,
  **address**, **content/instructions** (static, no input). Extend
  `FormFieldValue` for uploads (a `{url,name,contentType}[]` shape, reuse
  `sanitizeAttachments` discipline).
- **Completion-status triage + reminders** tied to live appointment state
  (per-appointment ✅/⏳ that's impossible to miss; reuses the reminders cron +
  the scheduled/after-hours infra). Fixes pitfalls #1 + #4.
- Builder v2 polish + live preview + submission detail/review.

### Phase 2 — smart
- **Conditional logic** (`visibleWhen` rule → show/hide field/section), evaluated
  in both the preview and the public/portal renderer.
- **Smart auto-send rules** (new-vs-returning, appointment type, **annual
  medical-history refresh**).
- **Return-visit pre-fill** — finish the `systemKey` scaffold (patient confirms/
  updates last answers; we own the data → we beat everyone here).
- **Form packets** (bundle several forms into one patient flow).

### Phase 3 — AI differentiators (Anthropic wired; metered via `ai_usage_counter`)
- **Insurance-card OCR auto-fill** — photograph card → Claude vision extracts
  carrier/member-ID/group → pre-fills, patient confirms ("we read what we can").
  *Confirm `runClaudeJson` accepts image content blocks; extend the wrapper if
  it's text-only.*
- **AI pre-visit summary + alerts** — on submit, summarize allergies/meds/
  conditions/anxiety onto the patient record + appointment so the provider sees
  flags.

### Phase 4 — honest reach
- **Open Dental chart mirror** — push the completed form as a PDF/structured note
  via the official API (`pms_write_op` queue, Documents/CommLog), framed honestly
  as "a copy in your PMS chart." Never claim deep structured field sync.
- **Spanish** public/portal fill.

## Architecture notes (from the code-surface map)

Adding a field type threads through, in order: (1) `FormFieldType` union +
`FormField` variant in `lib/types/forms.ts`; (2) builder `newField()` default;
(3) `FieldRow` editor conditionals (`app/(default)/intake-forms/[id]/
form-builder.tsx`); (4) preview `PreviewControl` switch (`form-preview.tsx`);
(5) public `FieldInput` switch (`app/site/[slug]/intake/[formSlug]/
intake-form-runner.tsx`); (6) `firstMissingRequiredField` if empty-semantics
differ; (7) tests. The submission `data` jsonb is `{ [fieldId]: FormFieldValue }`.
`form_submission` already carries `patientId` + `appointmentId` (appointment link
is scaffolded for completion-tracking + prefill). `seedDefaultIntakeForm` is
idempotent on slug; demo seeds 5 persona submissions (persona [1] intentionally
missing → 📝! glyph). Honor the "no fake content" rule each phase: real wiring +
demo seed + self-heal + tests.
