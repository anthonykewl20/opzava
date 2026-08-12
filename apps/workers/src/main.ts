import { type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { PostgresDoctorScanRepository, PostgresScheduledJobRepository, type ScheduledJobRepository } from "@opzava/adapters";

import { OpenClawDoctorScanOrchestrator, type OpenClawDoctorScanPort } from "./health-doctor-scan/orchestrator.js";
import { createConnectionsInternalHttpServer } from "./provisioning/connections-http-server.js";
import {
  createDefaultConnectionsProvisioningPort,
  type ConnectionsProvisioningRuntimePort,
} from "./provisioning/gateway-admin-connections.js";
import { DockerOpenClawGatewayRuntime } from "./provisioning/docker-gateway-runtime.js";
import { readDockerHost, readGatewayContainerName } from "./provisioning/gateway-config-mutation.js";
import { DurableScheduler } from "./scheduler/durable-scheduler.js";
import { createScheduledJobHandlerRegistry, DOCTOR_SCAN_JOB_KEY, DOCTOR_SCAN_SCOPE } from "./scheduler/handler-registry.js";

export interface ProvisioningWorkerRuntimeConfig {
  readonly port: number;
  readonly internalToken: string;
  readonly platformOrganizationId: string;
}

function nonEmptyEnv(source: NodeJS.ProcessEnv, primary: string, fallback?: string): string | null {
  const primaryValue = source[primary]?.trim();
  if (primaryValue !== undefined && primaryValue !== "") {
    return primaryValue;
  }

  const fallbackValue = fallback === undefined ? undefined : source[fallback]?.trim();
  return fallbackValue === undefined || fallbackValue === "" ? null : fallbackValue;
}

export function resolveProvisioningWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
): ProvisioningWorkerRuntimeConfig {
  const internalToken = nonEmptyEnv(
    source,
    "PROVISIONING_WORKER_TOKEN",
    "PROVISIONING_INTERNAL_TOKEN",
  );
  if (internalToken === null) {
    throw new Error("PROVISIONING_WORKER_TOKEN is required.");
  }

  const rawPort = source["PROVISIONING_WORKER_PORT"]?.trim() ?? source["PORT"]?.trim() ?? "19188";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PROVISIONING_WORKER_PORT/PORT must be a TCP port number.");
  }

  const platformOrganizationId = nonEmptyEnv(source, "OPZAVA_PLATFORM_ORGANIZATION_ID");
  if (platformOrganizationId === null || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(platformOrganizationId)) {
    throw new Error("OPZAVA_PLATFORM_ORGANIZATION_ID is required and must be a UUID.");
  }

  return { port, internalToken, platformOrganizationId };
}

export interface ProvisioningWorkerRuntime {
  readonly server: Server;
  readonly scheduler: SchedulerLifecycle;
  stop(): Promise<void>;
}

interface SchedulerLifecycle {
  start(): void;
  stop(): Promise<void>;
}

export function startProvisioningWorker(
  config: ProvisioningWorkerRuntimeConfig = resolveProvisioningWorkerRuntimeConfig(),
  dependencies: {
    readonly provisioningPort?: ConnectionsProvisioningRuntimePort;
    readonly createServer?: typeof createConnectionsInternalHttpServer;
    readonly scheduler?: SchedulerLifecycle;
    readonly scheduledJobs?: ScheduledJobRepository;
    readonly doctorScanPort?: OpenClawDoctorScanPort;
  } = {},
): Promise<ProvisioningWorkerRuntime> {
  const provisioningPort =
    dependencies.provisioningPort ?? createDefaultConnectionsProvisioningPort();

  return (async () => {
    try {
      const reconciled = await provisioningPort.reconcileStartup();
      if (!reconciled.ok) {
        throw reconciled.error;
      }

      const scheduledJobs = dependencies.scheduledJobs ?? new PostgresScheduledJobRepository();
      await scheduledJobs.register({ jobKey: DOCTOR_SCAN_JOB_KEY, organizationId: config.platformOrganizationId, scope: DOCTOR_SCAN_SCOPE, cadenceSeconds: 300, now: new Date() });
      const doctorScanPort = dependencies.doctorScanPort ?? createDefaultDoctorScanPort();
      const scheduler = dependencies.scheduler ?? createDefaultScheduler(config, scheduledJobs, doctorScanPort);

      const server = (dependencies.createServer ?? createConnectionsInternalHttpServer)({
        internalToken: config.internalToken,
        provisioningPort,
        doctorScanPort,
        platformOrganizationId: config.platformOrganizationId,
        doctorScanScope: DOCTOR_SCAN_SCOPE,
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, "0.0.0.0", () => {
          server.off("error", reject);
          console.log(`provisioning-worker listening on ${config.port}`);
          resolve();
        });
      });
      scheduler.start();
      let stopping: Promise<void> | null = null;
      return {
        server, scheduler,
        stop() {
          stopping ??= (async () => {
            await scheduler.stop();
            await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
            provisioningPort.close();
          })();
          return stopping;
        },
      };
    } catch (error) {
      provisioningPort.close();
      throw error;
    }
  })();
}

function createDefaultDoctorScanPort(): OpenClawDoctorScanPort {
  const dockerHost = readDockerHost(process.env);
  if (dockerHost === null) throw new Error("DOCKER_HOST is required for the doctor scan scheduler.");
  const containerName = readGatewayContainerName(process.env);
  const runtime = new DockerOpenClawGatewayRuntime({ dockerHost, ...(containerName === null ? {} : { containerName }) });
  return new OpenClawDoctorScanOrchestrator(new PostgresDoctorScanRepository(), runtime, {
    authorizeForce: () => true,
  });
}

function createDefaultScheduler(config: ProvisioningWorkerRuntimeConfig, repository: ScheduledJobRepository, doctor: OpenClawDoctorScanPort): DurableScheduler {
  return new DurableScheduler(repository, createScheduledJobHandlerRegistry(doctor), { organizationId: config.platformOrganizationId });
}

function runningAsEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

if (runningAsEntrypoint()) {
  void startProvisioningWorker()
    .then((runtime) => {
      const shutdown = (signal: NodeJS.Signals) => {
        void runtime.stop().then(() => process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1)).catch(() => process.exit(1));
      };

      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
