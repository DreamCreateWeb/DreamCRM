# Insurance eligibility — the go-live runbook

The insurance tool (`/insurance`, the patient record's rail card, ⌘K "Check
insurance") is RELEASED to every clinic as of 2026-10-03 (polish phase 6).
What a clinic sees depends on ONE platform-wide switch pair and ONE box on
their Business profile. This page is the checklist for turning real payer
answers on, and the rules the product enforces either way.

## The three states

| `INSURANCE_DRIVER` / `STEDI_MODE` | Who answers | Label on every result | Billed? |
|---|---|---|---|
| `sandbox` | the built-in deterministic driver | "Practice answer" | no |
| `stedi` / `test` (**prod today**) | Stedi's predefined mock members (Falcon Dent, 1985-06-07, 007007007 — Ameritas) | "Test payer answer" | no |
| `stedi` / `live` | the real payer, X12 270/271 through Stedi | none (a real answer) | **yes, per check, to the Dream Create account** |

`STEDI_MODE` is PLATFORM-WIDE. Live means every clinic's checks reach real
payers and bill Dream Create — there is no per-clinic switch, by design (a
per-clinic knob is a plan tier by another name).

## What the product enforces under the live driver

- **Readiness.** A payer answers a PROVIDER, so a live check needs the
  practice's own NPI (`clinic_profile.npi`, Settings → Business profile) or
  the platform fallback `STEDI_DEFAULT_NPI`. Without one the page parks the
  form behind "Add your practice NPI to start checking" (one button to the
  profile), the rail card offers the same door, and `runEligibilityCheck`
  refuses with `reason: 'npi'` BEFORE any row or any network call
  (`needsPracticeNpi` in lib/insurance-eligibility.ts is the one rule).
- **The included allowance.** `INCLUDED_MONTHLY_INSURANCE_CHECKS = 200`
  billed checks per clinic per clinic-local calendar month
  (env-overridable platform-wide with `INSURANCE_INCLUDED_MONTHLY_CHECKS`).
  `getInsuranceUsage` counts `insurance_verification` rows with
  `driver='stedi'` since `clinicMonthStart`; error rows count (Stedi bills
  the request, not the answer); sandbox and test-mode rows never do. The
  page header says "12 of 200 checks used this month"; at the cap the
  service refuses with `reason: 'over_allowance'` before the payer is
  asked. FAIL-OPEN: an unreadable count is zero used + a hidden counter,
  never a refusal (the SMS budget's law).
- **The demo clinic.** Gets the SAME driver as every org (owner ruling
  2026-10-01) — except where the live driver would only refuse it for a
  missing NPI. Then, and only then, the labelled sandbox answers
  (`effectiveInsuranceDriver`). Set `STEDI_DEFAULT_NPI` or put an NPI on the
  demo's profile to make the demo hit a real payer.

## The clinic's own switch (2026-10-05)

The tool is OFF for a clinic until an owner or admin turns it on from
`/insurance`: the page shows the intro card (what it does, what to know) and
"Enable and set up", which opens the practice-NPI box and "Turn on insurance
checks". Under the live driver the NPI is required to turn on; under the
sandbox and test drivers it is optional. Every clinic starts OFF — 0170
cleared the switch everywhere on the owner's ruling, so even a practice
with test checks on file meets the intro first. Nothing on the checklist
below reaches a clinic that has not turned it on — the record hides the rail card
and the service refuses `not_enabled` first. "Turn off insurance checks" at
the foot of the tool returns the intro; history is kept.

## Going live — the checklist, in order

1. **BAA.** Execute Stedi's BAA (docs/COMPLIANCE.md — a live check sends
   patient name, DOB, member id and the practice NPI; Stedi is a PHI
   subprocessor). Nothing below happens before this.
2. **Card images.** "Scan a card" and the intake OCR send card photos to
   Anthropic's API, which has NO BAA (docs/COMPLIANCE.md, the sharpest gap).
   Decide: accept as today (the posture every intake form already carries),
   or flip `AI_DRIVER=bedrock` to ride the AWS BAA first.
3. **The practice's NPI.** The client types it when they turn the tool on
   (or on Settings → Business profile, the "Practice NPI" box). Verify it
   is 10 digits. Optionally set
   `STEDI_DEFAULT_NPI` as the platform fallback (`--npi` on the script).
4. **The live key.** Mint a LIVE key in the Stedi portal (rotate the one
   shared in chat on 2026-09-30 — CLAUDE.md open item 1). Then, with AWS
   credentials for account 952078552817:
   ```bash
   STEDI_API_KEY=<live key> ./scripts/setup-stedi-aws.sh --mode live --confirm-baa
   ```
   The script refuses `--mode live` without `--confirm-baa`, merges the env
   into App Runner (never replacing the map), and forces a deployment
   (App Runner reads a secret once, at instance start).
5. **One real card, owner present.** On the client's own org, run one check
   on a card you can confirm by phone. The result must carry NO honesty
   pill; the header must read "1 of 200 checks used this month"; the rail
   card on the record must show the same answer.
6. **Watch the first month.** The allowance counter is per clinic; ask on
   the Support thread to raise `INSURANCE_INCLUDED_MONTHLY_CHECKS` if a
   busy practice needs more.

## Rolling back

`./scripts/setup-stedi-aws.sh` with no mode flag returns to test mode on the
stored key; `--driver sandbox` turns payer connectivity off entirely. Stored
rows keep the driver they were answered under, so history stays honest.
