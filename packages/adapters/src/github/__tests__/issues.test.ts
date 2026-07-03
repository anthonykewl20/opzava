import { describe, expect, it } from "vitest";

import { GitHubIssueTrackerAdapter } from "../issues.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("GitHubIssueTrackerAdapter", () => {
  it("maps repository issues to Opzava DTOs without leaking GitHub response shapes", async () => {
    const adapter = new GitHubIssueTrackerAdapter({
      repository: "anthonykewl20/opzava",
      token: "test-token",
      fetch: async () =>
        jsonResponse(200, [
          {
            html_url: "https://github.com/anthonykewl20/opzava/issues/42",
            number: 42,
            state: "open",
            title: "Ship issue sync",
            labels: [{ name: "ready-for-agent" }],
            assignee: { login: "Atlas" },
            updated_at: "2026-07-03T00:00:00Z",
          },
        ]),
    });

    const result = await adapter.listIssues({ repository: "anthonykewl20/opzava", state: "all" });

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          ref: {
            provider: "github",
            repository: "anthonykewl20/opzava",
            number: 42,
            url: "https://github.com/anthonykewl20/opzava/issues/42",
          },
          title: "Ship issue sync",
          state: "open",
          labels: ["ready-for-agent"],
          assignee: "Atlas",
        },
      ],
    });
  });

  it("maps GitHub rate limits to typed Result errors", async () => {
    const adapter = new GitHubIssueTrackerAdapter({
      repository: "anthonykewl20/opzava",
      token: "test-token",
      fetch: async () => jsonResponse(403, { message: "rate limit" }, { "x-ratelimit-remaining": "0" }),
    });

    const result = await adapter.listIssues({ repository: "anthonykewl20/opzava", state: "all" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected rate limit failure");
    }
    expect(result.error.code).toBe("githubIssues.rateLimited");
  });
});
