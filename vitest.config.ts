import { defineConfig } from 'vitest/config'
import { withArchal } from 'archal/vitest'

export default defineConfig({
  test: withArchal(
    {
      // everything you already had in test:, unchanged
      globals: true,
      timeout: 30000, // 30 second timeout for reliability tests
      retry: 0, // Don't retry reliability tests - failures are intentional
      reporters: ['verbose', 'json'],
      outputFile: {
        json: './reports/reliability-report.json'
      },
      setupFiles: ['./tests/setup.ts'],
      include: [
        'tests/**/*.test.ts'
      ],
      exclude: [
        'node_modules',
        'dist'
      ]
    },
    {
      services: {
        github: { mode: 'route', seed: 'small-project' },
      },
    },
  ),
})
