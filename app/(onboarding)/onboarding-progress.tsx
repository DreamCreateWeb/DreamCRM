import Link from 'next/link'

/**
 * "N of 3" — account (the sign-up page) → practice → software + web address.
 * Three screens; a finished step links back so a correction never costs the
 * draft (sessionStorage holds it).
 */
export const ONBOARDING_STEPS = [
  { label: 'Account', href: null },
  { label: 'Practice', href: '/onboarding-01' },
  { label: 'Software & site', href: '/onboarding-02' },
] as const

export default function OnboardingProgress({ step = 2 }: { step?: number }) {
  return (
    <div className="px-4 pt-10 pb-6">
      <div className="max-w-md mx-auto w-full">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-400">
          {step} of {ONBOARDING_STEPS.length}
        </p>
        <ol className="grid grid-cols-3 gap-2" aria-label="Setup progress">
          {ONBOARDING_STEPS.map((s, i) => {
            const n = i + 1
            const reached = step >= n
            const inner = (
              <>
                <span
                  className={`block h-1.5 rounded-full ${reached ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-700/60'}`}
                  aria-hidden="true"
                />
                <span className={`mt-1.5 block text-xs ${reached ? 'text-ink-700' : 'text-ink-500'}`}>{s.label}</span>
              </>
            )
            return (
              <li key={s.label} aria-current={step === n ? 'step' : undefined}>
                {s.href && n < step ? (
                  <Link href={s.href} className="block min-h-10 hover:opacity-80">
                    {inner}
                  </Link>
                ) : (
                  <div>{inner}</div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
