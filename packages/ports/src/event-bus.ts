import type { TenantId } from "@opzava/shared-kernel";
import type { OpaqueExternalRef, Result } from "@opzava/shared-kernel";

export type EventId = string & { readonly __eventId: "EventId" };
export type OutboxRecordId = string & { readonly __outboxRecordId: "OutboxRecordId" };

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: EventId;
  readonly tenantId: TenantId;
  readonly type: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
  readonly causationId?: string;
  readonly correlationId?: string;
}

export interface OutboxRecord<
  TPayload extends Record<string, unknown> = Record<string, unknown>
> {
  readonly id: OutboxRecordId;
  readonly event: DomainEvent<TPayload>;
  readonly createdAt: Date;
  readonly availableAt: Date;
  readonly attempts: number;
  readonly publishedAt?: Date;
  readonly externalRef?: OpaqueExternalRef;
}

export interface PublishOptions {
  readonly idempotencyKey?: string;
  readonly availableAt?: Date;
}

export type EventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent
) => Promise<void>;

export interface EventSubscription {
  readonly unsubscribe: () => Promise<void>;
}

export interface SubscribeInput<TEvent extends DomainEvent = DomainEvent> {
  readonly eventTypes: readonly string[];
  readonly handler: EventHandler<TEvent>;
}

export interface EventBusPort {
  publish<TPayload extends Record<string, unknown>>(
    event: DomainEvent<TPayload>,
    options?: PublishOptions
  ): Promise<Result<OutboxRecord<TPayload>>>;
  recordOutbox<TPayload extends Record<string, unknown>>(
    record: OutboxRecord<TPayload>
  ): Promise<Result<OutboxRecord<TPayload>>>;
  subscribe<TEvent extends DomainEvent = DomainEvent>(
    input: SubscribeInput<TEvent>
  ): Promise<Result<EventSubscription>>;
}
