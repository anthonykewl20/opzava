import type {
  IssueTrackerIssue,
  IssueTrackerPort,
  IssueTrackerRef,
  SecretReference,
  SecretsVaultPort,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

type Fetch = typeof fetch;

export const GITHUB_ISSUES_TOKEN_SECRET_LABEL = "github-issues-token";

interface GitHubUserShape {
  readonly login?: unknown;
}

interface GitHubLabelShape {
  readonly name?: unknown;
}

interface GitHubIssueShape {
  readonly html_url?: unknown;
  readonly number?: unknown;
  readonly state?: unknown;
  readonly title?: unknown;
  readonly labels?: unknown;
  readonly assignee?: unknown;
  readonly updated_at?: unknown;
  readonly pull_request?: unknown;
}

export interface GitHubIssueTrackerAdapterOptions {
  readonly repository: string;
  readonly token?: string;
  readonly tokenEnvName?: string;
  readonly apiBaseUrl?: string;
  readonly fetch?: Fetch;
  readonly vault?: SecretsVaultPort;
  readonly tokenRef?: SecretReference;
  readonly requestedBy?: string;
}

function adapterError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function splitRepository(repository: string): Result<{ readonly owner: string; readonly repo: string }> {
  const [owner, repo, ...rest] = repository.split("/");
  if (
    owner === undefined ||
    repo === undefined ||
    rest.length > 0 ||
    owner.trim() === "" ||
    repo.trim() === ""
  ) {
    return err(
      adapterError(
        "githubIssues.invalidRepository",
        "GitHub repository must be in owner/name form.",
      ),
    );
  }

  return ok({ owner, repo });
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function labelsValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) =>
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry !== null
          ? stringValue((entry as GitHubLabelShape).name)
          : null,
    )
    .filter((entry): entry is string => entry !== null);
}

function assigneeValue(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return stringValue((value as GitHubUserShape).login);
}

function mapGitHubIssue(repository: string, value: GitHubIssueShape): Result<IssueTrackerIssue> {
  if (typeof value.pull_request === "object" && value.pull_request !== null) {
    return err(adapterError("githubIssues.pullRequestSkipped", "Pull requests are not issues."));
  }

  const number = numberValue(value.number);
  const title = stringValue(value.title);
  const url = stringValue(value.html_url);
  const updatedAt = stringValue(value.updated_at);
  const state = value.state === "closed" ? "closed" : value.state === "open" ? "open" : null;

  if (number === null || title === null || url === null || updatedAt === null || state === null) {
    return err(
      adapterError("githubIssues.invalidResponse", "GitHub issue response is missing fields."),
    );
  }

  return ok({
    ref: {
      provider: "github",
      repository,
      number,
      url,
    },
    title,
    state,
    labels: labelsValue(value.labels),
    assignee: assigneeValue(value.assignee),
    updatedAt,
  });
}

function rateLimitMessage(response: Response): string {
  const retryAfter = response.headers.get("retry-after");
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (retryAfter !== null) {
    return `GitHub rate limit hit; retry after ${retryAfter}s.`;
  }

  if (remaining === "0" && reset !== null) {
    return `GitHub rate limit hit; reset at ${reset}.`;
  }

  return "GitHub API request was rate limited or forbidden.";
}

export class GitHubIssueTrackerAdapter implements IssueTrackerPort {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: Fetch;

  public constructor(private readonly options: GitHubIssueTrackerAdapterOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
    this.fetchImpl = options.fetch ?? fetch;
  }

  public async listIssues(input: {
    readonly repository: string;
    readonly state?: "open" | "closed" | "all";
    readonly labels?: readonly string[];
  }): Promise<Result<readonly IssueTrackerIssue[]>> {
    const repo = splitRepository(input.repository);
    if (!repo.ok) {
      return err(repo.error);
    }

    const params = new URLSearchParams({
      state: input.state ?? "all",
      per_page: "100",
      sort: "updated",
      direction: "desc",
    });
    if (input.labels !== undefined && input.labels.length > 0) {
      params.set("labels", input.labels.join(","));
    }

    const issues: IssueTrackerIssue[] = [];
    for (let page = 1; page <= 10; page += 1) {
      params.set("page", String(page));
      const result = await this.request(
        `/repos/${repo.value.owner}/${repo.value.repo}/issues?${params.toString()}`,
        { method: "GET" },
      );
      if (!result.ok) {
        return err(result.error);
      }

      if (!Array.isArray(result.value)) {
        return err(
          adapterError("githubIssues.invalidResponse", "GitHub issues response was not a list."),
        );
      }

      for (const entry of result.value) {
        const mapped = mapGitHubIssue(input.repository, entry as GitHubIssueShape);
        if (mapped.ok) {
          issues.push(mapped.value);
        } else if (mapped.error.code !== "githubIssues.pullRequestSkipped") {
          return err(mapped.error);
        }
      }

      if (result.value.length < 100) {
        break;
      }
    }

    return ok(issues);
  }

