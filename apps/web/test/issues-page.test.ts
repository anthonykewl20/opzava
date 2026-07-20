import { readFile } from "node:fs/promises";

import type { IssueTrackerIssue } from "@opzava/ports";
import type {
  CreateTrackedIssueInput,
  IssueProjectionDto,
  SyncIssueProjectionInput,
} from "@opzava/project-management";
import { ok } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import { buildLegacyAdminNavModel } from "../lib/admin-registry";
import {
  createIssueForContext,
  syncIssuesForContext,
  type IssuesActionDependencies,
} from "../lib/issues";
import {
  filterIssues,
  issueAssigneeView,
  issueDivergenceLabel,
  issueLabelView,
  issuePageCount,
  issuePageWindow,
  issuePipelineStages,
  issueSectionGroups,
  issueStatusView,
  parseIssueFilter,
  relativeIssueTime,
} from "../lib/issues-state";
import type { AppSessionContext } from "../lib/session";

function issue(overrides: Partial<IssueProjectionDto> = {}): IssueProjectionDto {
  return {
    id: "issue-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    repository: "anthonykewl20/opzava",
    number: 42,
    title: "Issue",
    state: "open",
    labels: [],
    assignee: null,
    updatedAt: "2026-07-03T00:00:00.000Z",
    syncedAt: "2026-07-03T00:00:00.000Z",
    url: "https://github.com/anthonykewl20/opzava/issues/42",
    linkedTaskId: null,
    linkedTaskStatus: null,
    ...overrides,
  };
}

