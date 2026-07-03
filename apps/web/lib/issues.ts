import { GitHubIssueTrackerAdapter } from "@opzava/adapters";
import type { IssueTrackerPort } from "@opzava/ports";
import {
  createTrackedIssue,
  listIssueProjections,
  syncIssueProjection,
  type IssueProjectionDto,
  type IssueTriageFilter,
} from "@opzava/project-management";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  filterIssues,
  issuePipelineStages,
  parseIssueFilter,
  type IssuePipelineStage,
} from "@/lib/issues-state";
import type { AppSessionContext } from "@/lib/session";

export interface IssuesPageData {
  readonly repository: string;
  readonly repositoryUrl: string;
  readonly filter: IssueTriageFilter;
  readonly issues: readonly IssueProjectionDto[];
  readonly filteredIssues: readonly IssueProjectionDto[];
  readonly pipeline: readonly IssuePipelineStage[];
  readonly lastSyncedAt: string | null;
}

export interface IssuesActionDependencies {
  readonly listIssueProjections: typeof listIssueProjections;
  readonly syncIssueProjection: typeof syncIssueProjection;
  readonly createTrackedIssue: typeof createTrackedIssue;
  readonly issueTrackerPort: IssueTrackerPort;
}

export interface IssuesLoadDependencies {
  readonly listIssueProjections: typeof listIssueProjections;
}

export const defaultIssuesLoadDependencies: IssuesLoadDependencies = {
  listIssueProjections,
};

export const defaultIssuesActionDependencies: Omit<IssuesActionDependencies, "issueTrackerPort"> = {
  listIssueProjections,
  syncIssueProjection,
  createTrackedIssue,
};

function webIssuesError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function actorFromContext(context: AppSessionContext) {
  return {
    userId: context.user.id,
    roleKeys: context.roleKeys,
  };
}

export function readGitHubIssuesRepository(source: NodeJS.ProcessEnv = process.env): string {
  const value = source["GITHUB_ISSUES_REPOSITORY"] ?? "anthonykewl20/opzava";
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new Error("Invalid GitHub issues repository: expected owner/name.");
  }

  return normalized;
}

export function defaultIssueTrackerPort(repository: string): GitHubIssueTrackerAdapter {
  return new GitHubIssueTrackerAdapter({
    repository,
    tokenEnvName: "GITHUB_TOKEN",
  });
}

export async function loadIssuesPageData(
  input: { readonly context: AppSessionContext; readonly filter?: string },
  dependencies: IssuesLoadDependencies = defaultIssuesLoadDependencies,
): Promise<Result<IssuesPageData>> {
  try {
    const repository = readGitHubIssuesRepository();
    const filter = parseIssueFilter(input.filter);
    const listed = await dependencies.listIssueProjections({
      orgId: input.context.orgId,
      workspaceId: input.context.workspaceId,
      actor: actorFromContext(input.context),
      repository,
      filter: "all",
    });
    if (!listed.ok) {
      return err(listed.error);
    }

    const issues = listed.value;
    const lastSyncedAt = issues.reduce<string | null>((latest, issue) => {
      if (latest === null) {
        return issue.syncedAt;
      }

      return new Date(issue.syncedAt).getTime() > new Date(latest).getTime()
        ? issue.syncedAt
        : latest;
    }, null);

    return ok({
      repository,
      repositoryUrl: `https://github.com/${repository}/issues`,
      filter,
      issues,
      filteredIssues: filterIssues(issues, filter),
      pipeline: issuePipelineStages(issues),
      lastSyncedAt,
    });
  } catch (error) {
    return err(
      webIssuesError("web.issuesLoadFailed", "GitHub issues could not be loaded.", error),
    );
  }
}

export async function syncIssuesForContext(
  context: AppSessionContext,
  dependencies: IssuesActionDependencies = {
    ...defaultIssuesActionDependencies,
    issueTrackerPort: defaultIssueTrackerPort(readGitHubIssuesRepository()),
  },
): Promise<Result<readonly IssueProjectionDto[]>> {
  const repository = readGitHubIssuesRepository();
  return dependencies.syncIssueProjection(
    {
      orgId: context.orgId,
      workspaceId: context.workspaceId,
      actor: actorFromContext(context),
      repository,
    },
    { issueTrackerPort: dependencies.issueTrackerPort },
  );
}

export async function createIssueForContext(
  input: {
    readonly context: AppSessionContext;
    readonly title: string;
    readonly body?: string;
    readonly labels?: readonly string[];
  },
  dependencies: IssuesActionDependencies = {
    ...defaultIssuesActionDependencies,
    issueTrackerPort: defaultIssueTrackerPort(readGitHubIssuesRepository()),
  },
): Promise<Result<IssueProjectionDto>> {
  const title = input.title.trim();
  if (title.length === 0) {
    return err(webIssuesError("web.issueTitleRequired", "Issue title is required."));
  }

  const repository = readGitHubIssuesRepository();
  return dependencies.createTrackedIssue(
    {
      orgId: input.context.orgId,
      workspaceId: input.context.workspaceId,
      actor: actorFromContext(input.context),
      repository,
      title,
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.labels === undefined ? {} : { labels: input.labels }),
    },
    { issueTrackerPort: dependencies.issueTrackerPort },
  );
}
