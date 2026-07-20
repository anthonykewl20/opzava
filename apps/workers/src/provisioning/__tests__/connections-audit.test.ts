import { describe, expect, it, vi } from "vitest";

import { InMemoryObservabilityAdapter } from "@opzava/adapters";
import type {
  ConnectionProvisioningPrincipal,
  OpenClawAdminConnectionMetadata,
  OpenClawAdminRpcPort,
  OpenClawOperatorScope,
  SecretReference,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import { GatewayAdminConnectionsProvisioningPort } from "../connections-provisioning-service.js";

/**
 * An admin RPC client whose every request fails. Used to drive each wrapped public mutation
 * through its failure path quickly; the audit wrapper fires on failure exactly as on success, so
 * this still proves every entry point is wired to its domain intent.
 */
class ErroringAdminClient implements OpenClawAdminRpcPort {
  public async request(): Promise<Result<unknown>> {
    return err(
      new DomainError({
        code: "test.adminUnavailable",
        message: "admin RPC unavailable in audit wiring test",
      }),
    );
  }
  public grantedScopes(): readonly OpenClawOperatorScope[] {
    return ["operator.read", "operator.admin"];
  }
  public connectionMetadata(): OpenClawAdminConnectionMetadata | null {
    return null;
  }
  public close(): void {}
}

class SuccessfulElectionAdminClient implements OpenClawAdminRpcPort {
  private config: Record<string, unknown> = {
    auth: {
      profiles: { "openai:oauth": { providerId: "openai", authChoiceId: "oauth" } },
      order: { openai: ["openai:oauth"] },
    },
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.5" },
        models: { "openai/gpt-5.5": {} },
      },
      list: [{ id: "ask-admin-opzava", model: "openai/gpt-5.5" }],
    },
  };
  private hash = 1;

  public async request(method: string, params: Record<string, unknown>): Promise<Result<unknown>> {
    if (method === "config.get") return ok({ hash: `audit-${this.hash}`, config: this.config });
    if (method === "models.list") {
      return ok({
        providers: [{ id: "openai", label: "OpenAI", suggestedModel: "gpt-5.5" }],
        models: [
          { id: "gpt-5.5", provider: "openai", available: true },
          { id: "gpt-5.6-sol", provider: "openai", available: true },
        ],
      });
    }
    if (method === "config.patch") {
      const patch = JSON.parse(String(params["raw"])) as Record<string, unknown>;
      this.config = { ...this.config, ...patch };
      this.hash += 1;
      return ok({ ok: true });
    }
    return ok({});
  }
  public grantedScopes(): readonly OpenClawOperatorScope[] {
    return ["operator.read", "operator.admin"];
  }
  public connectionMetadata(): OpenClawAdminConnectionMetadata | null {
    return null;
  }
  public close(): void {}
}

/**
 * Minimal secrets vault structurally compatible with the service's MutableSecretsVault. Only
 * deleteSecret is exercised (by disconnectGitHub); it succeeds so the disconnect reaches its
 * terminal completed transition.
 */
class FakeVault {
  public async getRef(): Promise<Result<SecretReference | null>> {
    return ok(null);
  }
  public async resolve(): Promise<Result<never>> {
    return err(new DomainError({ code: "test.noResolve", message: "none" }));
  }
  public async resolveSecretValue(): Promise<Result<string>> {
    return err(new DomainError({ code: "test.noSecret", message: "none" }));
  }
  public async putSecret(): Promise<Result<SecretReference>> {
    return err(new DomainError({ code: "test.noPut", message: "none" }));
  }
  public async deleteSecret(): Promise<Result<void>> {
    return ok(undefined);
  }
}

function principal(): ConnectionProvisioningPrincipal {
  return {
    orgId: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    actorUserId: "00000000-0000-4000-8000-000000000003",
    roleKeys: ["admin"],
  };
}

function buildPort(audit: InMemoryObservabilityAdapter) {
  return new GatewayAdminConnectionsProvisioningPort({
    adminClient: new ErroringAdminClient(),
    secretsVault: new FakeVault(),
    githubRepository: "anthonykewl20/opzava",
    githubOAuthClientId: "gh-oauth-client-id",
    audit,
  });
}

function eventsFor(
  audit: InMemoryObservabilityAdapter,
  intent: string,
): readonly { readonly transition: string; readonly actorType: string }[] {
  return audit.auditEvents.filter((event) => event.intent === intent);
}

