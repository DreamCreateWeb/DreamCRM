# DreamCRM — Compliance & data posture

Produced by the R1·S8 sweep (2026-08-17) of the release program. This is the
HONEST posture the owner decides from before the marketing pivot — what we
ARE, what we are NOT, the gap, and the decision. It is not legal advice;
it is an engineering-verified map of where the product actually stands.

**The one protective fact, verified first:** a grep for
"HIPAA"/"compliant"/"SOC"/"bank-level"/"secure patient data" across the whole
marketing site (`app/(marketing)/`) and app UI returns **zero product-level
compliance claims.** The only "HIPAA" strings are a clinic's own patient-facing
Notice-of-Privacy-Practices intake field and internal guardrails telling the AI
not to leak PHI into public review replies. **DreamCRM makes no compliance
claim today** — that is precisely what keeps the HIPAA gap below out of
launch-blocking territory *for now*, and what a single line of marketing copy
would undo.

---

## 1. TCPA / SMS consent — STRONG

**What we are:** a genuinely well-built consent spine.
- Prior express written consent is required and recorded before any marketing
  text. `recordSmsOptIn` (the ONLY writer of `marketingSmsOptIn=1`) stamps the
  timestamp AND the source (booking/intake/portal/staff/keyword) — proof of
  *when* and *from what artifact*. The disclosure names the sender, states
  texting is not a condition of care, gives frequency + rates, names STOP/HELP;
  the checkbox is never pre-ticked.
- The marketing/transactional line is drawn correctly: marketing sends as AWS
  `PROMOTIONAL` and requires opt-in; reminders send as `TRANSACTIONAL` on the
  business relationship. A STOP even silences transactional reminders
  (number-level), which is more conservative than required.
- Opt-out is immediate + permanent; only START (or staff-on-record) clears it;
  a re-ticked booking box does NOT resubscribe a standing opt-out.

**What we are NOT:** live — no clinic has completed A2P registration, so no
marketing text has ever sent in production (the AWS field paths are unproven
but fail visibly). Consent proof is a single mutable row, not an immutable
consent-event log tied to the disclosure version shown.

**Decision:** none blocking. Post-1.0, consider an append-only consent log if
you ever need to defend a specific opt-in's wording in a dispute.

## 2. CAN-SPAM (email) — SOLID

**What we are:** compliant on the hardened Resend path. The sending clinic's
own postal address is in every marketing footer (and `sendCampaign` REFUSES to
send a real campaign with no address — fail-closed). One-click unsubscribe is
real: RFC-8058 `List-Unsubscribe`/`-Post` headers + footer link share the same
token; `/api/unsub/[token]` flips `marketingEmailOptIn=0`, and the audience
resolver + send-time check both drop unsubscribed patients — verified end to
end. Transactional mail correctly carries no unsubscribe.

**Gaps (minor):** the Gmail warm-send channel can't carry the RFC-8058 header
(body link only — acceptable for the one-by-one path). Legacy unsub tokens use
a best-effort email match.

**Decision:** none. Posture is solid.

## 3. HIPAA posture — THE POSITIONING CALL (the real risk)

Dental patient data here is PHI by definition: "this person is a dental
patient" + names, contact, appointments, insurance member IDs, balances, and
intake answers (allergies, medications, conditions). Intake forms and
insurance-card OCR are live, so **the product collects PHI by design.**

### BAA status per PHI-touching subprocessor

| Subprocessor | Handles | BAA status |
|---|---|---|
| AWS (RDS/S3/SES/SMS) | all stored PHI + SMS | BAA **available** (SMS falls under the AWS BAA per the SMS eval doc). **Not confirmed executed** for the account in any doc. |
| **Anthropic (direct API)** | **intake answers, insurance-card images, message drafts, translations** | **NO BAA.** `AI_DRIVER=anthropic` is live; the Bedrock driver that would ride the AWS BAA is inert. **The sharpest gap.** |
| Resend | patient emails (a reminder reveals patient status) | Unconfirmed; historically no BAA on standard plans. Treat as no-BAA until proven. |
| NexHealth | full patient sync | Healthcare-purpose; signs BAAs. **Likely covered — confirm/execute.** |
| Stripe | payment/balance context | PCI; payment data alone usually not PHI. Lower risk. |
| Zernio | GBP/social (reviews may contain PHI) | Business data mostly; lower risk. Confirm. |

### What PHI actually flows to the AI (verified in code)
- `intake-summary.ts` sends the patient's real intake transcript (the prompt
  extracts allergies, blood thinners, heart conditions, diabetes, pregnancy…)
  to Anthropic.
- `insurance-ocr.ts` sends images of the patient's insurance card (member ID,
  subscriber name) to Anthropic vision.
- Message drafts + form translation also pass patient text.
- Terms: Anthropic direct API, **no BAA**, standard commercial terms. Real PHI
  leaves to a subprocessor with no HIPAA agreement.

