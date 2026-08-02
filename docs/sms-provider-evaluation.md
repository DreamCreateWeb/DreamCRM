# SMS provider evaluation — AWS End User Messaging vs Twilio

**Status:** decision document for Phase 5 limb 3 (SMS). Written 2026-08-02.
**Recommendation: Twilio**, with one named risk to close first (the BAA edition).
**Gate:** no provider-specific code ships until the owner accepts or overrides
this.

---

## Why this document exists

`CLAUDE.md` has named **AWS End User Messaging** as the SMS plan since Phase A,
but every schema stub is `twilio_*`-named (`clinic_sms_config.twilio_phone_number`,
`a2p_brand_sid`, the `'twilio_sms'` channel enum value). That contradiction has
sat unresolved for months because nothing consumed either. The moment we write
provisioning code it stops being cosmetic, so it gets settled here.

The owner's constraints, already decided:

1. **Local 10DLC, one number per clinic** — not toll-free, not a shared number.
2. **Full self-serve provisioning** — the clinic supplies its details once and
   the machine does the rest. Explicitly chosen over concierge registration.

Constraint 2 turns out to be the decisive one, for reasons that were not
obvious before the research.

---

## The regulatory shape (applies to both providers)

Registration happens at two levels, and **neither of them is the phone number**:

| Level | What it is | Registered? |
|---|---|---|
| **Brand** | the business — legal name, EIN, address, an authorised contact | ✅ once per business |
| **Campaign** | the use case ("appointment reminders", "marketing") | ✅ once per use case |
| **Number** | the 10-digit line | ❌ *attached* to an approved campaign |

Consequences that shape our design:

- A second number for a clinic is an API call, not paperwork.
- Each clinic is a separate legal business, so **each clinic needs its own
  brand**. There is no way around this and no version of it we can absorb.
- **One shared platform number is prohibited.** Carriers class it as
  shared-originator / snowshoe traffic. Twilio's ISV documentation is explicit
  that mixing customers on shared infrastructure means "if one customer sends
  noncompliant traffic, Twilio may need to suspend the primary Account" — one
  bad clinic silences every clinic. It is also wrong for patients: the text
  would not come from their dentist's number, and `STOP` would opt them out of
  an ambiguous set of businesses.
- Since **February 2025** unregistered A2P traffic is **blocked outright**, not
  throttled. There is no degraded mode to ship in the meantime.
- AWS adds an ISV-specific rule worth designing around: **the brand contact
  email must be on the end-brand's own domain**, not the platform's. So we must
  collect a real `@theclinic.com` contact, not use ours.

---

## Head to head

### Time from clinic signup to first text — the decisive column

AWS publishes its expected durations. They are the single most important number
in this document, because they are the clinic's onboarding experience:

| Step | AWS (US business) |
|---|---|
| Register brand / company | 1–2 business days |
| Apply for vetting | 1–2 business days |
| **Register campaign** | **up to 4 weeks** |
| **Request the 10DLC number** | **up to 10 days** |
| **Associate number → campaign** | **~14 days** |

Worst case that is roughly **seven to eight weeks**. A clinic that signs up in
August cannot text a patient until October. Twilio's equivalent flow is
routinely **hours to a few days** (brand approval is typically near-immediate
for a Low Volume Standard brand; campaign approval is the slow step and is
measured in days, not weeks).

We are selling a product whose pitch is that it does the work for you. Seven
weeks of "your texting is still pending" is not a thing the Guardian can
narrate its way out of.

### Can we actually build self-serve provisioning on it?

**Twilio: yes, unambiguously.** The entire flow is REST, no console, in a
documented order:

```
Secondary Customer Profile  (TrustHub)
  → EndUser: business information
  → EndUser: authorised representative
  → Address (Core API)
  → SupportingDocument (wraps the address)
  → CustomerProfile entity assignments
  → Brand Registration      (→ The Campaign Registry)
  → Campaign / use case
  → Messaging Service → attach phone numbers
```

Approval status arrives by **`status_callback` webhook**, so we do not have to
poll — though we will poll anyway as a backstop, the way `custom-domain.ts`
does.

**AWS: unclear, and the documentation leans console.** AWS does have an ISV
story — there is a dedicated *SMS Onboarding for SaaS, ISV, and Multi-Tenant
Applications* guide, and it presents six architectural models. But it names **no
concrete API actions** for brand or campaign registration, and it says the
provider "manages the complexity of registration and configuration through the
console" and "the Provider must enter the information." For a platform that has
chosen full self-serve provisioning, that is the wrong shape: we would be
building a form whose submit button is a human being.

This may be under-documented rather than genuinely absent. But we cannot plan a
slice against a maybe.

### Cost per clinic

| | AWS End User Messaging | Twilio |
|---|---|---|
| Brand registration | $4.50 one-time | $4.50 one-time (Low Volume Standard) |
| Brand vetting | $41.50 one-time (optional) · $200/yr for full brand vetting | not required for Low Volume Standard |
| Campaign | **$2/mo** low-volume · $10/mo regular | **$15/mo** (also $15 at approval) |
| Phone number | $1/mo | ~$1.15/mo |
| **Recurring per clinic** | **≈ $3/mo** | **≈ $16/mo** |

**AWS is roughly 5× cheaper per clinic, and this is the one column it wins
decisively.** At 200 clinics that is ~$600/mo vs ~$3,200/mo — real money.