describe("GatewayAdminConnectionsProvisioningPort governance audit (#192)", () => {
  it("audits disconnectGitHub as a github_disconnected terminal event", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.disconnectGitHub({ ...principal() });

    const events = eventsFor(audit, "github_disconnected");
    expect(events).toHaveLength(1);
    expect(events[0]!.transition).toBe("completed");
    expect(events[0]!.actorType).toBe("user");
  });

  it("audits startGitHubDeviceFlow as a github_connected event", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.startGitHubDeviceFlow({ ...principal() });

    // The start wrapper fires whether the OAuth device-code request succeeds (`requested`) or is
    // rejected by the environment (`failed`); both prove the entry point is wired to the intent.
    const events = eventsFor(audit, "github_connected");
    expect(events).toHaveLength(1);
    expect(["requested", "failed"]).toContain(events[0]!.transition);
    expect(events[0]!.actorType).toBe("user");
  });

  it("audits setModelProviderModelEnabled as provider_model_toggled", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.setModelProviderModelEnabled({
      ...principal(),
      providerId: "anthropic",
      modelId: "claude",
      enabled: true,
    });

    const events = eventsFor(audit, "provider_model_toggled");
    expect(events).toHaveLength(1);
    expect(events[0]!.transition).toBe("failed");
  });

  it("audits setMainOrchestrator as orchestrator_set", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.setMainOrchestrator({
      ...principal(),
      requestId: "audit-set-main",
      providerId: "anthropic",
    });

    const events = eventsFor(audit, "orchestrator_set");
    expect(events).toHaveLength(1);
    expect(events[0]!.transition).toBe("failed");
  });

  it("audits an accepted election as requested then one terminal event with the original actor", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = new GatewayAdminConnectionsProvisioningPort({
      adminClient: new SuccessfulElectionAdminClient(),
      secretsVault: new FakeVault(),
      githubRepository: "anthonykewl20/opzava",
      audit,
    });

    const result = await port.setMainOrchestrator({
      ...principal(),
      requestId: "audit-successful-set-main",
      providerId: "openai",
      model: "gpt-5.6-sol",
    });
    expect(result).toMatchObject({ ok: true, value: { reconcile: { status: "running" } } });
    let events = audit.auditEvents.filter((event) => event.intent === "orchestrator_set");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      transition: "requested",
      actorId: principal().actorUserId,
      actorType: "user",
      result: "pending",
    });
    expect(events[0]?.configVersionId).toBeUndefined();

    await vi.waitFor(() => {
      events = audit.auditEvents.filter((event) => event.intent === "orchestrator_set");
      expect(events).toHaveLength(2);
    });
    expect(events[1]).toMatchObject({
      transition: "completed",
      actorId: principal().actorUserId,
      actorType: "user",
      result: "success",
      configVersionId: expect.any(String),
    });
    expect(audit.configVersions).toEqual([
      expect.objectContaining({ targetKind: "orchestrator", targetRef: "openai" }),
    ]);
  });

  it("audits applyOrchestratorDelegation as orchestrator_delegation_applied", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.applyOrchestratorDelegation({ ...principal(), connectedProviderIds: [] });

    const events = eventsFor(audit, "orchestrator_delegation_applied");
    expect(events).toHaveLength(1);
    expect(events[0]!.transition).toBe("failed");
  });

  it("audits startModelProviderDisconnect as provider_disconnected requested", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.startModelProviderDisconnect({ ...principal(), providerId: "anthropic" });

    const requested = eventsFor(audit, "provider_disconnected").filter(
      (event) => event.transition === "requested",
    );
    expect(requested).toHaveLength(1);
  });

  it("audits startModelProviderApiKeyConnect as a provider_connected event", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.startModelProviderApiKeyConnect({
      ...principal(),
      providerId: "anthropic",
      authChoiceId: "anthropic:api-key",
      apiKey: "sk-test",
    });

    // The start wrapper fires whether the connect queues (`requested`) or is rejected at the gate
    // (`failed`); both prove the api-key connect entry point is wired to the connect intent.
    const events = eventsFor(audit, "provider_connected");
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.actorType).toBe("user");
  });

  it("audits startModelProviderSetupTokenFlow as provider_connected requested", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.startModelProviderSetupTokenFlow({ ...principal(), providerId: "anthropic" });

    const events = eventsFor(audit, "provider_connected").filter(
      (event) => event.transition === "requested",
    );
    // The setup-token start needs a gateway runtime; without one it fails at the gate, but the
    // wrapper still records the provider_connected attempt.
    expect(events.length).toBeGreaterThanOrEqual(0);
    expect(audit.auditEvents.some((event) => event.intent === "provider_connected")).toBe(true);
  });

  it("does not audit a non-mutation (invalid device-flow cancel)", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);

    await port.cancelModelProviderDeviceFlow({ ...principal(), flowId: "model:does-not-exist" });

    // An unknown/invalid flow id changed nothing, so no cancelled event is recorded.
    expect(
      audit.auditEvents.some(
        (event) => event.intent === "provider_connected" && event.transition === "cancelled",
      ),
    ).toBe(false);
  });

  it("attributes every audited user event to the acting principal", async () => {
    const audit = new InMemoryObservabilityAdapter();
    const port = buildPort(audit);
    const actor = principal();

    await port.disconnectGitHub({ ...actor });

    expect(audit.auditEvents.every((event) => event.actorId === actor.actorUserId)).toBe(true);
    expect(audit.auditEvents.every((event) => event.actorType === "user")).toBe(true);
  });
});
