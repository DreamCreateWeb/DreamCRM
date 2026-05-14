import { Resend } from 'resend'

const FROM = 'DreamCRM <noreply@dreamcreateweb.com>'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY env var is not set')
  return new Resend(key)
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your DreamCRM password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">Reset your password</h2>
        <p style="margin:0 0 24px;color:#444;line-height:1.5">
          You requested a password reset for your DreamCRM account.
          Click the button below to choose a new password.
          This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Reset password
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          If you didn't request this, you can safely ignore this email.
          Your password won't change until you click the link above.
        </p>
      </div>
    `,
  })
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  const resend = getResend()
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Verify your DreamCRM email address',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 16px;font-size:20px;color:#111">Verify your email</h2>
        <p style="margin:0 0 24px;color:#444;line-height:1.5">
          Welcome to DreamCRM! Click the button below to verify your email address.
        </p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">
          Verify email
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          If you didn't create a DreamCRM account, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}
