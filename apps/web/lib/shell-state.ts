import { sql, withTenant } from "@opzava/adapters";
import {
  listIssueProjections,
  listTasks,
  type IssueProjectionDto,
  type TaskDto,
} from "@opzava/project-management";

import { askAdminAssistantKey } from "@/lib/ask-admin-history";
import {
  hasConnectedProviderOrGitHub,
  openclawHealthSummary,
  type OpenClawHealthSummary,
} from "@/lib/connections-state";
import { loadConnectionsPageDataForRequest, type loadConnectionsPageData } from "@/lib/connections";
import { readGitHubIssuesRepository } from "@/lib/issues";
import { formatCardId } from "@/lib/task-card-format";
import type { AppSessionContext } from "@/lib/session";

export type ShellHealthStatus = "healthy" | "attention" | "unknown";

export interface ShellHealthState {
  readonly status: ShellHealthStatus;
  readonly text: string;
  readonly dotClassName: string;
  readonly ariaLabel: string;
  readonly attentionCount: number;
  readonly checkedAt: string | null;
  readonly gatewayReachable: boolean | null;
}

export interface AdminNavState {
  readonly openTasksCount: number | null;
  readonly openIssuesCount: number | null;
  readonly askOpzavaActive: boolean;
  readonly connectionsConnected: boolean;
  readonly connections: {
    readonly gatewayActive: boolean;
    readonly providersConnected: number;
    readonly providersTotal: number;
    readonly githubConnected: boolean;
  };
}

export type CommandPaletteItemKind = "destination" | "task" | "issue";

export interface CommandPaletteItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly kind: CommandPaletteItemKind;
  readonly meta: string;
  readonly external?: boolean;
}

export interface AdminShellState {
  readonly nav: AdminNavState;
  readonly health: ShellHealthState;
  readonly commandItems: readonly CommandPaletteItem[];
}

export interface AdminShellStateDependencies {
  readonly listTasks: typeof listTasks;
  readonly listIssueProjections: typeof listIssueProjections;
  readonly loadConnectionsPageData: typeof loadConnectionsPageData;
  readonly countActiveAskOpzavaTurns: (context: AppSessionContext) => Promise<number>;
}

type QueryRow = Record<string, unknown>;

const destinationItems: readonly CommandPaletteItem[] = [
  {
    id: "nav.ask-opzava",
    label: "Ask Opzava",
    href: "/ask-opzava",
    kind: "destination",
    meta: "Assistant",
  },
  { id: "nav.overview", label: "Overview", href: "/", kind: "destination", meta: "Workspace" },
  { id: "nav.tasks", label: "Tasks", href: "/tasks", kind: "destination", meta: "Operate" },
  { id: "nav.issues", label: "Issues", href: "/issues", kind: "destination", meta: "Operate" },
  {
    id: "nav.contacts",
    label: "Contacts",
    href: "/crm/contacts",
    kind: "destination",
    meta: "CRM",
  },
  {
    id: "nav.accounts",
    label: "Accounts",
    href: "/crm/accounts",
    kind: "destination",
    meta: "CRM",
  },
  { id: "nav.deals", label: "Deals", href: "/crm/deals", kind: "destination", meta: "CRM" },
  { id: "nav.tickets", label: "Tickets", href: "/crm/tickets", kind: "destination", meta: "CRM" },
  {
    id: "nav.connections",
    label: "Connections",
    href: "/connections",
    kind: "destination",
    meta: "Automate",
  },
] as const;

