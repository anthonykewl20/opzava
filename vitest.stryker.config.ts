import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dedicated vitest config for Stryker mutation runs. It mirrors vitest.config.ts
// but narrows `include` to only the tests that cover the mutated units and uses
// the `forks` pool (some suites call process.chdir(), unsupported in worker threads).
export default defineConfig(async () => {
  const { default: tsconfigPaths } = await import('vite-tsconfig-paths')

  return {
    plugins: [react(), tsconfigPaths()],
    test: {
      environment: 'jsdom',
      globals: true,
      pool: 'forks',
      setupFiles: ['src/test/setup.ts'],
      include: [
        'src/lib/__tests__/token-pricing.test.ts',
        'src/lib/__tests__/model-config.test.ts',
        'src/lib/__tests__/schedule-parser.test.ts',
        'src/opzava/modules/content/workflow/content-quality-gate.test.ts',
        'src/opzava/modules/content/campaign/campaign-send-approval.test.ts',
        'src/opzava/modules/content/campaign/run-approved-campaign.test.ts',
        'src/opzava/modules/content/providers/resolve-resend-campaign-connection.test.ts',
        'src/opzava/modules/content/providers/resolve-wordpress-draft-connection.test.ts',
        'src/opzava/modules/content/steps/wordpress-draft-service.test.ts',
        'src/opzava/platform/providers/env-secret-resolver.test.ts',
        'src/opzava/platform/runner/maintenance-daemon.test.ts',
        'src/opzava/platform/providers/limit-enforcement.test.ts',
        'src/opzava/platform/admin-config/runtime-options.test.ts',
        'src/opzava/modules/content/workflow/job-kind-executor.test.ts',
        'src/opzava/platform/costs/unified-cost-summary.test.ts',
        'src/opzava/platform/observability/log-shipping.test.ts',
        'src/opzava/platform/observability/log-shipper.test.ts',
        'src/opzava/platform/observability/log-ship-transport.test.ts',
      ],
    },
  }
})
