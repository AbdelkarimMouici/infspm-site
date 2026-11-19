import { defineConfig } from 'vitest/config';

// Tests of the BUILT site (dist/). Run after `npm run build`: `npm run test:dist`.
export default defineConfig({
  test: {
    include: ['tests-dist/**/*.test.ts'],
  },
});
