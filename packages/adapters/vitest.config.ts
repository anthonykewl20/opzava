import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/postgres/__tests__/**/*.test.ts"],
    testTimeout: 30000
  }
});
