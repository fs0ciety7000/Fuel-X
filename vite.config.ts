import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const r = (p: string): string => resolve(import.meta.dirname, p);

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@app': r('src/app'),
      '@sim': r('src/sim'),
      '@data': r('src/data'),
      '@bridge': r('src/bridge'),
      '@render': r('src/render'),
      '@ui': r('src/ui'),
      '@tokens': r('src/tokens'),
    },
  },
  build: {
    target: 'es2023',
    rollupOptions: {
      input: { main: r('index.html'), play: r('play.html'), design: r('design.html') },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Full-launch sim runs (~700 k ticks) take ~1–2 s plain but ~10× longer under coverage instrumentation.
    testTimeout: 60_000,
    coverage: { provider: 'v8', include: ['src/sim/**'], thresholds: { lines: 90 } },
  },
});
