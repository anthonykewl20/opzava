export const OPENCLAW_PROTOCOL_VERSION = 4
export const MIN_OPENCLAW_PROTOCOL_VERSION = 4
export const MAX_OPENCLAW_PROTOCOL_VERSION = 4

export type OpenClawFrame = OpenClawRequestFrame | OpenClawResponseFrame | OpenClawEventFrame

export interface ConnectChallengePayload {
  readonly nonce: string
  readonly ts: number
}

export interface OpenClawEventFrame {
  readonly type: "event"
  readonly event: string
  readonly payload: unknown
  readonly seq?: number
  readonly stateVersion?: number
}

export interface OpenClawRequestFrame {
  readonly type: "req"
  readonly id: string
  readonly method: string
  readonly params: Record<string, unknown>
}

export interface OpenClawResponseFrame {
  readonly type: "res"
  readonly id: string
  readonly ok: boolean
  readonly payload?: unknown
  readonly error?: OpenClawErrorPayload
}

export interface OpenClawErrorPayload {
  readonly code?: string
  readonly message?: string
  readonly details?: Record<string, unknown>
}

export interface OpenClawConnectParams<Scope extends string = string> {
  readonly minProtocol: number
  readonly maxProtocol: number
  readonly client: {
    readonly id: "cli"
    readonly version: string
    readonly platform: "node"
    readonly mode: "cli"
  }
  readonly role: "operator"
  readonly scopes: readonly Scope[]
  readonly caps: readonly string[]
  readonly commands: readonly string[]
  readonly permissions: Record<string, never>
  readonly auth: {
    readonly token?: string
    readonly deviceToken?: string
    readonly bootstrapToken?: string
  }
  readonly locale: "en-US"
  readonly userAgent: string
  readonly device: {
    readonly id: string
    readonly publicKey: string
    readonly signature: string
    readonly signedAt: number
    readonly nonce: string
  }
}

export interface HelloOkPayload {
  readonly type: "hello-ok"
  readonly protocol: number
  readonly server: {
    readonly version: string
    readonly connId: string
  }
  readonly features: {
    readonly methods: readonly string[]
    readonly events: readonly string[]
  }
  readonly snapshot: Record<string, unknown>
  readonly auth: {
    readonly role: "operator"
    readonly scopes: readonly string[]
    readonly deviceToken?: string
    readonly issuedAtMs?: number
  }
  readonly policy: {
    readonly maxPayload: number
    readonly maxBufferedBytes: number
    readonly tickIntervalMs: number
  }
}

export interface SessionMessageEventPayload {
  readonly sessionKey?: string
  readonly runId?: string
  readonly message?: string
  readonly deltaText?: string
  readonly done?: boolean
  readonly toolCall?: {
    readonly id?: string
    readonly name?: string
    readonly args?: Record<string, unknown>
  }
  readonly error?: {
    readonly code?: string
    readonly message?: string
  }
}

export interface ChatEventPayload {
  readonly state?: "delta" | "final" | "aborted" | "error" | string
  readonly runId?: string
  readonly sessionKey?: string
  readonly agentId?: string
  readonly spawnedBy?: string
  readonly seq?: number
  readonly message?: unknown
  readonly deltaText?: string
  readonly replace?: boolean
  readonly usage?: unknown
  readonly stopReason?: string
  readonly errorMessage?: string
  readonly errorKind?: string
}

export interface ToolsEffectivePayload {
  readonly tools?: readonly ToolsEffectiveEntry[]
  readonly entries?: readonly ToolsEffectiveEntry[]
  readonly notices?: readonly string[]
}

export interface ToolsEffectiveEntry {
  readonly name?: string
  readonly source?: "core" | "plugin" | "channel" | "mcp" | string
}

export interface OpenClawScopeProfile<Scope extends string = string> {
  readonly required: readonly Scope[]
  readonly allowed: readonly Scope[]
}

export function hasExactScopeProfile<Scope extends string>(
  profile: OpenClawScopeProfile<Scope>,
  scopes: readonly string[]
): boolean {
  const allowed = new Set<string>(profile.allowed)
  const unique = new Set(scopes)
  return (
    unique.size === scopes.length &&
    profile.required.every((scope) => scopes.includes(scope)) &&
    scopes.every((scope) => allowed.has(scope))
  )
}

export function parseOpenClawFrame(raw: string): OpenClawFrame | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed)) {
    return null
  }

  if (parsed["type"] === "event" && typeof parsed["event"] === "string") {
    return {
      type: "event",
      event: parsed["event"],
      payload: parsed["payload"],
      ...(typeof parsed["seq"] === "number" ? { seq: parsed["seq"] } : {}),
      ...(typeof parsed["stateVersion"] === "number"
        ? { stateVersion: parsed["stateVersion"] }
        : {})
    }
  }

  if (
    parsed["type"] === "req" &&
    typeof parsed["id"] === "string" &&
    typeof parsed["method"] === "string"
  ) {
    return {
      type: "req",
      id: parsed["id"],
      method: parsed["method"],
      params: isRecord(parsed["params"]) ? parsed["params"] : {}
    }
  }

  if (
    parsed["type"] === "res" &&
    typeof parsed["id"] === "string" &&
    typeof parsed["ok"] === "boolean"
  ) {
    return {
      type: "res",
      id: parsed["id"],
      ok: parsed["ok"],
      ...(parsed["payload"] === undefined ? {} : { payload: parsed["payload"] }),
      ...(isRecord(parsed["error"])
        ? { error: parsed["error"] as OpenClawErrorPayload }
        : {})
    }
  }

  return null
}

export function serializeOpenClawFrame(frame: OpenClawFrame): string {
  return JSON.stringify(frame)
}

export function isConnectChallenge(
  frame: OpenClawFrame,
  options: { readonly requireTimestamp?: boolean } = {}
): frame is OpenClawEventFrame & { readonly payload: ConnectChallengePayload } {
  return (
    frame.type === "event" &&
    frame.event === "connect.challenge" &&
    isConnectChallengePayload(frame.payload, options)
  )
}

export function isConnectChallengePayload(
  value: unknown,
  options: { readonly requireTimestamp?: boolean } = {}
): value is ConnectChallengePayload {
  return (
    isRecord(value) &&
    typeof value["nonce"] === "string" &&
    value["nonce"].trim() !== "" &&
    (options.requireTimestamp === false || typeof value["ts"] === "number")
  )
}

export function isHelloOkEnvelope(value: unknown): value is Record<string, unknown> & {
  readonly type: "hello-ok"
} {
  return isRecord(value) && value["type"] === "hello-ok"
}

export function isHelloOkPayload(value: unknown): value is HelloOkPayload {
  if (!isRecord(value)) {
    return false
  }

  const auth = value["auth"]
  const policy = value["policy"]
  const snapshot = value["snapshot"]
  return (
    value["type"] === "hello-ok" &&
    typeof value["protocol"] === "number" &&
    isRecord(value["server"]) &&
    isRecord(value["features"]) &&
    Array.isArray(value["features"]["methods"]) &&
    value["features"]["methods"].every((method) => typeof method === "string") &&
    Array.isArray(value["features"]["events"]) &&
    value["features"]["events"].every((event) => typeof event === "string") &&
    isRecord(auth) &&
    isRecord(policy) &&
    Array.isArray(auth["scopes"]) &&
    typeof policy["maxPayload"] === "number" &&
    typeof policy["maxBufferedBytes"] === "number" &&
    typeof policy["tickIntervalMs"] === "number" &&
    (snapshot === undefined || isRecord(snapshot))
  )
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
