import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  enableMfa: vi.fn(),
  startMfaEnrollment: vi.fn(),
  getCurrentAuthSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@opzava/identity-access/better-auth", () => ({
  authPort: { enableMfa: mocks.enableMfa, startMfaEnrollment: mocks.startMfaEnrollment },
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/session", () => ({ getCurrentAuthSession: mocks.getCurrentAuthSession }));

import { securityAction } from "../app/(auth)/security/actions";
import { MfaEnrollmentFields } from "../components/auth/security-form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("security MFA actions", () => {
  beforeEach(() => {
    mocks.enableMfa.mockReset();
    mocks.startMfaEnrollment.mockReset();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getCurrentAuthSession.mockResolvedValue({
      sessionId: "session-1",
      identity: { userId: "user-1", email: "owner@example.test" },
    });
  });

  it("preserves the enrollment secret and URI after a wrong enrollment code", async () => {
    mocks.enableMfa.mockResolvedValue({ ok: false, error: { code: "auth.mfaEnrollmentVerificationFailed" } });
    const state = await securityAction({
      status: "enrolling",
      secret: "BASE32SECRET",
      generation: "76dc5bc1-71e8-455c-b1e0-edc04a3d22ff",
      otpauthUri: "otpauth://totp/Opzava:owner@example.test?secret=BASE32SECRET",
    }, form({ intent: "enable", generation: "76dc5bc1-71e8-455c-b1e0-edc04a3d22ff", code: "000000" }));
    expect(state).toMatchObject({
      status: "enrolling",
      secret: "BASE32SECRET",
      otpauthUri: "otpauth://totp/Opzava:owner@example.test?secret=BASE32SECRET",
      message: expect.stringContaining("didn't match"),
    });
    if (state.secret === undefined || state.otpauthUri === undefined || state.generation === undefined || state.message === undefined) throw new Error("Expected preserved enrollment context.");
    const html = renderToStaticMarkup(<form><div role="alert">{state.message}</div><MfaEnrollmentFields secret={state.secret} otpauthUri={state.otpauthUri} generation={state.generation} /></form>);
    expect(html).toContain("BASE32SECRET");
    expect(html).toContain("otpauth://totp/Opzava:owner@example.test?secret=BASE32SECRET");
    expect(html).toContain("That code didn&#x27;t match");
  });

  it("clears enrollment material and offers restart when the authenticated session is no longer valid", async () => {
    mocks.enableMfa.mockResolvedValue({ ok: false, error: { code: "auth.currentSessionInvalid" } });
    const state = await securityAction({
      status: "enrolling",
      secret: "BASE32SECRET",
      generation: "76dc5bc1-71e8-455c-b1e0-edc04a3d22ff",
      otpauthUri: "otpauth://totp/Opzava:owner@example.test?secret=BASE32SECRET",
    }, form({ intent: "enable", generation: "76dc5bc1-71e8-455c-b1e0-edc04a3d22ff", code: "000000" }));
    expect(state).toEqual({ status: "error", message: "Enrollment expired — start again." });
    expect(state.secret).toBeUndefined();
    const html = renderToStaticMarkup(<MfaEnrollmentFields
      secret={state.secret ?? ""}
      otpauthUri={state.otpauthUri ?? ""}
      generation={state.generation ?? ""}
    />);
    expect(html).not.toContain("BASE32SECRET");
  });

  it("does not disclose enrollment material when password re-authentication fails", async () => {
    mocks.startMfaEnrollment.mockResolvedValue({ ok: false, error: { code: "auth.mfaEnrollmentPasswordInvalid" } });
    const state = await securityAction({ status: "idle" }, form({ intent: "start", password: "wrong-password" }));
    expect(mocks.startMfaEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", currentSessionId: "session-1", password: "wrong-password"
    }));
    expect(state).toEqual({ status: "error", message: "That password didn't match." });
    expect(state.secret).toBeUndefined();
  });

  it("returns the server-issued enrollment generation only after password re-authentication", async () => {
    mocks.startMfaEnrollment.mockResolvedValue({
      ok: true,
      value: {
        generation: "76dc5bc1-71e8-455c-b1e0-edc04a3d22ff",
        secret: "BASE32SECRET",
        otpauthUri: "otpauth://totp/Opzava:owner@example.test?secret=BASE32SECRET"
      }
    });
    await expect(securityAction({ status: "idle" }, form({ intent: "start", password: "Correct-Horse-Battery-Staple-1" }))).resolves.toMatchObject({
      status: "enrolling",
      generation: "76dc5bc1-71e8-455c-b1e0-edc04a3d22ff",
      secret: "BASE32SECRET"
    });
  });
});
