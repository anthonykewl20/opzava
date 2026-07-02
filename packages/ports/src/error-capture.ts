import type { OrgId, TenantId, UserId, WorkspaceId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type ErrorCaptureSeverity = "info" | "warning" | "error";

export interface CaptureErrorInput {
  readonly source: string;
  readonly operation: string;
  readonly severity: ErrorCaptureSeverity;
  readonly message: string;
  readonly code?: string;
  readonly tenantId?: TenantId;
  readonly orgId?: OrgId;
  readonly workspaceId?: WorkspaceId;
  readonly userId?: UserId;
  readonly correlationId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export interface ErrorCapturePort {
  capture(input: CaptureErrorInput): Promise<Result<void>>;
}
