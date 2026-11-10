export const metadata = {
  title: 'Prospecting Settings — DreamCRM',
  description: 'Kill switch, state rollout, warm-up ramp, and budgets.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  getProspectingConfig,
  getDiscoveryProgress,
  getProspectingCounter,
  getQualityCounts,
  counterMonth,
  counterDay,
} from '@/lib/services/prospecting'
import { phoneValidateDriver } from '@/lib/services/phone-validate'
import { listProspectingFailures } from '@/lib/services/engine-failures'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import SettingsPanel from './settings-panel'

export default async function ProspectingSettingsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const month = counterMonth()
  const day = counterDay()
  const [config, progress, placesUsed, crawlsUsed, aiUsed, phoneValidateUsed, autoEnrolledToday, quality, failures] =
    await Promise.all([
      getProspectingConfig(),
      getDiscoveryProgress(),
      getProspectingCounter(month, 'places_lookup'),
      getProspectingCounter(month, 'crawl'),
      getProspectingCounter(month, 'ai_score'),
      getProspectingCounter(month, 'phone_validate'),
      getProspectingCounter(day, 'auto_enroll'),
      getQualityCounts(),
      listProspectingFailures(1),
    ])

  // Outreach sender wiring is env-driven — surface its readiness honestly so
  // "why is nothing sending" is answerable at a glance.
  const senderConfigured = Boolean(process.env.OUTREACH_EMAIL_FROM?.trim())
  const gmailConfigured = Boolean(process.env.OUTREACH_GMAIL_ACCOUNT_ID?.trim())
  const placesConfigured = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())
  // Phone line-type validation (P-01) — PHONE_VALIDATE_DRIVER=aws + the
  // IAM action mobiletargeting:PhoneNumberValidate; a refused check today
  // shows on the pill rather than silently scoring without it.
  const phoneDriver = phoneValidateDriver()
  const phoneValidateRefusedToday = failures.some((f) => f.class === 'phone_validate_auth')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Platform · Prospecting"
        title="Prospecting Settings"
        subtitle="The safety rails: nothing discovers, crawls, or sends unless you turn it on here."
        actions={
          <ActionButton href="/platform/prospecting" variant="secondary">
            ← Back to Prospecting
          </ActionButton>
        }
      />
      <SettingsPanel
        config={config}
        progress={progress}
        usage={{ placesUsed, crawlsUsed, aiUsed, phoneValidateUsed }}
        env={{ senderConfigured, gmailConfigured, placesConfigured, phoneDriver, phoneValidateRefusedToday }}
        autoEnrolledToday={autoEnrolledToday}
        quality={quality}
      />
    </div>
  )
}
