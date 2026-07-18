import { describe, expect, it } from "vitest";

import {
  classifyAskAdminFailureState,
  mapBrokerError,
  type AskAdminFailureState,
} from "../lib/ask-admin-failure";

describe("mapBrokerError seam", () => {
  it("classifies duplicate-send codes", () => {
    expect(mapBrokerError({ code: "runtimeControl.idempotencyConflict" })).toEqual({
      state: "duplicate_send",
      reconnectEligible: false,
    });
    expect(mapBrokerError({ code: "gatewayBroker.sessionBusy" })).toEqual({
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
      expect(mapBrokerError({ code })).toEqual({ state: "policy_denied", reconnectEligible: false });
    }
    expect(mapBrokerError({ status: 403 })).toEqual({
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
      expect(mapBrokerError({ code })).toEqual({
        state: "gateway_unavailable",
        reconnectEligible: true,
      });
    }
  });

  it("falls back to generic failed for unknown codes", () => {
    expect(mapBrokerError({ code: "askAdmin.failed" })).toEqual({
      state: "failed",
      reconnectEligible: false,
    });
    expect(mapBrokerError({})).toEqual({ state: "failed", reconnectEligible: false });
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
