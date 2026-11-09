import OnboardingHeader from './onboarding-header'
import OnboardingImage from './onboarding-image'
import OnboardingProgress from './onboarding-progress'

/** The one chrome every onboarding screen wears: brand header, "N of 3", the side image. */
export default function OnboardingFrame({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative flex">
        <div className="w-full md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">
            <div className="flex-1">
              <OnboardingHeader />
              <OnboardingProgress step={step} />
            </div>
            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">{children}</div>
            </div>
          </div>
        </div>
        <OnboardingImage />
      </div>
    </main>
  )
}
