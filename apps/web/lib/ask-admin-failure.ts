/**
 * The single seam that maps a raw broker/runtime error into an Ask Admin
 * client failure class. This is the `mapError(rawBrokerError) -> ClientError`
 * surface called out by #165 and that #252 fills with sanitized presentation.
 *
 * Why it exists: before #165 the failure *state* was classified inline in the
 * turn route (`failureState`), the failure *text* was piped through raw, and the
 * recovery rule (reconnect vs. terminal) had no home. Classifications were
 * scattered and the browser owned recovery by grepping for a missing terminal
 * event. Now one function decides the class and whether the client may reconnect
 * off it, so transport recovery and presentation mapping read the same answer.
 *
 * What lives here vs. elsewhere (#252 contract):
 * - `state` + `reconnectEligible` (this file): the failure class and transport
 *   semantics. Consumed by the turn route (SSE failure event) and by any
 *   reconnect/re-snapshot decision.
 * - message sanitization (#252, broker): strips upstream URLs, cf-ray ids,
 *   request ids, and raw JSON blobs. The broker is the only ACL to OpenClaw, so
 *   it must never let infrastructure detail reach the BFF. This seam stays dumb
 *   about message text on purpose.
 *
 * Recovery semantics (CONTEXT.md: "reconnect = re-snapshot"):
 * - `gateway_unavailable`  -> transient; the client may reconnect / re-snapshot.
 * - `policy_denied`        -> terminal; the turn is dead, do not reconnect.
 * - `duplicate_send`       -> terminal; idempotency conflict, do not reconnect.
 * - `failed`               -> generic, non-reconnect-eligible.
 */
export type AskAdminFailureState =
  | "gateway_unavailable"
  | "policy_denied"
  | "duplicate_send"
  | "failed";

export interface RawBrokerError {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
}

export interface AskAdminClientError {
  readonly state: AskAdminFailureState;
  readonly reconnectEligible: boolean;
}

const DUPLICATE_SEND_CODES = new Set<string>([
  "runtimeControl.idempotencyConflict",
  "gatewayBroker.sessionBusy",
]);

const POLICY_DENIED_CODES = new Set<string>([
  "runtimeControl.forbidden",
  "projectManagement.forbidden",
  "gatewayBroker.authModeForbidden",
  "gatewayBroker.authScopeMismatch",
  "gatewayBroker.scopeMismatch",
  "gatewayBroker.tenantMismatch",
  "gatewayBroker.toolInventoryMismatch",
  "webGateway.internalUnauthorized",
]);

const GATEWAY_UNAVAILABLE_CODES = new Set<string>([
  "gatewayBroker.gatewayUnavailable",
  "gatewayBroker.circuitOpen",
  "gatewayBroker.connectionClosed",
  "webGateway.gatewayUnavailable",
  "webGateway.emptyStream",
  "webGateway.streamInterrupted",
]);

export function classifyAskAdminFailureState(error: RawBrokerError): AskAdminFailureState {
  const code = error.code;
  if (code !== undefined && DUPLICATE_SEND_CODES.has(code)) {
    return "duplicate_send";
  }

  if (error.status === 403 || (code !== undefined && POLICY_DENIED_CODES.has(code))) {
    return "policy_denied";
  }

  if (code !== undefined && GATEWAY_UNAVAILABLE_CODES.has(code)) {
    return "gateway_unavailable";
  }

  return "failed";
}

/**
 * The explicit seam: raw broker error -> client error class. #252 extends the
 * presentation side; callers that only need the SSE `state` read `.state`.
 */
export function mapBrokerError(error: RawBrokerError): AskAdminClientError {
  const state = classifyAskAdminFailureState(error);
  return { state, reconnectEligible: state === "gateway_unavailable" };
}
