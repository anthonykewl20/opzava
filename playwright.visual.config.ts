import { createVisualRegressionConfig } from './playwright.base.config'

// The Visual Regression config — extends the E2E Contract base (see ARD 0030 / module-design.md).
// Slice 0: createVisualRegressionConfig defaults to 1 project / 1 theme / 1 viewport (the walking
// skeleton). The full 2×2 matrix becomes the default in Slice 1.
export default createVisualRegressionConfig({
  globalSetup: 'tests/visual/global-setup.ts',
  testMatch: /.*\.visual\.spec\.ts$/,
})
