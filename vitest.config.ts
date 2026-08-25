import { defineConfig } from 'vitest/config'

// Mapping-only suite: pure pitch/garden math and the deferred URL parsers.
// No canvas, no network, no Vite middleware.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
