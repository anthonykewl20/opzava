import { createHash, timingSafeEqual } from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

import type { ConnectionsProvisioningPort, ConnectionProvisioningPrincipal } from "@opzava/ports";

import { createDefaultConnectionsProvisioningPort } from "./gateway-admin-connections.js";
import type {
  DoctorScanLatest,
  OpenClawDoctorScanPort,
} from "../health-doctor-scan/orchestrator.js";

export interface ConnectionsInternalHttpServerOptions {
  readonly provisioningPort?: ConnectionsProvisioningPort;
  readonly internalToken: string;
  readonly maxBodyBytes?: number;
  readonly doctorScanPort?: OpenClawDoctorScanPort;
  readonly platformOrganizationId?: string;
  readonly doctorScanScope?: string;
}

const defaultMaxBodyBytes = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function stringArrayValue(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value.map((entry) => stringValue(entry));
  return values.every((entry): entry is string => entry !== null) ? values : null;
}

function sameToken(expected: string, candidate: string): boolean {
  const expectedHash = createHash("sha256").update(expected).digest();
  const candidateHash = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expectedHash, candidateHash);
}

function bearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || token === undefined || token.trim() === "") {
    return null;
  }

  return token;
}

function authenticated(request: IncomingMessage, internalToken: string): boolean {
  const token = bearerToken(request);
  return token !== null && sameToken(internalToken, token);
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBodyBytes) {
      throw new Error("request-body-too-large");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parsePrincipal(value: unknown): ConnectionProvisioningPrincipal | null {
  if (!isRecord(value)) {
    return null;
  }

  const orgId = stringValue(value["orgId"]);
  const workspaceId = stringValue(value["workspaceId"]);
  const actorUserId = stringValue(value["actorUserId"]);
  const roleKeys = stringArrayValue(value["roleKeys"]);
  if (orgId === null || workspaceId === null || actorUserId === null || roleKeys === null) {
    return null;
  }

  return { orgId, workspaceId, actorUserId, roleKeys };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function closedDoctorScanLatest(value: DoctorScanLatest): DoctorScanLatest {
  const latest = value.latest;
  return {
    availability: value.availability,
    latest:
      latest === null
        ? null
        : {
            status: latest.status,
            checksRun: latest.checksRun,
            checksSkipped: latest.checksSkipped,
            findings: latest.findings.map((finding) => ({
              checkId: finding.checkId,
              severity: finding.severity,
              group: finding.group,
              summary: finding.summary,
              detailState: finding.detailState,
              locationLabel: finding.locationLabel,
              targetLabel: finding.targetLabel,
              fixHint: finding.fixHint,
              suppressed: finding.suppressed,
              suppressionReason: finding.suppressionReason,
            })),
            ...(latest.failureCode === undefined ? {} : { failureCode: latest.failureCode }),
          },
    inProgress: value.inProgress,
  };
}

async function handleDoctorScanRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ConnectionsInternalHttpServerOptions,
): Promise<void> {
  if (!authenticated(request, options.internalToken)) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }

  if (
    options.doctorScanPort === undefined ||
    options.platformOrganizationId === undefined ||
    options.doctorScanScope === undefined
  ) {
    writeJson(response, 503, { error: "doctor_scan_not_configured" });
    return;
  }

  const url = new URL(request.url ?? "", "http://internal");
  const organizationId = url.searchParams.get("organizationId")?.trim();
  const scope = url.searchParams.get("scope")?.trim();
  // The internal token authenticates the BFF, while these equality checks bind its query to the
  // worker-owned platform tenant and scope. A caller cannot select an arbitrary RLS tenant.
  if (
    organizationId !== options.platformOrganizationId ||
    scope !== options.doctorScanScope ||
    [...url.searchParams.keys()].length !== 2 ||
    [...url.searchParams.keys()].some((key) => key !== "organizationId" && key !== "scope")
  ) {
    writeJson(response, 400, { error: "invalid_doctor_scan_scope" });
    return;
  }

  const input = { organizationId, scope };
  let result: DoctorScanLatest;
  if (request.method === "GET" && url.pathname === "/internal/doctor-scan") {
    result = await options.doctorScanPort.readLatest(input);
  } else if (request.method === "POST" && url.pathname === "/internal/doctor-scan/ensure") {
    result = await options.doctorScanPort.ensureFresh(input);
  } else if (request.method === "POST" && url.pathname === "/internal/doctor-scan/force") {
    // The shared internal token is the force trust boundary. The web BFF must enforce admin auth
    // before calling this endpoint; the orchestrator is wired to authorize this trusted path.
    result = await options.doctorScanPort.force(input);
  } else {
    writeJson(response, 404, { error: "not_found" });
    return;
  }
  writeJson(response, 200, closedDoctorScanLatest(result));
}

