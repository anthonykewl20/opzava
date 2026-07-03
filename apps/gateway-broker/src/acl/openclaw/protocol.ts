export const OPENCLAW_PROTOCOL_VERSION = 4;
export const MIN_OPENCLAW_PROTOCOL_VERSION = 4;
export const MAX_OPENCLAW_PROTOCOL_VERSION = 4;
export const EXPECTED_OPERATOR_SCOPES = ["operator.write", "operator.approvals"] as const;

export type OperatorScope = (typeof EXPECTED_OPERATOR_SCOPES)[number];
export type OpenClawFrame = OpenClawRequestFrame | OpenClawResponseFrame | OpenClawEventFrame;

export interface ConnectChallengePayload {
  readonly nonce: string;
  readonly ts: number;
}

export interface OpenClawEventFrame {
  readonly type: "event";
  readonly event: string;
  readonly payload: unknown;
  readonly seq?: number;
  readonly stateVersion?: number;
}

export interface OpenClawRequestFrame {
  readonly type: "req";
  readonly id: string;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface OpenClawResponseFrame {
  readonly type: "res";
  readonly id: string;
  readonly ok: boolean;
  readonly payload?: unknown;
  readonly error?: OpenClawErrorPayload;
}

export interface OpenClawErrorPayload {
  readonly code?: string;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

export interface OpenClawConnectParams {
  readonly minProtocol: number;
  readonly maxProtocol: number;
  readonly client: {
    readonly id: "cli";
    readonly version: string;
    readonly platform: "node";
    readonly mode: "cli";
  };
  readonly role: "operator";
  readonly scopes: readonly OperatorScope[];
  readonly caps: readonly string[];
  readonly commands: readonly string[];
  readonly permissions: Record<string, never>;
  readonly auth: {
    readonly token?: string;
    readonly deviceToken?: string;
    readonly bootstrapToken?: string;
  };
  readonly locale: "en-US";
  readonly userAgent: string;
  readonly device: {
    readonly id: string;
    readonly publicKey: string;
    readonly signature: string;
    readonly signedAt: number;
    readonly nonce: string;
  };
}

export interface HelloOkPayload {
  readonly type: "hello-ok";
  readonly protocol: number;
  readonly server: {
    readonly version: string;
    readonly connId: string;
  };
  readonly features: {
    readonly methods: readonly string[];
    readonly events: readonly string[];
  };
  readonly snapshot: Record<string, unknown>;
  readonly auth: {
    readonly role: "operator";
    readonly scopes: readonly string[];
    readonly deviceToken?: string;
    readonly issuedAtMs?: number;
  };
  readonly policy: {
    readonly maxPayload: number;
    readonly maxBufferedBytes: number;
    readonly tickIntervalMs: number;
  };
}

export interface SessionMessageEventPayload {
  readonly sessionKey?: string;
  readonly runId?: string;
  readonly message?: string;
  readonly deltaText?: string;
  readonly done?: boolean;
  readonly toolCall?: {
    readonly id?: string;
    readonly name?: string;
    readonly args?: Record<string, unknown>;
  };
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
}

export interface ChatEventPayload {
  readonly state?: "delta" | "final" | "aborted" | "error" | string;
  readonly runId?: string;
  readonly sessionKey?: string;
  readonly agentId?: string;
  readonly spawnedBy?: string;
  readonly seq?: number;
  readonly message?: unknown;
  readonly deltaText?: string;
  readonly replace?: boolean;
  readonly usage?: unknown;
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly errorKind?: string;
}

export interface ToolsEffectivePayload {
  readonly tools?: readonly ToolsEffectiveEntry[];
  readonly entries?: readonly ToolsEffectiveEntry[];
  readonly notices?: readonly string[];
}

export interface ToolsEffectiveEntry {
  readonly name?: string;
  readonly source?: "core" | "plugin" | "channel" | "mcp" | string;
}

export function parseOpenClawFrame(raw: string): OpenClawFrame | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record["type"] === "event" && typeof record["event"] === "string") {
    return {
      type: "event",
      event: record["event"],
      payload: record["payload"],
      ...(typeof record["seq"] === "number" ? { seq: record["seq"] } : {}),
      ...(typeof record["stateVersion"] === "number"
        ? { stateVersion: record["stateVersion"] }
        : {}),
    };
  }

  if (
    record["type"] === "req" &&
    typeof record["id"] === "string" &&
    typeof record["method"] === "string"
  ) {
    return {
      type: "req",
      id: record["id"],
      method: record["method"],
      params: isRecord(record["params"]) ? record["params"] : {},
    };
  }

  if (
    record["type"] === "res" &&
    typeof record["id"] === "string" &&
    typeof record["ok"] === "boolean"
  ) {
    return {
      type: "res",
      id: record["id"],
      ok: record["ok"],
      ...(record["payload"] === undefined ? {} : { payload: record["payload"] }),
      ...(isRecord(record["error"]) ? { error: record["error"] as OpenClawErrorPayload } : {}),
    };
  }

  return null;
}

export function serializeOpenClawFrame(frame: OpenClawFrame): string {
  return JSON.stringify(frame);
}

export function isConnectChallenge(
  frame: OpenClawFrame,
): frame is OpenClawEventFrame & { readonly payload: ConnectChallengePayload } {
  return (
    frame.type === "event" &&
    frame.event === "connect.challenge" &&
    isConnectChallengePayload(frame.payload)
  );
}

export function isConnectChallengePayload(value: unknown): value is ConnectChallengePayload {
  return (
    isRecord(value) &&
    typeof value["nonce"] === "string" &&
    value["nonce"].trim() !== "" &&
    typeof value["ts"] === "number"
  );
}

export function isHelloOkPayload(value: unknown): value is HelloOkPayload {
  if (!isRecord(value)) {
    return false;
  }

  const auth = value["auth"];
  const policy = value["policy"];
  return (
    value["type"] === "hello-ok" &&
    typeof value["protocol"] === "number" &&
    isRecord(value["server"]) &&
    isRecord(value["features"]) &&
    isRecord(auth) &&
    isRecord(policy) &&
    Array.isArray(auth["scopes"]) &&
    typeof policy["maxPayload"] === "number" &&
    typeof policy["maxBufferedBytes"] === "number" &&
    typeof policy["tickIntervalMs"] === "number"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const IMPLIED_OPERATOR_SCOPES = ["operator.read"] as const;

export function hasExactExpectedScopes(scopes: readonly string[]): boolean {
  // The live Gateway materializes operator.read alongside operator.write
  // ("write implies read"); it is the ONLY tolerated addition - any other
  // scope (admin, pairing, talk.secrets, unknown) stays fail-closed.
  const allowed = new Set<string>([...EXPECTED_OPERATOR_SCOPES, ...IMPLIED_OPERATOR_SCOPES]);
  const unique = new Set(scopes);
  return (
    unique.size === scopes.length &&
    EXPECTED_OPERATOR_SCOPES.every((scope) => scopes.includes(scope)) &&
    scopes.every((scope) => allowed.has(scope))
  );
}

export function eventFamily(eventName: string): string {
  const firstDot = eventName.indexOf(".");
  return firstDot === -1 ? eventName : eventName.slice(0, firstDot);
}

export function isAllowedEventFamily(eventName: string): boolean {
  if (eventName === "connect.challenge") {
    return true;
  }

  const family = eventFamily(eventName);
  return (
    family === "chat" ||
    family === "session" ||
    family === "exec" ||
    family === "plugin" ||
    family === "presence" ||
    family === "tick" ||
    family === "health" ||
    family === "heartbeat" ||
    family === "shutdown"
  );
}
