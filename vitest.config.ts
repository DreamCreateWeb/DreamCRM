import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

// The prod server's clock is UTC (see CLAUDE.md timezone rules). Tests that
// bucket timestamps into local days flip results on a developer machine in a
// US timezone, so the suite runs pinned to the clock it was written against.
// Set here (before any Date use) so vitest workers inherit it on every OS.
process.env.TZ = 'UTC'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws on client import. Stub it for unit tests.
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
