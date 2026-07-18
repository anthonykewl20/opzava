import { DomainError } from "@opzava/shared-kernel";

export type GatewayBrokerErrorCode =
  | "gatewayBroker.authModeForbidden"
  | "gatewayBroker.authScopeMismatch"
  | "gatewayBroker.circuitOpen"
  | "gatewayBroker.connectChallengeTimeout"
  | "gatewayBroker.connectionClosed"
  | "gatewayBroker.deviceSignatureFailed"
  | "gatewayBroker.duplicateResponse"
  | "gatewayBroker.gatewayUnavailable"
  | "gatewayBroker.invalidFrame"
  | "gatewayBroker.missingIdempotencyKey"
  | "gatewayBroker.protocolMismatch"
  | "gatewayBroker.requestFailed"
  | "gatewayBroker.requestTimeout"
  | "gatewayBroker.scopeMismatch"
  | "gatewayBroker.sessionBusy"
  | "gatewayBroker.tenantMismatch"
  | "gatewayBroker.toolInventoryMismatch"
  | "gatewayBroker.unknownEventFamily"
  | "gatewayBroker.unknownResponse";

export function gatewayBrokerError(
  code: GatewayBrokerErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
  cause?: unknown
): DomainError {
  return new DomainError({
    code,
    message,
    ...(details === undefined ? {} : { details }),
    ...(cause === undefined ? {} : { cause })
  });
}

export function sanitizeGatewayError(error: unknown): Readonly<Record<string, unknown>> {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const record = error as Record<string, unknown>;
  const details = typeof record["details"] === "object" && record["details"] !== null
    ? (record["details"] as Record<string, unknown>)
    : {};

  return {
    code: typeof record["code"] === "string" ? record["code"] : undefined,
    message: typeof record["message"] === "string" ? record["message"] : undefined,
    reason: typeof details["reason"] === "string" ? details["reason"] : undefined
  };
}

/**
 * Broker-side transient classification for the reconnect decision. This is the
 * broker half of the failure-state contract the BFF's `mapBrokerError` seam
 * (#165/#252) consumes on the client side: these are exactly the codes the BFF
 * maps to `gateway_unavailable` (reconnect-eligible). Kept here so the broker
 * drives "reconnect = re-snapshot" off failure state without reaching into the
 * web app, while staying aligned with the client's reconnect eligibility.
 */
const TRANSIENT_GATEWAY_ERROR_CODES: ReadonlySet<string> = new Set([
  "gatewayBroker.connectionClosed",
  "gatewayBroker.gatewayUnavailable",
  "gatewayBroker.circuitOpen",
]);

export function isTransientGatewayError(error: { readonly code?: string }): boolean {
  return error.code !== undefined && TRANSIENT_GATEWAY_ERROR_CODES.has(error.code);
}

