import type { GatewayRuntimeDeviceCodeLogin, GatewayRuntimeSetupTokenLogin } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { describe, expect, it } from "vitest";

import { DockerOpenClawGatewayRuntime } from "../docker-gateway-runtime.js";

class InMemoryOpaqueLoginRuntime extends DockerOpenClawGatewayRuntime {
  public deviceLog =
    "Open https://auth.example.test/device Code: ABCD-EFGH Code expires in 5 minutes";
  public setupLog = "Authorize: https://claude.ai/oauth/authorize";
  public deviceReadFails = false;
  public readonly setupInputs: { readonly path: string; readonly code: string }[] = [];
  public readonly stops: string[] = [];
  public stopBarrier: Promise<void> | undefined;

  public constructor() {
    super({ dockerHost: "tcp://unused.test:2375" });
  }

  public override async startDeviceCodeLogin(): Promise<Result<GatewayRuntimeDeviceCodeLogin>> {
    return ok({ execId: "docker-exec-secret", logPath: "/tmp/private/device.log" });
  }

  public override async readDeviceCodeLog(): Promise<Result<string>> {
    return this.deviceReadFails
      ? err(new DomainError({ code: "test.deadExec", message: "RAW DEAD EXEC docker-exec-secret" }))
      : ok(this.deviceLog);
  }

  public override async stopDeviceCodeLogin(): Promise<void> {
    await this.stopBarrier;
    this.stops.push("device");
  }

  public override async startSetupTokenLogin(): Promise<Result<GatewayRuntimeSetupTokenLogin>> {
    return ok({
      execId: "setup-exec-secret",
      logPath: "/tmp/private/setup.log",
      stdinPath: "/tmp/private/setup.stdin",
    });
  }

  public override async readSetupTokenLog(): Promise<Result<string>> {
    return ok(this.setupLog);
  }

  public override async writeSetupTokenInput(path: string, code: string): Promise<Result<void>> {
    this.setupInputs.push({ path, code });
    this.setupLog = "Setup token created successfully";
    return ok(undefined);
  }

  public override async stopSetupTokenLogin(): Promise<void> {
    this.stops.push("setup-token");
  }
}

describe("Gateway runtime opaque interactive-login facade", () => {
  it("returns an opaque device handle without Docker execution or path details", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();

    const begun = await runtime.beginDeviceLogin({ providerId: "openai", agentId: "main" });

    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect(begun.value).toEqual({ __brand: "DeviceLoginHandle", token: expect.any(String) });
    expect(begun.value.token).not.toBe("docker-exec-secret");
    expect(JSON.stringify(begun.value)).not.toContain("/tmp/private");
    expect(JSON.stringify(begun.value)).not.toContain("docker-exec-secret");
  });

  it("parses awaiting and completed device states without returning raw logs", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const rawLog = runtime.deviceLog;
    const begun = await runtime.beginDeviceLogin({ providerId: "openai", agentId: "main" });
    if (!begun.ok) throw begun.error;

    const awaiting = await runtime.pollDeviceLogin(begun.value);
    expect(awaiting).toEqual(
      ok({
        kind: "awaiting-code",
        deviceCode: "ABCD-EFGH",
        verificationUri: "https://auth.example.test/device",
        expiresInMs: 300_000,
      }),
    );
    expect(JSON.stringify(awaiting)).not.toContain(rawLog);

    runtime.deviceLog = "Authentication successful";
    await expect(runtime.pollDeviceLogin(begun.value)).resolves.toEqual(ok({ kind: "completed" }));
  });

  it("maps a dead device exec to a bounded redacted terminal failure", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const begun = await runtime.beginDeviceLogin({ providerId: "openai", agentId: "main" });
    if (!begun.ok) throw begun.error;
    runtime.deviceReadFails = true;

    const state = await runtime.pollDeviceLogin(begun.value);

    expect(state).toEqual(
      ok({ kind: "terminal-failure", reason: "The device login process is no longer available." }),
    );
    expect(JSON.stringify(state)).not.toContain("RAW DEAD EXEC");
    expect(JSON.stringify(state).length).toBeLessThan(200);
  });

  it("waits for verified device cancellation before invalidating the handle", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    let releaseStop: (() => void) | undefined;
    runtime.stopBarrier = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const begun = await runtime.beginDeviceLogin({ providerId: "openai", agentId: "main" });
    if (!begun.ok) throw begun.error;

    let cancelled = false;
    const cancellation = runtime.cancelDeviceLogin(begun.value).then((result) => {
      cancelled = true;
      return result;
    });
    await Promise.resolve();
    expect(cancelled).toBe(false);
    releaseStop?.();
    await expect(cancellation).resolves.toEqual(ok(undefined));
    expect(runtime.stops).toEqual(["device"]);
    await expect(runtime.pollDeviceLogin(begun.value)).resolves.toMatchObject({ ok: false });
    await expect(runtime.cancelDeviceLogin(begun.value)).resolves.toMatchObject({ ok: false });
  });

  it("supports the opaque setup-token begin, poll, submit, complete, and cancel flow", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const begun = await runtime.beginSetupTokenLogin();
    if (!begun.ok) throw begun.error;

    expect(JSON.stringify(begun.value)).not.toContain("setup-exec-secret");
    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toEqual(
      ok({ kind: "awaiting-code" }),
    );
    await expect(runtime.submitSetupTokenCode(begun.value, "one-use-code")).resolves.toEqual(
      ok(undefined),
    );
    expect(runtime.setupInputs).toEqual([
      { path: "/tmp/private/setup.stdin", code: "one-use-code" },
    ]);
    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toEqual(
      ok({ kind: "completed" }),
    );
    await expect(runtime.cancelSetupTokenLogin(begun.value)).resolves.toEqual(ok(undefined));
    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toMatchObject({ ok: false });
  });

  it("never carries a raw upstream log in any typed terminal state", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const secretRawLog = "access denied SECRET-UPSTREAM-PAYLOAD-123";
    runtime.deviceLog = secretRawLog;
    const begun = await runtime.beginDeviceLogin({ providerId: "openai", agentId: "main" });
    if (!begun.ok) throw begun.error;

    const state = await runtime.pollDeviceLogin(begun.value);

    expect(state).toEqual(
      ok({ kind: "terminal-failure", reason: "The provider rejected the device login." }),
    );
    expect(JSON.stringify(state)).not.toContain(secretRawLog);
    expect(JSON.stringify(state)).not.toContain("SECRET-UPSTREAM-PAYLOAD-123");
  });
});
