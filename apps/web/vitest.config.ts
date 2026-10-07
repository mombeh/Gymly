import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    // The default is 5s per test. These tests drive real keystrokes through
    // userEvent, which has a deliberate delay between characters, so a form with
    // five fields legitimately takes several seconds. Files run in parallel, so
    // the slower machine has to be allowed for or a passing suite fails on
    // timing rather than on behaviour.
    testTimeout: 20_000,
    env: {
      // The API client reads this at call time; tests assert against it.
      NEXT_PUBLIC_API_URL: 'http://localhost:3000/api',
    },
  },
});