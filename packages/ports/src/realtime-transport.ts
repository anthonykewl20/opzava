import type { OrgId, TenantId, UserId, WorkspaceId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type RealtimeTopic = string & { readonly __realtimeTopic: "RealtimeTopic" };
export type RealtimeEventId = string & { readonly __realtimeEventId: "RealtimeEventId" };

export interface RealtimePrincipal {
  readonly tenantId: TenantId;
  readonly orgId: OrgId;
  readonly workspaceId?: WorkspaceId;
  readonly userId: UserId;
  readonly roleKeys: readonly string[];
}

export interface RealtimeEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: RealtimeEventId;
  readonly tenantId: TenantId;
  readonly topic: RealtimeTopic;
  readonly type: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
}

export interface PublishRealtimeEventInput<
  TPayload extends Record<string, unknown> = Record<string, unknown>
> {
  readonly event: RealtimeEvent<TPayload>;
  readonly idempotencyKey?: string;
}

export interface AuthorizeRealtimeTopicInput {
  readonly principal: RealtimePrincipal;
  readonly topic: RealtimeTopic;
}

export interface RealtimeTopicDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface RealtimeTransportPort {
  publish<TPayload extends Record<string, unknown>>(
    input: PublishRealtimeEventInput<TPayload>
  ): Promise<Result<void>>;
  authorizeTopic(input: AuthorizeRealtimeTopicInput): Promise<Result<RealtimeTopicDecision>>;
}
