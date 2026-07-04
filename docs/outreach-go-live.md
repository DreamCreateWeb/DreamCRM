# Prospecting outreach — go-live runbook

Turning "The Hunter" from dry-run into a live cold-outreach engine, safely.
The engine ships OFF (kill switch on, dry-run on) and sends nothing until a
sending identity exists AND dry-run is flipped off. This is the exact order.

> **Sending domain rule:** outreach NEVER sends from `dreamcreatestudio.com`
> (that domain carries clinic + platform transactional mail; a cold-outreach
> bounce storm must not touch its reputation). Use a **dedicated subdomain of
> a different domain** — e.g. `send.dreamcreateweb.com`.

## 0. Rotate anything that was pasted in chat

Any key that has ever been pasted into a chat/log is compromised. Before
go-live, regenerate and swap:

- **AWS** — IAM → deactivate + delete the old access key → create a fresh one.
- **Google Places** — Cloud console → regenerate the key, and restrict it to
  the **Places API** + your server egress IP.
- **Resend** — delete the old API key → create a fresh one.

Set the fresh values in **Secrets Manager → `dreamcrm/app-secrets`** (console,
never paste them back into chat), then redeploy (secret changes need a
redeploy). Swapping a key later = editing that one value + redeploy.

## 1. Verify the sending subdomain in Resend

1. Resend → **Domains → Add Domain** → enter the subdomain, e.g.
   `send.dreamcreateweb.com`.
2. Resend shows **SPF** (a TXT/MX record), **DKIM** (one or more TXT records),
   and a recommended **DMARC** TXT record.
3. In **name.com DNS for `dreamcreateweb.com`**, add each record scoped to the
   subdomain (name.com wants the host label, e.g. `send` or
   `resend._domainkey.send`). Add a DMARC record at `_dmarc.send` —
   `v=DMARC1; p=none; rua=mailto:dmarc@dreamcreateweb.com` is a safe start.
4. Back in Resend, click **Verify**. DNS can take minutes to hours.

> The account holding this Resend key must ALSO have `dreamcreatestudio.com`
> verified — that's what sends clinic/patient/platform mail. If this key is a
> NEW Resend account, re-verify `dreamcreatestudio.com` there too or all
> transactional email breaks.

## 2. Set the outreach secrets

In `dreamcrm/app-secrets` (values are the FRESH, rotated ones):

| Secret | Value | Notes |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | shared with transactional mail — see §1 warning |
| `GOOGLE_PLACES_API_KEY` | `AIza…` | enrichment (website + rating); enrichment skips Places until set |
| `OUTREACH_EMAIL_FROM` | `Dustin <dustin@send.dreamcreateweb.com>` | the cold-send identity; MUST be the dedicated subdomain, never `dreamcreatestudio.com` |
| `OUTREACH_SENDER_NAME` | `Dustin` | signature name (defaults to `Dustin`) |
| `OUTREACH_REPLY_TO` | `dustin@dreamcreateweb.com` (an inbox you watch) | replies route here even on the Resend path — see §4 |
| `MARKETING_POSTAL_ADDRESS` | your real business mailing address | **CAN-SPAM requires it**; renders in every outreach footer |

Redeploy after saving. The Settings → Prospecting page shows a green
"Configured" pill for the Places key and the sender once they're live.

## 3. Capturing replies (the close half of the loop)

The reply → intent → call-list loop (interested/question → owner alert + AI
draft) closes fully only through a **connected outreach Gmail**:

- Best: connect a Gmail mailbox for outreach and set
  `OUTREACH_GMAIL_ACCOUNT_ID` to its account id. Then outreach sends AS that
  mailbox (Gmail is preferred over Resend when both are set), inbound replies
  are ingested by the Gmail webhook + the outreach cron, and replies flow onto
  the call list automatically.
- Minimum without Gmail: `OUTREACH_REPLY_TO` (§2) points replies at an inbox a
  human watches, so nothing is lost — but they won't auto-appear on the call
  list until the Gmail path is connected.

## 4. Warm up — do NOT skip this

1. Leave the **kill switch ON** and **dry-run ON**. Enrichment + auto-enroll
   (if you turn it on) run in dry-run; sends render to `channel='dry_run'` in
   the sequence logs. Confirm a few touches look right.
2. Enable discovery states in **Settings → Prospecting** so the pipeline
   fills (discovery → enrich → score → contacts).
3. When the domain is verified and the dry-run touches look good, flip
   **dry-run OFF**. The warm-up ramp starts at **20 sends/day**, +10/week, to a
   150/day ceiling. Sends respect prospect-local weekday business hours.
4. The **deliverability watchdog** auto-pauses back to dry-run if the trailing
   72h bounce rate exceeds 5% or complaints exceed 0.3% — leave it ON.

## 5. Optional: self-booking demos

Flip **Settings → Prospecting → Self-booking demos ON** to let interested
prospects pick a demo time at `/d/<token>` (host timezone + window are in the
`booking` config). Booking a demo emails the owner, so it ships OFF. The AI
reply draft then auto-includes the prospect's booking link.

## Quick reference — every outreach env var

| Var | Purpose | Default if unset |
|---|---|---|
| `OUTREACH_EMAIL_FROM` | Resend cold-send From (dedicated subdomain) | dry-run |
| `OUTREACH_GMAIL_ACCOUNT_ID` | send-as + reply-ingest Gmail (preferred) | dry-run / no inbound |
| `OUTREACH_REPLY_TO` | Reply-To for the Resend path | none (no reply routing) |
| `OUTREACH_SENDER_NAME` | signature name | `Dustin` |
| `MARKETING_POSTAL_ADDRESS` | CAN-SPAM footer address | empty (required for compliant sending) |
| `RESEND_API_KEY` | Resend send | send fails |
| `GOOGLE_PLACES_API_KEY` | enrichment | Places enrichment skipped |
