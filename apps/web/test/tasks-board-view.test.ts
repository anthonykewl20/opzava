import { readFile } from "node:fs/promises";

import type { TaskDto } from "@opzava/project-management";
import { describe, expect, it } from "vitest";

import {
  filterBoardTasks,
  nextTaskStatus,
  statusColumns,
  taskCardTimingLabel,
  taskSearchText,
  taskStatusChip,
} from "../lib/tasks-board-view";

async function readRepoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function task(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: "task-1",
    organizationId: "org-1",
    workspaceId: "workspace-1",
    cardNumber: 1042,
    title: "Audit Q2 social performance",
    description: "Compare paid and organic channels",
    status: "todo",
    priority: "high",
    assigneeUserId: "user-1",
    assigneeName: "Iris Ramos",
    labels: ["marketing", "q2"],
    position: 1,
    dueAt: null,
    provenanceSource: "manual",
    provenanceExternalRef: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
    ...overrides,
  };
}

describe("Tasks board view model", () => {
  it("maps the live task statuses into the mockup board columns", () => {
    expect(statusColumns.map((column) => [column.status, column.title, column.domId])).toEqual([
      ["todo", "Backlog", "col-backlog"],
      ["in_progress", "In progress", "col-inprogress"],
      ["blocked", "Review", "col-review"],
      ["done", "Done", "col-done"],
    ]);
    expect(nextTaskStatus("todo")).toBe("in_progress");
    expect(nextTaskStatus("blocked")).toBe("done");
  });

  it("filters tasks through real task fields only", () => {
    const tasks = [
      task(),
      task({
        id: "task-2",
        cardNumber: 1043,
        title: "Proofread newsletter",
        status: "blocked",
        priority: "low",
        assigneeName: "Atlas-7",
        labels: ["email"],
      }),
    ];

    expect(
      filterBoardTasks(tasks, {
        search: "atlas review",
        status: "all",
        priority: "all",
      }).map((current) => current.id),
    ).toEqual(["task-2"]);
    expect(
      filterBoardTasks(tasks, {
        search: "",
        status: "todo",
        priority: "high",
      }).map((current) => current.id),
    ).toEqual(["task-1"]);
    expect(taskSearchText(task())).toContain("iris ramos");
  });

  it("derives card chips and timing copy from task data", () => {
    expect(taskStatusChip("in_progress")).toEqual({
      className: "badge badge-accent",
      dotClassName: "dot dot-accent",
      label: "Running",
    });
    expect(
      taskCardTimingLabel(
        task({
          status: "in_progress",
          updatedAt: "2026-07-03T09:20:00.000Z",
        }),
        new Date("2026-07-03T10:00:00.000Z"),
      ),
    ).toBe("Started 40 minutes ago");
    expect(
      taskCardTimingLabel(
        task({
          dueAt: "2026-07-05T00:00:00.000Z",
        }),
        new Date("2026-07-03T10:00:00.000Z"),
      ),
    ).toBe("Due Sunday");
  });

  it("wires the task create form with a per-open replay-safe idempotency key", async () => {
    const [board, actions, page] = await Promise.all([
      readRepoFile("components/tasks/tasks-board.tsx"),
      readRepoFile("app/(app)/tasks/actions.ts"),
      readRepoFile("app/(app)/tasks/page.tsx"),
    ]);

    expect(board).toContain("createTaskIdempotencyKey");
    expect(board).toContain("web.task.create");
    expect(board).toContain('name="idempotencyKey"');
    expect(actions).toContain("idempotencyKey: z.string().trim().min(1).max(160)");
    expect(actions).toContain("idempotencyKey: parsed.data.idempotencyKey");

    expect(page).toContain("DESCOPE(project-filter)");
    expect(page).toContain("id: context.workspaceId");
    expect(board).not.toContain("All projects");
    expect(board).not.toContain('workspaceId: "all"');
  });
});
