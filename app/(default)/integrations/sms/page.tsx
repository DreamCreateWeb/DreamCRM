import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getSmsRegistration, smsDriver } from '@/lib/services/sms-registration'
import { getSmsUsage } from '@/lib/sms'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { BrandLogo } from '@/components/integrations/brand-logos'
import { formatPhone } from '@/lib/phone'
import RegistrationPanel from './registration-panel'

export const metadata = {
  title: 'Text messaging - Integrations - DreamCRM',
  description:
    'Set up texting from your practice’s own number — reminders, recall, and patient replies.',
}

export const dynamic = 'force-dynamic'

/**
 * SMS detail page (Phase 5 limb 3, slice 2b). The doctrine's shape: the
 * clinic answers ONE form (EIN, business type, a contact at their own
 * domain), and everything after is the machine's job — register the brand,
 * register the campaign, buy the number, poll the carriers, report. No
 * wizard, no checklist, no console.
 *
 * DARK BUILD: with SMS_DRIVER unset this page renders the honest
 * coming-soon posture (the same sentence the marketing site makes), so the
 * route can ship before the driver goes live.
 */
export default async function SmsDetailPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  const live = smsDriver() !== 'none'
  const registration = live ? await getSmsRegistration(ctx.organizationId) : null
  // Usage honesty (ruling #10): texting is included with a monthly segment
  // budget, so the surface says where the month stands. Only meaningful once
  // approved; best-effort (a failed read hides the line, never the page).
  const usage =
    registration?.state === 'approved'
      ? await getSmsUsage(ctx.organizationId).catch(() => null)
      : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-4">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All integrations
        </Link>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <BrandLogo id="sms" size={44} />
        <div>
          <PageHeader
            title="Text messaging"
            subtitle="Reminders, recall, and patient replies — from your practice’s own number."
          />
        </div>
      </div>

      {!live ? (
        <div className="rounded-2xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-6">
          <StatusPill tone="neutral" label="Coming soon" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Two-way texting is in the works. It needs a regulated carrier-registration process
            (A2P 10DLC) that takes a few weeks per practice once it kicks off — we won’t sell it
            before it works.
          </p>
        </div>
      ) : registration ? (
        <RegistrationPanel
          canManage={canManage}
          state={registration.state}
          statusText={registration.statusText}
          audience={registration.audience}
          notice={registration.notice}
          phoneNumber={registration.phoneNumber ? formatPhone(registration.phoneNumber) : null}
          details={registration.details}
          clinicName={ctx.organizationName ?? 'your practice'}
          usage={usage}
        />
      ) : null}
    </div>
  )
}
