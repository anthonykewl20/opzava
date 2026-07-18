import { DomainError } from "@opzava/shared-kernel";

import { isRecord } from "./protocol.js";

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

/**
 * #252 — the broker's ACL content sanitizer (CWE-200). The broker is the only
 * ACL to OpenClaw, so it is where upstream topology/vendor detail is stripped
 * before a failure payload crosses to the BFF: the BFF must never see a
 * Cloudflare ray id, an upstream URL, or an upstream request id in the first
 * place.
 *
 * The distinction is content-class, not upstream-vs-ours: semantic,
 * operator-actionable text survives (e.g. "The 'gpt-5.6-sol' model requires a
 * newer version of Codex"); infrastructure detail is stripped or collapsed:
 *
 *   - raw vendor JSON blobs → the inner semantic `.message` is extracted (or the
 *     blob is dropped when no semantic message lives inside it),
 *   - `url:`/`https://…`/`cf-ray:`/`request id:`/`req_…` tokens are stripped by
 *     content scan (so an upstream message that embeds a URL inside otherwise-
 *     semantic text is scrubbed too, not just well-known fields),
 *   - pure transport noise (socket/`app-server client closed`/Node network
 *     codes) collapses to the fallback, since it carries no operator action.
 *
 * Returns the fallback only when nothing semantic remains; never returns an
 * empty string. Server-side detail is preserved separately by the broker logger
 * and the BFF's ErrorCapturePort — sanitization is for the browser payload only.
 */
const FAILURE_INFRA_TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
  // labelled url + value, e.g. `url: https://api.openai.com/v1/responses`
  /\burl:\s*https?:\/\/[^\s,)"'<>]+/gi,
  // any bare URL
  /\bhttps?:\/\/[^\s,)"'<>]+/gi,
  // Cloudflare ray id, e.g. `cf-ray: a1b22d857c3484a5-HKG` (also `cf_ray`)
  /\bcf[-_]?ray:\s*[A-Za-z0-9-]+/gi,
  // labelled request id, e.g. `request id: req_73d0a1881cf9490d88ca96376ebe7926`
  /\brequest id:\s*[A-Za-z0-9_-]+/gi,
  // x-request-id header form
  /\bx-request-id:\s*[^\s,]+/gi,
  // bare upstream request id, e.g. `req_73d0a1881cf9490d88ca96376ebe7926`
  /\breq_[A-Za-z0-9]{8,}/g,
  // embedded credentials / API keys (high-signal only): bearer tokens,
  // OpenAI-style `sk-…` secrets, `api_key=…`/`api-key:…` assignments, and the
  // x-api-key header. Catches a key an upstream message embeds in its text.
  /\bbearer\s+[A-Za-z0-9._-]{8,}/gi,
  /\bsk-[A-Za-z0-9]{16,}/g,
  /\bapi[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9._-]{8,}/gi,
  /\bx-api-key:\s*[^\s,]+/gi,
];

// Pure transport noise — no operator action; the BFF substitutes an Opzava-owned
// message via the presentation layer. Intentionally conservative (anchored to
// unambiguous transport signals) so semantic text is never mis-classified.
const TRANSPORT_NOISE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|EHOSTUNREACH|ENETUNREACH|UND_ERR_[A-Z_]+)\b/,
  /socket hang up/i,
  /app-server client/i,
  /client closed before/i,
];

function pickSemanticMessage(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() === "" ? null : value;
  }

  if (!isRecord(value)) {
    return null;
  }

  // Common vendor shapes: { error: "…" } | { error: { message: "…" } } |
  // { message: "…" }, recursing one level into a nested `error` object so a
  // blob like {"error":{"type":"invalid_request_error","message":"…"}} yields
  // its inner semantic message.
  const errorField = value["error"];
  if (typeof errorField === "string" && errorField.trim() !== "") {
    return errorField;
  }

  if (isRecord(errorField)) {
    const inner = pickSemanticMessage(errorField);
    if (inner !== null) {
      return inner;
    }
  }

  const messageField = value["message"];
  if (typeof messageField === "string" && messageField.trim() !== "") {
    return messageField;
  }

  return null;
}

function extractSemanticFromJsonBlob(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not a real JSON blob (e.g. a message that merely contains a brace); leave
    // it to token stripping below.
    return null;
  }

  const semantic = pickSemanticMessage(parsed);
  return semantic === null ? "" : semantic;
}

function tidyFailureText(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*)+/g, ", ")
    .replace(/^[\s,:]+|[\s,:]+$/g, "")
    .trim();
}

export function sanitizeFailureMessage(
  rawMessage: string | undefined | null,
  fallback: string,
): string {
  if (rawMessage === undefined || rawMessage === null) {
    return fallback;
  }

  let text = String(rawMessage).trim();
  if (text === "") {
    return fallback;
  }

  // Raw JSON blob → lift the inner semantic message, then keep sanitizing it.
  const jsonSemantic = extractSemanticFromJsonBlob(text);
  if (jsonSemantic !== null) {
    text = jsonSemantic.trim();
    if (text === "") {
      return fallback;
    }
  }

  for (const pattern of FAILURE_INFRA_TOKEN_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  if (TRANSPORT_NOISE_PATTERNS.some((pattern) => pattern.test(text))) {
    return fallback;
  }

  text = tidyFailureText(text);
  return text === "" ? fallback : text;
}

export interface SanitizedFailure {
  readonly code: string;
  readonly sanitizedMessage: string;
}

/**
 * Shapes an arbitrary thrown error into the strict `{ code, sanitizedMessage }`
 * payload the broker emits to the BFF (#252). Used at every broker→BFF failure
 * boundary (the internal HTTP stream/health responses and the operator-client
 * stream-failure events) so no path can raw-passthrough an upstream message.
 */
export function sanitizeFailure(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): SanitizedFailure {
  if (typeof error === "object" && error !== null) {
    const code = (error as { readonly code?: unknown }).code;
    const message = (error as { readonly message?: unknown }).message;
    return {
      code: typeof code === "string" && code.trim() !== "" ? code : fallbackCode,
      sanitizedMessage: sanitizeFailureMessage(
        typeof message === "string" ? message : undefined,
        fallbackMessage,
      ),
    };
  }

  if (typeof error === "string" && error.trim() !== "") {
    return { code: fallbackCode, sanitizedMessage: sanitizeFailureMessage(error, fallbackMessage) };
  }

  return { code: fallbackCode, sanitizedMessage: fallbackMessage };
}

