import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      exclude: [
        'src/dashboard/**',
        'src/mcp/server.ts',
        'src/cli/cli.ts',
        'src/**/*.test.ts',
        'dist/**',
        'vitest.config.ts',
        'bin/**',
      ],
    },
  },
})
