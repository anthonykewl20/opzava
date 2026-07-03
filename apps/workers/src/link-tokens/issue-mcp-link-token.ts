import "dotenv/config";

import { issueLinkToken } from "@opzava/identity-access";
import path from "node:path";
import { fileURLToPath } from "node:url";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function optionalNumberEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }

  return parsed;
}

function scopesFromEnv(): readonly string[] {
  return requiredEnv("OPZAVA_LINK_TOKEN_SCOPES")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const issued = await issueLinkToken({
    orgId: requiredEnv("OPZAVA_LINK_TOKEN_ORG_ID"),
    workspaceId: requiredEnv("OPZAVA_LINK_TOKEN_WORKSPACE_ID"),
    userId: requiredEnv("OPZAVA_LINK_TOKEN_USER_ID"),
    sessionId: requiredEnv("OPZAVA_LINK_TOKEN_SESSION_ID"),
    scopes: scopesFromEnv(),
    ttlSeconds: optionalNumberEnv("OPZAVA_LINK_TOKEN_TTL_SECONDS", 3600),
  });

  if (!issued.ok) {
    throw issued.error;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  console.log(
    JSON.stringify(
      {
        token: issued.value.token,
        shownOnce: true,
        tokenId: issued.value.record.id,
        expiresAt: issued.value.record.expiresAt,
        mcp: {
          mcpServers: {
            opzava: {
              command: "pnpm",
              args: ["--dir", repoRoot, "--filter", "@opzava/mcp-server", "start"],
              env: {
                OPZAVA_LINK_TOKEN: "<paste-token-shown-once>",
                DATABASE_URL: "<runtime-database-url>",
              },
            },
          },
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Failed to issue MCP link token.";
  console.error(message);
  process.exitCode = 1;
});
