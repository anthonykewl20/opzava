import { defineConfig } from "@playwright/test";

const port = Number(process.env["PORT"] ?? 3000);
const baseURL = process.env["PLAYWRIGHT_BASE_URL"] ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `pnpm start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env["CI"],
    env: {
      APP_URL: baseURL,
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET:
        process.env["BETTER_AUTH_SECRET"] ?? "local-test-better-auth-secret-32-chars",
      DATABASE_URL:
        process.env["DATABASE_URL"] ??
        "postgresql://opzava_app:opzava_app_local_only@localhost:15432/opzava"
    }
  }
});
