import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { decodeToken } from '@/lib/marketing/tokens'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = decodeToken(token)
  if (!payload || payload.p !== 'u') {
    return htmlResponse('Invalid link', 'This unsubscribe link is invalid or has expired.', 400)
  }

  try {
    // Patient-source unsubscribe: flip the patient's marketingEmailOptIn=0
    // and stamp the opt-out time. We do NOT touch marketingSmsOptIn — SMS
    // opt-out is a separate STOP-keyword flow (Phase B).
    if (payload.pi) {
      await db
        .update(schema.patient)
        .set({
          marketingEmailOptIn: 0,
          marketingEmailOptOutAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.patient.id, payload.pi))
    } else if (payload.i) {
      // Customer-source unsubscribe (SaaS lead pipeline).
      await db
        .update(schema.customers)
        .set({ optedOut: true, updatedAt: new Date() })
        .where(eq(schema.customers.id, payload.i))
    } else {
      // Fall back: match all customers with this email across the same org
      // as the campaign. Best-effort — patient-source rows without payload.pi
      // (e.g. very old tokens) won't be touched here, but the explicit-pi
      // branch above covers all Phase A+ sends.
      const [campaign] = await db
        .select({ orgId: schema.campaigns.organizationId })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, payload.c))
        .limit(1)
      if (campaign?.orgId) {
        await db
          .update(schema.customers)
          .set({ optedOut: true, updatedAt: new Date() })
          .where(
            and(
              eq(schema.customers.organizationId, campaign.orgId),
              eq(schema.customers.email, payload.e),
            ),
          )
        await db
          .update(schema.patient)
          .set({
            marketingEmailOptIn: 0,
            marketingEmailOptOutAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.patient.organizationId, campaign.orgId),
              eq(schema.patient.email, payload.e),
            ),
          )
      }
    }

    await db.insert(schema.campaignEvents).values({
      campaignId: payload.c,
      recipientEmail: payload.e,
      customerId: payload.i ?? null,
      patientId: payload.pi ?? null,
      type: 'unsubscribe',
      meta: { ua: req.headers.get('user-agent') ?? null },
    })
  } catch (err) {
    console.warn('[unsub]', err)
  }

  return htmlResponse(
    'Unsubscribed',
    `${payload.e} will no longer receive marketing emails. You can change your mind any time by replying to a recent message.`,
    200,
  )
}

function htmlResponse(title: string, body: string, status: number) {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:12px;padding:32px 40px;max-width:480px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.04)}
    h1{margin:0 0 12px;font-size:20px;color:#0c0a09}
    p{margin:0;color:#57534e;line-height:1.5}
  </style>
</head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
