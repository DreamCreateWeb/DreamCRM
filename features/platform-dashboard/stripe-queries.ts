import { stripe } from '@/lib/stripe'

export interface MonthPoint { month: string; value: number }

export interface StripeInvoice {
  id: string
  number: string | null
  clinicName: string
  amount: number
  status: string
  created: Date
  hostedUrl: string | null
}

function lastNMonths(n: number): string[] {
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export async function getStripeMRR(): Promise<number> {
  try {
    const subs = await stripe.subscriptions.list({ status: 'active', limit: 100 })
    let mrr = 0
    for (const sub of subs.data) {
      for (const item of sub.items.data) {
        const amount = (item.quantity ?? 1) * (item.price.unit_amount ?? 0)
        if (item.price.recurring?.interval === 'month') mrr += amount / 100
        else if (item.price.recurring?.interval === 'year') mrr += amount / 100 / 12
      }
    }
    return mrr
  } catch {
    return 0
  }
}

export async function getMonthlyRevenue(numMonths = 6): Promise<MonthPoint[]> {
  try {
    const since = new Date()
    since.setMonth(since.getMonth() - numMonths)
    since.setDate(1)

    const invoices = await stripe.invoices.list({
      status: 'paid',
      created: { gte: Math.floor(since.getTime() / 1000) },
      limit: 100,
    })

    const byMonth: Record<string, number> = {}
    for (const inv of invoices.data) {
      const d = new Date(inv.created * 1000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      byMonth[key] = (byMonth[key] ?? 0) + inv.amount_paid / 100
    }
    return lastNMonths(numMonths).map(m => ({ month: m, value: byMonth[m] ?? 0 }))
  } catch {
    return lastNMonths(numMonths).map(m => ({ month: m, value: 0 }))
  }
}

export async function getRecentInvoices(limit = 15): Promise<StripeInvoice[]> {
  try {
    const invoices = await stripe.invoices.list({ limit, expand: ['data.customer'] })
    return invoices.data.map(inv => {
      const cust = inv.customer as { name?: string | null; email?: string | null } | null
      return {
        id: inv.id,
        number: inv.number,
        clinicName: cust?.name ?? cust?.email ?? 'Unknown',
        amount: (inv.amount_paid || inv.amount_due) / 100,
        status: inv.status ?? 'unknown',
        created: new Date(inv.created * 1000),
        hostedUrl: inv.hosted_invoice_url ?? null,
      }
    })
  } catch {
    return []
  }
}
