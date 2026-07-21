import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    environmentMatchGlobs: [
      ['app/api/**', 'node'],
    ],
  } as unknown as Record<string, unknown>,
})
