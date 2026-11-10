import 'server-only'
import type { ProspectPhoneLineType } from '@/lib/db/schema/prospecting'
import { nanpDigits } from '@/lib/phone-nanp'

/**
 * Phone line-type validation (P-01) — the metered, provider-backed half of
 * "does this number ring?". The NANP check in lib/phone-nanp.ts is the free
 * syntax half; this asks a carrier database what KIND of line it is and
 * whether it is assigned at all.
 *
 * Driver switch — the EMAIL_DRIVER / SMS_DRIVER idiom:
 *   PHONE_VALIDATE_DRIVER=aws   Amazon Pinpoint `PhoneNumberValidate`
 *                               (~$0.006 a number; the IAM action is
 *                               `mobiletargeting:PhoneNumberValidate`)
 *   unset / none                off — the quality score runs without it
 *
 * The client is built lazily so `next build` stays keyless. Every call is
 * metered by the caller against `budgets.phoneValidatePerMonth` (the
 * `phone_validate` month counter). A permission/auth error is reported as
 * ONE engine failure a day and the pass fails open — never blocks.
 */

export type PhoneValidateDriver = 'aws' | 'none'

export function phoneValidateDriver(): PhoneValidateDriver {
  return process.env.PHONE_VALIDATE_DRIVER?.trim().toLowerCase() === 'aws' ? 'aws' : 'none'
}

export const PHONE_VALIDATE_IAM_ACTION = 'mobiletargeting:PhoneNumberValidate'

export type LineCheck =
  | {
      ok: true
      /** null when the provider could not say (OTHER with no detail). */
      lineType: ProspectPhoneLineType | null
      /** The provider says this number is not assigned / not a number. */
      invalid: boolean
      carrier: string | null
      provider: 'aws_pinpoint'
    }
  | { ok: false; error: 'driver_off' | 'auth' | 'unavailable' }

/** Pinpoint's PhoneType → our line types. PREPAID is a mobile line. */
export function mapPinpointPhoneType(phoneType: string | undefined | null): {
  lineType: ProspectPhoneLineType | null
  invalid: boolean
} {
  switch ((phoneType ?? '').toUpperCase()) {
    case 'MOBILE':
    case 'PREPAID':
      return { lineType: 'mobile', invalid: false }
    case 'LANDLINE':
      return { lineType: 'landline', invalid: false }
    case 'VOIP':
      return { lineType: 'voip', invalid: false }
    case 'INVALID':
      return { lineType: null, invalid: true }
    case 'OTHER':
      return { lineType: 'other', invalid: false }
    default:
      return { lineType: null, invalid: false }
  }
}

/** A credentials/permission refusal vs. the service being unreachable. */
export function classifyPinpointError(err: unknown): 'auth' | 'unavailable' {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null
  const name = e?.name ?? ''
  const status = e?.$metadata?.httpStatusCode
  if (
    status === 401 ||
    status === 403 ||
    /AccessDenied|Unauthorized|NotAuthorized|Forbidden|CredentialsProviderError|ExpiredToken|InvalidSignature|UnrecognizedClient/i.test(
      name,
    )
  ) {
    return 'auth'
  }
  return 'unavailable'
}

type PinpointClient = import('@aws-sdk/client-pinpoint').PinpointClient
let client: PinpointClient | null = null

async function getClient(): Promise<PinpointClient> {
  if (client) return client
  const { PinpointClient } = await import('@aws-sdk/client-pinpoint')
  client = new PinpointClient({ region: process.env.AWS_REGION || 'us-east-1' })
  return client
}

/** Check one US number. Whatever was stored (ten digits, eleven with the
 *  country code, punctuation) is normalized to the NANP ten before it is
 *  sent as +1 + ten — Pinpoint reads "+1" + eleven digits as INVALID.
 *  Never throws. */
export async function validatePhoneLine(digits: string): Promise<LineCheck> {
  if (phoneValidateDriver() !== 'aws') return { ok: false, error: 'driver_off' }
  const ten = nanpDigits(digits)
  try {
    const { PhoneNumberValidateCommand } = await import('@aws-sdk/client-pinpoint')
    const c = await getClient()
    const res = await c.send(
      new PhoneNumberValidateCommand({
        NumberValidateRequest: { PhoneNumber: `+1${ten}`, IsoCountryCode: 'US' },
      }),
    )
    const r = res.NumberValidateResponse
    const mapped = mapPinpointPhoneType(r?.PhoneType)
    return {
      ok: true,
      lineType: mapped.lineType,
      invalid: mapped.invalid,
      carrier: r?.Carrier ?? null,
      provider: 'aws_pinpoint',
    }
  } catch (err) {
    const error = classifyPinpointError(err)
    console.warn('[phone-validate]', error, err instanceof Error ? err.message : err)
    return { ok: false, error }
  }
}
