import type { ConnectionsSnapshot, OpenClawAuditActivityPage } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { describe, expect, it, vi } from "vitest";

import { CompositionCache } from "../lib/admin-evidence";
import {
  composeAdminOverview,
  type AdminOverviewCachedEvidence,
} from "../lib/admin-overview/overview-composition";
import type { ConnectionsPageData } from "../lib/connections";
import { providerConnectionSummary, projectProviderConnections } from "../lib/connections-state";
import type { AppSessionContext } from "../lib/session";

const observedAt = "2026-07-20T00:00:00.000Z";
const evaluatedAt = "2026-07-20T00:00:30.000Z";

const context: AppSessionContext = {
  sessionId: "session-1",
  user: { id: "user-1", email: "owner@example.test", name: "Owner" },
  orgId: "org-1",
  organizationName: "Opzava",
  organizationLifecycleState: "active",
  workspaceId: "workspace-1",
  workspaceName: "Admin",
  roleKeys: ["owner"],
};

function snapshot(overrides: Partial<ConnectionsSnapshot> = {}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "active",
      region: "ap-southeast-1",
      authLabel: "Workspace admin",
      lastHeartbeatAt: observedAt,
      message: null,
    },
    openclawHealth: {
      components: [
        {
          id: "gateway",
          kind: "gateway",
          label: "Gateway",
          status: "healthy",
          detail: null,
          lastCheckedAt: observedAt,
        },
      ],
      warnings: [],
      runtime: { version: "1.0.0", uptimeMs: 10, hostUptimeMs: 20, updateAvailable: null },
      sessions: { count: 1, recent: [] },
      checkedAt: observedAt,
      lastKnownHealthy: null,
    },
    providerCatalog: [
      {
        id: "openai",
        label: "OpenAI",
        vendor: "OpenAI",
        suggestedModel: "gpt-5",
        roleStrength: "General",
        whenToUse: "General work",
        authChoices: [],
        models: [],
      },
    ],
    providerConnections: [
      {
        providerId: "openai",
        status: "connected",
        authChoiceId: null,
        accountLabel: "team@example.test",
        scopes: [],
        model: "gpt-5",
        usageLabel: null,
        lastCheckedAt: observedAt,
        message: null,
      },
    ],
    pendingDeviceFlows: [],
    github: {
      status: "connected",
      accountLabel: "opzava-bot",
      scopes: ["repo"],
      repository: "anthonykewl20/opzava",
      lastCheckedAt: observedAt,
      message: null,
    },
    orchestrator: {
      orchestratorAgentId: "ask-admin-opzava",
      orchestratorModel: "openai/gpt-5",
      orchestratorProviderId: "openai",
      delegationMode: "prefer",
      allowAgents: [],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: null,
      },
      reconcile: { status: "idle" },
      updatedAt: observedAt,
    },
    refreshedAt: observedAt,
    ...overrides,
  };
}

function pageData(current = snapshot()): ConnectionsPageData {
  return {
    snapshot: current,
    providerSummary: providerConnectionSummary(current),
    providers: projectProviderConnections(current),
    githubSummary: "Connected",
    provisioningAvailable: true,
  };
}

const activity: OpenClawAuditActivityPage = {
  events: [
    {
      eventType: "agent_run",
      eventId: "event-later",
      sequence: 2,
      sourceSequence: 12,
      occurredAt: Date.parse("2026-07-20T00:00:20.000Z"),
      action: "agent.run.finished",
      status: "succeeded",
      agentId: "private-agent-id",
      runId: "private-run-id",
    },
    {
      eventType: "tool_action",
      eventId: "event-earlier",
      sequence: 1,
      sourceSequence: 11,
      occurredAt: Date.parse("2026-07-20T00:00:10.000Z"),
      action: "tool.action.finished",
      status: "failed",
      agentId: "private-agent-id",
      runId: "private-run-id",
      toolName: "private-tool-name",
    },
  ],
};

function dependencies(
  overrides: {
    readonly loadConnectionsPageData?: () => Promise<Result<ConnectionsPageData>>;
    readonly readRecentActivity?: () => Promise<Result<OpenClawAuditActivityPage>>;
    readonly authorizationVersion?: string;
    readonly cache?: CompositionCache<AdminOverviewCachedEvidence>;
  } = {},
) {
  return {
    loadConnectionsPageData: overrides.loadConnectionsPageData ?? (async () => ok(pageData())),
    readRecentActivity: overrides.readRecentActivity ?? (async () => ok(activity)),
    now: () => new Date(evaluatedAt),
    observationGeneration: 7,
    authorizationVersion: overrides.authorizationVersion ?? "membership:1",
    cache: overrides.cache ?? new CompositionCache<AdminOverviewCachedEvidence>(),
  };
}