function mutationErrorStatus(code: string): number {
  return code === "provisioning.connections.providerConnectInFlight" ||
    code === "provisioning.connections.orchestratorElectionInFlight" ||
    code === "provisioning.connections.orchestratorProviderNotConnected" ||
    code === "provisioning.connections.orchestratorModelUnknown" ||
    code === "provisioning.connections.orchestratorModelUnavailable"
    ? 409
    : 502;
}

function errorPayload(error: unknown): {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
} {
  if (typeof error !== "object" || error === null) {
    return {
      code: "provisioning.connectionsFailed",
      message: "Connection provisioning failed.",
    };
  }

  const code = (error as { readonly code?: unknown }).code;
  const message = (error as { readonly message?: unknown }).message;
  const details = (error as { readonly details?: unknown }).details;
  return {
    code: typeof code === "string" ? code : "provisioning.connectionsFailed",
    message:
      typeof message === "string" && message.trim() !== ""
        ? message
        : "Connection provisioning failed.",
    ...(typeof details === "object" && details !== null && !Array.isArray(details)
      ? { details: details as Readonly<Record<string, unknown>> }
      : {}),
  };
}

async function handleConnectionsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ConnectionsInternalHttpServerOptions & {
    readonly provisioningPort: ConnectionsProvisioningPort;
    readonly maxBodyBytes: number;
  },
): Promise<void> {
  if (!authenticated(request, options.internalToken)) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, options.maxBodyBytes ?? defaultMaxBodyBytes);
  } catch {
    writeJson(response, 400, { error: "invalid_request" });
    return;
  }

  const principal = parsePrincipal(body);
  if (principal === null) {
    writeJson(response, 400, { error: "invalid_principal" });
    return;
  }

  const route = request.url;
  if (route === "/internal/connections/snapshot") {
    const result = await options.provisioningPort.getConnectionsSnapshot(principal);
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/refresh") {
    const result = await options.provisioningPort.refreshConnectionsSnapshot(principal);
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/api-key") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const providerId = stringValue(body["providerId"]);
    const authChoiceId = stringValue(body["authChoiceId"]);
    const apiKey = stringValue(body["apiKey"]);
    if (providerId === null || authChoiceId === null || apiKey === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.startModelProviderApiKeyConnect({
      ...principal,
      providerId,
      authChoiceId,
      apiKey,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/api-key/poll") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const opId = stringValue(body["opId"]);
    if (opId === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.pollModelProviderApiKeyConnect({
      ...principal,
      opId,
    });
    writeJson(
      response,
      result.ok ? 200 : 404,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/setup-token") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const providerId = stringValue(body["providerId"]);
    if (providerId === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.startModelProviderSetupTokenFlow({
      ...principal,
      providerId,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/setup-token/poll") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const flowId = stringValue(body["flowId"]);
    if (flowId === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.pollModelProviderSetupTokenFlow({
      ...principal,
      flowId,
    });
    writeJson(
      response,
      result.ok ? 200 : 404,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/setup-token/code") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const flowId = stringValue(body["flowId"]);
    const code = typeof body["code"] === "string" ? body["code"] : null;
    if (flowId === null || code === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.submitModelProviderSetupTokenCode({
      ...principal,
      flowId,
      code,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/device-flow") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const providerId = stringValue(body["providerId"]);
    const authChoiceId = stringValue(body["authChoiceId"]);
    if (providerId === null || authChoiceId === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.startModelProviderDeviceFlow({
      ...principal,
      providerId,
      authChoiceId,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/device-flow/cancel") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const flowId = stringValue(body["flowId"]);
    if (
      flowId === null ||
      !/^model:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(flowId)
    ) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.cancelModelProviderDeviceFlow({
      ...principal,
      flowId,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/device-flow/poll") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const flowId = stringValue(body["flowId"]);
    if (flowId === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.pollDeviceFlow({ ...principal, flowId });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  // Disconnect is start-then-poll, not a single call: it paces one gateway logout per agent and
  // routinely runs past any HTTP client's timeout (#168). There is deliberately no synchronous
  // disconnect route — one would time out for every tenant with 3+ agents.
  if (route === "/internal/connections/model/disconnect") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const providerId = stringValue(body["providerId"]);
    if (providerId === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.startModelProviderDisconnect({
      ...principal,
      providerId,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/disconnect/poll") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const opId = stringValue(body["opId"]);
    if (opId === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.pollModelProviderDisconnect({
      ...principal,
      opId,
    });
    writeJson(
      response,
      result.ok ? 200 : 404,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/model/models") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const providerId = stringValue(body["providerId"]);
    const modelId = stringValue(body["modelId"]);
    const enabled = body["enabled"];
    if (providerId === null || modelId === null || typeof enabled !== "boolean") {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.setModelProviderModelEnabled({
      ...principal,
      providerId,
      modelId,
      enabled,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/orchestrator/apply") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const connectedProviderIds = stringArrayValue(body["connectedProviderIds"]);
    if (connectedProviderIds === null) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const result = await options.provisioningPort.applyOrchestratorDelegation({
      ...principal,
      connectedProviderIds,
    });
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/orchestrator/set-main") {
    if (!isRecord(body)) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    const providerId = stringValue(body["providerId"]);
    const requestId = stringValue(body["requestId"]);
    if (
      providerId === null ||
      requestId === null ||
      body["requestId"] !== requestId ||
      requestId.length > 128
    ) {
      writeJson(response, 400, { error: "invalid_request" });
      return;
    }

    // Optional: absent means "keep deriving the model" — the service owns that derivation.
    const model = stringValue(body["model"]);
    const result = await options.provisioningPort.setMainOrchestrator({
      ...principal,
      requestId,
      providerId,
      ...(model === null ? {} : { model }),
    });
    writeJson(
      response,
      result.ok ? 202 : mutationErrorStatus(result.error.code),
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/github/device-flow") {
    const result = await options.provisioningPort.startGitHubDeviceFlow(principal);
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  if (route === "/internal/connections/github/disconnect") {
    const result = await options.provisioningPort.disconnectGitHub(principal);
    writeJson(
      response,
      result.ok ? 200 : 502,
      result.ok ? result.value : errorPayload(result.error),
    );
    return;
  }

  writeJson(response, 404, { error: "not_found" });
}

export function createConnectionsInternalHttpServer(
  options: ConnectionsInternalHttpServerOptions,
): http.Server {
  const resolvedOptions = {
    provisioningPort: options.provisioningPort ?? createDefaultConnectionsProvisioningPort(),
    internalToken: options.internalToken,
    maxBodyBytes: options.maxBodyBytes ?? defaultMaxBodyBytes,
    ...(options.doctorScanPort === undefined ? {} : { doctorScanPort: options.doctorScanPort }),
    ...(options.platformOrganizationId === undefined
      ? {}
      : { platformOrganizationId: options.platformOrganizationId }),
    ...(options.doctorScanScope === undefined ? {} : { doctorScanScope: options.doctorScanScope }),
  };

  return http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      writeJson(response, 200, { status: "ok" });
      return;
    }

    if (new URL(request.url ?? "", "http://internal").pathname.startsWith("/internal/doctor-scan")) {
      void handleDoctorScanRequest(request, response, resolvedOptions).catch(() => {
        writeJson(response, 500, { error: "doctor_scan_failed" });
      });
      return;
    }

    if (request.method !== "POST") {
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    void handleConnectionsRequest(request, response, resolvedOptions).catch((error) => {
      writeJson(response, 500, errorPayload(error));
    });
  });
}
