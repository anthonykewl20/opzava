import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  verifyMfaChallenge: vi.fn(),
  startPasskeySignIn: vi.fn(),
  finishPasskeySignIn: vi.fn(),
  headers: vi.fn(),
  setSessionCookie: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@opzava/identity-access/better-auth", () => ({
  authPort: {
    signIn: mocks.signIn,
    verifyMfaChallenge: mocks.verifyMfaChallenge,
    startPasskeySignIn: mocks.startPasskeySignIn,
    finishPasskeySignIn: mocks.finishPasskeySignIn
  },
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth-cookie", () => ({ setSessionCookie: mocks.setSessionCookie }));

import { finishPasskeyLoginAction, loginAction, verifyMfaAction } from "../app/(auth)/login/actions";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  mocks.signIn.mockReset();
  mocks.verifyMfaChallenge.mockReset();
  mocks.startPasskeySignIn.mockReset();
  mocks.finishPasskeySignIn.mockReset();
  mocks.setSessionCookie.mockReset();
  mocks.redirect.mockReset();
  mocks.headers.mockResolvedValue(new Headers({ "user-agent": "vitest" }));
});

describe("login MFA actions", () => {
  it("returns the server-issued challenge rather than issuing a session", async () => {
    mocks.signIn.mockResolvedValue({
      ok: true,
      value: { challengeId: "opaque-challenge", userId: "user", tenantId: "org", method: "totp", issuedAt: new Date(), expiresAt: new Date() },
    });
    await expect(loginAction({ status: "idle" }, form({ email: "owner@example.test", password: "secret" }))).resolves.toEqual({
      status: "mfa", challengeId: "opaque-challenge",
    });
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("keeps the MFA step on an invalid code", async () => {
    mocks.verifyMfaChallenge.mockResolvedValue({ ok: false, error: new Error("invalid") });
    const state = await verifyMfaAction({ status: "idle" }, form({ challengeId: "opaque-challenge", code: "000000", method: "totp" }));
    expect(state.status).toBe("mfa");
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("exposes an MFA lockout distinctly from an invalid code", async () => {
    mocks.verifyMfaChallenge.mockResolvedValue({
      ok: false,
      error: { code: "auth.mfaChallengeUnavailable" },
    });
    await expect(verifyMfaAction(
      { status: "idle" },
      form({ challengeId: "opaque-challenge", code: "000000", method: "totp" }),
    )).resolves.toMatchObject({
      status: "mfa",
      locked: true,
      message: "Too many attempts — try again in a few minutes",
    });
  });

  it("returns passkey verification failure state for the login form to render", async () => {
    mocks.finishPasskeySignIn.mockResolvedValue({ ok: false, error: { code: "auth.passkeyVerificationFailed" } });
    await expect(finishPasskeyLoginAction("opaque-challenge", { id: "credential" })).resolves.toEqual({
      status: "error",
      message: "That passkey could not be verified. Try again or use your password."
    });
  });
});
