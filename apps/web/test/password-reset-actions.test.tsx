import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(), resetPassword: vi.fn(), changePassword: vi.fn(), getCurrentAuthSession: vi.fn(), headers: vi.fn()
}));

vi.mock("@opzava/identity-access/better-auth", () => ({
  authPort: { requestPasswordReset: mocks.requestPasswordReset, resetPassword: mocks.resetPassword, changePassword: mocks.changePassword }
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/session", () => ({ getCurrentAuthSession: mocks.getCurrentAuthSession }));

import { requestPasswordResetAction } from "../app/(auth)/forgot-password/actions";
import { resetPasswordAction } from "../app/(auth)/reset-password/actions";
import { changePasswordAction } from "../app/(auth)/security/actions";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("password reset and change-password actions", () => {
  beforeEach(() => {
    mocks.requestPasswordReset.mockReset(); mocks.resetPassword.mockReset(); mocks.changePassword.mockReset();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getCurrentAuthSession.mockResolvedValue({ sessionId: "session-1", identity: { userId: "user-1", email: "owner@example.test" } });
  });

  it("returns the same generic confirmation for an unknown account", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ ok: true, value: { status: "reset-token-issued" } });
    await expect(requestPasswordResetAction({ status: "idle" }, form({ email: "missing@example.test" }))).resolves.toEqual({
      status: "sent", message: "If that account can be reset, follow the instructions provided by your administrator."
    });
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({ email: "missing@example.test" });
  });

  it("does not send mismatched reset passwords to the AuthPort", async () => {
    await expect(resetPasswordAction({ status: "idle" }, form({ handle: "a".repeat(43), password: "long-enough-password", confirmPassword: "different-password" }))).resolves.toMatchObject({ status: "error", message: "Passwords do not match." });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("passes XFF to the public handle exchange limiter", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "spoofed-client, 198.51.100.17" }));
    mocks.resetPassword.mockResolvedValue({ ok: false, error: { code: "auth.resetInvalid" } });
    await resetPasswordAction({ status: "idle" }, form({ handle: "a".repeat(43), password: "long-enough-password", confirmPassword: "long-enough-password" }));
    expect(mocks.resetPassword).toHaveBeenCalledWith({ handle: "a".repeat(43), newPassword: "long-enough-password", ipAddress: "spoofed-client, 198.51.100.17" });
  });

  it("requires the current password and preserves the current session when changing password", async () => {
    mocks.changePassword.mockResolvedValue({ ok: true, value: undefined });
    await expect(changePasswordAction({ status: "idle" }, form({ currentPassword: "current-password", newPassword: "long-enough-password", confirmPassword: "long-enough-password" }))).resolves.toMatchObject({ status: "success" });
    expect(mocks.changePassword).toHaveBeenCalledWith({ userId: "user-1", currentSessionId: "session-1", currentPassword: "current-password", newPassword: "long-enough-password" });
  });
});
