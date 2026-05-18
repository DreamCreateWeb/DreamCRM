interface Props {
  configured: boolean
}

export default function ConnectPrompt({ configured }: Props) {
  return (
    <div className="grow flex items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-4">📬</div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
          Connect your first inbox
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Link a Gmail account (info@, support@, billing@…) and we&apos;ll bring its inbox right
          into DreamCRM. You can connect as many as you need.
        </p>
        {configured ? (
          <a
            href="/api/oauth/gmail/start"
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 inline-flex items-center gap-2"
          >
            <GoogleIcon />
            Connect Gmail
          </a>
        ) : (
          <div className="text-sm bg-amber-500/10 text-amber-700 dark:text-amber-400 px-4 py-3 rounded">
            Gmail OAuth isn&apos;t configured yet. A platform admin needs to set <code>GOOGLE_OAUTH_CLIENT_ID</code> and{' '}
            <code>GOOGLE_OAUTH_CLIENT_SECRET</code> in the Vercel project, then redeploy.
          </div>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Microsoft 365 / Outlook support coming soon.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86a5.27 5.27 0 0 1-4.96-3.65H1.05v2.3A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M4.04 10.77a5.4 5.4 0 0 1 0-3.54v-2.3H1.05a9 9 0 0 0 0 8.14z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.43 1.34l2.57-2.57A9 9 0 0 0 1.05 4.93l3 2.3A5.27 5.27 0 0 1 9 3.58z" />
    </svg>
  )
}
