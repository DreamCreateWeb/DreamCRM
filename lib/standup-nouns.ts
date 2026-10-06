/**
 * The machine's work, as count-line nouns — "12 appointment reminders",
 * "1 review invitation". Pure and client-safe: the Monday standup
 * (lib/services/standup.ts) narrates a WEEK with these, and the morning
 * digest (S7, docs/ACTIVATION.md law 6) narrates the NIGHT with the same
 * words, so a practice never reads two names for one job.
 */

/** Count-line nouns, singular AND plural — the registry labels are verb
 *  phrases ("Send appointment reminders"), which read wrong after a number,
 *  and a hard-plural map read "1 blog posts published" in the normal
 *  single-occurrence week (round-2 audit). */
export const STANDUP_NOUNS: Record<string, { one: string; many: string }> = {
  appointment_reminder: { one: 'appointment reminder', many: 'appointment reminders' },
  review_request: { one: 'review invitation', many: 'review invitations' },
  campaign_send: { one: 'campaign send', many: 'campaign sends' },
  retention_automation: { one: 'recall & win-back note', many: 'recall & win-back notes' },
  followup_rule: { one: 'follow-up opened', many: 'follow-ups opened' },
  balance_nudge: { one: 'balance reminder', many: 'balance reminders' },
  auto_reply: { one: 'after-hours reply', many: 'after-hours replies' },
  forms_reminder: { one: 'form nudge', many: 'form nudges' },
  nps_survey: { one: 'visit check-in', many: 'visit check-ins' },
  noshow_rebook: { one: 'rebook invitation', many: 'rebook invitations' },
  waitlist_offer: { one: 'waitlist offer', many: 'waitlist offers' },
  payment_autocharge: { one: 'plan payment collected', many: 'plan payments collected' },
  service_copywriting: { one: 'service page written', many: 'service pages written' },
  scheduled_message: { one: 'scheduled message delivered', many: 'scheduled messages delivered' },
  blog_publish: { one: 'blog post published', many: 'blog posts published' },
  scheduled_social: { one: 'social post published', many: 'social posts published' },
  domain_autorenew: { one: 'domain renewal', many: 'domain renewals' },
  listing_sync: { one: 'listing update', many: 'listing updates' },
  review_feature: { one: 'review featured on your site', many: 'reviews featured on your site' },
  review_reply: { one: 'review reply', many: 'review replies' },
  social_post: { one: 'post published', many: 'posts published' },
  inquiry_response: { one: 'inquiry answered', many: 'inquiries answered' },
  outreach_campaign: { one: 'campaign sent', many: 'campaigns sent' },
  content_plan: { one: 'content plan scheduled', many: 'content plans scheduled' },
  schedule_gap: { one: 'invitation out for an open day', many: 'invitations out for open days' },
}

export function standupNoun(capability: string, count = 2): string {
  const pair = STANDUP_NOUNS[capability]
  if (!pair) return capability.replace(/_/g, ' ')
  return count === 1 ? pair.one : pair.many
}

