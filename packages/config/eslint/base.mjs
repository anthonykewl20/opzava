import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

const sourceFiles = ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"];
const workspaceRoot = findWorkspaceRoot(path.dirname(fileURLToPath(import.meta.url)));
const workspacePackages = readWorkspacePackages(workspaceRoot);
const boundaryElements = buildBoundaryElements(workspacePackages);
const boundaryAllowRules = buildBoundaryAllowRules(boundaryElements);

function findWorkspaceRoot(startDir) {
  let currentDir = startDir;

  while (!fs.existsSync(path.join(currentDir, "pnpm-workspace.yaml"))) {
    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error(`Unable to find pnpm-workspace.yaml from ${startDir}`);
    }

    currentDir = parentDir;
  }

  return currentDir;
}

function readWorkspacePackages(rootDir) {
  return readWorkspacePackageGlobs(rootDir).flatMap((workspaceGlob) =>
    expandWorkspaceGlob(rootDir, workspaceGlob)
  );
}

function readWorkspacePackageGlobs(rootDir) {
  const workspaceFile = fs.readFileSync(path.join(rootDir, "pnpm-workspace.yaml"), "utf8");
  const globs = [];
  let inPackagesBlock = false;

  for (const line of workspaceFile.split(/\r?\n/)) {
    if (/^packages:\s*$/.test(line)) {
      inPackagesBlock = true;
      continue;
    }

    if (inPackagesBlock && /^\S/.test(line)) {
      break;
    }

    if (!inPackagesBlock) {
      continue;
    }

    const match = line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);

    if (match) {
      globs.push(match[1]);
    }
  }

  return globs;
}

function expandWorkspaceGlob(rootDir, workspaceGlob) {
  if (!workspaceGlob.endsWith("/*")) {
    return [];
  }

  const workspaceDir = workspaceGlob.slice(0, -2);
  const absoluteWorkspaceDir = path.join(rootDir, workspaceDir);

  if (!fs.existsSync(absoluteWorkspaceDir)) {
    return [];
  }

  return fs
    .readdirSync(absoluteWorkspaceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => path.posix.join(workspaceDir, entry.name))
    .filter((relativeDir) => fs.existsSync(path.join(rootDir, relativeDir, "package.json")))
    .map((relativeDir) => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(rootDir, relativeDir, "package.json"), "utf8")
      );

      return {
        name: packageJson.name,
        relativeDir,
        type: classifyWorkspacePackage(relativeDir)
      };
    })
    .filter((workspacePackage) => workspacePackage.type !== null);
}

function classifyWorkspacePackage(relativeDir) {
  if (relativeDir.startsWith("apps/")) {
    return "app";
  }

  if (!relativeDir.startsWith("packages/")) {
    return null;
  }

  switch (path.posix.basename(relativeDir)) {
    case "shared-kernel":
      return "shared-kernel";
    case "ports":
      return "ports";
    case "adapters":
      return "adapters";
    case "config":
      return "config";
    default:
      return "bounded-context";
  }
}

function buildBoundaryElements(packages) {
  const elements = [];
  const packagesByType = Map.groupBy(packages, (workspacePackage) => workspacePackage.type);

  if (packagesByType.has("app")) {
    elements.push({ type: "app", pattern: "apps/*" });
  }

  for (const type of ["shared-kernel", "ports", "adapters", "config"]) {
    for (const workspacePackage of packagesByType.get(type) ?? []) {
      elements.push({ type, pattern: workspacePackage.relativeDir });
    }
  }

  for (const workspacePackage of packagesByType.get("bounded-context") ?? []) {
    elements.push({ type: "bounded-context", pattern: workspacePackage.relativeDir });
  }

  return elements;
}

function buildBoundaryAllowRules(elements) {
  const elementTypes = new Set(elements.map((element) => element.type));
  const allowRules = [];
  const outboundPolicies = [
    ["app", ["adapters", "bounded-context", "config", "ports", "shared-kernel"]],
    ["ports", ["shared-kernel"]],
    ["adapters", ["ports", "shared-kernel"]],
    ["bounded-context", ["ports", "shared-kernel"]]
  ];

  for (const [from, allow] of outboundPolicies) {
    if (elementTypes.has(from)) {
      allowRules.push({
        from,
        allow: allow.filter((type) => elementTypes.has(type))
      });
    }
  }

  const internalLeafTypes = ["config", "shared-kernel"].filter((type) => elementTypes.has(type));

  if (internalLeafTypes.length > 0) {
    allowRules.push({
      from: internalLeafTypes.length === 1 ? internalLeafTypes[0] : internalLeafTypes,
      allow: []
    });
  }

  return allowRules;
}

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
      "boundaries/elements": boundaryElements
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: boundaryAllowRules
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
