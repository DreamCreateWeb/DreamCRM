'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { loadOnboardingState, saveOnboardingState } from '@/lib/onboarding/storage'

type Situation = 'existing' | 'solo' | 'starting'

const OPTIONS: { value: Situation; title: string; description: string }[] = [
  { value: 'existing', title: 'I have an existing dental practice', description: 'Bringing an established clinic online with Dream Create.' },
  { value: 'solo', title: 'I’m a solo practitioner', description: 'Just me — I run my own practice and need a simple online presence.' },
  { value: 'starting', title: 'I’m just getting started', description: 'Setting up a brand new clinic from scratch.' },
]

export default function Onboarding01() {
  const router = useRouter()
  const [situation, setSituation] = useState<Situation>('existing')

  useEffect(() => {
    const state = loadOnboardingState()
    if (state.situation) setSituation(state.situation)
  }, [])

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    saveOnboardingState({ situation })
    router.push('/onboarding-02')
  }

  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative flex">
        <div className="w-full md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">

            <div className="flex-1">
              <OnboardingHeader />
              <OnboardingProgress step={1} />
            </div>

            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">Tell us about your situation</h1>
                <form onSubmit={handleNext}>
                  <div className="space-y-3 mb-8">
                    {OPTIONS.map(opt => (
                      <label key={opt.value} className="relative block cursor-pointer">
                        <input
                          type="radio"
                          name="situation"
                          value={opt.value}
                          checked={situation === opt.value}
                          onChange={() => setSituation(opt.value)}
                          className="peer sr-only"
                        />
                        <div className="flex items-center bg-white text-sm font-medium text-gray-800 dark:text-gray-100 p-4 rounded-lg dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm transition">
                          <svg className="w-6 h-6 shrink-0 fill-current mr-4" viewBox="0 0 24 24">
                            <path className="text-violet-500" d="m12 10.856 9-5-8.514-4.73a1 1 0 0 0-.972 0L3 5.856l9 5Z" />
                            <path className="text-violet-300" d="m11 12.588-9-5V18a1 1 0 0 0 .514.874L11 23.588v-11Z" />
                            <path className="text-violet-200" d="M13 12.588v11l8.486-4.714A1 1 0 0 0 22 18V7.589l-9 4.999Z" />
                          </svg>
                          <div>
                            <div>{opt.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">{opt.description}</div>
                          </div>
                        </div>
                        <div className="absolute inset-0 border-2 border-transparent peer-checked:border-violet-400 dark:peer-checked:border-violet-500 rounded-lg pointer-events-none" aria-hidden="true" />
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <Link className="text-sm underline hover:no-underline" href="/dashboard">Skip for now</Link>
                    <button type="submit" className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-auto">
                      Next Step →
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </div>

        <OnboardingImage />
      </div>
    </main>
  )
}
