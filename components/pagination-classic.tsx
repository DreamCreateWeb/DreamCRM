export default function PaginationClassic() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <nav className="mb-4 sm:mb-0 sm:order-1" role="navigation" aria-label="Navigation">
        <ul className="flex justify-center">
          <li className="ml-3 first:ml-0">
            {/* The unavailable arm. It was gray-300 on white (1.55) and
                gray-600 on gray-800 (1.90) — pale enough that WCAG 1.4.3's
                inactive-control exemption was doing all the work, on an
                element that never said it was inactive. Now it says so, and
                it sits on the design system's own quiet-ink pair
                (DESIGN-SYSTEM.md §2.2: gray-500 is the lightest meaningful
                ink on white, dark:gray-400 the lightest on dark) — still
                visibly quieter than the live arm beside it, at 5.30 and 4.99
                rather than on a pardon. */}
            <span
              aria-disabled="true"
              className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 text-gray-500 dark:text-gray-400"
            >
              &lt;- Previous
            </span>
          </li>
          <li className="ml-3 first:ml-0">
            <a className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300" href="#0">Next -&gt;</a>
          </li>
        </ul>
      </nav>
      <div className="text-sm text-gray-500 text-center sm:text-left">
        Showing <span className="font-medium text-gray-600 dark:text-gray-300">1</span> to <span className="font-medium text-gray-600 dark:text-gray-300">10</span> of <span className="font-medium text-gray-600 dark:text-gray-300">467</span> results
      </div>
    </div>
  )
}