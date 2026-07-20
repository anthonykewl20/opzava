import { describe, expect, it, vi } from "vitest";

const framework = vi.hoisted(() => ({
  forbidden: vi.fn((): never => {
    throw new Error("NEXT_FORBIDDEN");
  }),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => framework);
vi.mock("@/lib/session", () => ({
  getAppSessionContext: async () => ({ roleKeys: ["owner"] }),
}));

import UnmatchedAdminPathPage from "../app/(app)/[...adminPath]/page";

describe("Unmatched Admin route admission", () => {
  it("hard-forbids an unregistered path", async () => {
    await expect(
      UnmatchedAdminPathPage({ params: Promise.resolve({ adminPath: ["random", "path"] }) }),
    ).rejects.toThrow("NEXT_FORBIDDEN");

    expect(framework.forbidden).toHaveBeenCalledTimes(1);
    expect(framework.notFound).not.toHaveBeenCalled();
  });

  it("preserves 404 for an admitted destination whose leaf has not landed", async () => {
    await expect(
      UnmatchedAdminPathPage({ params: Promise.resolve({ adminPath: ["gateway"] }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(framework.notFound).toHaveBeenCalledTimes(1);
  });
});
