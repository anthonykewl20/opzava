import { describe, expect, it } from "vitest";

import { sanitizeFailure, sanitizeFailureMessage } from "../acl/openclaw/errors.js";

const FALLBACK = "OpenClaw stream failed.";

describe("sanitizeFailureMessage (#252 broker ACL sanitizer)", () => {
  it("lifts the semantic message out of a raw vendor JSON blob", () => {
    const blob =
      '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'gpt-5.6-sol\' model requires a newer version of Codex to use this model."}}';
    expect(sanitizeFailureMessage(blob, FALLBACK)).toBe(
      "The 'gpt-5.6-sol' model requires a newer version of Codex to use this model.",
    );
  });

  it("strips cf-ray, upstream URL, and request id from a 401 upstream error", () => {
    // The exact leak the owner saw live (2026-07-16).
    const leak =
      "unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses, cf-ray: a1b22d857c3484a5-HKG, request id: req_73d0a1881cf9490d88ca96376ebe7926";
    const sanitized = sanitizeFailureMessage(leak, FALLBACK);

    // Semantic, operator-actionable text (the credential was rejected) survives.
    expect(sanitized).toBe(
      "unexpected status 401 Unauthorized: Missing bearer or basic authentication in header",
    );
    // And none of the topology/vendor detail reaches the output.
    expect(sanitized).not.toContain("api.openai.com");
    expect(sanitized).not.toContain("https://");
    expect(sanitized).not.toContain("cf-ray");
    expect(sanitized).not.toContain("a1b22d857c3484a5");
    expect(sanitized).not.toContain("request id");
    expect(sanitized).not.toContain("req_73d0");
  });

  it("scrubs a URL/key embedded inside an otherwise-semantic message (content scan, not fields)", () => {
    const embedded =
      "The 'gpt-5.6-sol' model requires a newer version of Codex (see https://api.openai.com/v1/responses for details) key=sk-proj1234567890abcdefghij";
    const sanitized = sanitizeFailureMessage(embedded, FALLBACK);

    expect(sanitized).toContain("The 'gpt-5.6-sol' model requires a newer version of Codex");
    expect(sanitized).not.toContain("https://");
    expect(sanitized).not.toContain("api.openai.com");
    expect(sanitized).not.toContain("sk-proj1234567890abcdefghij");
  });

  it("collapses pure transport noise to the fallback (carries no operator action)", () => {
    expect(sanitizeFailureMessage("codex app-server client closed before turn completed", FALLBACK)).toBe(
      FALLBACK,
    );
    expect(sanitizeFailureMessage("socket hang up ECONNRESET", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeFailureMessage("fetch failed: ENOTFOUND api.openai.com", FALLBACK)).toBe(FALLBACK);
  });

  it("preserves broker-owned semantic text that has no infra tokens", () => {
    expect(
      sanitizeFailureMessage(
        "Gateway route tenant does not match the authenticated principal.",
        FALLBACK,
      ),
    ).toBe("Gateway route tenant does not match the authenticated principal.");
    expect(sanitizeFailureMessage("Provider rate limit.", FALLBACK)).toBe("Provider rate limit.");
  });

  it("walks nested error objects inside a JSON blob to find the semantic message", () => {
    const nested =
      '{"error":{"error":{"message":"deep semantic cause text"}}}';
    expect(sanitizeFailureMessage(nested, FALLBACK)).toBe("deep semantic cause text");
  });

  it("drops a JSON blob that carries no semantic message", () => {
    expect(sanitizeFailureMessage('{"type":"error","status":500}', FALLBACK)).toBe(FALLBACK);
  });

  it("falls back for empty / undefined / null / non-string input", () => {
    expect(sanitizeFailureMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeFailureMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeFailureMessage("", FALLBACK)).toBe(FALLBACK);
    expect(sanitizeFailureMessage("   ", FALLBACK)).toBe(FALLBACK);
  });

  it("does not treat a message that merely contains a brace as a JSON blob", () => {
    const withBrace = "Stream failed near config { retry: 3 } — see logs.";
    expect(sanitizeFailureMessage(withBrace, FALLBACK)).toBe(withBrace);
  });
});

describe("sanitizeFailure (#252 strict { code, sanitizedMessage } payload)", () => {
  it("keeps a structured code and sanitizes the message of an error object", () => {
    const result = sanitizeFailure(
      {
        code: "openclaw.streamFailed",
        message: "unexpected status 401, url: https://api.openai.com/v1/responses",
      },
      "gatewayBroker.requestFailed",
      "Gateway broker request failed.",
    );
    expect(result.code).toBe("openclaw.streamFailed");
    expect(result.sanitizedMessage).not.toContain("https://");
    expect(result.sanitizedMessage).not.toContain("api.openai.com");
    expect(result.sanitizedMessage).toContain("unexpected status 401");
  });

  it("falls back to the fallback code/message for a non-object throw", () => {
    expect(sanitizeFailure("a raw string", "gatewayBroker.requestFailed", "Gateway broker request failed.")).toEqual({
      code: "gatewayBroker.requestFailed",
      sanitizedMessage: "a raw string",
    });
    expect(sanitizeFailure(42, "gatewayBroker.requestFailed", "Gateway broker request failed.")).toEqual({
      code: "gatewayBroker.requestFailed",
      sanitizedMessage: "Gateway broker request failed.",
    });
    expect(sanitizeFailure(undefined, "gatewayBroker.requestFailed", "Gateway broker request failed.")).toEqual({
      code: "gatewayBroker.requestFailed",
      sanitizedMessage: "Gateway broker request failed.",
    });
  });

  it("uses the fallback code when the error code is missing or non-string", () => {
    expect(
      sanitizeFailure(
        { message: "openclaw chat error" },
        "gatewayBroker.requestFailed",
        "Gateway broker request failed.",
      ).code,
    ).toBe("gatewayBroker.requestFailed");
    expect(
      sanitizeFailure(
        { code: 123, message: "openclaw chat error" },
        "gatewayBroker.requestFailed",
        "Gateway broker request failed.",
      ).code,
    ).toBe("gatewayBroker.requestFailed");
  });
});
