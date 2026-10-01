import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    env: {
      // The API client reads this at call time; tests assert against it.
      NEXT_PUBLIC_API_URL: 'http://localhost:3000/api',
    },
  },
});