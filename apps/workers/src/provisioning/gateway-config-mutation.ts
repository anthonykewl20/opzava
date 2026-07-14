import {
  expectedLocalFileSecretReference,
  GITHUB_ISSUES_TOKEN_SECRET_LABEL,
} from "@opzava/adapters";
import {
  type ConnectionProvisioningPrincipal,
  type ConnectionsSnapshot,
  type GetSecretRefInput,
  type OpenClawOperatorScope,
  type SecretReference,
} from "@opzava/ports";
import {
  DomainError,
  err,
  makeTenantId,
  ok,
  type Result,
  type TenantId,
} from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_ID,
  ASK_ADMIN_AGENT_MODEL,
  ASK_ADMIN_PLATFORM_TENANT_ID,
  ASK_ADMIN_WORKER_ADMIN_DEVICE_TOKEN_LABEL,
} from "./ask-admin-agent.js";
import { type OpenClawAdminLogger } from "./openclaw-admin-client.js";

function provisioningError(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): DomainError {
  return new DomainError({
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function configBaseHash(value: unknown): string | null {
  const root = recordValue(value);
  return root === null ? null : stringValue(root["hash"]);
}

export function configPatchParams(input: {
  readonly configGetPayload: unknown;
  readonly patch: Record<string, unknown>;
  readonly replacePaths?: readonly string[];
}): Result<Record<string, unknown>> {
  const baseHash = configBaseHash(input.configGetPayload);
  if (baseHash === null) {
    return err(
      provisioningError(
        "provisioning.connections.configBaseHashMissing",
        "Opzava Gateway config.get did not return the base hash required by config.patch.",
      ),
    );
  }

  return ok({
    raw: JSON.stringify(input.patch),
    baseHash,
    ...(input.replacePaths === undefined || input.replacePaths.length === 0
      ? {}
      : { replacePaths: input.replacePaths }),
  });
}

export function secretRef(input: ConnectionProvisioningPrincipal): GetSecretRefInput {
  return {
    tenantId: input.orgId as TenantId,
    purpose: "provider",
    label: GITHUB_ISSUES_TOKEN_SECRET_LABEL,
  };
}

export function readPrivateKeyPem(env: NodeJS.ProcessEnv): string | null {
  const base64Value = env["OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64"]?.trim();
  if (base64Value !== undefined && base64Value !== "") {
    return Buffer.from(base64Value, "base64").toString("utf8");
  }

  const pemValue = env["OPENCLAW_DEVICE_PRIVATE_KEY_PEM"]?.trim();
  return pemValue === undefined || pemValue === "" ? null : pemValue.replaceAll("\\n", "\n");
}

export function readRepository(env: NodeJS.ProcessEnv): string {
  return env["GITHUB_ISSUES_REPOSITORY"]?.trim() || "anthonykewl20/opzava";
}

export function readRequestedOperatorScopes(
  env: NodeJS.ProcessEnv,
): readonly OpenClawOperatorScope[] | undefined {
  const raw = env["OPENCLAW_OPERATOR_SCOPES"]?.trim();
  if (raw === undefined || raw === "") {
    return undefined;
  }

  const scopes = raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter((scope): scope is OpenClawOperatorScope => scope.startsWith("operator."));

  return scopes.length === 0 ? undefined : scopes;
}

export function readDockerHost(env: NodeJS.ProcessEnv): string | null {
  const value = env["DOCKER_HOST"]?.trim();
  return value === undefined || value === "" ? null : value;
}

export function readGatewayContainerName(env: NodeJS.ProcessEnv): string | null {
  const value =
    env["OPENCLAW_GATEWAY_CONTAINER_NAME"]?.trim() ?? env["OPENCLAW_GATEWAY_CONTAINER"]?.trim();
  return value === undefined || value === "" ? null : value;
}

export function consoleAdminLogger(): OpenClawAdminLogger {
  return {
    error(message, details) {
      console.error(JSON.stringify({ message, ...details }));
    },
  };
}

export function vaultTokenRef(env: NodeJS.ProcessEnv): SecretReference {
  return expectedLocalFileSecretReference({
    tenantId: makeTenantId(
      env["OPENCLAW_DEVICE_TOKEN_VAULT_TENANT_ID"]?.trim() || ASK_ADMIN_PLATFORM_TENANT_ID,
    ),
    purpose: "openclaw",
    label:
      env["OPENCLAW_DEVICE_TOKEN_VAULT_LABEL"]?.trim() || ASK_ADMIN_WORKER_ADMIN_DEVICE_TOKEN_LABEL,
    ...(env["OPENCLAW_DEVICE_TOKEN_VAULT_VERSION"]?.trim()
      ? { version: env["OPENCLAW_DEVICE_TOKEN_VAULT_VERSION"]!.trim() }
      : {}),
  });
}

export function unavailableSnapshot(input: {
  readonly now: Date;
  readonly repository: string;
  readonly message: string;
}): ConnectionsSnapshot {
  return {
    gateway: {
      status: "unavailable",
      region: null,
      authLabel: "Opzava Gateway admin RPC unavailable",
      lastHeartbeatAt: null,
      message: input.message,
    },
    providerCatalog: [],
    providerConnections: [],
    pendingDeviceFlows: [],
    github: {
      status: "not_connected",
      accountLabel: null,
      scopes: [],
      repository: input.repository,
      lastCheckedAt: null,
      message: "GitHub connection state is unavailable until provisioning is configured.",
    },
    orchestrator: {
      orchestratorAgentId: ASK_ADMIN_AGENT_ID,
      orchestratorModel: ASK_ADMIN_AGENT_MODEL,
      orchestratorProviderId: null,
      delegationMode: "prefer",
      allowAgents: [],
      subagents: [],
      toolPolicyExpansion: {
        allow: ["sessions_spawn", "subagents", "group:sessions"],
        receiptId: null,
      },
      reconcile: { status: "idle" },
      updatedAt: null,
    },
    refreshedAt: input.now.toISOString(),
  };
}

export function gatewayRuntimeUnavailableError(): DomainError {
  return provisioningError(
    "provisioning.connections.gatewayRuntimeUnavailable",
    "Gateway container exec is not configured for model-provider credential writes.",
  );
}
