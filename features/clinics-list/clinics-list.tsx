import { listClinics } from './queries'

const planColors: Record<string, string> = {
  basic: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pro: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400',
  premium: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
}

const statusColors: Record<string, string> = {
  active: 'text-green-600 bg-green-100 dark:bg-green-500/20 dark:text-green-400',
  trialing: 'text-sky-600 bg-sky-100 dark:bg-sky-500/20 dark:text-sky-400',
  past_due: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-500/20 dark:text-yellow-400',
  canceled: 'text-red-600 bg-red-100 dark:bg-red-500/20 dark:text-red-400',
}

export default async function ClinicsList() {
  const clinics = await listClinics()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Clinics</h1>
          <p className="text-sm text-gray-500 mt-1">{clinics.length} {clinics.length === 1 ? 'clinic' : 'clinics'} on the platform</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        {clinics.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No clinics yet. They&apos;ll appear here once they sign up.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-b border-gray-200 dark:border-gray-700/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Clinic</th>
                  <th className="px-4 py-3 text-left font-semibold">Owner</th>
                  <th className="px-4 py-3 text-left font-semibold">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Members</th>
                  <th className="px-4 py-3 text-left font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {clinics.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{c.name}</div>
                      <div className="text-xs text-gray-500">/{c.slug}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.ownerName ? (
                        <div>
                          <div className="text-gray-800 dark:text-gray-100">{c.ownerName}</div>
                          <div className="text-xs text-gray-500">{c.ownerEmail}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${planColors[c.planTier ?? 'basic'] ?? planColors.basic}`}>
                        {c.planTier ?? 'basic'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.subscriptionStatus ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[c.subscriptionStatus] ?? statusColors.canceled}`}>
                          {c.subscriptionStatus.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">no subscription</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">{c.memberCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {c.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
