export const metadata = {
  title: 'Communications — DreamCRM',
  description: 'Every outreach email, call, and reply.',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listCommunications, type CommItem } from '@/lib/services/prospecting'
import { prospectInitials } from '@/lib/prospect-when'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'

const KIND_ICON: Record<CommItem['kind'], string> = { email: '✉️', call: '📞', reply: '💬' }
// Avatar tint by kind — replies (a human reaching back) are the warm signal.
const KIND_AVATAR: Record<CommItem['kind'], string> = {
  email: 'bg-sky-500',
  call: 'bg-gray-400',
  reply: 'bg-emerald-500',
}

/** Coarse relative time — no timezone needed, reads well in a feed. */
function ago(at: Date, now: number): string {
  const s = Math.max(0, Math.round((now - at.getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.round(d / 30)}mo ago`
}

export default async function CommunicationsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const items = await listCommunications()
  const now = Date.now()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <PageHeader
        eyebrow="Platform · Sales Pipeline"
        title="Communications"
        subtitle="Every outreach email the hunter sent, every call you logged, and every reply that came back."
        actions={
          <Link href="/platform/prospecting" className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400">
            ‹ Pipeline
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No communications yet"
          body="Once the hunter emails a prospect, you log a call, or a reply lands, it shows up here."
        />
      ) : (
        <>
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            🛰 The feed
          </span>
          <span className="rounded-full bg-[color:var(--color-surface-sunk)] px-2 py-0.5 font-mono-num text-[0.65rem] font-bold text-gray-500 dark:text-gray-400">
            {items.length}
          </span>
        </div>
        <ol className="space-y-2">
          {items.map((c, i) => {
            const place = c.city ? ` · ${c.city}` : ''
            return (
              <li key={`${c.kind}-${c.prospectId}-${i}`}>
                <Link
                  href={c.href}
                  className="flex items-start gap-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-2)] px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-hairline)] transition hover:shadow-[inset_0_0_0_1px_var(--color-hairline),0_1px_6px_rgba(0,0,0,0.06)]"
                >
                  <span
                    className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-xs font-bold text-white ${KIND_AVATAR[c.kind]}`}
                    aria-hidden="true"
                  >
                    {prospectInitials(c.prospectName)}
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-[color:var(--color-surface-2)] px-0.5 text-[0.6rem] leading-none">
                      {KIND_ICON[c.kind]}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {c.prospectName}
                        <span className="font-normal text-gray-400 dark:text-gray-500">{place}</span>
                      </p>
                      <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">{ago(c.at, now)}</span>
                    </div>
                    <p className="truncate text-sm text-gray-600 dark:text-gray-300">{c.title}</p>
                    {c.detail && <p className="truncate text-xs text-gray-400 dark:text-gray-500">{c.detail}</p>}
                  </div>
                </Link>
              </li>
            )
          })}
        </ol>
        </>
      )}
    </div>
  )
}
