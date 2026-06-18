/**
 * Client-safe message-template types + constants + the starter set.
 * Split out of the `server-only` service so the Settings editor (a client
 * component) can import the bounds + the row type without pulling the DB layer
 * into the browser bundle.
 */

export interface MessageTemplateRow {
  id: string
  name: string
  body: string
  shortcut: string | null
  sortOrder: number
}

export const MAX_TEMPLATE_NAME_LEN = 80
export const MAX_TEMPLATE_BODY_LEN = 2000
export const MAX_TEMPLATES_PER_ORG = 50

/** The starter set — seeded as editable rows for every new org (was the old
 *  hard-coded CANNED_TEMPLATES). */
export const DEFAULT_MESSAGE_TEMPLATES: Array<{ name: string; body: string }> = [
  {
    name: 'Confirming your visit',
    body: `Hi {{firstName}}, just confirming your visit. Reply YES to confirm, or let us know if you need to reschedule. — The team`,
  },
  {
    name: 'Following up on your treatment plan',
    body: `Hi {{firstName}}, wanted to follow up on the treatment plan we talked about at your last visit. No pressure — just let us know if you have any questions or want to schedule the next step. — The team`,
  },
  {
    name: 'Quick scheduling question',
    body: `Hi {{firstName}}, a quick question on scheduling — when works best for you over the next couple of weeks? Reply with a day or two and we'll send a time. — The team`,
  },
]
