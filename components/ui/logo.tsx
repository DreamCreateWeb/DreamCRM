import Link from 'next/link'

export default function Logo() {
  return (
    <Link className="block" href="/">
      <div className="flex items-center gap-2">
        <svg className="fill-violet-500 shrink-0" xmlns="http://www.w3.org/2000/svg" width={32} height={32} viewBox="0 0 32 32">
          <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2Zm0 4a9.94 9.94 0 0 1 7.07 2.93L6.93 23.07A9.94 9.94 0 0 1 6 16c0-5.514 4.486-10 10-10Zm0 20a9.94 9.94 0 0 1-7.07-2.93L25.07 8.93A9.94 9.94 0 0 1 26 16c0 5.514-4.486 10-10 10Z" />
        </svg>
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100 hidden lg:block">Dream Create</span>
      </div>
    </Link>
  )
}
