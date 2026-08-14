export interface CommandExpectedVersion {
  readonly recordKind: string;
  readonly recordId: string;
  readonly version: number;
}

import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const commandActorKinds = ["user", "agent", "system"] as const;
export const commandActorRoles = ["admin", "human_owner", "lead_orchestrator", "agent", "system_worker"] as const;
export interface CommandActorRef {
  readonly kind: (typeof commandActorKinds)[number];
  readonly stableId: string;
  readonly role: (typeof commandActorRoles)[number];
}

export interface CommandSourceRef {
  readonly kind: string;
  readonly ref: string;
}

export interface CommandEnvelope {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly commandName: string;
  readonly targetAggregateId: string;
  readonly actorRef: CommandActorRef;
  readonly sourceRef: CommandSourceRef;
  readonly authorizationVersion: number;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly expectedVersions: readonly CommandExpectedVersion[];
}

export function parseCommandActorRef(value: unknown): Result<CommandActorRef> {
  if (typeof value !== "object" || value === null) return err(new DomainError({ code: "dev_board.invalid_actor_ref", message: "Command actor reference is invalid." }));
  const actor = value as Record<string, unknown>;
  if (typeof actor["stableId"] !== "string" || actor["stableId"].length === 0 ||
    typeof actor["kind"] !== "string" || !commandActorKinds.includes(actor["kind"] as never) ||
    typeof actor["role"] !== "string" || !commandActorRoles.includes(actor["role"] as never))
    return err(new DomainError({ code: "dev_board.invalid_actor_ref", message: "Command actor reference is invalid." }));
  return ok({ kind: actor["kind"] as CommandActorRef["kind"], stableId: actor["stableId"], role: actor["role"] as CommandActorRef["role"] });
}
