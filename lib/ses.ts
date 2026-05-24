import 'server-only'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

let cached: SESv2Client | null = null
function client(): SESv2Client {
  if (cached) return cached
  cached = new SESv2Client({
    region: process.env.SES_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  })
  return cached
}

export interface SesSendInput {
  from: string
  to: string | string[]
  subject: string
  html: string
  replyTo?: string | string[]
  headers?: Record<string, string>
  tags?: Record<string, string>
  configurationSet?: string
}

function toList(v: string | string[] | undefined): string[] | undefined {
  if (v == null) return undefined
  return Array.isArray(v) ? v : [v]
}

export async function sendEmailViaSes(input: SesSendInput): Promise<{ messageId?: string }> {
  const out = await client().send(
    new SendEmailCommand({
      FromEmailAddress: input.from,
      Destination: { ToAddresses: toList(input.to) },
      ReplyToAddresses: toList(input.replyTo),
      ConfigurationSetName: input.configurationSet ?? process.env.SES_CONFIGURATION_SET,
      EmailTags: input.tags
        ? Object.entries(input.tags).map(([Name, Value]) => ({ Name, Value }))
        : undefined,
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: input.html, Charset: 'UTF-8' } },
          Headers: input.headers
            ? Object.entries(input.headers).map(([Name, Value]) => ({ Name, Value }))
            : undefined,
        },
      },
    })
  )
  return { messageId: out.MessageId }
}
