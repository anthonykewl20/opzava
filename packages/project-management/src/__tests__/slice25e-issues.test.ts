import type { IssueTrackerPort } from "@opzava/ports";
import { DomainError, err, ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import {
  issueFilterFromLabels,
  issueRefFromTask,
  processIssueCloseOutbox,
  type IssueProjectionDto,
} from "../application/issues.js";
import type { TaskDto } from "../application/tasks.js";

function task(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    workspaceId: "33333333-3333-4333-8333-333333333333",
    cardNumber: 42,
    title: "Issue linked task",
    description: "",
    status: "done",
    priority: "normal",
    assigneeUserId: null,
    assigneeName: null,
    labels: [],
    position: 1,
    dueAt: null,
    provenanceSource: "github",
    provenanceExternalRef: "github:anthonykewl20/opzava#123",
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

function issue(overrides: Partial<IssueProjectionDto> = {}): IssueProjectionDto {
  return {
    id: "issue-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    repository: "anthonykewl20/opzava",
    number: 123,
    title: "Issue",
    state: "open",
    labels: [],
    assignee: null,
    updatedAt: "2026-07-03T00:00:00.000Z",
    syncedAt: "2026-07-03T00:00:00.000Z",
    url: "https://github.com/anthonykewl20/opzava/issues/123",
    linkedTaskId: null,
    linkedTaskStatus: null,
    ...overrides,
  };
}

describe("slice 2.5e issue helpers", () => {
  it("derives triage filters from labels and issue state", () => {
    expect(issueFilterFromLabels(issue())).toBe("needs-triage");
    expect(issueFilterFromLabels(issue({ labels: ["ready-for-agent"] }))).toBe("ready-for-agent");
    expect(issueFilterFromLabels(issue({ labels: ["ready-for-human"] }))).toBe("ready-for-human");
    expect(issueFilterFromLabels(issue({ labels: ["in-progress"] }))).toBe("in-progress");
    expect(issueFilterFromLabels(issue({ state: "closed" }))).toBe("closed");
  });

  it("parses supported GitHub task provenance refs", () => {
    expect(issueRefFromTask(task())).toEqual({
      repository: "anthonykewl20/opzava",
      number: 123,
      url: "https://github.com/anthonykewl20/opzava/issues/123",
    });
    expect(
      issueRefFromTask(
        task({
          provenanceExternalRef: "https://github.com/anthonykewl20/opzava/issues/124",
        }),
      ),
    ).toEqual({
      repository: "anthonykewl20/opzava",
      number: 124,
      url: "https://github.com/anthonykewl20/opzava/issues/124",
    });
    expect(issueRefFromTask(task({ provenanceExternalRef: "not-github" }))).toBeNull();
  });

  it("requires an issue tracker port for active-close processing", async () => {
    const result = await processIssueCloseOutbox({
      orgId: "22222222-2222-4222-8222-222222222222",
      workspaceId: "33333333-3333-4333-8333-333333333333",
      actor: { userId: "44444444-4444-4444-8444-444444444444", roleKeys: ["admin"] },
      repository: "anthonykewl20/opzava",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing tracker failure");
    }
    expect(result.error.code).toBe("projectManagement.issueTrackerMissing");
  });

  it("documents fake IssueTrackerPort sad paths for worker tests", async () => {
    const fake: IssueTrackerPort = {
      listIssues: async () => ok([]),
      getIssue: async () =>
        err(new DomainError({ code: "fake.notFound", message: "not found" })),
      createIssue: async () =>
        err(new DomainError({ code: "fake.forbidden", message: "forbidden" })),
      closeIssue: async () =>
        err(new DomainError({ code: "fake.rateLimited", message: "retry later" })),
    };

    const closed = await fake.closeIssue({
      ref: {
        provider: "github",
        repository: "anthonykewl20/opzava",
        number: 1,
        url: "https://github.com/anthonykewl20/opzava/issues/1",
      },
      reason: "completed",
    });

    expect(closed.ok).toBe(false);
  });
});
