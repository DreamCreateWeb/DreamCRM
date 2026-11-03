import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TYPES, isUrgentType, notificationType } from '@/lib/types/notifications'

/**
 * The registry's URGENT membership is somebody's interrupted morning, so the
 * three changes of 2026-10-26 are pinned by name:
 *   - online_booking is urgent (a stranger put themselves on the book; a
 *     desk with no PMS bridge keys it in by hand — left in the bell alone a
 *     Saturday-night booking is Monday's double-booked chair);
 *   - scheduled_message_failed is urgent (something broke, and the strip
 *     vanishing looks exactly like success);
 *   - thread_resurfaced is NOT (the front desk set the timer themselves).
 */
describe('notification registry — urgency', () => {
  it('a website booking emails under the urgent mode; a portal booking stays routine', () => {
    expect(isUrgentType('online_booking')).toBe(true)
    expect(isUrgentType('portal_booking')).toBe(false)
  })

  it('a failed scheduled send is registered, urgent, and wears the clock', () => {
    expect(NOTIFICATION_TYPES.scheduled_message_failed).toEqual({ icon: '⏰', tone: 'urgent', urgent: true })
  })

  it('a snooze that ran out is registered, warn-toned, and bell-only', () => {
    expect(NOTIFICATION_TYPES.thread_resurfaced).toEqual({ icon: '💤', tone: 'warn' })
    expect(isUrgentType('thread_resurfaced')).toBe(false)
  })

  it('a conversation handed to you is registered, info-toned, and urgent (a person is waiting on YOU by name)', () => {
    expect(NOTIFICATION_TYPES.thread_assigned).toEqual({ icon: '🙋', tone: 'info', urgent: true })
    expect(isUrgentType('thread_assigned')).toBe(true)
  })

  it('an unregistered type still floors to the plain bell', () => {
    expect(notificationType('something_new')).toEqual({ icon: '🔔', tone: 'neutral' })
  })

  it('every urgent type is one of: something broke, a person is waiting, or a stranger is on the book', () => {
    // The full list, so a new `urgent: true` has to be added here on purpose.
    const urgent = Object.entries(NOTIFICATION_TYPES)
      .filter(([, def]) => def.urgent)
      .map(([k]) => k)
      .sort()
    expect(urgent).toEqual(
      [
        'campaign_sent_with_errors',
        'clinic_signup',
        'domain_attach_manual',
        'inbox_message',
        'insurance_question',
        'nps_detractor',
        'online_booking',
        'patient_message',
        'patient_message_bounce',
        'payment_failed',
        'platform_inbound_email',
        'pms_sync_failing',
        'prospect_call_list',
        'prospect_demo_booked',
        'prospect_watchdog',
        'review_low_rating',
        'scheduled_message_failed',
        'subscription_cancelled',
        'support_message',
        'support_reply',
        'thread_assigned',
        'website_lead',
      ].sort(),
    )
  })
})
