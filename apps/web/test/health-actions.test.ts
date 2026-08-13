import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  force: vi.fn(),
  requireContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/authed-action", () => ({ requireContext: mocks.requireContext }));
vi.mock("@/lib/doctor-scan", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/doctor-scan")>();
  return {
    ...original,
    defaultDoctorScanClient: () => ({ force: mocks.force }),
  };
});

const organizationId = "22222222-2222-4222-8222-222222222222";
const latest = {
  availability: "available" as const,
  latest: null,
  inProgress: true,
};

describe("recheckDoctorScanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPZAVA_PLATFORM_ORGANIZATION_ID", organizationId);
    vi.stubEnv("DOCTOR_SCAN_SCOPE", "platform-gateway");
    mocks.requireContext.mockResolvedValue({ roleKeys: ["admin"] });
  });

  it("forces the resolved scope when authorized", async () => {
    mocks.force.mockResolvedValue({ ok: true, value: latest });
    const { recheckDoctorScanAction } = await import("@/app/(app)/health/actions");

    await expect(recheckDoctorScanAction({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "idle",
    });
    expect(mocks.force).toHaveBeenCalledWith({ organizationId, scope: "platform-gateway" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/health");
  });

  it("returns an explicit failure when the scope is not configured", async () => {
    vi.stubEnv("OPZAVA_PLATFORM_ORGANIZATION_ID", "");
    const { recheckDoctorScanAction } = await import("@/app/(app)/health/actions");

    await expect(recheckDoctorScanAction({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: "Doctor scan is not configured.",
    });
    expect(mocks.force).not.toHaveBeenCalled();
  });

  it("maps cooldown conflicts without fabricating success", async () => {
    mocks.force.mockResolvedValue({
      ok: false,
      error: { code: "doctorScan.forceCooldown", message: "conflict" },
    });
    const { recheckDoctorScanAction } = await import("@/app/(app)/health/actions");

    await expect(recheckDoctorScanAction({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: "Scanned recently — available again soon.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats an unclaimed force as cooldown rather than success", async () => {
    mocks.force.mockResolvedValue({ ok: true, value: { ...latest, inProgress: false } });
    const { recheckDoctorScanAction } = await import("@/app/(app)/health/actions");

    await expect(recheckDoctorScanAction({ status: "idle" }, new FormData())).resolves.toMatchObject({
      status: "error",
      message: "Scanned recently — available again soon.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a failure instead of throwing when authorization fails", async () => {
    mocks.requireContext.mockRejectedValue(new Error("unauthorized"));
    const { recheckDoctorScanAction } = await import("@/app/(app)/health/actions");

    await expect(recheckDoctorScanAction({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: "You must be signed in as an administrator to re-check health.",
    });
    expect(mocks.force).not.toHaveBeenCalled();
  });
});
