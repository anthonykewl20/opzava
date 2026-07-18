import { describe, expect, it } from "vitest";

import {
  classifyAskAdminFailureState,
  mapBrokerError,
  presentAskAdminMessage,
  type AskAdminFailureState,
} from "../lib/ask-admin-failure";

describe("mapBrokerError seam — classification (#165, unchanged by #252)", () => {
  it("classifies duplicate-send codes", () => {
    expect(mapBrokerError({ code: "runtimeControl.idempotencyConflict" })).toMatchObject({
      state: "duplicate_send",
      reconnectEligible: false,
    });
    expect(mapBrokerError({ code: "gatewayBroker.sessionBusy" })).toMatchObject({
      state: "duplicate_send",
      reconnectEligible: false,
    });
  });

  it("classifies policy-denied codes and a 403 status", () => {
    for (const code of [
      "runtimeControl.forbidden",
      "gatewayBroker.tenantMismatch",
      "gatewayBroker.toolInventoryMismatch",
      "webGateway.internalUnauthorized",
    ]) {
      expect(mapBrokerError({ code })).toMatchObject({
        state: "policy_denied",
        reconnectEligible: false,
      });
    }
    expect(mapBrokerError({ status: 403 })).toMatchObject({
      state: "policy_denied",
      reconnectEligible: false,
    });
  });

  it("classifies transient gateway-unavailable codes as reconnect-eligible", () => {
    for (const code of [
      "gatewayBroker.connectionClosed",
      "gatewayBroker.gatewayUnavailable",
      "gatewayBroker.circuitOpen",
      "webGateway.streamInterrupted",
    ]) {
      expect(mapBrokerError({ code })).toMatchObject({
        state: "gateway_unavailable",
        reconnectEligible: true,
      });
    }
  });

  it("falls back to generic failed for unknown codes", () => {
    expect(mapBrokerError({ code: "askAdmin.failed" })).toMatchObject({
      state: "failed",
      reconnectEligible: false,
    });
    expect(mapBrokerError({})).toMatchObject({ state: "failed", reconnectEligible: false });
  });

  it("keeps the four-state classification total", () => {
    const states: AskAdminFailureState[] = [
      classifyAskAdminFailureState({ code: "gatewayBroker.sessionBusy" }),
      classifyAskAdminFailureState({ code: "gatewayBroker.tenantMismatch" }),
      classifyAskAdminFailureState({ code: "gatewayBroker.connectionClosed" }),
      classifyAskAdminFailureState({ code: "askAdmin.failed" }),
    ];
    expect(new Set(states)).toEqual(
      new Set<AskAdminFailureState>([
        "duplicate_send",
        "policy_denied",
        "gateway_unavailable",
        "failed",
      ]),
    );
  });
});

describe("mapBrokerError seam — presentation (#252)", () => {
  it("always returns a non-empty browser message", () => {
    for (const code of [
      "runtimeControl.idempotencyConflict",
      "gatewayBroker.tenantMismatch",
      "gatewayBroker.connectionClosed",
      "askAdmin.failed",
    ]) {
      expect(mapBrokerError({ code }).message).toEqual(expect.any(String));
      expect(mapBrokerError({ code }).message.length).toBeGreaterThan(0);
    }
  });

  it("falls back to an Opzava-owned string per state when no sanitized message is supplied", () => {
    expect(mapBrokerError({ code: "gatewayBroker.connectionClosed" }).message).toBe(
      "The assistant gateway is temporarily unavailable.",
    );
    expect(mapBrokerError({ code: "gatewayBroker.tenantMismatch" }).message).toBe(
      "Ask Admin is not permitted to perform that action.",
    );
    expect(mapBrokerError({ code: "runtimeControl.idempotencyConflict" }).message).toBe(
      "This message is already being sent; wait for it to finish before resending.",
    );
    expect(mapBrokerError({ code: "askAdmin.failed" }).message).toBe(
      "Ask Admin Opzava could not complete the request.",
    );
  });

  it("surfaces the broker-sanitized semantic message when one is supplied (every state)", () => {
    // duplicate_send: the idempotency conflict message is operator-useful and
    // not infrastructure detail, so it surfaces rather than the fallback.
    expect(
      mapBrokerError(
        { code: "runtimeControl.idempotencyConflict" },
        "Idempotency key was reused with a different payload.",
      ).message,
    ).toBe("Idempotency key was reused with a different payload.");

    // failed: the actionable model-configuration hint surfaces verbatim.
    expect(
      mapBrokerError(
        { code: "openclaw.streamFailed" },
        "The 'gpt-5.6-sol' model requires a newer version of Codex to use this model.",
      ).message,
    ).toBe("The 'gpt-5.6-sol' model requires a newer version of Codex to use this model.");

    // gateway_unavailable: a broker-owned message surfaces (it is not transport noise
    // once the broker has already sanitized/collapsed that).
    expect(
      mapBrokerError(
        { code: "gatewayBroker.connectionClosed" },
        "Gateway stream ended before a final assistant message.",
      ).message,
    ).toBe("Gateway stream ended before a final assistant message.");
  });

  it("treats a blank sanitized message as absent and falls back", () => {
    expect(mapBrokerError({ code: "askAdmin.failed" }, "   ").message).toBe(
      "Ask Admin Opzava could not complete the request.",
    );
  });
});

describe("presentAskAdminMessage", () => {
  it("surfaces non-empty sanitized text", () => {
    expect(presentAskAdminMessage("failed", "provider rejected the credential")).toBe(
      "provider rejected the credential",
    );
  });

  it("falls back to the state's Opzava string for empty/whitespace input", () => {
    expect(presentAskAdminMessage("policy_denied", undefined)).toBe(
      "Ask Admin is not permitted to perform that action.",
    );
    expect(presentAskAdminMessage("gateway_unavailable", "")).toBe(
      "The assistant gateway is temporarily unavailable.",
    );
  });
});
