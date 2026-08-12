import { beforeEach, describe, expect, it, vi } from "vitest";

const framework = vi.hoisted(() => ({
  forbidden: vi.fn((): never => {
    throw new Error("NEXT_FORBIDDEN");
  }),
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const session = vi.hoisted(() => ({
  getAppSessionContext: vi.fn(),
}));

vi.mock("next/navigation", () => framework);
vi.mock("@/lib/session", () => session);

import {
  errorCode,
  errorStatusCode,
  forbiddenFromError,
  requireContext,
} from "../lib/authed-action";
import { connectionsMutationErrorResponse } from "../lib/connections-route-errors";

describe("authed action prologue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a missing session to login before returning action state", async () => {
    session.getAppSessionContext.mockResolvedValueOnce(null);

    await expect(requireContext()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(framework.redirect).toHaveBeenCalledWith("/login");
    expect(framework.forbidden).not.toHaveBeenCalled();
  });

  it("preserves thrown session resolution failures without a fallback", async () => {
    const failure = new Error("auth port unavailable");
    session.getAppSessionContext.mockRejectedValueOnce(failure);

    await expect(requireContext()).rejects.toBe(failure);
    expect(framework.redirect).not.toHaveBeenCalled();
    expect(framework.forbidden).not.toHaveBeenCalled();
  });

  it("keeps unauthenticated and authenticated forbidden outcomes distinct", async () => {
    session.getAppSessionContext.mockResolvedValueOnce(null);
    await expect(requireContext()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(() => forbiddenFromError({ code: "projectManagement.forbidden" })).toThrow(
      "NEXT_FORBIDDEN",
    );
    expect(framework.redirect).toHaveBeenCalledTimes(1);
    expect(framework.forbidden).toHaveBeenCalledTimes(1);
  });

  it("maps a nested status 403 to forbidden rather than an empty result", () => {
    expect(() => forbiddenFromError({ cause: { status: 403 } })).toThrow("NEXT_FORBIDDEN");
  });

  it("keeps the connections-specific forbidden code mapped to HTTP 403", () => {
    const response = connectionsMutationErrorResponse({
      code: "web.connectionsForbidden",
      message: "Admins only.",
    });

    expect(response.status).toBe(403);
  });
});

describe("authed action error walker", () => {
  it("terminates cyclic cause chains", () => {
    const first: { cause?: unknown } = {};
    const second: { cause?: unknown } = { cause: first };
    first.cause = second;

    expect(errorCode(first)).toBeUndefined();
    expect(errorStatusCode(first)).toBeUndefined();
  });

  it("preserves the depth greater than five cap", () => {
    const atDepthFive = { cause: { cause: { cause: { cause: { cause: { code: "visible", status: 403 } } } } } };
    const atDepthSix = { cause: atDepthFive };

    expect(errorCode(atDepthFive)).toBe("visible");
    expect(errorStatusCode(atDepthFive)).toBe(403);
    expect(errorCode(atDepthSix)).toBeUndefined();
    expect(errorStatusCode(atDepthSix)).toBeUndefined();
  });
});
