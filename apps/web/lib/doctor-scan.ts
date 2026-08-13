import type { DoctorScanRunRecord } from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { z } from "zod";

export interface DoctorScanLatest {
  readonly availability: "available" | "unknown";
  readonly latest: DoctorScanRunRecord | null;
  readonly inProgress: boolean;
}

export interface DoctorScanScope {
  readonly organizationId: string;
  readonly scope: string;
}

const doctorScanScopeSchema = z.object({
  organizationId: z.string().uuid(),
  scope: z.string().trim().min(1),
});

export function readDoctorScanScope(
  source: Readonly<Record<string, string | undefined>> = process.env,
): Result<DoctorScanScope> {
  const organizationId = source["OPZAVA_PLATFORM_ORGANIZATION_ID"]?.trim();
  if (!organizationId) {
    return err(
      clientError(
        "web.doctorScanNotConfigured",
        "OPZAVA_PLATFORM_ORGANIZATION_ID is not configured.",
      ),
    );
  }
  const parsed = doctorScanScopeSchema.safeParse({
    organizationId,
    scope: source["DOCTOR_SCAN_SCOPE"]?.trim() || "platform-gateway",
  });
  return parsed.success
    ? ok(parsed.data)
    : err(clientError("web.doctorScanInvalidConfig", "Doctor scan scope is invalid."));
}

export interface DoctorScanClient {
  readLatest(input: DoctorScanScope): Promise<Result<DoctorScanLatest>>;
  ensureFresh(input: DoctorScanScope): Promise<Result<DoctorScanLatest>>;
  force(input: DoctorScanScope): Promise<Result<DoctorScanLatest>>;
}

interface WorkerConfig {
  readonly url: string;
  readonly token: string;
}

const requestTimeoutMs = 20_000;
const findingSchema = z.object({
  checkId: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  group: z.string(),
  summary: z.string(),
  detailState: z.enum(["available", "redacted_unavailable"]),
  locationLabel: z.string().nullable(),
  targetLabel: z.string().nullable(),
  fixHint: z.string().nullable(),
  suppressed: z.boolean(),
  suppressionReason: z.string().nullable(),
}).strict();
const latestSchema = z.object({
  availability: z.enum(["available", "unknown"]),
  latest: z.object({
    status: z.enum(["succeeded", "unavailable"]),
    runCheckedAt: z.string().nullable(),
    checksRun: z.number().int().nonnegative(),
    checksSkipped: z.number().int().nonnegative(),
    findings: z.array(findingSchema),
    failureCode: z.string().optional(),
  }).strict().nullable(),
  inProgress: z.boolean(),
}).strict();

function clientError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({ code, message, ...(cause === undefined ? {} : { cause }) });
}

function readConfig(source: Readonly<Record<string, string | undefined>>): Result<WorkerConfig> {
  const url = source["PROVISIONING_WORKER_URL"]?.trim() ?? source["PROVISIONING_INTERNAL_URL"]?.trim();
  const token = source["PROVISIONING_WORKER_TOKEN"]?.trim() ?? source["PROVISIONING_INTERNAL_TOKEN"]?.trim();
  if (!url || !token) {
    return err(clientError("web.doctorScanNotConfigured", "PROVISIONING_WORKER_URL and PROVISIONING_WORKER_TOKEN are not configured."));
  }
  try {
    return ok({ url: new URL(url).toString().replace(/\/$/, ""), token });
  } catch (cause) {
    return err(clientError("web.doctorScanInvalidConfig", "Provisioning worker URL is invalid.", cause));
  }
}

class UnavailableDoctorScanClient implements DoctorScanClient {
  public readLatest(): Promise<Result<DoctorScanLatest>> { return Promise.resolve(err(this.error())); }
  public ensureFresh(): Promise<Result<DoctorScanLatest>> { return Promise.resolve(err(this.error())); }
  public force(): Promise<Result<DoctorScanLatest>> { return Promise.resolve(err(this.error())); }
  private error(): DomainError {
    return clientError("web.doctorScanNotConfigured", "PROVISIONING_WORKER_URL and PROVISIONING_WORKER_TOKEN are not configured.");
  }
}

class InternalDoctorScanClient implements DoctorScanClient {
  public constructor(private readonly config: WorkerConfig) {}
  public readLatest(input: DoctorScanScope): Promise<Result<DoctorScanLatest>> { return this.request("/internal/doctor-scan", "GET", input); }
  public ensureFresh(input: DoctorScanScope): Promise<Result<DoctorScanLatest>> { return this.request("/internal/doctor-scan/ensure", "POST", input); }
  public force(input: DoctorScanScope): Promise<Result<DoctorScanLatest>> { return this.request("/internal/doctor-scan/force", "POST", input); }

  private async request(path: string, method: "GET" | "POST", input: DoctorScanScope): Promise<Result<DoctorScanLatest>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    const query = new URLSearchParams({ organizationId: input.organizationId, scope: input.scope });
    try {
      const response = await fetch(`${this.config.url}${path}?${query}`, {
        method,
        headers: { authorization: `Bearer ${this.config.token}` },
        signal: controller.signal,
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok) return err(clientError("web.doctorScanFailed", "Doctor scan worker request failed."));
      const parsed = latestSchema.safeParse(payload);
      if (!parsed.success) {
        return err(clientError("web.doctorScanInvalidResponse", "Doctor scan worker returned an invalid response."));
      }
      const latest = parsed.data.latest;
      return ok({
        availability: parsed.data.availability,
        latest:
          latest === null
            ? null
            : {
                status: latest.status,
                runCheckedAt: latest.runCheckedAt,
                checksRun: latest.checksRun,
                checksSkipped: latest.checksSkipped,
                findings: latest.findings,
                ...(latest.failureCode === undefined ? {} : { failureCode: latest.failureCode }),
              },
        inProgress: parsed.data.inProgress,
      });
    } catch (cause) {
      return err(clientError("web.doctorScanFailed", cause instanceof DOMException && cause.name === "AbortError" ? "Doctor scan worker request timed out." : "Doctor scan worker request failed.", cause));
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function defaultDoctorScanClient(source: Readonly<Record<string, string | undefined>> = process.env): DoctorScanClient {
  const config = readConfig(source);
  return config.ok ? new InternalDoctorScanClient(config.value) : new UnavailableDoctorScanClient();
}
