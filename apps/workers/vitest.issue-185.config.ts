import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@opzava/adapters": resolve(workspaceRoot, "packages/adapters/src/index.ts"),
      "@opzava/crm": resolve(workspaceRoot, "packages/crm/src/index.ts"),
      "@opzava/identity-access": resolve(workspaceRoot, "packages/identity-access/src/index.ts"),
      "@opzava/ports": resolve(workspaceRoot, "packages/ports/dist/index.js"),
      "@opzava/project-management": resolve(workspaceRoot, "packages/project-management/src/index.ts"),
      "@opzava/runtime-control": resolve(workspaceRoot, "packages/runtime-control/src/index.ts"),
      "@opzava/shared-kernel": resolve(workspaceRoot, "packages/shared-kernel/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
  },
});
