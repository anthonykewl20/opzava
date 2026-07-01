import { defineConfig, devices } from "@playwright/test";

const desktopChrome = devices["Desktop Chrome"];

if (!desktopChrome) {
  throw new Error("Playwright Desktop Chrome device descriptor is unavailable.");
}

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: true,
  retries: process.env["CI"] ? 2 : 0,
  use: {
    baseURL: process.env["APP_URL"] ?? "http://web.opzava.localhost:18088",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...desktopChrome }
    }
  ]
});
