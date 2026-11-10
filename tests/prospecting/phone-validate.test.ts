import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phone line-type validation (P-01): the driver switch, the Pinpoint type
 * map, the auth-vs-unavailable split, and the lazy client (keyless build).
 */

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))
vi.mock('@aws-sdk/client-pinpoint', () => ({
  PinpointClient: class {
    send = sendMock
  },
  PhoneNumberValidateCommand: class {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
}))

import {
  phoneValidateDriver,
  validatePhoneLine,
  mapPinpointPhoneType,
  classifyPinpointError,
  PHONE_VALIDATE_IAM_ACTION,
} from '@/lib/services/phone-validate'

const ORIGINAL = process.env.PHONE_VALIDATE_DRIVER

beforeEach(() => {
  sendMock.mockReset()
  delete process.env.PHONE_VALIDATE_DRIVER
})
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PHONE_VALIDATE_DRIVER
  else process.env.PHONE_VALIDATE_DRIVER = ORIGINAL
})

describe('the driver switch', () => {
  it('defaults to none; only "aws" turns it on', () => {
    expect(phoneValidateDriver()).toBe('none')
    process.env.PHONE_VALIDATE_DRIVER = 'AWS'
    expect(phoneValidateDriver()).toBe('aws')
    process.env.PHONE_VALIDATE_DRIVER = 'twilio'
    expect(phoneValidateDriver()).toBe('none')
  })
  it('off → driver_off without touching the SDK', async () => {
    expect(await validatePhoneLine('4045551212')).toEqual({ ok: false, error: 'driver_off' })
    expect(sendMock).not.toHaveBeenCalled()
  })
  it('names the IAM action the settings pill tells the owner to grant', () => {
    expect(PHONE_VALIDATE_IAM_ACTION).toBe('mobiletargeting:PhoneNumberValidate')
  })
})

describe('mapPinpointPhoneType', () => {
  it.each([
    ['MOBILE', 'mobile', false],
    ['PREPAID', 'mobile', false],
    ['LANDLINE', 'landline', false],
    ['VOIP', 'voip', false],
    ['OTHER', 'other', false],
    ['INVALID', null, true],
    [undefined, null, false],
  ] as const)('%s → %s (invalid=%s)', (t, lineType, invalid) => {
    expect(mapPinpointPhoneType(t)).toEqual({ lineType, invalid })
  })
})

describe('classifyPinpointError', () => {
  it('permission / credential refusals are auth', () => {
    expect(classifyPinpointError({ name: 'AccessDeniedException' })).toBe('auth')
    expect(classifyPinpointError({ name: 'CredentialsProviderError' })).toBe('auth')
    expect(classifyPinpointError({ name: 'X', $metadata: { httpStatusCode: 403 } })).toBe('auth')
  })
  it('everything else is unavailable', () => {
    expect(classifyPinpointError(new Error('socket hang up'))).toBe('unavailable')
    expect(classifyPinpointError({ name: 'ThrottlingException', $metadata: { httpStatusCode: 429 } })).toBe('unavailable')
  })
})

describe('validatePhoneLine with the aws driver', () => {
  beforeEach(() => {
    process.env.PHONE_VALIDATE_DRIVER = 'aws'
  })
  it('sends +1 and the country, maps the type and carrier', async () => {
    sendMock.mockResolvedValue({ NumberValidateResponse: { PhoneType: 'LANDLINE', Carrier: 'AT&T' } })
    const r = await validatePhoneLine('4045551212')
    expect(r).toEqual({ ok: true, lineType: 'landline', invalid: false, carrier: 'AT&T', provider: 'aws_pinpoint' })
    const cmd = sendMock.mock.calls[0][0] as { input: { NumberValidateRequest: { PhoneNumber: string; IsoCountryCode: string } } }
    expect(cmd.input.NumberValidateRequest).toEqual({ PhoneNumber: '+14045551212', IsoCountryCode: 'US' })
  })
  it('an eleven-digit stored number (leading country code) is sent as +1 + ten, never +1 + eleven (P-01 C5/C9)', async () => {
    sendMock.mockResolvedValue({ NumberValidateResponse: { PhoneType: 'LANDLINE' } })
    await validatePhoneLine('14045551212')
    const cmd = sendMock.mock.calls[0][0] as { input: { NumberValidateRequest: { PhoneNumber: string } } }
    expect(cmd.input.NumberValidateRequest.PhoneNumber).toBe('+14045551212')
    sendMock.mockClear()
    await validatePhoneLine('+1 (404) 555-1212')
    const cmd2 = sendMock.mock.calls[0][0] as { input: { NumberValidateRequest: { PhoneNumber: string } } }
    expect(cmd2.input.NumberValidateRequest.PhoneNumber).toBe('+14045551212')
  })
  it('INVALID is reported as invalid, not as a line type', async () => {
    sendMock.mockResolvedValue({ NumberValidateResponse: { PhoneType: 'INVALID' } })
    expect(await validatePhoneLine('4045551212')).toMatchObject({ ok: true, invalid: true, lineType: null })
  })
  it('an auth refusal never throws — the caller fails open and strikes once', async () => {
    sendMock.mockRejectedValue(Object.assign(new Error('nope'), { name: 'AccessDeniedException' }))
    expect(await validatePhoneLine('4045551212')).toEqual({ ok: false, error: 'auth' })
  })
})