function issueTrackerIssue(overrides: Partial<IssueTrackerIssue> = {}): IssueTrackerIssue {
  return {
    ref: {
      provider: "github",
      repository: "anthonykewl20/opzava",
      number: 42,
      url: "https://github.com/anthonykewl20/opzava/issues/42",
    },
    title: "Issue",
    state: "open",
    labels: [],
    assignee: null,
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

async function readRepoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function context(): AppSessionContext {
  return {
    sessionId: "session-1",
    user: { id: "user-1", email: "anthony@example.test", name: "Anthony" },
    orgId: "org-1",
    organizationName: "Opzava",
    organizationLifecycleState: "active",
    workspaceId: "workspace-1",
    workspaceName: "Admin",
    roleKeys: ["admin"],
  };
}

describe("Issues page state", () => {
  it("derives filter tabs and pipeline counts from live projection rows", () => {
    const issues = [
      issue({ number: 1 }),
      issue({ number: 2, labels: ["ready-for-agent"] }),
      issue({ number: 3, labels: ["ready-for-human"] }),
      issue({ number: 4, labels: ["in-progress"] }),
      issue({ number: 5, state: "closed" }),
    ];

    expect(parseIssueFilter("ready-for-agent")).toBe("ready-for-agent");
    expect(parseIssueFilter("unknown")).toBe("all");
    expect(filterIssues(issues, "ready-for-human").map((current) => current.number)).toEqual([3]);
    expect(issuePipelineStages(issues).map((stage) => [stage.id, stage.count])).toEqual([
      ["needs-triage", 1],
      ["ready-for-agent", 1],
      ["ready-for-human", 1],
      ["in-progress", 1],
      ["closed", 1],
    ]);
  });

  it("maps issue table assignees, status, relative time, and divergence", () => {
    expect(issueAssigneeView(null, "Anthony")).toEqual({
      label: "Unassigned",
      kind: "unassigned",
    });
    expect(issueAssigneeView("Atlas", "Anthony")).toEqual({
      label: "Atlas",
      kind: "ai-agent",
    });
    expect(issueStatusView(issue({ labels: ["ready-for-human"] }))).toEqual({
      label: "In review",
      dotClassName: "dot dot-warning",
    });
    expect(
      relativeIssueTime("2026-07-03T08:00:00.000Z", new Date("2026-07-03T10:00:00.000Z")),
    ).toBe("2h");
    expect(
      issueDivergenceLabel(
        issue({ state: "open", linkedTaskId: "task-1", linkedTaskStatus: "done" }),
      ),
    ).toBe("Task done · GitHub still open");
  });

  it("keeps the issue list scannable with one primary label and hidden extras", () => {
    expect(issueLabelView(issue())).toEqual({
      primaryLabel: "needs-triage",
      hiddenLabels: [],
    });
    expect(
      issueLabelView(issue({ labels: ["ready-for-agent", "area:gateway", "priority:p1"] })),
    ).toEqual({
      primaryLabel: "priority:p1",
      hiddenLabels: ["ready-for-agent", "area:gateway"],
    });
    expect(issueLabelView(issue({ labels: ["ready-for-agent", "orchestrator"] }))).toEqual({
      primaryLabel: "orchestrator",
      hiddenLabels: ["ready-for-agent"],
    });
  });

  it("chunks visible issues into typed sections and an 18-row page window", () => {
    const issues = Array.from({ length: 33 }, (_, index) =>
      issue({
        number: index + 1,
        title:
          index % 3 === 0
            ? `ADR-${index + 1} architecture record`
            : index % 3 === 1
              ? `PRD ${index + 1}: product requirement`
              : `Operational issue ${index + 1}`,
      }),
    );

    expect(issuePageCount(issues.length)).toBe(2);
    const secondPage = issuePageWindow(issues, 2);
    expect(secondPage).toMatchObject({
      page: 2,
      pageCount: 2,
      totalCount: 33,
      startItem: 19,
      endItem: 33,
    });
    expect(secondPage.issues).toHaveLength(15);
    expect(issueSectionGroups(secondPage.issues).map((group) => [group.id, group.count])).toEqual([
      ["adr", 5],
      ["prd", 5],
      ["other", 5],
    ]);
  });

  it("routes sync and create through session-derived issue services", async () => {
    let syncInput: SyncIssueProjectionInput | null = null;
    let createInput: CreateTrackedIssueInput | null = null;
    const dependencies = {
      listIssueProjections: async () => ok([]),
      syncIssueProjection: async (input: SyncIssueProjectionInput) => {
        syncInput = input;
        return ok([issue()]);
      },
      createTrackedIssue: async (input: CreateTrackedIssueInput) => {
        createInput = input;
        return ok(issue({ title: input.title }));
      },
      issueTrackerPort: {
        listIssues: async () => ok([]),
        getIssue: async () => ok(issueTrackerIssue()),
        createIssue: async () => ok(issueTrackerIssue()),
        closeIssue: async () => ok(issueTrackerIssue({ state: "closed" })),
      },
    } satisfies IssuesActionDependencies;

    const synced = await syncIssuesForContext(context(), dependencies);
    const created = await createIssueForContext(
      {
        context: context(),
        title: "  New issue  ",
        labels: ["ready-for-agent"],
        idempotencyKey: "web.issue.create:test-key",
      },
      dependencies,
    );

    expect(synced.ok).toBe(true);
    expect(created.ok).toBe(true);
    expect(syncInput).toMatchObject({
      orgId: "org-1",
      workspaceId: "workspace-1",
      actor: { userId: "user-1", roleKeys: ["admin"] },
      repository: "anthonykewl20/opzava",
    });
    expect(createInput).toMatchObject({
      title: "New issue",
      labels: ["ready-for-agent"],
      idempotencyKey: "web.issue.create:test-key",
    });
  });

  it("wires /issues page, actions, sidebar route, and mockup contract", async () => {
    const page = await readRepoFile("app/(app)/issues/page.tsx");
    const actions = await readRepoFile("app/(app)/issues/actions.ts");

    expect(page).toContain("Sync now");
    expect(page).toContain("New issue");
    expect(page).toContain('name="idempotencyKey"');
    expect(page).toContain("Triage pipeline");
    expect(page).toContain(
      "Page-specific composition only; values come from existing tokens and primitives.",
    );
    expect(page).toContain("UX laws: Hick's/Miller's chunking");
    expect(page).toContain('className="tabs"');
    expect(page).toContain('className="card issues-pipeline-strip"');
    expect(page).toContain("issuePageWindow");
    expect(page).toContain("issueSectionGroups");
    expect(page).toContain("IssueLabelChips");
    expect(page).toContain('className="table table-compact table-cards issues-list-table"');
    expect(page).toContain('className="issues-number-link"');
    expect(page).toContain("issueDivergenceLabel");
    expect(page).toContain("<time dateTime={value}>");
    expect(page).not.toContain("issues-page-header");
    expect(page).not.toContain("issues-table");
    expect(actions).toContain("syncIssuesForContext");
    expect(actions).toContain("createIssueForContext");
    expect(buildLegacyAdminNavModel({ roleKeys: ["admin"] }).operate).toContainEqual(
      expect.objectContaining({ label: "Issues", href: "/issues" }),
    );
  });
});
