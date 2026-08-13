import { createHash } from "node:crypto";

import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const devTicketLanes = [
  "backlog",
  "todo",
  "blocked",
  "in_progress",
  "review",
  "done",
] as const;
export type DevTicketLane = (typeof devTicketLanes)[number];

export const readyStates = ["draft", "approved"] as const;
export type ReadyState = (typeof readyStates)[number];

export const originKinds = ["proposal", "direct", "legacy"] as const;
export type OriginKind = (typeof originKinds)[number];

export interface ReadyContract {
  readonly version: number;
  readonly content: Readonly<Record<string, unknown>>;
  readonly contentHash: string;
}

export interface DevTicket {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly version: number;
  readonly originKind: OriginKind;
  readonly sourceProposalId: string | null;
  readonly lane: DevTicketLane;
  readonly archivedAt: Date | null;
  readonly humanOwnerUserId: string;
  readonly readyContract: ReadyContract;
  readonly readyState: ReadyState;
  readonly readyApprovalContractVersion: number | null;
  readonly readyApprovalContentHash: string | null;
  readonly readyApprovedByUserId: string | null;
  readonly readyApprovedAt: Date | null;
  readonly readyApprovalCommandId: string | null;
  readonly todoRank: number | null;
  readonly createdCommandId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function ticketError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

function enumParser<T extends string>(
  value: unknown,
  values: readonly T[],
  code: string,
  message: string,
): Result<T> {
  return typeof value === "string" && values.includes(value as T)
    ? ok(value as T)
    : err(ticketError(code, message));
}

export function parseDevTicketLane(value: unknown): Result<DevTicketLane> {
  return enumParser(
    value,
    devTicketLanes,
    "dev_board.invalid_dev_ticket_lane",
    "DevTicket lane is invalid.",
  );
}

export function parseReadyState(value: unknown): Result<ReadyState> {
  return enumParser(value, readyStates, "dev_board.invalid_ready_state", "Ready state is invalid.");
}

export function parseOriginKind(value: unknown): Result<OriginKind> {
  return enumParser(
    value,
    originKinds,
    "dev_board.invalid_origin_kind",
    "DevTicket origin kind is invalid.",
  );
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Ready contract content must be JSON serializable.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Ready contract content must be JSON serializable.");
}

/** Contract content excludes secret values and transient Runner, GitHub, and dependency completion fields per wf230:742-744. */
export function computeReadyContractContentHash(content: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function parseReadyContractContent(
  value: unknown,
): Result<Readonly<Record<string, unknown>>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return err(
      ticketError(
        "dev_board.invalid_ready_contract_content",
        "Ready contract content must be an object.",
      ),
    );
  }
  try {
    computeReadyContractContentHash(value as Record<string, unknown>);
    return ok(value as Readonly<Record<string, unknown>>);
  } catch {
    return err(
      ticketError(
        "dev_board.invalid_ready_contract_content",
        "Ready contract content must be JSON serializable.",
      ),
    );
  }
}
