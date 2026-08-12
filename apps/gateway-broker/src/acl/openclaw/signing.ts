export {
  Ed25519DeviceKeypair,
  HmacDeviceKeypair,
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID,
  OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE,
  deriveDeviceIdFromPublicKey,
  deriveOpenClawDeviceIdentity,
  deviceIdFromRawPublicKey,
  deviceSignaturePayload,
  deviceSignaturePayloadV3,
  rawOpenClawPublicKey
} from "@opzava/openclaw-wire"
export type { OpenClawDeviceIdentity } from "@opzava/openclaw-wire"

import type {
  DeviceKeypair as SharedDeviceKeypair,
  DeviceSignatureInput as SharedDeviceSignatureInput
} from "@opzava/openclaw-wire"

import type { OperatorScope } from "./protocol.js"

export type DeviceSignatureInput = SharedDeviceSignatureInput<OperatorScope>
export type DeviceKeypair = SharedDeviceKeypair<OperatorScope>
