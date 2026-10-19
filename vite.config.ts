import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const r = (p: string): string => resolve(import.meta.dirname, p);
const base = process.env.VITE_BASE ?? '/';

// The game lives at the clean URL `/play` (ADR 0009); nginx maps it in production, this does it in dev and preview.
function playRoute(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, res, next) => {
    const match = req.url?.match(/^([^?]*)(\?.*)?$/);
    if (match?.[1] === `${base}play/`) {
      // Same as nginx: one canonical URL.
      res.writeHead(301, { Location: `${base}play${match[2] ?? ''}` }).end();
      return;
    }
    if (match?.[1] === `${base}play`) req.url = `${base}play.html${match[2] ?? ''}`;
    next();
  };
  return {
    name: 'fuelx-play-route',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  };
}

export default defineConfig({
  base,
  plugins: [react(), playRoute()],
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
