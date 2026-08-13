export interface CommandExpectedVersion {
  readonly recordKind: string;
  readonly recordId: string;
  readonly version: number;
}

export interface CommandActorRef {
  readonly kind: string;
  readonly stableId: string;
  readonly role: string;
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
