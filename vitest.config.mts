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
    /*
     * Older dataset releases are behind a dynamic import in the app, so that a
     * browser and a cold serverless start pay for one release rather than 29.
     * The tests want all of them: they sweep every shipped version and check it
     * still computes what it did when it shipped.
     */
    setupFiles: ['./engine/test-setup.ts'],
  },
});
