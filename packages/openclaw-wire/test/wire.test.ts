import { generateKeyPairSync, verify } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  Ed25519DeviceKeypair,
  deviceSignaturePayload,
  isConnectChallenge,
  parseOpenClawFrame,
  serializeOpenClawFrame,
  type OpenClawRequestFrame
} from "../src/index.js"

describe("OpenClaw wire", () => {
  it("round-trips a frame", () => {
    const frame: OpenClawRequestFrame = {
      type: "req",
      id: "connect:test",
      method: "connect",
      params: { minProtocol: 4, maxProtocol: 4 }
    }

    expect(parseOpenClawFrame(serializeOpenClawFrame(frame))).toEqual(frame)
    expect(
      isConnectChallenge(
        parseOpenClawFrame(
          '{"type":"event","event":"connect.challenge","payload":{"nonce":"n","ts":1}}'
        )!
      )
    ).toBe(true)
  })

  it("derives and validates a signed hello payload", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519")
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    const keypair = new Ed25519DeviceKeypair<"operator.admin">({ privateKeyPem })
    const input = {
      clientId: "cli",
      clientMode: "cli",
      clientVersion: "test",
      platform: "node",
      deviceId: keypair.deviceId,
      publicKey: keypair.publicKey,
      role: "operator" as const,
      scopes: ["operator.admin"] as const,
      token: "test-token",
      nonce: "challenge",
      signedAt: 123
    }

    const signature = await keypair.sign(input)
    expect(
      verify(
        null,
        Buffer.from(deviceSignaturePayload(input), "utf8"),
        publicKey,
        Buffer.from(signature, "base64url")
      )
    ).toBe(true)
  })
})
