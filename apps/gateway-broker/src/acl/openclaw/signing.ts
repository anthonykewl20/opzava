import { createHmac } from "node:crypto";

import type { OperatorScope } from "./protocol.js";

export interface DeviceSignatureInput {
  readonly clientId: string;
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

export function deviceSignaturePayload(input: DeviceSignatureInput): string {
  return JSON.stringify({
    version: "v3",
    client: {
      id: input.clientId,
      version: input.clientVersion,
      platform: input.platform
    },
    device: {
      id: input.deviceId,
      publicKey: input.publicKey,
      family: input.deviceFamily ?? "server"
    },
    role: input.role,
    scopes: [...input.scopes].sort(),
    token: input.token,
    nonce: input.nonce,
    signedAt: input.signedAt
  });
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
