import { afterEach, describe, expect, it, vi } from "vitest";

const cleanupDoneConfirmations = vi.fn();

vi.mock("@opzava/project-management", () => ({ cleanupDoneConfirmations }));

describe("Done confirmation cleanup job", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env["TASK_DONE_CONFIRMATION_ORG_ID"];
  });

  it("runs the tenant cleanup sweep from the scheduled-job environment", async () => {
    process.env["TASK_DONE_CONFIRMATION_ORG_ID"] = "0f1c3670-0197-44d4-b2d6-3a481ce687ff";
    cleanupDoneConfirmations.mockResolvedValue({ ok: true, value: 3 });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { cleanupDoneConfirmationsFromEnv } = await import("./cleanup-done-confirmations.js");

    await cleanupDoneConfirmationsFromEnv();

    expect(cleanupDoneConfirmations).toHaveBeenCalledWith({
      orgId: "0f1c3670-0197-44d4-b2d6-3a481ce687ff",
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify({ deleted: 3 }));
    log.mockRestore();
  });
});
