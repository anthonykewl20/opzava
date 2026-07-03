import { createHash, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  Ed25519DeviceKeypair,
  deviceSignaturePayload,
  deriveDeviceIdFromPublicKey,
  deriveOpenClawDeviceIdentity,
} from "../acl/openclaw/signing.js";

function testEd25519PrivateKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");

  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("OpenClaw device signing", () => {
  it("derives the Gateway device identity from the raw Ed25519 public key", () => {
    const privateKeyPem = testEd25519PrivateKeyPem();
    const identity = deriveOpenClawDeviceIdentity(privateKeyPem);
    const rawPublicKey = Buffer.from(identity.publicKeyBase64Url, "base64url");

    expect(rawPublicKey).toHaveLength(32);
    expect(identity.deviceId).toBe(createHash("sha256").update(rawPublicKey).digest("hex"));
    expect(identity.deviceId).toBe(deriveDeviceIdFromPublicKey(identity.publicKeyBase64Url));
  });

  it("builds the exact v2 signature payload verified by the live Gateway", () => {
    expect(
      deviceSignaturePayload({
        clientId: "cli",
        clientMode: "cli",
        clientVersion: "0.0.0",
        platform: "node",
        deviceFamily: "server",
        deviceId: "device-sha",
        publicKey: "raw-public-key",
        role: "operator",
        scopes: ["operator.write", "operator.approvals"],
        token: "paired-token",
        nonce: "nonce-1",
        signedAt: 1737264000000,
      }),
    ).toBe(
      "v2|device-sha|cli|cli|operator|operator.write,operator.approvals|1737264000000|paired-token|nonce-1",
    );
  });

  it("signs the v2 payload with an Ed25519 private key for real broker use", async () => {
    const privateKeyPem = testEd25519PrivateKeyPem();
    const keypair = new Ed25519DeviceKeypair({ privateKeyPem });

    await expect(
      keypair.sign({
        clientId: "cli",
        clientMode: "cli",
        clientVersion: "0.0.0",
        platform: "node",
        deviceFamily: "server",
        deviceId: keypair.deviceId,
        publicKey: keypair.publicKey,
        role: "operator",
        scopes: ["operator.write", "operator.approvals"],
        token: "paired-token",
        nonce: "nonce-1",
        signedAt: 1737264000000,
      }),
    ).resolves.toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
