import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Only source tests. Without this, vitest's default include also matches the
    // compiled dist/**/*.test.js, running each suite twice and racing on shared
    // singletons (e.g. first_owner_setup).
    include: ["src/**/*.test.ts"],
    testTimeout: 30000
  }
});
