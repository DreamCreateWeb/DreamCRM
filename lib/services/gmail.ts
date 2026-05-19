import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db, schema } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

/**
 * Gmail OAuth + API wrapper. Talks to Google directly via fetch — no SDK,
 * keeps the dependency surface small. When we add Microsoft we'll mirror
 * this module as lib/services/outlook.ts and dispatch from a common surface.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'
const USER_INFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

export function gmailOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

export function getAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent', // force refresh-token issuance every time
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${body}`)
  }
  return res.json() as Promise<GoogleTokenResponse>
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token refresh failed: ${res.status} ${body}`)
  }
  return res.json() as Promise<GoogleTokenResponse>
}

async function getUserInfo(accessToken: string): Promise<{ email: string; name?: string; picture?: string }> {
  const res = await fetch(USER_INFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google user info')
  return res.json()
}

/**
 * Persist a newly connected Gmail account. Returns the row id. If an
 * account with the same email + org already exists, refresh its tokens
 * in-place rather than creating a duplicate.
 */
export async function saveConnectedAccount(opts: {
  organizationId: string
  connectedByUserId: string
  tokens: GoogleTokenResponse
}): Promise<{ accountId: string; emailAddress: string }> {
  if (!opts.tokens.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token. Try revoking this app's access at myaccount.google.com/permissions and reconnecting.",
    )
  }
  const userInfo = await getUserInfo(opts.tokens.access_token)
  const existing = await db
    .select({ id: schema.emailAccount.id })
    .from(schema.emailAccount)
    .where(
      and(
        eq(schema.emailAccount.organizationId, opts.organizationId),
        eq(schema.emailAccount.emailAddress, userInfo.email),
      ),
    )
    .limit(1)

  const expiresAt = new Date(Date.now() + (opts.tokens.expires_in - 30) * 1000)
  const encrypted = encryptSecret(opts.tokens.refresh_token)

  if (existing[0]) {
    await db
      .update(schema.emailAccount)
      .set({
        refreshTokenEncrypted: encrypted,
        accessToken: opts.tokens.access_token,
        accessExpiresAt: expiresAt,
        scope: opts.tokens.scope,
        disabled: false,
        syncStatus: 'pending',
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailAccount.id, existing[0].id))
    return { accountId: existing[0].id, emailAddress: userInfo.email }
  }

  const id = randomUUID()
  await db.insert(schema.emailAccount).values({
    id,
    organizationId: opts.organizationId,
    connectedByUserId: opts.connectedByUserId,
    provider: 'gmail',
    emailAddress: userInfo.email,
    displayName: userInfo.name ?? null,
    refreshTokenEncrypted: encrypted,
    accessToken: opts.tokens.access_token,
    accessExpiresAt: expiresAt,
    scope: opts.tokens.scope,
    syncStatus: 'pending',
  })
  return { accountId: id, emailAddress: userInfo.email }
}

/**
 * Get a usable access token for an account, refreshing if expired. Updates
 * the row with the new access token on every refresh.
 */
export async function getAccessToken(accountId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.emailAccount)
    .where(eq(schema.emailAccount.id, accountId))
    .limit(1)
  if (!row) throw new Error('Account not found')
  if (row.disabled) throw new Error('Account is disabled')

  const now = Date.now()
  const exp = row.accessExpiresAt ? new Date(row.accessExpiresAt).getTime() : 0
  if (row.accessToken && exp > now + 5000) {
    return row.accessToken
  }
  const refreshed = await refreshAccessToken(decryptSecret(row.refreshTokenEncrypted))
  const newExp = new Date(Date.now() + (refreshed.expires_in - 30) * 1000)
  await db
    .update(schema.emailAccount)
    .set({ accessToken: refreshed.access_token, accessExpiresAt: newExp, updatedAt: new Date() })
    .where(eq(schema.emailAccount.id, accountId))
  return refreshed.access_token
}

// ---------- Gmail API: list / get / send ----------

interface GmailMessageListItem { id: string; threadId: string }
interface GmailHeader { name: string; value: string }
interface GmailMessagePart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailMessagePart[]
}
interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  payload?: GmailMessagePart
  internalDate?: string
}

