export interface TaskCreatedEvent {
  readonly type: "project-management.task.created";
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
}

export interface TaskUpdatedEvent {
  readonly type: "project-management.task.updated";
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
}

export interface TaskMovedEvent {
  readonly type: "project-management.task.moved";
  readonly taskId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly status: string;
  readonly position: number;
}

export type TaskDomainEvent = TaskCreatedEvent | TaskUpdatedEvent | TaskMovedEvent;
