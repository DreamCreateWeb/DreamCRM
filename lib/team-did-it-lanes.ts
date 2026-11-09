/**
 * WHICH LANES EACH GROWTH PAGE FRONTS (ML-36, G3-15). Client-safe: the
 * capabilities a page asks `teamDidIt` about and the noun its band uses.
 * Every key is a registered capability (tests/growth/team-did-it.test.tsx).
 */
export interface TeamDidItLanes {
  capabilities: readonly string[]
  what: { one: string; many: string }
}

export const REVIEWS_LANES: TeamDidItLanes = {
  capabilities: ['review_request', 'review_reply', 'review_feature'],
  what: { one: 'review task', many: 'review tasks' },
}

export const SOCIAL_LANES: TeamDidItLanes = {
  capabilities: ['social_post', 'content_plan', 'scheduled_social'],
  what: { one: 'post or plan', many: 'posts and plans' },
}

export const OUTREACH_LANES: TeamDidItLanes = {
  capabilities: [
    'outreach_campaign',
    'newsletter',
    'schedule_gap',
    'rebook_nudge',
    'retention_automation',
    'campaign_send',
  ],
  what: { one: 'outreach job', many: 'outreach jobs' },
}

/** The hub fronts all of the above. */
export const GROWTH_HUB_LANES: TeamDidItLanes = {
  capabilities: Array.from(
    new Set([...REVIEWS_LANES.capabilities, ...SOCIAL_LANES.capabilities, ...OUTREACH_LANES.capabilities]),
  ),
  what: { one: 'growth job', many: 'growth jobs' },
}