### Encryption
RDS encrypted at rest (deletion protection on); TLS in transit over the VPC
connector; HTTPS at the edge. **Verify S3 SSE is enabled on
`dreamcrm-uploads-prod`** (RDS is documented; S3 is not).

### The decision, framed honestly
To sell to a dental practice without misrepresentation, become **BAA-ready**:
1. Execute the AWS BAA (and use only HIPAA-eligible services).
2. **Resolve the AI path** — flip `AI_DRIVER=bedrock` (the already-scaffolded
   "single-BAA move" that collapses AI under the AWS BAA) OR sign an Anthropic
   BAA / zero-data-retention agreement. **Highest-leverage single move.**
3. Move patient email to SES under the AWS BAA (or sign a Resend BAA).
4. Confirm/execute the NexHealth BAA.
5. Write the customer-facing legal pages (Privacy Policy, ToS, DPA, offered
   BAA) — none exist for dreamcreatestudio.com today.

**Until AWS + AI + email BAAs are executed, put NO "HIPAA"/"compliant"/
"secure patient data" language in any marketing or UI copy.** The gap is
S2 *only because no claim is made*; any compliance representation (marketing
copy, or signing a customer BAA/DPA that names subprocessors) flips the
Anthropic-no-BAA reality to a live misrepresentation (S1).

## 4. Data export / deletion (data-subject rights)

**What we are:** clinic data export is self-serve (patients + leads CSV);
tenant deletion exists (`deleteClinicAction`, slug-confirmed, FK-cascade +
Stripe cancel) — genuine offboarding/erasure at the tenant level.

**Gaps:** **no patient-level deletion (right to erasure)** — staff can delete a
patient's notes/documents/tags/follow-ups and merge patients, but cannot delete
a patient record on request. Export is partial (patients/leads only — not
messages, forms, appointments, documents, billing). The trial-KILL's "nothing
is deleted; paying revives" is billing suspension, NOT a retention/deletion
policy — don't conflate.

**Decision:** decide whether patient right-to-erasure is a launch requirement
(for a dental practice it is a realistic support request). Minimum: a
documented manual process; ideal: a `deletePatient` action with the same
cascade discipline as `deleteClinicAction`.

## 5. Retention & PII in logs

**What we are / are not:** no data-retention policy or expiry — patient data
lives indefinitely until a manual org delete. PII-in-logs is mostly clean
(inbound-sms logs only the last 4 phone digits), but a few paths log full email
addresses to CloudWatch (`lib/email.ts` `msg.to`; `lib/services/mailbox.ts`);
an email tied to "dental patient" context is arguably PHI. Low volume, 30-day
retention.

**Decision:** adopt a written retention policy (even "life of account + N days
after offboarding"); scrub/hash the handful of email-logging paths before scale.

---

## Findings ledger (the S8 rubric)

**S1 — none today.** No false compliance claim exists; opt-out/unsub both
verified to suppress. The Anthropic-no-BAA item flips to S1 the instant any
HIPAA/compliance representation is made.

**S2 (missing-but-not-claimed / consent-proof gaps):**
1. PHI flows to Anthropic with no BAA (headline; escalates to S1 on any claim).
2. AWS BAA not confirmed executed for the account.
3. Resend receives patient PHI, BAA unconfirmed/unlikely (consider SES).
4. No platform Privacy Policy / ToS / DPA / customer BAA for the marketing site.
5. No patient-level deletion (right to erasure).
6. No data-retention policy; full-tenant export is partial.
7. SMS consent proof is a single mutable timestamp, not an immutable event log.

**S3 (documentation / polish):**
8. Full email addresses in a few CloudWatch log paths.
9. NexHealth/Zernio/Stripe BAA status undocumented — confirm and file.
10. Gmail warm-send can't carry RFC-8058 header (document it).
11. S3 bucket encryption-at-rest not explicitly documented (verify SSE).
12. `docs/sms-provider-evaluation.md` recommendation section is stale (owner
    reversed Twilio→AWS; AWS is the better BAA outcome — a doc fix).

---

## Bottom line for the owner

The consent and anti-spam machinery (TCPA, CAN-SPAM) is genuinely strong and
verified — not where the risk is. The risk is entirely the **HIPAA
subprocessor posture**, contained today only by the fact that you make no
compliance claims. The moment you market to a dental practice you'll be
expected to offer a BAA/DPA and name subprocessors — at which point the
Anthropic-no-BAA reality becomes a live misrepresentation. Cheapest path to
closing it: the **Bedrock flip** (AI under the AWS BAA), execute the AWS BAA,
move patient email to SES, confirm NexHealth, and write the legal pages.
Patient-level deletion and a retention policy are the secondary must-haves
before a real clinic with real patients onboards.
