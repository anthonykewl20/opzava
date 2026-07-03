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
