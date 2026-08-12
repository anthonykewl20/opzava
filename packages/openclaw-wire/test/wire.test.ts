import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  Ed25519DeviceKeypair,
  deviceSignaturePayload,
  deviceSignaturePayloadV3,
  hasExactScopeProfile,
  isConnectChallenge,
  isHelloOkPayload,
  parseOpenClawFrame,
  serializeOpenClawFrame,
  type OpenClawEventFrame,
  type OpenClawRequestFrame,
} from "../src/index.js";

describe("OpenClaw wire", () => {
  it("round-trips a frame", () => {
    const frame: OpenClawRequestFrame = {
      type: "req",
      id: "connect:test",
      method: "connect",
      params: { minProtocol: 4, maxProtocol: 4 },
    };

    expect(parseOpenClawFrame(serializeOpenClawFrame(frame))).toEqual(frame);
    expect(
      isConnectChallenge(
        parseOpenClawFrame(
          '{"type":"event","event":"connect.challenge","payload":{"nonce":"n","ts":1}}',
        )!,
      ),
    ).toBe(true);
  });

  it("derives and validates a signed hello payload", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const keypair = new Ed25519DeviceKeypair<"operator.admin">({ privateKeyPem });
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
      signedAt: 123,
    };

    const signature = await keypair.sign(input);
    expect(
      verify(
        null,
        Buffer.from(deviceSignaturePayload(input), "utf8"),
        publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("orders and normalizes every field in a v3 device signature payload", () => {
    const input = {
      clientId: "cli",
      clientMode: "cli",
      clientVersion: "test",
      platform: " Node ",
      deviceFamily: " Server ",
      deviceId: "device-id",
      publicKey: "public-key",
      role: "operator" as const,
      scopes: ["operator.write", "operator.approvals"] as const,
      token: "test-token",
      nonce: "challenge",
      signedAt: 123,
    };

    const payload = deviceSignaturePayloadV3(input);

    expect(payload).toBe(
      "v2|device-id|cli|cli|operator|operator.write,operator.approvals|123|test-token|challenge|node|server",
    );
  });

  it("recognizes only valid hello-ok payloads", () => {
    const helloOk = {
      type: "hello-ok",
      protocol: 4,
      server: { version: "test", connId: "connection-id" },
      features: { methods: ["chat.send"], events: ["chat"] },
      snapshot: {},
      auth: { role: "operator", scopes: ["operator.write"] },
      policy: { maxPayload: 1024, maxBufferedBytes: 2048, tickIntervalMs: 1000 },
    };

    expect(isHelloOkPayload(helloOk)).toBe(true);
    expect(
      isHelloOkPayload({
        ...helloOk,
        features: { ...helloOk.features, methods: ["chat.send", 42] },
      }),
    ).toBe(false);
  });

  it("matches scope profiles as exact sets", () => {
    const profile = {
      required: ["operator.write", "operator.approvals"],
      allowed: ["operator.write", "operator.approvals"],
    };

    expect(hasExactScopeProfile(profile, ["operator.approvals", "operator.write"])).toBe(true);
    expect(hasExactScopeProfile(profile, ["operator.write"])).toBe(false);
    expect(
      hasExactScopeProfile(profile, ["operator.write", "operator.approvals", "operator.admin"]),
    ).toBe(false);
  });

  it("optionally accepts connect challenges without timestamps", () => {
    const challenge: OpenClawEventFrame = {
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "challenge" },
    };

    expect(isConnectChallenge(challenge, { requireTimestamp: false })).toBe(true);
    expect(isConnectChallenge(challenge)).toBe(false);
  });
});
