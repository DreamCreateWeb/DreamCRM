/**
 * Tenant-aware terminology + defaults for the Marketing module. Platform
 * (Dream Create) markets a SaaS to dental clinics — long-cycle B2B sales
 * with explicit pipeline stages. Clinics market to their patients — recall
 * + lifecycle nurture. Same primitives, different labels and stage sets.
 *
 * Lives in lib/marketing/ (not lib/services/) so client components can
 * import without pulling in 'server-only'.
 */
import type { TenantType } from '@/lib/inbox-terminology'

export interface PipelineStage {
  /** machine key stored in customers.pipeline_stage */
  key: string
  /** display label */
  label: string
  /** stone-palette accent for chips/columns */
  accent: 'stone' | 'sky' | 'amber' | 'emerald' | 'violet' | 'rose'
  /** Is this a "won" terminal state? (excluded from open-pipeline counts) */
  terminal?: 'won' | 'lost'
}

export interface MarketingTerminology {
  /** Module title used in headers + sidebar override */
  moduleTitle: string
  /** Lowercase singular for lead/contact: "lead" | "patient" */
  lead: string
  /** Lowercase plural */
  leads: string
  /** Capitalized singular */
  Lead: string
  /** Capitalized plural */
  Leads: string
  /** Pipeline column definition */
  stages: PipelineStage[]
  /** Sensible defaults for the leadSource dropdown */
  sources: string[]
  /** Default send-from email when sending via Resend */
  defaultFromEmail: string
  /** Suggested campaign types shown in "new campaign" picker */
  campaignTypes: { key: string; label: string; description: string }[]
}

const PLATFORM_STAGES: PipelineStage[] = [
  { key: 'new', label: 'New', accent: 'stone' },
  { key: 'contacted', label: 'Contacted', accent: 'sky' },
  { key: 'demo', label: 'Demo Scheduled', accent: 'amber' },
  { key: 'trial', label: 'Trialing', accent: 'violet' },
  { key: 'customer', label: 'Customer', accent: 'emerald', terminal: 'won' },
  { key: 'lost', label: 'Lost', accent: 'rose', terminal: 'lost' },
]

const CLINIC_STAGES: PipelineStage[] = [
  { key: 'new', label: 'New', accent: 'stone' },
  { key: 'active', label: 'Active', accent: 'emerald' },
  { key: 'inactive', label: 'Inactive', accent: 'amber' },
  { key: 'lapsed', label: 'Lapsed', accent: 'rose', terminal: 'lost' },
]

export function marketingTerminology(tenantType: TenantType): MarketingTerminology {
  if (tenantType === 'platform') {
    return {
      moduleTitle: 'Marketing',
      lead: 'lead',
      leads: 'leads',
      Lead: 'Lead',
      Leads: 'Leads',
      stages: PLATFORM_STAGES,
      sources: ['Website form', 'Cold outreach', 'Referral', 'LinkedIn', 'Trade show', 'Other'],
      defaultFromEmail: 'Hello@DreamCreateWeb.com',
      campaignTypes: [
        { key: 'announcement', label: 'Announcement', description: 'Product update, new feature, news' },
        { key: 'nurture', label: 'Nurture', description: 'Educational content for prospects in the pipeline' },
        { key: 'outreach', label: 'Cold outreach', description: 'Personal first-touch via connected Gmail' },
        { key: 'retention', label: 'Retention', description: 'Reduce churn, upsell to higher plans' },
      ],
    }
  }
  return {
    moduleTitle: 'Recall & Outreach',
    lead: 'patient',
    leads: 'patients',
    Lead: 'Patient',
    Leads: 'Patients',
    stages: CLINIC_STAGES,
    sources: ['Walk-in', 'Website', 'Referral', 'Insurance', 'Other'],
    defaultFromEmail: '',
    campaignTypes: [
      { key: 'recall', label: 'Recall reminder', description: 'Cleaning / checkup due soon' },
      { key: 'newsletter', label: 'Newsletter', description: 'Monthly dental health newsletter' },
      { key: 'birthday', label: 'Birthday / anniversary', description: 'Lifecycle touchpoint' },
      { key: 'winback', label: 'Win-back', description: 're-engage lapsed patients' },
    ],
  }
}

/** Pipeline accent → Tailwind class tuple (bg-soft, text, ring) */
export function stageAccentClasses(accent: PipelineStage['accent']): {
  bg: string
  text: string
  dot: string
} {
  switch (accent) {
    case 'sky':
      return { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' }
    case 'amber':
      return { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' }
    case 'emerald':
      return { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' }
    case 'violet':
      return { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' }
    case 'rose':
      return { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' }
    default:
      return { bg: 'bg-stone-100 dark:bg-stone-800', text: 'text-stone-700 dark:text-stone-300', dot: 'bg-stone-500' }
  }
}
