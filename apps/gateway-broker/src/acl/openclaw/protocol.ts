export {
  MAX_OPENCLAW_PROTOCOL_VERSION,
  MIN_OPENCLAW_PROTOCOL_VERSION,
  OPENCLAW_PROTOCOL_VERSION,
  hasExactScopeProfile,
  isConnectChallenge,
  isConnectChallengePayload,
  isHelloOkPayload,
  isHelloOkEnvelope,
  isRecord,
  parseOpenClawFrame,
  serializeOpenClawFrame
} from "@opzava/openclaw-wire"
export type {
  ChatEventPayload,
  ConnectChallengePayload,
  HelloOkPayload,
  OpenClawErrorPayload,
  OpenClawEventFrame,
  OpenClawFrame,
  OpenClawRequestFrame,
  OpenClawResponseFrame,
  SessionMessageEventPayload,
  ToolsEffectiveEntry,
  ToolsEffectivePayload
} from "@opzava/openclaw-wire"

import { hasExactScopeProfile } from "@opzava/openclaw-wire"
import type { OpenClawConnectParams as SharedOpenClawConnectParams } from "@opzava/openclaw-wire"

export const EXPECTED_OPERATOR_SCOPES = ["operator.write", "operator.approvals"] as const
const ALLOWED_OPERATOR_SCOPES = [...EXPECTED_OPERATOR_SCOPES, "operator.read"] as const

export type OperatorScope = (typeof EXPECTED_OPERATOR_SCOPES)[number]
export type OpenClawConnectParams = SharedOpenClawConnectParams<OperatorScope>

export function hasExactExpectedScopes(scopes: readonly string[]): boolean {
  return hasExactScopeProfile(
    { required: EXPECTED_OPERATOR_SCOPES, allowed: ALLOWED_OPERATOR_SCOPES },
    scopes
  )
}

export function eventFamily(eventName: string): string {
  const firstDot = eventName.indexOf(".")
  return firstDot === -1 ? eventName : eventName.slice(0, firstDot)
}

export function isAllowedEventFamily(eventName: string): boolean {
  if (eventName === "connect.challenge") {
    return true
  }

  const family = eventFamily(eventName)
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
  )
}
