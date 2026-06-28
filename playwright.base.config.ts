/**
 * The deep module behind Opzava's `E2E Contract` (ARD 0030).
 *
 * Single source of truth for: chromium-only browser, workers:1 / fullyParallel:false,
 * expect/timeout defaults, the determinism recipe, the seeded webServer substrate, and the
 * Visual Regression project matrix. Every consuming config is an ADAPTER that calls a factory
 * here — see docs/architecture/e2e-vr/module-design.md.
 *
 * Slice 0 scope (this file): the factories + the full `buildVisualMatrix`; `createVisualRegressionConfig`
 * defaults to 1 project / 1 theme / 1 viewport so the walking skeleton produces ONE baseline. The
 * 2×2 matrix becomes the default in Slice 1 (issue #42).
 */
import { defineConfig, devices, type PlaywrightTestConfig, type Project } from '@playwright/test'

/** The substrate every Tier-1 Surface run inherits. Single source — the VR fixture imports creds
 *  from here so they can never drift from what the server is seeded with. */
export const E2E_SEED_ENV = {
  MISSION_CONTROL_TEST_MODE: '1',
  MC_DISABLE_RATE_LIMIT: '1',
  MC_WORKLOAD_QUEUE_DEPTH_THROTTLE: '1000',
  MC_WORKLOAD_QUEUE_DEPTH_SHED: '2000',
  MC_WORKLOAD_ERROR_RATE_THROTTLE: '1',
  MC_WORKLOAD_ERROR_RATE_SHED: '1',
  // Honor an ambient override — matches the original playwright.config.ts `process.env.X || default`
  // seam, so CI/local can inject these instead of relying on the committed default. (code-review fix.)
  API_KEY: process.env.API_KEY || 'test-api-key-e2e-12345',
  AUTH_USER: process.env.AUTH_USER || 'testadmin',
  AUTH_PASS: process.env.AUTH_PASS || 'testpass1234!',
  NEXT_PUBLIC_GATEWAY_OPTIONAL: 'true',
} as const

/** Determinism recipe — applied inside every project's `use`. */
export const E2E_DETERMINISM = {
  locale: 'en',
  timezoneId: 'UTC',
  reducedMotion: 'reduce' as const,
}

/** Canonical VR axes — exported so governance + power-users reference the blessed set. */
export const E2E_VISUAL_AXES = {
  themes: ['dark', 'light'] as const,
  viewports: [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 375, height: 812 },
  ],
}

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3005'

/** True only on an explicit opt-in ('1' | 'true') — NOT any truthy string, so '0'/'false'/'no'
 *  correctly disable. (code-review fix: the old truthy check enabled Chrome on E2E_USE_CHROME=0.) */
const systemChromeEnabled = (): boolean => /^(1|true)$/i.test(process.env.E2E_USE_CHROME ?? '')

/** The chromium device descriptor + the system-Chrome channel when opted in. Single source —
 *  shared by the E2E project and every Visual Regression matrix project (no duplication). */
const chromiumDevice = () => ({
  ...devices['Desktop Chrome'],
  // channel: 'chrome' opts into the system-installed Google Chrome when bundled chromium is
  // unavailable (e.g. unsupported distros). Set E2E_USE_CHROME=1. (ARD 0030 exception.)
  ...(systemChromeEnabled() ? { channel: 'chrome' as const } : {}),
})

const chromiumProject = (): Project => ({
  name: 'chromium',
  use: chromiumDevice(),
})

const webServerFor = (
  mode: 'local' | 'gateway' | 'none',
  baseURL: string,
): PlaywrightTestConfig['webServer'] => {
  if (mode === 'none') return undefined
  return {
    command: `node scripts/e2e-openclaw/start-e2e-server.mjs --mode=${mode}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, ...E2E_SEED_ENV },
  }
}

export interface E2EConfigOverrides {
  testMatch?: PlaywrightTestConfig['testMatch']
  testIgnore?: PlaywrightTestConfig['testIgnore']
  baseURL?: string
  /** Default 'local'. 'none' = dokploy parity (external stack, no managed server). */
  webServer?: 'local' | 'gateway' | 'none'
}

/** Build a Tier-1 E2E config. Zero-arg → a correct, hardened config. */
export function createE2EConfig(o: E2EConfigOverrides = {}): PlaywrightTestConfig {
  const baseURL = o.baseURL ?? DEFAULT_BASE_URL
  const mode = o.webServer ?? 'local'
  if (mode === 'none' && !o.baseURL && !process.env.E2E_BASE_URL) {
    throw new Error(
      'createE2EConfig: webServer:"none" requires a baseURL (the dokploy footgun) — see ARD 0030',
    )
  }
  return defineConfig({
    testDir: 'tests',
    ...(o.testMatch ? { testMatch: o.testMatch } : {}),
    ...(o.testIgnore ? { testIgnore: o.testIgnore } : {}),
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: { baseURL, trace: 'retain-on-failure', ...E2E_DETERMINISM },
    projects: [chromiumProject()],
    webServer: webServerFor(mode, baseURL),
  })
}

export interface VisualRegressionOptions {
  testMatch?: PlaywrightTestConfig['testMatch']
  snapshotDir?: string
  globalSetup?: string
  themes?: readonly ('dark' | 'light')[]
  viewports?: readonly { name: string; width: number; height: number }[]
  baseURL?: string
  webServer?: 'local' | 'gateway' | 'none'
}

/** Pure matrix builder — exported for governance tests (assert the default matrix without
 *  spinning Playwright) and power-users. The internal seam VR composes over. */
export function buildVisualMatrix(
  o: { themes?: readonly string[]; viewports?: readonly { name: string; width: number; height: number }[] } = {},
): Project[] {
  const themes = o.themes ?? E2E_VISUAL_AXES.themes
  const viewports = o.viewports ?? E2E_VISUAL_AXES.viewports
  const matrix: Project[] = []
  for (const vp of viewports) {
    for (const theme of themes) {
      matrix.push({
        name: `chromium-${vp.name}-${theme}`,
        use: {
          ...chromiumDevice(),
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme as 'dark' | 'light',
        },
      })
    }
  }
  return matrix
}

/** Build a Visual Regression config. Defaults: 1 project / 1 theme / 1 viewport in Slice 0
 *  (the walking skeleton); Slice 1 expands the default to the full {dark,light}×{desktop,mobile}. */
export function createVisualRegressionConfig(o: VisualRegressionOptions = {}): PlaywrightTestConfig {
  const baseURL = o.baseURL ?? DEFAULT_BASE_URL
  const mode = o.webServer ?? 'local'
  const matrix = buildVisualMatrix({
    themes: o.themes ?? E2E_VISUAL_AXES.themes,
    viewports: o.viewports ?? E2E_VISUAL_AXES.viewports,
  })
  return defineConfig({
    testDir: 'tests',
    testMatch: o.testMatch ?? /.*\.visual\.spec\.ts$/,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    ...(o.snapshotDir ? { snapshotDir: o.snapshotDir } : {}),
    ...(o.globalSetup ? { globalSetup: o.globalSetup } : {}),
    use: { baseURL, trace: 'retain-on-failure', ...E2E_DETERMINISM },
    projects: matrix,
    webServer: webServerFor(mode, baseURL),
  })
}