async function gmailFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gmail API ${res.status}: ${body}`)
  }
  return res
}

export async function listInboxMessageIds(accessToken: string, limit = 30): Promise<GmailMessageListItem[]> {
  const res = await gmailFetch(
    accessToken,
    `/users/me/messages?labelIds=INBOX&maxResults=${limit}`,
  )
  const data = (await res.json()) as { messages?: GmailMessageListItem[] }
  return data.messages ?? []
}

export async function getMessage(accessToken: string, id: string): Promise<GmailMessage> {
  const res = await gmailFetch(accessToken, `/users/me/messages/${id}?format=full`)
  return res.json() as Promise<GmailMessage>
}

function decodeBody(part: GmailMessagePart | undefined): string | null {
  if (!part?.body?.data) return null
  return Buffer.from(part.body.data, 'base64url').toString('utf8')
}

function findPartByMime(part: GmailMessagePart | undefined, mime: string): GmailMessagePart | undefined {
  if (!part) return undefined
  if (part.mimeType === mime) return part
  for (const sub of part.parts ?? []) {
    const found = findPartByMime(sub, mime)
    if (found) return found
  }
  return undefined
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string | null {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null
}

// Split an address list, respecting quoted display names that may contain
// commas like "Eve, Ms" <eve@x.com>, "Bob" <b@x.com>.
function splitAddressList(raw: string): string[] {
  const parts: string[] = []
  let current = ''
  let inQuotes = false
  let depth = 0
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === '<') depth++
    else if (ch === '>') depth = Math.max(0, depth - 1)
    if (ch === ',' && !inQuotes && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)
  return parts
}

function parseAddressList(raw: string | null): string[] {
  if (!raw) return []
  return splitAddressList(raw)
    .map((part) => {
      const m = part.match(/<([^>]+)>/)
      return (m ? m[1] : part).trim()
    })
    .filter(Boolean)
}

function parseAddress(raw: string | null): { name: string | null; email: string } {
  if (!raw) return { name: null, email: '' }
  // "Name" <email> form
  const bracketed = raw.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>]+?)\s*>\s*$/)
  if (bracketed) {
    const name = (bracketed[1] || '').trim() || null
    return { name, email: bracketed[2].trim() }
  }
  // Bare email (no display name)
  return { name: null, email: raw.trim() }
}

export interface ParsedGmailMessage {
  providerMessageId: string
  providerThreadId: string
  fromName: string | null
  fromEmail: string
  toEmails: string[]
  ccEmails: string[]
  subject: string | null
  snippet: string | null
  bodyText: string | null
  bodyHtml: string | null
  receivedAt: Date
  labels: string[]
  isRead: boolean
}

export function parseGmailMessage(msg: GmailMessage): ParsedGmailMessage {
  const headers = msg.payload?.headers
  const from = parseAddress(headerValue(headers, 'From'))
  const dateRaw = headerValue(headers, 'Date')
  const receivedAt = msg.internalDate
    ? new Date(Number(msg.internalDate))
    : dateRaw
      ? new Date(dateRaw)
      : new Date()
  const labels = msg.labelIds ?? []
  return {
    providerMessageId: msg.id,
    providerThreadId: msg.threadId,
    fromName: from.name,
    fromEmail: from.email,
    toEmails: parseAddressList(headerValue(headers, 'To')),
    ccEmails: parseAddressList(headerValue(headers, 'Cc')),
    subject: headerValue(headers, 'Subject'),
    snippet: msg.snippet ?? null,
    bodyText: decodeBody(findPartByMime(msg.payload, 'text/plain')) ?? decodeBody(msg.payload),
    bodyHtml: decodeBody(findPartByMime(msg.payload, 'text/html')),
    receivedAt,
    labels,
    isRead: !labels.includes('UNREAD'),
  }
}

export interface SendMessageInput {
  from: string
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  bodyHtml?: string
  inReplyTo?: string
  references?: string
}

function buildRawMessage(input: SendMessageInput): string {
  const boundary = `dcrm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const headerLines = [
    `From: ${input.from}`,
    `To: ${input.to.join(', ')}`,
    ...(input.cc && input.cc.length > 0 ? [`Cc: ${input.cc.join(', ')}`] : []),
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    input.bodyText,
  ].join('\r\n')
  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    input.bodyHtml ?? input.bodyText.replace(/</g, '&lt;').replace(/\n/g, '<br>'),
  ].join('\r\n')
  const closing = `--${boundary}--`
  return [headerLines.join('\r\n'), '', textPart, htmlPart, closing].join('\r\n')
}

