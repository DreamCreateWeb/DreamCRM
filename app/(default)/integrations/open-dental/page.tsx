import { permanentRedirect } from 'next/navigation'

/** The separate Open Dental connector path was retired (2026-08-19, owner
 *  ruling: one PMS door). Open Dental practices connect through the same
 *  NexHealth bridge as everyone else — 308 so old bookmarks and emails
 *  land on the one PMS sync surface. */
export default function OpenDentalRedirect() {
  permanentRedirect('/integrations/pms')
}
