import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json, so tests can import
    // application modules the same way the app does.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // The engine is plain TypeScript with no DOM, so tests run in Node.
    // UI component tests, if ever added, would need their own project entry.
    environment: 'node',
    include: ['engine/**/*.test.ts', 'lib/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
