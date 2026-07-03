import "dotenv/config";

import { GitHubIssueTrackerAdapter } from "@opzava/adapters";
import { processIssueCloseOutbox } from "@opzava/project-management";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function optionalIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export async function processGitHubIssueCloseOutboxFromEnv(): Promise<void> {
  const repository = requiredEnv("GITHUB_ISSUES_REPOSITORY");
  const orgId = requiredEnv("ISSUE_CLOSE_ORG_ID");
  const workspaceId = requiredEnv("ISSUE_CLOSE_WORKSPACE_ID");
  const userId = requiredEnv("ISSUE_CLOSE_ACTOR_USER_ID");
  const roleKeys = (process.env["ISSUE_CLOSE_ROLE_KEYS"] ?? "admin")
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role !== "");
  const limit = optionalIntEnv("ISSUE_CLOSE_LIMIT", 10);

  const result = await processIssueCloseOutbox(
    {
      orgId,
      workspaceId,
      actor: { userId, roleKeys },
      repository,
      limit,
    },
    {
      issueTrackerPort: new GitHubIssueTrackerAdapter({
        repository,
        tokenEnvName: "GITHUB_TOKEN",
      }),
    },
  );

  if (!result.ok) {
    throw result.error;
  }

  console.log(
    JSON.stringify({
      processed: result.value.length,
      closed: result.value.filter((entry) => entry.state === "closed").length,
      retrying: result.value.filter((entry) => entry.state === "failed").length,
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await processGitHubIssueCloseOutboxFromEnv();
}
