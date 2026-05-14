import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { getClinicBillingContext } from '@/lib/billing/context'

export async function GET() {
  try {
    const ctx = await getClinicBillingContext()
    if (!ctx) return NextResponse.json({ invoices: [] })

    const invoices = await stripe.invoices.list({
      customer: ctx.customerId,
      limit: 24,
      expand: ['data.subscription'],
    })

    const formatted = invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      amount: (inv.amount_paid / 100).toFixed(2),
      currency: inv.currency.toUpperCase(),
      status: inv.status,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      hostedUrl: inv.hosted_invoice_url,
      pdfUrl: inv.invoice_pdf,
      description: inv.lines.data[0]?.description ?? '',
    }))

    return NextResponse.json({ invoices: formatted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
