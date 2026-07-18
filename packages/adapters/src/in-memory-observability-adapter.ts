import type {
  AppendAuditInput,
  AppendAuditReceipt,
  CaptureErrorInput,
  ErrorCapturePort,
} from "@opzava/ports";
import { ok, type Result } from "@opzava/shared-kernel";

export interface RecordedAuditEvent {
  readonly eventId: string;
  readonly organizationId: string;
  readonly intent: string;
  readonly transition: string;
  readonly targetKind: string;
  readonly targetRef: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly result: string;
  readonly workspaceId?: string;
  readonly triggeredByActorId?: string;
  readonly triggeredByAction?: string;
  readonly correlationId?: string;
  readonly configVersionId?: string;
  readonly authorizationDecision?: string;
  readonly policyDecision?: string;
  readonly entitlementDecision?: string;
  readonly resultCode?: string;
  readonly resultMessage?: string;
}

export interface RecordedConfigVersion {
  readonly id: string;
  readonly organizationId: string;
  readonly targetKind: string;
  readonly targetRef: string;
  readonly content: Readonly<Record<string, unknown>>;
  readonly versionHash?: string;
}

/**
 * In-memory observability seam for tests. Mirrors the Postgres adapter's contract — compliance
 * audit events and immutable config versions are recorded in the same atomic append, and the
 * generated ids link them — so tests can assert on domain intent, transition, actor/triggered_by
 * split, and config_version_id linkage without a database.
 */
export class InMemoryObservabilityAdapter implements ErrorCapturePort {
  public readonly auditEvents: RecordedAuditEvent[] = [];
  public readonly configVersions: RecordedConfigVersion[] = [];
  public readonly diagnostics: CaptureErrorInput[] = [];
  private sequence = 0;

  public async capture(input: CaptureErrorInput): Promise<Result<void>> {
    this.diagnostics.push(input);
    return ok(undefined);
  }

  public async appendAudit(input: AppendAuditInput): Promise<Result<AppendAuditReceipt>> {
    let configVersionId: string | undefined;

    if (input.configSnapshot !== undefined) {
      configVersionId = `cfg_${++this.sequence}`;
      const snapshot = input.configSnapshot;
      this.configVersions.push({
        id: configVersionId,
        organizationId: input.organizationId,
        targetKind: snapshot.targetKind,
        targetRef: snapshot.targetRef,
        content: snapshot.content,
        ...(snapshot.versionHash === undefined ? {} : { versionHash: snapshot.versionHash }),
      });
    }

    const eventId = `evt_${++this.sequence}`;
    const event: RecordedAuditEvent = {
      eventId,
      organizationId: input.organizationId,
      intent: input.intent,
      transition: input.transition,
      targetKind: input.targetKind,
      targetRef: input.targetRef,
      actorId: input.actorId,
      actorType: input.actorType,
      result: input.result,
      ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
      ...(input.trigger === undefined
        ? {}
        : {
            triggeredByActorId: input.trigger.triggeredByActorId,
            triggeredByAction: input.trigger.triggeredByAction,
          }),
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      ...(configVersionId === undefined ? {} : { configVersionId }),
      ...(input.authorizationDecision === undefined
        ? {}
        : { authorizationDecision: input.authorizationDecision }),
      ...(input.policyDecision === undefined ? {} : { policyDecision: input.policyDecision }),
      ...(input.entitlementDecision === undefined
        ? {}
        : { entitlementDecision: input.entitlementDecision }),
      ...(input.resultCode === undefined ? {} : { resultCode: input.resultCode }),
      ...(input.resultMessage === undefined ? {} : { resultMessage: input.resultMessage }),
    };
    this.auditEvents.push(event);

    return ok({
      eventId,
      ...(configVersionId === undefined ? {} : { configVersionId }),
    } satisfies AppendAuditReceipt);
  }
}
