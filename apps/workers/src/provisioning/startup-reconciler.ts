import type { OpenClawAdminRpcPort } from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  ASK_ADMIN_AGENT_ID,
  ASK_ADMIN_AGENT_VERSION,
  renderAskAdminAgentArtifacts,
  type RenderedAskAdminArtifact,
} from "./ask-admin-agent.js";

export interface StartupOrchestratorConfigPort {
  reconcileStartupOrchestrator(): Promise<Result<void>>;
}

export interface AskAdminStartupReconcilerOptions {
  readonly adminClient: OpenClawAdminRpcPort;
  readonly configPort: StartupOrchestratorConfigPort;
  readonly maxAttempts?: number;
  readonly retryBackoffMs?: readonly number[];
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface AskAdminStartupReconciliationReceipt {
  readonly agentId: typeof ASK_ADMIN_AGENT_ID;
  readonly version: typeof ASK_ADMIN_AGENT_VERSION;
  readonly artifactsChecked: number;
  readonly artifactsWritten: number;
}

const defaultRetryBackoffMs = [100, 250, 500] as const;

function startupError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function artifactContent(
  payload: unknown,
  requestedPath: RenderedAskAdminArtifact["path"],
): Result<string | null> {
  if (
    !isRecord(payload) ||
    payload["agentId"] !== ASK_ADMIN_AGENT_ID ||
    !isRecord(payload["file"]) ||
    payload["file"]["name"] !== requestedPath
  ) {
    return err(
      startupError(
        "workers.askAdminStartup.artifactReadMalformed",
        "Gateway returned a malformed Ask Admin artifact response.",
      ),
    );
  }

  const file = payload["file"];
  if (file["missing"] === true) {
    return ok(null);
  }
  if (file["missing"] !== false || typeof file["content"] !== "string") {
    return err(
      startupError(
        "workers.askAdminStartup.artifactReadMalformed",
        "Gateway returned a malformed Ask Admin artifact response.",
      ),
    );
  }
  return ok(file["content"]);
}

export class AskAdminStartupReconciler {
  private readonly maxAttempts: number;
  private readonly retryBackoffMs: readonly number[];
  private readonly sleep: (ms: number) => Promise<void>;

  public constructor(private readonly options: AskAdminStartupReconcilerOptions) {
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 4);
    this.retryBackoffMs = options.retryBackoffMs ?? defaultRetryBackoffMs;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  public async reconcile(): Promise<Result<AskAdminStartupReconciliationReceipt>> {
    const config = await this.retry(() => this.options.configPort.reconcileStartupOrchestrator());
    if (!config.ok) {
      return err(
        startupError(
          "workers.askAdminStartup.configReconcileFailed",
          "Ask Admin startup config reconciliation failed.",
          config.error,
        ),
      );
    }

    let artifactsWritten = 0;
    for (const artifact of renderAskAdminAgentArtifacts()) {
      const reconciled = await this.reconcileArtifact(artifact);
      if (!reconciled.ok) {
        return err(reconciled.error);
      }
      if (reconciled.value) {
        artifactsWritten += 1;
      }
    }

    // One combined final pass proves that a partial retry did not leave an earlier file stale.
    for (const artifact of renderAskAdminAgentArtifacts()) {
      const verified = await this.readArtifact(artifact.path);
      if (!verified.ok) {
        return err(verified.error);
      }
      if (verified.value !== artifact.content) {
        return err(
          startupError(
            "workers.askAdminStartup.artifactVerifyFailed",
            `Ask Admin ${artifact.path} final exact-read verification failed.`,
          ),
        );
      }
    }

    return ok({
      agentId: ASK_ADMIN_AGENT_ID,
      version: ASK_ADMIN_AGENT_VERSION,
      artifactsChecked: renderAskAdminAgentArtifacts().length,
      artifactsWritten,
    });
  }

  public close(): void {
    this.options.adminClient.close();
  }

  private async reconcileArtifact(artifact: RenderedAskAdminArtifact): Promise<Result<boolean>> {
    const current = await this.readArtifact(artifact.path);
    if (!current.ok) {
      return err(current.error);
    }
    if (current.value === artifact.content) {
      return ok(false);
    }

    const written = await this.retry(() =>
      this.options.adminClient.request(
        "agents.files.set",
        {
          agentId: ASK_ADMIN_AGENT_ID,
          name: artifact.path,
          content: artifact.content,
        },
        { requiredScope: "operator.admin" },
      ),
    );
    if (!written.ok) {
      return err(
        startupError(
          "workers.askAdminStartup.artifactWriteFailed",
          `Ask Admin ${artifact.path} reconciliation failed.`,
          written.error,
        ),
      );
    }

    const verified = await this.readArtifact(artifact.path);
    if (!verified.ok) {
      return err(verified.error);
    }
    if (verified.value !== artifact.content) {
      return err(
        startupError(
          "workers.askAdminStartup.artifactVerifyFailed",
          `Ask Admin ${artifact.path} exact-read verification failed.`,
        ),
      );
    }
    return ok(true);
  }

  private async readArtifact(
    path: RenderedAskAdminArtifact["path"],
  ): Promise<Result<string | null>> {
    const read = await this.retry(() =>
      this.options.adminClient.request("agents.files.get", {
        agentId: ASK_ADMIN_AGENT_ID,
        name: path,
      }),
    );
    if (!read.ok) {
      return err(
        startupError(
          "workers.askAdminStartup.artifactReadFailed",
          `Ask Admin ${path} read failed.`,
          read.error,
        ),
      );
    }
    return artifactContent(read.value, path);
  }

  private async retry<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    let latest: Result<T> | null = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      latest = await operation();
      if (latest.ok) {
        return latest;
      }
      if (attempt + 1 < this.maxAttempts && this.retryable(latest.error)) {
        const delayMs = this.retryBackoffMs[Math.min(attempt, this.retryBackoffMs.length - 1)] ?? 0;
        await this.sleep(delayMs);
      } else if (!this.retryable(latest.error)) {
        return latest;
      }
    }
    return latest!;
  }

  private retryable(error: unknown): boolean {
    const code = isRecord(error) && typeof error["code"] === "string" ? error["code"] : "";
    return [
      "provisioning.openclawAdmin.connectionClosed",
      "provisioning.openclawAdmin.notConnected",
      "provisioning.openclawAdmin.gatewayUnavailable",
      "provisioning.openclawAdmin.requestTimeout",
      "provisioning.openclawAdmin.connectTimeout",
    ].includes(code);
  }
}
