import { defineConfig, devices } from '@playwright/test';

// Chromium r1194 is preinstalled at /opt/pw-browsers — never run `playwright install` (ADR 0006).
// SwiftShader keeps WebGL output stable for screenshot baselines.

// Game-scene specs render the full world in software GL (SwiftShader, CPU-bound, ~1 fps at 1080p). Two of them at
// once on a 4-vCPU container starve each other into timeouts (5.9: scene.e2e "debug hooks"), so they run one at a
// time in their own project while the light specs (showcase, smoke) share the other worker.
const SCENE_SPECS = /(scene|anim|fx|world)\.e2e\.ts$/;
// `perf` (reference-scene audit) is opt-in: `npm run perf -- --browser` sets FUELX_PERF=1.
const PERF = process.env.FUELX_PERF === '1';

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
      testIgnore: SCENE_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'scene',
      testMatch: SCENE_SPECS,
      workers: 1,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'visual',
      testMatch: /.*\.visual\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    ...(PERF
      ? [
          {
            name: 'perf',
            testMatch: /.*\.perf\.ts/,
            workers: 1,
            use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
          },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
