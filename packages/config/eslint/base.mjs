import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

const sourceFiles = ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"];

export default [
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: sourceFiles,
    plugins: {
      boundaries
    },
    settings: {
      "boundaries/include": ["apps/**", "packages/**"],
      "boundaries/elements": [
        { type: "app", pattern: "apps/*" },
        { type: "shared-kernel", pattern: "packages/shared-kernel" },
        { type: "ports", pattern: "packages/ports" },
        { type: "adapters", pattern: "packages/adapters" },
        { type: "config", pattern: "packages/config" },
        { type: "bounded-context", pattern: "packages/identity-access" },
        { type: "bounded-context", pattern: "packages/tenant-provisioning" },
        { type: "bounded-context", pattern: "packages/platform-ops" },
        { type: "bounded-context", pattern: "packages/project-management" },
        { type: "bounded-context", pattern: "packages/internal-collaboration" },
        { type: "bounded-context", pattern: "packages/ai-workforce" },
        { type: "bounded-context", pattern: "packages/knowledge-management" },
        { type: "bounded-context", pattern: "packages/crm" },
        { type: "bounded-context", pattern: "packages/department-workflows" },
        { type: "bounded-context", pattern: "packages/finance" },
        { type: "bounded-context", pattern: "packages/notifications-admin-observability" },
        { type: "bounded-context", pattern: "packages/billing" },
        { type: "bounded-context", pattern: "packages/external-channels" },
        { type: "bounded-context", pattern: "packages/runtime-control" }
      ]
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            {
              from: "app",
              allow: ["adapters", "bounded-context", "config", "ports", "shared-kernel"]
            },
            {
              from: "ports",
              allow: ["shared-kernel"]
            },
            {
              from: "adapters",
              allow: ["ports", "shared-kernel"]
            },
            {
              from: "bounded-context",
              allow: ["ports", "shared-kernel"]
            },
            {
              from: ["config", "shared-kernel"],
              allow: []
            }
          ]
        }
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["apps/*", "@opzava/web", "@opzava/gateway-broker", "@opzava/workers"],
              message: "Application packages are composition roots and must not be imported."
            },
            {
              group: ["@opzava/*/src/*", "packages/*/src/*"],
              message: "Import Opzava packages through their public barrel only."
            }
          ]
        }
      ]
    }
  }
];
