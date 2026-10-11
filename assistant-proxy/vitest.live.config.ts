import { defineConfig } from 'vitest/config';

// Live suite: asks the real model. Run with `npm run test:live` (see test/live/sage.live.ts).
export default defineConfig({
  test: {
    include: ['test/live/**/*.live.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
