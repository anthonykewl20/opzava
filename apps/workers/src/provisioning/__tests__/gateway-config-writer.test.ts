import { describe, expect, it } from "vitest";

import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  GatewayConfigWriter,
  type ConfigPatchPlan,
  type GatewayConfigSnapshot,
} from "../gateway-config-writer.js";

interface FakeOptions {
  readonly getError?: DomainError;
  readonly patchError?: DomainError;
  stalePatchCount?: number;
}

class FakeAdminClient implements OpenClawAdminRpcPort {
  public readonly calls: Array<{
    readonly method: string;
    readonly params: Record<string, unknown>;
    readonly requiredScope?: string;
  }> = [];
  private hash = 0;

  public constructor(private readonly options: FakeOptions = {}) {}

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

    if (method === "config.get") {
      if (this.options.getError !== undefined) {
        return err(this.options.getError);
      }
      this.hash += 1;
      return ok({ hash: `hash-${this.hash}`, config: { generation: this.hash } });
    }
    if (method === "config.patch") {
      if ((this.options.stalePatchCount ?? 0) > 0) {
        this.options.stalePatchCount = (this.options.stalePatchCount ?? 0) - 1;
        return err(
          new DomainError({
            code: "provisioning.openclawAdmin.requestError",
            message: "config changed since last load; re-run config.get and retry",
          }),
        );
      }
      if (this.options.patchError !== undefined) {
        return err(this.options.patchError);
      }
      return ok({ patched: true });
    }
    return err(new DomainError({ code: "unexpected", message: method }));
  }

  public grantedScopes() {
    return ["operator.admin"] as const;
  }

  public connectionMetadata() {
    return null;
  }

  public close(): void {}
}

function writer(adminClient: FakeAdminClient): GatewayConfigWriter {
  return new GatewayConfigWriter({ adminClient, sleep: async () => undefined });
}

async function snapshot(configWriter: GatewayConfigWriter): Promise<GatewayConfigSnapshot> {
  const result = await configWriter.read();
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

function patchCalls(admin: FakeAdminClient) {
  return admin.calls.filter((call) => call.method === "config.patch");
}

describe("GatewayConfigWriter", () => {
  it("reads the parsed config and constructs its opaque revision from config.get", async () => {
    const admin = new FakeAdminClient();
    const result = await writer(admin).read();

    expect(result).toEqual({
      ok: true,
      value: { revision: "hash-1", config: { generation: 1 } },
    });
    expect(admin.calls).toEqual([{ method: "config.get", params: {} }]);
  });

  it("propagates a config.get failure", async () => {
    const failure = new DomainError({ code: "gateway.unavailable", message: "offline" });
    const result = await writer(new FakeAdminClient({ getError: failure })).read();

    expect(result).toEqual(err(failure));
  });

  it("keeps ConfigRevision opaque to callers", () => {
    type Revision = GatewayConfigSnapshot["revision"];
    // @ts-expect-error A plain string cannot construct the writer-owned revision brand.
    const revision: Revision = "caller-supplied-hash";
    expect(revision).toBe("caller-supplied-hash");
  });

  it.each<{
    readonly name: string;
    readonly plan: ConfigPatchPlan;
    readonly patch: Record<string, unknown>;
    readonly replacePaths?: readonly string[];
  }>([
    {
      name: "plugin allow-list",
      plan: { allow: ["github", "slack"] },
      patch: { plugins: { allow: ["github", "slack"] } },
      replacePaths: ["plugins.allow"],
    },
    {
      name: "canonical agent graph",
      plan: {
        agentsList: [
          { id: "ask-admin", skills: ["ops"], tools: { allow: ["read"], deny: [] } },
          { id: "subagent-review" },
        ],
      },
      patch: {
        agents: {
          list: [
            { id: "ask-admin", skills: ["ops"], tools: { allow: ["read"], deny: [] } },
            { id: "subagent-review" },
          ],
        },
      },
      replacePaths: [
        "agents.list",
        "agents.list[].skills",
        "agents.list[].tools.allow",
        "agents.list[].tools.deny",
        "agents.list[].subagents.allowAgents",
      ],
    },
    {
      name: "provider disconnect",
      plan: {
        providerId: "anthropic",
        profileIdsToRemove: ["anthropic:default", "anthropic:backup"],
        authOrderForProvider: ["anthropic:survivor"],
      },
      patch: {
        auth: {
          profiles: { "anthropic:default": null, "anthropic:backup": null },
          order: { anthropic: ["anthropic:survivor"] },
        },
      },
      replacePaths: ["auth.order.anthropic"],
    },
    {
      name: "model routability",
      plan: { models: { "anthropic/claude": {}, "openai/gpt": null } },
      patch: {
        agents: {
          defaults: { models: { "anthropic/claude": {}, "openai/gpt": null } },
        },
      },
    },
  ])("compiles the exact $name patch and replacement paths", async ({ plan, patch, replacePaths }) => {
    const admin = new FakeAdminClient();
    const configWriter = writer(admin);
    const current = await snapshot(configWriter);

    const result = await configWriter.commit(current, plan);

    expect(result).toEqual({ ok: true, value: { response: { patched: true } } });
    const call = patchCalls(admin)[0]!;
    expect(JSON.parse(String(call.params["raw"]))).toEqual(patch);
    expect(call.params["baseHash"]).toBe("hash-1");
    expect(call.params["replacePaths"]).toEqual(replacePaths);
    expect(call.requiredScope).toBe("operator.admin");
  });

  it("re-reads and rebuilds the same plan with a fresh revision after a stale-base-hash error", async () => {
    const admin = new FakeAdminClient({ stalePatchCount: 1 });
    const configWriter = writer(admin);
    const current = await snapshot(configWriter);
    const plan = { allow: ["github"] } as const;

    const result = await configWriter.commit(current, plan);

    expect(result.ok).toBe(true);
    expect(admin.calls.map((call) => call.method)).toEqual([
      "config.get",
      "config.patch",
      "config.get",
      "config.patch",
    ]);
    const patches = patchCalls(admin);
    expect(patches.map((call) => call.params["baseHash"])).toEqual(["hash-1", "hash-2"]);
    expect(patches.map((call) => call.params["raw"])).toEqual([
      JSON.stringify({ plugins: { allow: ["github"] } }),
      JSON.stringify({ plugins: { allow: ["github"] } }),
    ]);
  });

  it("propagates a non-retryable patch error without retrying", async () => {
    const failure = new DomainError({
      code: "provisioning.openclawAdmin.operatorAdminRequired",
      message: "scope",
    });
    const admin = new FakeAdminClient({ patchError: failure });
    const configWriter = writer(admin);
    const current = await snapshot(configWriter);

    const result = await configWriter.commit(current, { allow: ["github"] });

    expect(result).toEqual(err(failure));
    expect(admin.calls.map((call) => call.method)).toEqual(["config.get", "config.patch"]);
  });
});