function rowsFromExecuteResult(result: unknown): readonly QueryRow[] {
  if (Array.isArray(result)) {
    return result as readonly QueryRow[];
  }

  if (typeof result !== "object" || result === null || !("rows" in result)) {
    return [];
  }

  const rows = (result as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as readonly QueryRow[]) : [];
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function actorFromContext(context: AppSessionContext) {
  return {
    userId: context.user.id,
    roleKeys: context.roleKeys,
  };
}

function safeGitHubIssuesRepository(): string | null {
  try {
    return readGitHubIssuesRepository();
  } catch {
    return null;
  }
}

export function openTaskCount(tasks: readonly TaskDto[]): number {
  return tasks.filter((task) => task.status !== "done").length;
}

export function openIssueCount(issues: readonly IssueProjectionDto[]): number {
  return issues.filter((issue) => issue.state === "open").length;
}

export function shellHealthView(input: {
  readonly summary: OpenClawHealthSummary;
  readonly checkedAt: string | null;
  readonly gatewayReachable: boolean | null;
}): ShellHealthState {
  const status = input.summary.status;

  if (status === "healthy") {
    return {
      status,
      text: "All systems healthy",
      dotClassName: "dot dot-success",
      ariaLabel: "System health: All systems healthy",
      attentionCount: input.summary.attention,
      checkedAt: input.checkedAt,
      gatewayReachable: input.gatewayReachable,
    };
  }

  if (status === "attention") {
    const count = input.summary.attention;
    const text = `${count} ${count === 1 ? "needs" : "need"} attention`;
    return {
      status,
      text,
      dotClassName: "dot dot-warning",
      ariaLabel: `System health: ${text}`,
      attentionCount: count,
      checkedAt: input.checkedAt,
      gatewayReachable: input.gatewayReachable,
    };
  }

  return {
    status,
    text: "Health unknown",
    dotClassName: "dot",
    ariaLabel: "System health: Health unknown",
    attentionCount: input.summary.attention,
    checkedAt: input.checkedAt,
    gatewayReachable: input.gatewayReachable,
  };
}

async function defaultCountActiveAskOpzavaTurns(context: AppSessionContext): Promise<number> {
  const result = await withTenant(context.orgId, async (tx) =>
    tx.execute(sql`
      select count(*) as active_count
      from public.assistant_turns
      where organization_id = ${context.orgId}
        and workspace_id = ${context.workspaceId}
        and assistant_key = ${askAdminAssistantKey}
        and status in ('queued', 'streaming', 'finalizing')
    `),
  );

  return numberValue(rowsFromExecuteResult(result)[0]?.["active_count"]);
}

function defaultDependencies(): AdminShellStateDependencies {
  return {
    listTasks,
    listIssueProjections,
    loadConnectionsPageData: loadConnectionsPageDataForRequest,
    countActiveAskOpzavaTurns: defaultCountActiveAskOpzavaTurns,
  };
}

function gatewayReachableFromConnectionsPageData(
  result: Awaited<ReturnType<typeof loadConnectionsPageData>> | null,
): boolean {
  return result !== null && result.ok && result.value.snapshot.gateway.status === "active";
}

function connectionsNavStateFromPageData(
  result: Awaited<ReturnType<typeof loadConnectionsPageData>> | null,
): AdminNavState["connections"] {
  if (result?.ok !== true) {
    return {
      gatewayActive: false,
      providersConnected: 0,
      providersTotal: 0,
      githubConnected: false,
    };
  }

  return {
    gatewayActive: result.value.snapshot.gateway.status === "active",
    providersConnected: result.value.providerSummary.connected,
    providersTotal: result.value.providerSummary.total,
    githubConnected: result.value.snapshot.github.status === "connected",
  };
}

function taskCommandItems(
  tasks: readonly TaskDto[],
  workspaceName: string,
): readonly CommandPaletteItem[] {
  return tasks.map((task) => {
    const cardId = formatCardId(workspaceName, task.cardNumber);
    return {
      id: `task.${task.id}`,
      label: task.title,
      href: `/tasks/${cardId.routeSegment}`,
      kind: "task",
      meta: `Task ${cardId.cardId}`,
    };
  });
}

function issueCommandItems(issues: readonly IssueProjectionDto[]): readonly CommandPaletteItem[] {
  return issues.map((issue) => ({
    id: `issue.${issue.repository}.${issue.number}`,
    label: issue.title,
    href: issue.url,
    kind: "issue",
    meta: `Issue #${issue.number}`,
    external: true,
  }));
}

export function buildCommandPaletteItems(input: {
  readonly tasks: readonly TaskDto[];
  readonly issues: readonly IssueProjectionDto[];
  readonly workspaceName: string;
}): readonly CommandPaletteItem[] {
  return [
    ...destinationItems,
    ...taskCommandItems(input.tasks, input.workspaceName),
    ...issueCommandItems(input.issues),
  ];
}

export async function loadAdminShellState(
  context: AppSessionContext,
  dependencies: AdminShellStateDependencies = defaultDependencies(),
): Promise<AdminShellState> {
  const actor = actorFromContext(context);
  const repository = safeGitHubIssuesRepository();
  const [tasksResult, issuesResult, connectionsResult, activeTurnsResult] = await Promise.all([
    dependencies.listTasks({
      orgId: context.orgId,
      workspaceId: context.workspaceId,
      actor,
    }),
    repository === null
      ? Promise.resolve(null)
      : dependencies.listIssueProjections({
          orgId: context.orgId,
          workspaceId: context.workspaceId,
          actor,
          repository,
          filter: "all",
        }),
    dependencies.loadConnectionsPageData(context).catch(() => null),
    dependencies.countActiveAskOpzavaTurns(context).catch(() => 0),
  ]);

  const tasks = tasksResult.ok ? tasksResult.value : [];
  const issues = issuesResult?.ok === true ? issuesResult.value : [];
  const gatewayReachable = gatewayReachableFromConnectionsPageData(connectionsResult);
  const connections = connectionsNavStateFromPageData(connectionsResult);
  const openclawHealth =
    connectionsResult?.ok === true ? connectionsResult.value.snapshot.openclawHealth : null;
  const healthSummary =
    openclawHealth === null
      ? {
          total: 0,
          healthy: 0,
          attention: 0,
          notChecked: 0,
          percent: null,
          status: "unknown" as const,
        }
      : openclawHealthSummary(openclawHealth);

  return {
    nav: {
      openTasksCount: tasksResult.ok ? openTaskCount(tasks) : null,
      openIssuesCount: issuesResult?.ok === true ? openIssueCount(issues) : null,
      askOpzavaActive: activeTurnsResult > 0,
      connectionsConnected:
        connectionsResult?.ok === true &&
        hasConnectedProviderOrGitHub(connectionsResult.value.snapshot),
      connections,
    },
    health: shellHealthView({
      summary: healthSummary,
      checkedAt: openclawHealth?.checkedAt ?? null,
      gatewayReachable,
    }),
    commandItems: buildCommandPaletteItems({
      tasks,
      issues,
      workspaceName: context.workspaceName,
    }),
  };
}
