import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign as signData,
} from "node:crypto";

import type { OperatorScope } from "./protocol.js";

export const OPENCLAW_EXTERNAL_OPERATOR_CLIENT_ID = "cli";
export const OPENCLAW_EXTERNAL_OPERATOR_CLIENT_MODE = "cli";

const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

export interface DeviceSignatureInput {
  readonly clientId: string;
  readonly clientMode: string;
  readonly clientVersion: string;
  readonly platform: string;
  readonly deviceFamily?: string;
  readonly deviceId: string;
  readonly publicKey: string;
  readonly role: "operator";
  readonly scopes: readonly OperatorScope[];
  readonly token: string;
  readonly nonce: string;
  readonly signedAt: number;
}

export interface DeviceKeypair {
  readonly deviceId: string;
  readonly publicKey: string;
  sign(input: DeviceSignatureInput): Promise<string>;
}

export interface OpenClawDeviceIdentity {
  readonly deviceId: string;
  readonly publicKeyBase64Url: string;
}

export function rawOpenClawPublicKey(publicKey: string): Buffer {
  const normalized = publicKey.trim();
  if (normalized.startsWith("-----BEGIN PUBLIC KEY-----")) {
    const spki = createPublicKey(normalized).export({ type: "spki", format: "der" });
    const raw = Buffer.from(spki).subarray(ed25519SpkiPrefix.length);
    if (
      spki.length !== ed25519SpkiPrefix.length + 32 ||
      !Buffer.from(spki).subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)
    ) {
      throw new Error("OpenClaw device public key must be an Ed25519 SPKI PEM key.");
    }

    return raw;
  }

  const raw = Buffer.from(normalized, "base64url");
  if (raw.length !== 32) {
    throw new Error("OpenClaw device public key must be raw 32-byte Ed25519 base64url.");
  }

  return raw;
}

export function deviceIdFromRawPublicKey(rawPublicKey: Buffer): string {
  return createHash("sha256").update(rawPublicKey).digest("hex");
}

export function deriveDeviceIdFromPublicKey(publicKey: string): string {
  return deviceIdFromRawPublicKey(rawOpenClawPublicKey(publicKey));
}

export function deriveOpenClawDeviceIdentity(privateKeyPem: string): OpenClawDeviceIdentity {
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  const spki = Buffer.from(publicKey.export({ type: "spki", format: "der" }));
  const raw = spki.subarray(ed25519SpkiPrefix.length);
  if (
    spki.length !== ed25519SpkiPrefix.length + 32 ||
    !spki.subarray(0, ed25519SpkiPrefix.length).equals(ed25519SpkiPrefix)
  ) {
    throw new Error("OpenClaw device private key must be an Ed25519 PKCS8 PEM key.");
  }

  return {
    deviceId: deviceIdFromRawPublicKey(raw),
    publicKeyBase64Url: raw.toString("base64url"),
  };
}

function normalizedSignatureMetadata(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function deviceSignaturePayload(input: DeviceSignatureInput): string {
  return [
    "v2",
    input.deviceId,
    input.clientId,
    input.clientMode,
    input.role,
    input.scopes.join(","),
    String(input.signedAt),
    input.token,
    input.nonce,
  ].join("|");
}

export function deviceSignaturePayloadV3(input: DeviceSignatureInput): string {
  return [
    deviceSignaturePayload(input),
    normalizedSignatureMetadata(input.platform),
    normalizedSignatureMetadata(input.deviceFamily),
  ].join("|");
}

export class Ed25519DeviceKeypair implements DeviceKeypair {
  public readonly deviceId: string;
  public readonly publicKey: string;
  private readonly privateKeyPem: string;

  public constructor(input: {
    readonly privateKeyPem: string;
    readonly deviceId?: string;
    readonly publicKey?: string;
  }) {
    const derived = deriveOpenClawDeviceIdentity(input.privateKeyPem);
    if (input.deviceId !== undefined && input.deviceId !== derived.deviceId) {
      throw new Error("OpenClaw device id does not match the Ed25519 public key.");
    }

    if (
      input.publicKey !== undefined &&
      deriveDeviceIdFromPublicKey(input.publicKey) !== derived.deviceId
    ) {
      throw new Error("OpenClaw public key does not match the Ed25519 private key.");
    }

    this.privateKeyPem = input.privateKeyPem;
    this.deviceId = derived.deviceId;
    this.publicKey = derived.publicKeyBase64Url;
  }

  public async sign(input: DeviceSignatureInput): Promise<string> {
    return signData(
      null,
      Buffer.from(deviceSignaturePayload(input), "utf8"),
      createPrivateKey(this.privateKeyPem),
    ).toString("base64url");
  }
}

export class HmacDeviceKeypair implements DeviceKeypair {
  public readonly deviceId: string;
  public readonly publicKey: string;
  private readonly secret: string;

  public constructor(input: {
    readonly deviceId: string;
    readonly publicKey: string;
    readonly secret: string;
  }) {
    this.deviceId = input.deviceId;
    this.publicKey = input.publicKey;
    this.secret = input.secret;
  }

  public async sign(input: DeviceSignatureInput): Promise<string> {
    return createHmac("sha256", this.secret)
      .update(deviceSignaturePayload(input))
      .digest("base64url");
  }
}
