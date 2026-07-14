import Link from 'next/link'
import { NavIcon } from '@/components/ui/nav-icons'
import { formatCents } from '@/lib/types/shop'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

/** The Payments workspace doors — same door pattern as the Growth/Website
 *  hubs (icon + live stat + one-line description, hover-lift). */
export default function PaymentsHubDoors({
  collections,
  toReconcile,
  connectReady,
  membershipStats,
}: {
  collections: { patientCount: number; totalOutstandingCents: number }
  toReconcile: number
  connectReady: boolean
  membershipStats: { activeMembers: number; mrrCents: number }
}) {
  const doors: Array<{
    href: string
    icon: string
    title: string
    stat?: string
    statTone?: Tone
    description: string
  }> = [
    {
      href: '/payments/collections',
      icon: 'flag',
      title: 'Collections',
      stat:
        collections.patientCount > 0
          ? `${collections.patientCount} open balance${collections.patientCount === 1 ? '' : 's'} · ${formatCents(collections.totalOutstandingCents)}`
          : 'Nothing outstanding',
      statTone: collections.patientCount > 0 ? 'warn' : 'ok',
      description: 'Every open PMS balance with its dunning state — send pay links, propose plans.',
    },
    {
      href: '/payments/online',
      icon: 'wallet',
      title: 'Online payments',
      stat: connectReady ? (toReconcile > 0 ? `${toReconcile} to reconcile` : 'Connected') : 'Not connected',
      statTone: connectReady ? (toReconcile > 0 ? 'warn' : 'ok') : 'warn',
      description: connectReady
        ? 'Balance payments and booking deposits to post to your PMS.'
        : 'Connect Stripe to take online payments.',
    },
    {
      href: '/payments/memberships',
      icon: 'star',
      title: 'Memberships',
      stat:
        membershipStats.activeMembers > 0
          ? `${membershipStats.activeMembers} active · ${formatCents(membershipStats.mrrCents)}/mo`
          : 'No members yet',
      statTone: membershipStats.activeMembers > 0 ? 'ok' : undefined,
      description: 'In-house dental plans with recurring billing.',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {doors.map((d) => (
        <Link
          key={d.href}
          href={d.href}
          className="v2-card p-4 sm:p-5 block group hover:shadow-[var(--shadow-pop)] transition-shadow"
        >
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-[var(--r-sm)] bg-teal-500/10 text-teal-700 dark:text-teal-300">
              <NavIcon name={d.icon} className="shrink-0 fill-current w-4.5 h-4.5" />
            </span>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:underline underline-offset-4">
              {d.title}
            </h2>
          </div>
          {d.stat && (
            <p className={`text-xs font-medium mb-1 ${d.statTone ? TONE_TEXT[d.statTone] : 'text-gray-600 dark:text-gray-300'}`}>
              {d.stat}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">{d.description}</p>
        </Link>
      ))}
    </div>
  )
}