describe("Admin Overview composition", () => {
  it("composes Variant A in order with source provenance and newest activity first", async () => {
    const overview = await composeAdminOverview(context, dependencies());

    expect(overview.sections.map((section) => section.id)).toEqual([
      "needs-your-attention",
      "active-delivery",
      "development-readiness",
      "recent-activity",
    ]);
    expect(overview.developmentReadiness.envelopes.map((envelope) => envelope.sourceOwner)).toEqual(
      ["OpenClaw/Platform", "OpenClaw Gateway", "OpenClaw Models", "GitHub"],
    );
    expect(
      overview.developmentReadiness.envelopes.every((item) => item.provenance.href !== null),
    ).toBe(true);
    expect(overview.recentActivity.rows.map((row) => row.occurredAt)).toEqual([
      "2026-07-20T00:00:20.000Z",
      "2026-07-20T00:00:10.000Z",
    ]);
    expect(JSON.stringify(overview)).not.toContain("private-");
  });

  it("keeps sibling sections available when the audit source fails", async () => {
    const overview = await composeAdminOverview(
      context,
      dependencies({
        readRecentActivity: async () =>
          err(new DomainError({ code: "gatewayBroker.gatewayUnavailable", message: "offline" })),
      }),
    );

    expect(overview.recentActivity.status.state).toBe("unavailable");
    expect(overview.recentActivity.rows).toEqual([]);
    expect(overview.needsYourAttention.status.state).toBe("live");
    expect(overview.developmentReadiness.status.state).toBe("live");
    expect(overview.activeDelivery.status.state).toBe("not-configured");
  });

  it("maps unsupported audit reads to not-configured", async () => {
    const overview = await composeAdminOverview(
      context,
      dependencies({
        readRecentActivity: async () =>
          err(new DomainError({ code: "webGateway.auditUnsupported", message: "unsupported" })),
      }),
    );

    expect(overview.recentActivity.status.state).toBe("not-configured");
    expect(overview.recentActivity.rows).toEqual([]);
  });

  it("reports a removed required readiness fact as unknown instead of zero", async () => {
    const current = snapshot({
      openclawHealth: {
        ...snapshot().openclawHealth,
        components: [],
        checkedAt: null,
      },
    });
    const overview = await composeAdminOverview(
      context,
      dependencies({ loadConnectionsPageData: async () => ok(pageData(current)) }),
    );

    const health = overview.developmentReadiness.envelopes[0]!;
    expect(health.state).toBe("unknown");
    expect(health.value).toBeNull();
    expect(overview.developmentReadiness.status.state).toBe("unknown");
    expect(overview.developmentReadiness.status.partial).toBe(true);
  });

  it("preserves R1 not-configured readiness when a successful snapshot lacks provisioning", async () => {
    const current = snapshot({
      gateway: {
        ...snapshot().gateway,
        status: "unavailable",
      },
    });
    const unavailablePageData = { ...pageData(current), provisioningAvailable: false };
    const overview = await composeAdminOverview(
      context,
      dependencies({ loadConnectionsPageData: async () => ok(unavailablePageData) }),
    );

    expect(overview.needsYourAttention.status.state).toBe("unavailable");
    expect(overview.developmentReadiness.envelopes.map((item) => item.state)).toEqual([
      "not-configured",
      "not-configured",
      "not-configured",
      "not-configured",
    ]);
    expect(overview.developmentReadiness.status.state).toBe("not-configured");
  });

  it("treats zero attention items as a live empty result", async () => {
    const overview = await composeAdminOverview(context, dependencies());

    expect(overview.needsYourAttention.rows).toEqual([]);
    expect(overview.needsYourAttention.empty).toBe(true);
    expect(overview.needsYourAttention.status.state).toBe("live");
  });

  it("projects only actionable provider and health proxies with owner links", async () => {
    const current = snapshot({
      providerConnections: [
        {
          ...snapshot().providerConnections[0]!,
          status: "needs_attention",
        },
      ],
      openclawHealth: {
        ...snapshot().openclawHealth,
        components: [
          {
            ...snapshot().openclawHealth.components[0]!,
            status: "attention",
          },
        ],
      },
    });
    const overview = await composeAdminOverview(
      context,
      dependencies({ loadConnectionsPageData: async () => ok(pageData(current)) }),
    );

    expect(overview.needsYourAttention.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "OpenAI",
          actionLabel: "Fix",
          href: "/connections/providers",
        }),
        expect.objectContaining({ title: "Gateway", actionLabel: "Inspect", href: "/connections" }),
      ]),
    );
    expect(overview.needsYourAttention.empty).toBe(false);
  });

  it("isolates cache entries by authorizationVersion", async () => {
    const cache = new CompositionCache<AdminOverviewCachedEvidence>();
    const loadConnectionsPageData = vi.fn(async () => ok(pageData()));
    const readRecentActivity = vi.fn(async () => ok(activity));

    await composeAdminOverview(
      context,
      dependencies({ cache, loadConnectionsPageData, readRecentActivity }),
    );
    await composeAdminOverview(
      context,
      dependencies({ cache, loadConnectionsPageData, readRecentActivity }),
    );
    await composeAdminOverview(
      context,
      dependencies({
        cache,
        loadConnectionsPageData,
        readRecentActivity,
        authorizationVersion: "membership:2",
      }),
    );

    expect(loadConnectionsPageData).toHaveBeenCalledTimes(2);
    expect(readRecentActivity).toHaveBeenCalledTimes(2);
  });
});
