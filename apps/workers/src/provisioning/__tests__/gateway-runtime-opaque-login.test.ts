import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { describe, expect, it, vi } from "vitest";

import { DockerOpenClawGatewayRuntime } from "../docker-gateway-runtime.js";

class InMemoryOpaqueLoginRuntime extends DockerOpenClawGatewayRuntime {
  public deviceLog =
    "Open https://auth.example.test/device Code: ABCD-EFGH Code expires in 5 minutes";
  public setupLog = "Authorize: https://claude.ai/oauth/authorize";
  public deviceReadFails = false;
  public setupReadFails = false;
  public readonly setupInputs: { readonly code: string }[] = [];
  public readonly stops: string[] = [];
  public stopBarrier: Promise<void> | undefined;
  public stopError: Error | undefined;
  private activeKind: "device" | "setup-token" = "device";

  public constructor() {
    super({ dockerHost: "tcp://unused.test:2375" });
    const internals = this as unknown as {
      startDeviceLogin: () => Promise<Result<{ readonly execId: string; readonly logPath: string }>>;
      readInteractiveLoginLog: () => Promise<Result<string>>;
      stopInteractiveLogin: () => Promise<void>;
      launchSetupTokenLogin: () => Promise<
        Result<{ readonly execId: string; readonly logPath: string; readonly stdinPath: string }>
      >;
      writeSetupTokenCode: (_stdinPath: string, code: string) => Promise<Result<void>>;
    };
    internals.startDeviceLogin = async () => {
      this.activeKind = "device";
      return ok({ execId: "docker-exec-secret", logPath: "/tmp/private/device.log" });
    };
    internals.readInteractiveLoginLog = async () =>
      this.deviceReadFails || (this.activeKind === "setup-token" && this.setupReadFails)
        ? err(new DomainError({ code: "test.deadExec", message: "RAW DEAD EXEC docker-exec-secret" }))
        : ok(this.activeKind === "setup-token" ? this.setupLog : this.deviceLog);
    internals.stopInteractiveLogin = async () => {
      await this.stopBarrier;
      if (this.stopError !== undefined) throw this.stopError;
      this.stops.push(this.activeKind);
    };
    internals.launchSetupTokenLogin = async () => {
      this.activeKind = "setup-token";
      return ok({ execId: "setup-exec-secret", logPath: "/tmp/private/setup.log", stdinPath: "/tmp/private/setup.stdin" });
    };
    internals.writeSetupTokenCode = async (_path, code) => {
      this.setupInputs.push({ code });
      this.setupLog = `sk-ant-oat01-${"a".repeat(95)}`;
      return ok(undefined);
    };
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

  it("maps a dead device exec to a bounded typed unavailable state", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const begun = await runtime.beginDeviceLogin({ providerId: "openai", agentId: "main" });
    if (!begun.ok) throw begun.error;
    runtime.deviceReadFails = true;

    const state = await runtime.pollDeviceLogin(begun.value);

    expect(state).toEqual(ok({ kind: "unavailable" }));
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

  it("synchronously revokes a setup-token handle while its verified stop is pending", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    let releaseStop: (() => void) | undefined;
    runtime.stopBarrier = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const begun = await runtime.beginSetupTokenLogin();
    if (!begun.ok) throw begun.error;

    const cancellation = runtime.cancelSetupTokenLogin(begun.value);
    await Promise.resolve();

    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toMatchObject({ ok: false });
    await expect(runtime.submitSetupTokenCode(begun.value, "one-use-code")).resolves.toMatchObject({
      ok: false,
    });
    releaseStop?.();
    await expect(cancellation).resolves.toEqual(ok(undefined));
  });

  it("restores a setup-token handle after verified cancellation fails", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    runtime.stopError = new Error("stop failed");
    const begun = await runtime.beginSetupTokenLogin();
    if (!begun.ok) throw begun.error;

    await expect(runtime.cancelSetupTokenLogin(begun.value)).resolves.toMatchObject({ ok: false });
    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toEqual(
      ok({ kind: "awaiting-code", authorizeUrl: "https://claude.ai/oauth/authorize" }),
    );
  });

  it("supports the opaque setup-token begin, poll, submit, complete, and cancel flow", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const begun = await runtime.beginSetupTokenLogin();
    if (!begun.ok) throw begun.error;

    expect(JSON.stringify(begun.value)).not.toContain("setup-exec-secret");
    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toEqual(
      ok({ kind: "awaiting-code", authorizeUrl: "https://claude.ai/oauth/authorize" }),
    );
    await expect(runtime.submitSetupTokenCode(begun.value, "one-use-code")).resolves.toEqual(
      ok(undefined),
    );
    expect(runtime.setupInputs).toEqual([{ code: "one-use-code" }]);
    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toMatchObject({
      ok: true,
      value: { kind: "completed", setupToken: expect.any(String) },
    });
    await expect(runtime.cancelSetupTokenLogin(begun.value)).resolves.toEqual(ok(undefined));
    await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toMatchObject({ ok: false });
  });

  it("maps an unreadable setup-token log to the typed unavailable state", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const begun = await runtime.beginSetupTokenLogin();
    if (!begun.ok) throw begun.error;
    runtime.setupReadFails = true;

    const state = await runtime.pollSetupTokenLogin(begun.value);

    expect(state).toEqual(ok({ kind: "unavailable" }));
    expect(JSON.stringify(state)).not.toContain("RAW DEAD EXEC");
  });

  it("warns with token length metadata when a setup-token candidate is malformed", async () => {
    const runtime = new InMemoryOpaqueLoginRuntime();
    const malformed = `sk-ant-oat01-${"a".repeat(20)}`;
    runtime.setupLog = `Created ${malformed}\n`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const begun = await runtime.beginSetupTokenLogin();
      if (!begun.ok) throw begun.error;

      await expect(runtime.pollSetupTokenLogin(begun.value)).resolves.toEqual(ok({ kind: "pending" }));

      expect(warn).toHaveBeenCalledWith("connections.setupToken.rejectedMalformedToken", {
        reason: "tooShort",
        expectedLength: 108,
        observedLength: malformed.length,
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(malformed);
    } finally {
      warn.mockRestore();
    }
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