One caveat that narrows the gap: Twilio's **Starter Brand** tier targets exactly
our customer shape (under 3,000 daily segments, five or fewer numbers — a dental
practice is nowhere near either ceiling) and **Twilio covers the registration
and monthly campaign fees**. If clinics qualify, Twilio's recurring cost falls
to about the number rental alone and the gap largely closes. *This needs
confirming with Twilio for our specific use case before it can be banked.*

### Throughput

Not a real differentiator at our volume, but worth recording:

- **AWS:** each number defaults to **1 message part per second**, and — a trap —
  brand vetting alone does **not** raise it. You must file a separate AWS Support
  case for a sending-rate increase. Unvetted brands get 75 parts/min to AT&T and
  2,000 messages/day to T-Mobile, shared across all campaigns for that brand.
- **Twilio:** Low Volume Mixed use cases also cap around 2,000 segments/day to
  T-Mobile with lower MPS.

A single dental practice sending reminders and a weekly recall will not approach
either. Both are fine.

### HIPAA / BAA — the one place AWS is genuinely ahead

This matters more than usual for us: "this person is a dental patient" is PHI,
so an appointment reminder is PHI whatever its wording. A BAA is not optional.

- **AWS End User Messaging** falls under the **existing AWS BAA**. We already run
  on AWS. No new vendor agreement, no edition upgrade, no sales conversation.
- **Twilio** does sign a BAA and Programmable Messaging (SMS/MMS) *is* a
  HIPAA-eligible product — but **the BAA requires Security Edition or Enterprise
  Edition**, it is **not self-service**, and it goes through Twilio sales.

**This is the one finding that could overturn the recommendation.** If Security
Edition carries a meaningful platform fee, it lands on top of the already-higher
per-clinic cost and the calculus changes.

### Operational fit

- **AWS:** one account, one bill, one BAA, the same Secrets Manager and VPC, and
  the same IAM posture as everything else we run. Genuinely simpler to operate.
- **Twilio:** a second vendor, a second bill, a second set of credentials — but
  **subaccount-per-clinic isolation**, which is the structural answer to "one
  clinic's bad traffic must not take down the others." AWS's isolation story
  across models 2–5 is not clearly documented.

---

## Recommendation

**Twilio**, because the owner chose full self-serve provisioning and a
days-not-weeks onboarding, and Twilio is the only one of the two that
demonstrably supports both. AWS wins on cost and on the BAA, and loses on the
two things that were actually specified.

Put plainly: AWS is the better back end for a platform that will register
clinics by hand, and Twilio is the better back end for a platform that will
register them automatically. We chose automatically.

### Before any provider-specific code

1. **Confirm the Twilio BAA path and its cost.** Security/Enterprise Edition
   pricing, via Twilio sales. If it is prohibitive, this document should be
   re-opened — the AWS path plus concierge registration for the first N clinics
   becomes the better trade, and that is a legitimate answer.
2. **Confirm Starter Brand eligibility** for a dental-practice reminder +
   recall use case. It is the difference between ~$16/mo and ~$1/mo per clinic.
3. Confirm campaign approval times for a **healthcare** use case specifically —
   healthcare campaigns can attract extra scrutiny.

### Naming

Settle the contradiction in favour of the schema: keep the `twilio_*` column
names. They are already migrated to production, they will now be accurate, and
renaming columns nothing has ever read is churn for its own sake.

**Correct instead the two places that assert AWS** — `CLAUDE.md`'s stack section
and Phase B item, and the integration catalog entry in
`lib/integrations/catalog.ts` (which currently describes AWS End User Messaging
to the user). `.env.example`'s SMS section, which declares no variable names at
all, gets the real Twilio ones.

### Driver shape

Follow the house pattern, not a new abstraction. `lib/email.ts` has
`emailDriver(): 'ses' | 'resend'` and `lib/services/custom-domain.ts` has
`customDomainDriver(): 'apprunner' | 'cloudfront'` — both bare env-switched
functions with inline branching. Add `smsDriver(): 'twilio' | 'aws'` in the same
shape and leave the AWS branch throwing "not wired", exactly as the SES and
Bedrock drivers sit inert today. That keeps the door open at the cost of one
`if`, and an `SmsProvider` interface would be speculative generality that
CLAUDE.md's "wire logic into the existing system" rule argues against.

`lib/services/custom-domain.ts` is the structural precedent for the whole limb:
collect input → call an external API → poll status → surface pending/failed → a
cron drives it.

---

## Sources

- [Twilio — ISV A2P 10DLC onboarding overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv)
- [Twilio — ISV Standard / Low-Volume Standard onboarding via API](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api)
- [Twilio — Starter Brands API for ISV customer registration](https://www.twilio.com/en-us/changelog/starter-brands-api-now-available-for-a2p-10dlc-registration-of-i)
- [Twilio — A2P 10DLC pricing and fees](https://support.twilio.com/hc/en-us/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service)
- [Twilio and HIPAA](https://www.twilio.com/en-us/hipaa)
- [AWS — United States 10DLC registration (timings, throughput)](https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-10dlc.html)
- [AWS — SMS onboarding for SaaS, ISV and multi-tenant applications](https://aws.amazon.com/blogs/messaging-and-targeting/sms-onboarding-for-saas-isv-and-multi-tenant-applications-with-aws-end-user-messaging/)
- [AWS End User Messaging pricing](https://aws.amazon.com/end-user-messaging/pricing/)
- [US carrier penalties for non-compliant messaging](https://support.callhub.io/hc/en-us/articles/4552724225817-US-Carrier-Penalties-for-non-compliance-of-10DLC-messaging)
