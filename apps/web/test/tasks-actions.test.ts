import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  markTaskDone: vi.fn(),
  moveTask: vi.fn(),
  requireContext: vi.fn(),
}));

vi.mock("@opzava/project-management", () => ({
  createTask: mocks.createTask,
  markTaskDone: mocks.markTaskDone,
  moveTask: mocks.moveTask,
  taskPriorities: ["low", "normal", "high", "urgent"],
  taskStatuses: ["todo", "in_progress", "blocked", "done"],
  updateTask: vi.fn(),
}));
vi.mock("@/lib/authed-action", () => ({
  forbiddenFromError: vi.fn(),
  requireContext: mocks.requireContext,
}));
vi.mock("@/lib/task-attestation", () => ({
  attestHumanCommand: vi.fn(),
  issueDoneConfirmNonce: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createTaskAction, moveTaskAction } from "../app/(app)/tasks/actions";

describe("task action write status validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireContext.mockResolvedValue({
      user: { id: "user-1" },
      orgId: "org-1",
      workspaceId: "workspace-1",
      roleKeys: ["admin"],
    });
  });

  it("rejects done in the create schema before calling the application layer", async () => {
    const formData = new FormData();
    formData.set("title", "Task");
    formData.set("status", "done");
    formData.set("priority", "normal");
    formData.set("idempotencyKey", "task-create-1");

    const result = await createTaskAction({ status: "idle" }, formData);

    expect(result).toMatchObject({ status: "error", fieldErrors: { status: expect.any(String) } });
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("rejects done in the move schema before calling the application layer", async () => {
    const formData = new FormData();
    formData.set("taskId", "task-1");
    formData.set("status", "done");
    formData.set("position", "0");

    const result = await moveTaskAction({ status: "idle" }, formData);

    expect(result).toMatchObject({ status: "error", fieldErrors: { status: expect.any(String) } });
    expect(mocks.markTaskDone).not.toHaveBeenCalled();
    expect(mocks.moveTask).not.toHaveBeenCalled();
  });
});
