# Inbound email replies → /messages (Tier-1)

Patient replies to Tier-1 clinic email (`"{Clinic}" <slug@dreamcreatestudio.com>`)
historically went to the clinic's own inbox (Reply-To = their office email) —
outside DreamCRM. This path routes them into the patient's `/messages` thread
instead (unread badge + staff bell + realtime, same as portal messages).

## How it works

1. `INBOUND_REPLY_DOMAIN` (e.g. `in.dreamcreatestudio.com`) flips Tier-1
   Reply-To to `{slug}@{INBOUND_REPLY_DOMAIN}` (`lib/services/clinic-sender.ts`
   → `inboundReplyAddress`). Unset = old behavior; the feature ships dark.
2. Resend Inbound receives mail for that domain (MX record) and POSTs an
   `email.received` event to the existing svix-signed webhook
   `/api/webhooks/resend`.
3. `lib/services/inbound-reply.ts` routes it:
   - recipient slug → org; sender email → patient (org-scoped, not merged) →
     `recordInboundMessage` (channel `email`, quoted history stripped,
     Resend `email_id` as `externalId` so svix replays are no-ops);
   - unknown sender → the email is **forwarded to the clinic's own inbox**
     (nothing is ever silently dropped);
   - wrong domain / unknown slug / unconfigured → ignored.
4. Pure parsing/heuristics (recipient slug, quoted-reply stripping, defensive
   payload normalization) live in `lib/inbound-email.ts` with tests in
   `tests/messaging/`.

Gmail **Tier-2** senders are untouched: the Gmail transport ignores Reply-To,
replies go to the clinic's Gmail and loop back through the mailbox sync as
before.

## Turning it on (owner runbook — one-time)

1. **Resend dashboard** → Domains → add `in.dreamcreatestudio.com` as an
   **inbound** domain (Resend shows the MX target to use).
2. **name.com DNS** → add the MX record for `in.dreamcreatestudio.com` exactly
   as Resend specifies (priority + host).
3. **Resend dashboard** → Webhooks → make sure the existing endpoint
   `https://www.dreamcreatestudio.com/api/webhooks/resend` is subscribed to
   `email.received` (it already receives the delivery/bounce events).
4. **Secrets Manager** (`dreamcrm/app-secrets`) → add
   `INBOUND_REPLY_DOMAIN=in.dreamcreatestudio.com`, then redeploy (secret
   changes need a redeploy).
5. Verify: send any automated email to a patient with a real inbox (or
   yourself), reply to it, and watch the reply land in `/messages` with a bell.

Rollback = remove the env var and redeploy; Reply-To reverts to the clinic's
own inbox instantly. The MX record can stay.

## Email delivery receipts (same webhook — shipped 2026-07-14)

Staff→patient thread emails now carry a `patientMessageId` Resend tag; the
same `/api/webhooks/resend` endpoint turns delivery events into thread
receipts:

- `email.delivered` → the bubble shows **Delivered ✓**
- `email.opened` → **Opened ✓✓** (requires **open tracking enabled for the
  sending domain** in Resend → Domains — a dashboard toggle)
- `email.bounced` / `email.complained` → a red **⚠ Not delivered** receipt
  + ONE staff bell ("Your message to {patient} didn't get through") so the
  front desk re-reaches the patient another way

One-time dashboard step (do it in the same visit as the inbound setup):
make sure the webhook endpoint is subscribed to `email.delivered`,
`email.opened`, `email.bounced`, `email.complained` (bounce/complaint are
likely already on for campaign suppression), and flip on **open tracking**
for `dreamcreatestudio.com`. Gmail Tier-2 sends have no Resend events —
those bubbles honestly stay at "Sent".
