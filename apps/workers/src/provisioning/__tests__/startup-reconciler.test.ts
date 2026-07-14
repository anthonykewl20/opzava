import { describe, expect, it } from "vitest";

import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { renderAskAdminAgentArtifacts } from "../ask-admin-agent.js";
import {
  AskAdminStartupReconciler,
  type StartupOrchestratorConfigPort,
} from "../startup-reconciler.js";

class StartupAdminClient implements OpenClawAdminRpcPort {
  public readonly calls: Array<{
    readonly method: string;
    readonly params: Record<string, unknown>;
    readonly requiredScope?: string;
  }> = [];
  public readonly files = new Map<string, string>();
  public failures = 0;
  public closed = false;

  public async request(
    method: string,
    params: Record<string, unknown>,
    options?: { readonly requiredScope?: `operator.${string}` },
  ): Promise<Result<unknown>> {
    this.calls.push({
      method,
      params,
      ...(options?.requiredScope === undefined ? {} : { requiredScope: options.requiredScope }),
    });
    if (this.failures > 0) {
      this.failures -= 1;
      return err(
        new DomainError({
          code: "provisioning.openclawAdmin.connectionClosed",
          message: "Gateway reload in progress.",
        }),
      );
    }

    const name = String(params["name"]);
    if (method === "agents.files.get") {
      const content = this.files.get(name);
      return ok({
        agentId: "ask-admin-opzava",
        file: content === undefined ? { name, missing: true } : { name, missing: false, content },
      });
    }
    if (method === "agents.files.set") {
      this.files.set(name, String(params["content"]));
      return ok({ ok: true, file: { name, missing: false } });
    }
    return err(new DomainError({ code: "unexpected", message: method }));
  }

  public grantedScopes() {
    return ["operator.read", "operator.admin"] as const;
  }

  public connectionMetadata() {
    return null;
  }

  public close(): void {
    this.closed = true;
  }
}

class StartupConfigPort implements StartupOrchestratorConfigPort {
  public calls = 0;
  public result: Result<void> = ok(undefined);

  public async reconcileStartupOrchestrator(): Promise<Result<void>> {
    this.calls += 1;
    return this.result;
  }
}

describe("Ask Admin startup exact reconciliation", () => {
  it("does not write artifacts that already match exactly", async () => {
    const admin = new StartupAdminClient();
    for (const artifact of renderAskAdminAgentArtifacts()) {
      admin.files.set(artifact.path, artifact.content);
    }
    const config = new StartupConfigPort();
    const reconciler = new AskAdminStartupReconciler({
      adminClient: admin,
      configPort: config,
      sleep: async () => undefined,
    });

    const result = await reconciler.reconcile();

    expect(result).toMatchObject({ ok: true, value: { artifactsWritten: 0 } });
    expect(config.calls).toBe(1);
    expect(admin.calls.map((call) => call.method)).toEqual([
      "agents.files.get",
      "agents.files.get",
      "agents.files.get",
      "agents.files.get",
      "agents.files.get",
      "agents.files.get",
    ]);
    expect(admin.calls.map((call) => call.params["name"])).toEqual([
      "SOUL.md",
      "IDENTITY.md",
      "AGENTS.md",
      "SOUL.md",
      "IDENTITY.md",
      "AGENTS.md",
    ]);
  });

  it("writes drifted artifacts in canonical order with admin scope and exact-read verification", async () => {
    const admin = new StartupAdminClient();
    const config = new StartupConfigPort();
    const reconciler = new AskAdminStartupReconciler({
      adminClient: admin,
      configPort: config,
      sleep: async () => undefined,
    });

    const result = await reconciler.reconcile();

    expect(result).toMatchObject({ ok: true, value: { artifactsWritten: 3 } });
    expect(config.calls).toBe(1);
    expect(
      admin.calls.map((call) => [call.method, call.params["name"], call.requiredScope]),
    ).toEqual([
      ["agents.files.get", "SOUL.md", undefined],
      ["agents.files.set", "SOUL.md", "operator.admin"],
      ["agents.files.get", "SOUL.md", undefined],
      ["agents.files.get", "IDENTITY.md", undefined],
      ["agents.files.set", "IDENTITY.md", "operator.admin"],
      ["agents.files.get", "IDENTITY.md", undefined],
      ["agents.files.get", "AGENTS.md", undefined],
      ["agents.files.set", "AGENTS.md", "operator.admin"],
      ["agents.files.get", "AGENTS.md", undefined],
      ["agents.files.get", "SOUL.md", undefined],
      ["agents.files.get", "IDENTITY.md", undefined],
      ["agents.files.get", "AGENTS.md", undefined],
    ]);
    expect(admin.files).toEqual(
      new Map(renderAskAdminAgentArtifacts().map((artifact) => [artifact.path, artifact.content])),
    );
  });

  it("retries a transient partial file failure and fails closed when retries are exhausted", async () => {
    const retryingAdmin = new StartupAdminClient();
    retryingAdmin.failures = 1;
    const retrying = new AskAdminStartupReconciler({
      adminClient: retryingAdmin,
      configPort: new StartupConfigPort(),
      maxAttempts: 2,
      sleep: async () => undefined,
    });
    await expect(retrying.reconcile()).resolves.toMatchObject({ ok: true });

    const failingAdmin = new StartupAdminClient();
    failingAdmin.failures = 2;
    const failing = new AskAdminStartupReconciler({
      adminClient: failingAdmin,
      configPort: new StartupConfigPort(),
      maxAttempts: 2,
      sleep: async () => undefined,
    });

    const result = await failing.reconcile();

    expect(result).toMatchObject({
      ok: false,
      error: { code: "workers.askAdminStartup.artifactReadFailed" },
    });
  });

  it("closes the shared admin client", () => {
    const admin = new StartupAdminClient();
    const reconciler = new AskAdminStartupReconciler({
      adminClient: admin,
      configPort: new StartupConfigPort(),
    });

    reconciler.close();

    expect(admin.closed).toBe(true);
  });

  it("fails closed on a malformed or cross-file read payload", async () => {
    const admin = new StartupAdminClient();
    admin.request = async () =>
      ok({
        agentId: "another-agent",
        file: { name: "IDENTITY.md", missing: false, content: "wrong file" },
      });
    const reconciler = new AskAdminStartupReconciler({
      adminClient: admin,
      configPort: new StartupConfigPort(),
      maxAttempts: 1,
    });

    await expect(reconciler.reconcile()).resolves.toMatchObject({
      ok: false,
      error: { code: "workers.askAdminStartup.artifactReadMalformed" },
    });
  });
});
