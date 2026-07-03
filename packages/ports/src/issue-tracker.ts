import type { Result } from "@opzava/shared-kernel";

export type IssueTrackerProvider = "github";
export type IssueTrackerIssueState = "open" | "closed";
export type IssueTrackerCloseReason = "completed" | "not_planned";

export interface IssueTrackerRef {
  readonly provider: IssueTrackerProvider;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
}

export interface IssueTrackerIssue {
  readonly ref: IssueTrackerRef;
  readonly title: string;
  readonly state: IssueTrackerIssueState;
  readonly labels: readonly string[];
  readonly assignee: string | null;
  readonly updatedAt: string;
}

export interface ListIssuesFilter {
  readonly repository: string;
  readonly state?: IssueTrackerIssueState | "all";
  readonly labels?: readonly string[];
}

export interface GetIssueInput {
  readonly ref: IssueTrackerRef;
}

export interface CreateIssueInput {
  readonly repository: string;
  readonly title: string;
  readonly body?: string;
  readonly labels?: readonly string[];
  readonly assignees?: readonly string[];
}

export interface CloseIssueInput {
  readonly ref: IssueTrackerRef;
  readonly reason: IssueTrackerCloseReason;
}

export interface IssueTrackerPort {
  listIssues(input: ListIssuesFilter): Promise<Result<readonly IssueTrackerIssue[]>>;
  getIssue(input: GetIssueInput): Promise<Result<IssueTrackerIssue>>;
  createIssue(input: CreateIssueInput): Promise<Result<IssueTrackerIssue>>;
  closeIssue(input: CloseIssueInput): Promise<Result<IssueTrackerIssue>>;
}
