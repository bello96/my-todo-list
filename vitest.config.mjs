import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/setup/global.mjs'],
    include: ['tests/**/*.test.mjs'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallel: false,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
