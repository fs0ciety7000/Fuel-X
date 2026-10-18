import { defineConfig, devices } from '@playwright/test';

// Chromium r1194 is preinstalled at /opt/pw-browsers — never run `playwright install` (ADR 0006).
// SwiftShader keeps WebGL output stable for screenshot baselines.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  reporter: [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1920, height: 1080 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    {
      name: 'e2e',
      testMatch: /.*\.e2e\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'visual',
      testMatch: /.*\.visual\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
