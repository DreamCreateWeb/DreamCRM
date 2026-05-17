export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'completed', 'paused'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]
