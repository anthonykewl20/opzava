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
 *   it must never let infrastructure detail reach the BFF.
 * - message presentation (#252, this file via `mapBrokerError`/`presentAskAdminMessage`):
 *   decides whether the sanitized semantic message surfaces or is overridden by
 *   an Opzava-owned string. UI mapping belongs here, not in the broker.
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
  /**
   * The browser-facing failure text (#252). This is the presentation half of
   * the seam: a sanitized, operator-safe message. It surfaces the sanitized
   * semantic text the broker relayed when one exists, and otherwise falls back
   * to an Opzava-owned string keyed by `state`. State/recovery are unchanged.
   */
  readonly message: string;
}

/**
 * Opzava-owned presentation strings, used when no sanitized semantic message is
 * available (the broker collapsed pure transport/infra noise, or the BFF hit a
 * non-`DomainError` throw with no controlled message). Kept here so the admin
 * UX strings live in the presentation layer the broker must not know about.
 */
const STATE_FALLBACK_MESSAGES: Readonly<Record<AskAdminFailureState, string>> = {
  gateway_unavailable: "The assistant gateway is temporarily unavailable.",
  policy_denied: "Ask Admin is not permitted to perform that action.",
  duplicate_send: "This message is already being sent; wait for it to finish before resending.",
  failed: "Ask Admin Opzava could not complete the request.",
};

/**
 * Decides whether the sanitized semantic message surfaces or is overridden by
 * an Opzava-owned string. Semantic, operator-actionable text (e.g. a model
 * configuration hint or a provider credential rejection) surfaces as-is; empty
 * or collapsed-to-noise text falls back to the state's Opzava string. The
 * broker has already stripped cf-ray/URL/request-id/raw-JSON before this runs.
 */
export function presentAskAdminMessage(
  state: AskAdminFailureState,
  sanitizedMessage?: string,
): string {
  const text = sanitizedMessage?.trim();
  return text && text !== "" ? text : STATE_FALLBACK_MESSAGES[state];
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
 * The explicit seam: raw broker error -> client error class. #252 fills the
 * presentation side: pass the sanitized message the broker relayed (for gateway
 * failures) or the BFF's own controlled message (for BFF-internal errors), and
 * it decides surface-vs-override. Callers that only need the SSE `state` read
 * `.state`; the transport recovery reads `.reconnectEligible`.
 */
export function mapBrokerError(
  error: RawBrokerError,
  sanitizedMessage?: string,
): AskAdminClientError {
  const state = classifyAskAdminFailureState(error);
  return {
    state,
    reconnectEligible: state === "gateway_unavailable",
    message: presentAskAdminMessage(state, sanitizedMessage),
  };
}
