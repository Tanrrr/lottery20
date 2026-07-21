import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Vitest doesn't load .env files into process.env automatically the way
  // Next.js does; pull them in explicitly via Vite's loadEnv so
  // SUPABASE_SERVICE_ROLE_KEY etc. from .env.local are visible to the
  // integration test and to SupabaseLeagueRepository at runtime.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    test: {
      include: ['**/*.integration.test.ts'],
      environment: 'node',
    },
  }
})