  public async getIssue(input: { readonly ref: IssueTrackerRef }): Promise<Result<IssueTrackerIssue>> {
    const repo = splitRepository(input.ref.repository);
    if (!repo.ok) {
      return err(repo.error);
    }

    const result = await this.request(
      `/repos/${repo.value.owner}/${repo.value.repo}/issues/${input.ref.number}`,
      { method: "GET" },
    );
    if (!result.ok) {
      return err(result.error);
    }

    return mapGitHubIssue(input.ref.repository, result.value as GitHubIssueShape);
  }

  public async createIssue(input: {
    readonly repository: string;
    readonly title: string;
    readonly body?: string;
    readonly labels?: readonly string[];
    readonly assignees?: readonly string[];
  }): Promise<Result<IssueTrackerIssue>> {
    const repo = splitRepository(input.repository);
    if (!repo.ok) {
      return err(repo.error);
    }

    const result = await this.request(`/repos/${repo.value.owner}/${repo.value.repo}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.labels === undefined ? {} : { labels: input.labels }),
        ...(input.assignees === undefined ? {} : { assignees: input.assignees }),
      }),
    });
    if (!result.ok) {
      return err(result.error);
    }

    return mapGitHubIssue(input.repository, result.value as GitHubIssueShape);
  }

  public async closeIssue(input: {
    readonly ref: IssueTrackerRef;
    readonly reason: "completed" | "not_planned";
  }): Promise<Result<IssueTrackerIssue>> {
    const repo = splitRepository(input.ref.repository);
    if (!repo.ok) {
      return err(repo.error);
    }

    const current = await this.getIssue({ ref: input.ref });
    if (current.ok && current.value.state === "closed") {
      return current;
    }

    const result = await this.request(
      `/repos/${repo.value.owner}/${repo.value.repo}/issues/${input.ref.number}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          state: "closed",
          state_reason: input.reason,
        }),
      },
    );
    if (!result.ok) {
      return err(result.error);
    }

    return mapGitHubIssue(input.ref.repository, result.value as GitHubIssueShape);
  }

  private async request(path: string, init: RequestInit): Promise<Result<unknown>> {
    const token = await this.resolveToken();
    if (!token.ok) {
      return err(token.error);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token.value}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      return err(
        adapterError("githubIssues.network", "GitHub API request failed before response.", error),
      );
    }

    if (response.status === 403 || response.status === 429) {
      return err(adapterError("githubIssues.rateLimited", rateLimitMessage(response)));
    }

    if (!response.ok) {
      return err(
        adapterError(
          response.status === 404 ? "githubIssues.notFound" : "githubIssues.requestFailed",
          `GitHub API request failed with HTTP ${response.status}.`,
        ),
      );
    }

    try {
      return ok(await response.json());
    } catch (error) {
      return err(
        adapterError("githubIssues.invalidResponse", "GitHub API returned invalid JSON.", error),
      );
    }
  }

  private async resolveToken(): Promise<Result<string>> {
    if (this.options.token !== undefined && this.options.token.trim() !== "") {
      return ok(this.options.token.trim());
    }

    const envName = this.options.tokenEnvName ?? "GITHUB_TOKEN";
    const envToken = process.env[envName];
    if (envToken !== undefined && envToken.trim() !== "") {
      return ok(envToken.trim());
    }

    if (this.options.vault !== undefined && this.options.tokenRef !== undefined) {
      return this.options.vault.resolveSecretValue({
        ref: this.options.tokenRef,
        requestedBy: this.options.requestedBy ?? "github-issues-adapter",
        reason: "github-issues-rest-api",
      });
    }

    return err(
      adapterError(
        "githubIssues.missingToken",
        "GITHUB_TOKEN or a GitHub token vault reference is required.",
      ),
    );
  }
}
