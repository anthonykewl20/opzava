import { db, sql, withTenant } from "@opzava/adapters";
import {
  listIssueProjections,
  listTasks,
  type IssueProjectionDto,
  type TaskDto,
} from "@opzava/project-management";
import type { OpenClawGatewayRouteId } from "@opzava/ports";

import { askAdminAssistantKey, askAdminRouteId } from "@/lib/ask-admin-history";
import { readBrokerInternalEnv } from "@/lib/broker-internal-env";
import { hasConnectedProviderOrGitHub } from "@/lib/connections-state";
import { loadConnectionsPageData } from "@/lib/connections";
import { readGitHubIssuesRepository } from "@/lib/issues";
import { createBrokerOpenClawGatewayPort } from "@/lib/openclaw-gateway-broker";
import { formatCardId } from "@/lib/task-card-format";
import type { AppSessionContext } from "@/lib/session";

export type ShellHealthStatus = "healthy" | "degraded" | "unknown";

export interface ShellHealthState {
  readonly status: ShellHealthStatus;
  readonly text: string;
  readonly dotClassName: string;
  readonly ariaLabel: string;
  readonly databaseReachable: boolean | null;
  readonly gatewayReachable: boolean | null;
}

export interface AdminNavState {
  readonly openTasksCount: number | null;
  readonly openIssuesCount: number | null;
  readonly askOpzavaActive: boolean;
  readonly connectionsConnected: boolean;
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
  readonly checkDatabaseHealth: () => Promise<boolean>;
  readonly checkGatewayHealth: () => Promise<boolean | null>;
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
  readonly databaseReachable: boolean | null;
  readonly gatewayReachable: boolean | null;
}): ShellHealthState {
  const checks = [input.databaseReachable, input.gatewayReachable];
  const status: ShellHealthStatus = checks.every((check) => check === true)
    ? "healthy"
    : checks.some((check) => check === false)
      ? "degraded"
      : "unknown";

  if (status === "healthy") {
    return {
      status,
      text: "All systems healthy",
      dotClassName: "dot dot-success",
      ariaLabel: "System health: All systems healthy",
      databaseReachable: input.databaseReachable,
      gatewayReachable: input.gatewayReachable,
    };
  }

  if (status === "degraded") {
    return {
      status,
      text: "Systems degraded",
      dotClassName: "dot dot-warning",
      ariaLabel: "System health: Systems degraded",
      databaseReachable: input.databaseReachable,
      gatewayReachable: input.gatewayReachable,
    };
  }

  return {
    status,
    text: "Health unknown",
    dotClassName: "dot",
    ariaLabel: "System health: Health unknown",
    databaseReachable: input.databaseReachable,
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

async function defaultCheckDatabaseHealth(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

function timeoutFetch(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetchImpl(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };
}

export async function defaultCheckGatewayHealth(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 750,
): Promise<boolean | null> {
  let brokerEnv: ReturnType<typeof readBrokerInternalEnv>;
  try {
    brokerEnv = readBrokerInternalEnv();
  } catch {
    return null;
  }

  const gateway = createBrokerOpenClawGatewayPort({
    baseUrl: brokerEnv.BROKER_INTERNAL_URL,
    internalToken: brokerEnv.BROKER_INTERNAL_TOKEN,
    principalSessionId: "shell-health",
    fetchImpl: timeoutFetch(fetchImpl, timeoutMs),
  });
  const health = await gateway.getHealth(askAdminRouteId as OpenClawGatewayRouteId);

  if (!health.ok) {
    return false;
  }

  return health.value.reachable && !health.value.circuitOpen;
}

function defaultDependencies(): AdminShellStateDependencies {
  return {
    listTasks,
    listIssueProjections,
    loadConnectionsPageData,
    countActiveAskOpzavaTurns: defaultCountActiveAskOpzavaTurns,
    checkDatabaseHealth: defaultCheckDatabaseHealth,
    checkGatewayHealth: defaultCheckGatewayHealth,
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
  const [
    tasksResult,
    issuesResult,
    connectionsResult,
    activeTurnsResult,
    databaseReachable,
    gatewayReachable,
  ] = await Promise.all([
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
    dependencies.loadConnectionsPageData(context),
    dependencies.countActiveAskOpzavaTurns(context).catch(() => 0),
    dependencies.checkDatabaseHealth().catch(() => false),
    dependencies.checkGatewayHealth().catch(() => null),
  ]);

  const tasks = tasksResult.ok ? tasksResult.value : [];
  const issues = issuesResult?.ok === true ? issuesResult.value : [];

  return {
    nav: {
      openTasksCount: tasksResult.ok ? openTaskCount(tasks) : null,
      openIssuesCount: issuesResult?.ok === true ? openIssueCount(issues) : null,
      askOpzavaActive: activeTurnsResult > 0,
      connectionsConnected:
        connectionsResult.ok && hasConnectedProviderOrGitHub(connectionsResult.value.snapshot),
    },
    health: shellHealthView({
      databaseReachable,
      gatewayReachable,
    }),
    commandItems: buildCommandPaletteItems({
      tasks,
      issues,
      workspaceName: context.workspaceName,
    }),
  };
}