export async function sendMessage(accessToken: string, input: SendMessageInput): Promise<{ id: string }> {
  const raw = Buffer.from(buildRawMessage(input)).toString('base64url')
  const res = await gmailFetch(accessToken, '/users/me/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  return res.json() as Promise<{ id: string }>
}

export async function markMessageRead(accessToken: string, providerMessageId: string, read: boolean): Promise<void> {
  await gmailFetch(accessToken, `/users/me/messages/${providerMessageId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(read ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] }),
    }),
  })
}

/**
 * Add/remove Gmail labels on a message in a single API call. Use empty
 * arrays when only adding or removing.
 */
export async function modifyLabels(
  accessToken: string,
  providerMessageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<void> {
  await gmailFetch(accessToken, `/users/me/messages/${providerMessageId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  })
}

/**
 * Apply the same label change to many messages in one request. Gmail caps
 * batchModify at 1000 ids per call, so callers should chunk if needed.
 */
export async function batchModifyLabels(
  accessToken: string,
  providerMessageIds: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<void> {
  if (providerMessageIds.length === 0) return
  await gmailFetch(accessToken, '/users/me/messages/batchModify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: providerMessageIds, addLabelIds, removeLabelIds }),
  })
}

/**
 * Move a message to the Trash in Gmail (reversible for 30 days from the
 * user's web UI — does not delete permanently).
 */
export async function trashMessage(accessToken: string, providerMessageId: string): Promise<void> {
  await gmailFetch(accessToken, `/users/me/messages/${providerMessageId}/trash`, { method: 'POST' })
}

// ---------- Inline image resolution (cid: → data: URL) ----------

interface InlineImage {
  contentId: string
  attachmentId: string
  mimeType: string
}

/**
 * Walk a message payload tree and collect every image part that has both an
 * attachmentId and a Content-ID header. These are inline images referenced
 * via `<img src="cid:xxx">` in the HTML body — typical for signatures and
 * embedded logos.
 */
function findInlineImages(part: GmailMessagePart | undefined): InlineImage[] {
  const result: InlineImage[] = []
  function walk(p: GmailMessagePart) {
    if (p.body?.attachmentId && p.mimeType?.startsWith('image/')) {
      const cidHeader = p.headers?.find((h) => h.name.toLowerCase() === 'content-id')
      // Content-ID typically looks like `<abc123@mail.gmail.com>`; strip angle
      // brackets to match how it appears inside cid: URIs.
      const cid = cidHeader?.value.trim().replace(/^<|>$/g, '')
      if (cid) {
        result.push({ contentId: cid, attachmentId: p.body.attachmentId, mimeType: p.mimeType })
      }
    }
    for (const sub of p.parts ?? []) walk(sub)
  }
  if (part) walk(part)
  return result
}

interface GmailAttachmentResponse {
  size: number
  data: string // base64url
}

/**
 * Fetch a single attachment payload from Gmail. Returns base64url-encoded data.
 */
async function fetchAttachmentData(
  accessToken: string,
  providerMessageId: string,
  attachmentId: string,
): Promise<string> {
  const res = await gmailFetch(accessToken, `/users/me/messages/${providerMessageId}/attachments/${attachmentId}`)
  const json = (await res.json()) as GmailAttachmentResponse
  return json.data
}

/**
 * For HTML bodies that reference inline images via `cid:` URIs, fetch each
 * referenced attachment from Gmail and substitute a self-contained
 * `data:image/...;base64,...` URL. Result: embedded logos and signature
 * graphics render in the inbox iframe without needing any further server
 * round-trip when the user opens the message.
 *
 * Skips fetches for cid references not present in the HTML, so a 12-image
 * attachment list only costs one fetch per image actually used in the body.
 *
 * Best-effort: failures are logged and the cid reference is left intact
 * (renders as a broken-image icon, same as before this function existed).
 */
export async function resolveInlineImages(
  accessToken: string,
  providerMessageId: string,
  html: string | null,
  payload: GmailMessagePart | undefined,
): Promise<string | null> {
  if (!html) return html
  const images = findInlineImages(payload)
  if (images.length === 0) return html

  // Only fetch the ones the HTML actually references.
  const referenced = images.filter((img) => html.includes(`cid:${img.contentId}`))
  if (referenced.length === 0) return html

  const fetches = await Promise.allSettled(
    referenced.map((img) => fetchAttachmentData(accessToken, providerMessageId, img.attachmentId)),
  )

  let out = html
  referenced.forEach((img, i) => {
    const settled = fetches[i]
    if (settled.status !== 'fulfilled') {
      console.warn(`[gmail.inline] ${img.attachmentId} fetch failed:`, settled.reason)
      return
    }
    // Gmail returns base64url-encoded; convert to standard base64 for the
    // data: URI (browsers accept both but base64 is more conventional).
    const base64 = settled.value.replace(/-/g, '+').replace(/_/g, '/')
    const dataUrl = `data:${img.mimeType};base64,${base64}`
    const cidPattern = new RegExp(`cid:${img.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')
    out = out.replace(cidPattern, dataUrl)
  })

  return out
}

// ---------- Real (non-inline) attachments ----------

export interface AttachmentSummary {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}

/**
 * Walk a message payload and return all "real" attachments — parts that
 * have a filename, are not inline (no matching cid: in body), have an
 * attachmentId. For now we just expose the metadata; downloads happen via
 * a separate proxy endpoint when the user clicks.
 */
export function findAttachments(part: GmailMessagePart | undefined): AttachmentSummary[] {
  const result: AttachmentSummary[] = []
  function walk(p: GmailMessagePart) {
    if (p.body?.attachmentId && p.filename && p.filename.length > 0) {
      // Exclude pure inline images already resolved above — those have a
      // Content-ID header.
      const hasCid = p.headers?.some((h) => h.name.toLowerCase() === 'content-id')
      if (!hasCid) {
        result.push({
          filename: p.filename,
          mimeType: p.mimeType ?? 'application/octet-stream',
          size: p.body.size ?? 0,
          attachmentId: p.body.attachmentId,
        })
      }
    }
    for (const sub of p.parts ?? []) walk(sub)
  }
  if (part) walk(part)
  return result
}

// ---------- Push notifications: watch / stop / history ----------

export interface WatchResponse {
  historyId: string
  expiration: string // unix ms as a string
}

export async function watchMailbox(
  accessToken: string,
  topicName: string,
): Promise<WatchResponse> {
  const res = await gmailFetch(accessToken, '/users/me/watch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    }),
  })
  return res.json() as Promise<WatchResponse>
}

export async function stopWatch(accessToken: string): Promise<void> {
  await gmailFetch(accessToken, '/users/me/stop', { method: 'POST' })
}

export interface GmailHistoryRecord {
  id: string
  messages?: GmailMessageListItem[]
  messagesAdded?: { message: GmailMessageListItem & { labelIds?: string[] } }[]
  messagesDeleted?: { message: GmailMessageListItem }[]
  labelsAdded?: { message: GmailMessageListItem; labelIds: string[] }[]
  labelsRemoved?: { message: GmailMessageListItem; labelIds: string[] }[]
}

export interface HistoryListResponse {
  history?: GmailHistoryRecord[]
  nextPageToken?: string
  historyId: string
}

export async function listHistory(
  accessToken: string,
  startHistoryId: string,
  opts: { pageToken?: string } = {},
): Promise<HistoryListResponse> {
  const params = new URLSearchParams({
    startHistoryId,
    historyTypes: 'messageAdded',
    labelId: 'INBOX',
  })
  if (opts.pageToken) params.set('pageToken', opts.pageToken)
  const res = await gmailFetch(accessToken, `/users/me/history?${params.toString()}`)
  return res.json() as Promise<HistoryListResponse>
}
