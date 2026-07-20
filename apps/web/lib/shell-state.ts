import {
  listIssueProjections,
  listTasks,
  type IssueProjectionDto,
  type TaskDto,
} from "@opzava/project-management";

import {
  buildAdminNavModel,
  NAVIGABLE_ROUTES,
  type AdminPrincipal,
} from "@/lib/admin-registry";
import { openclawHealthSummary, type OpenClawHealthSummary } from "@/lib/connections-state";
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
  readonly health: ShellHealthState;
  readonly commandItems: readonly CommandPaletteItem[];
}

export interface AdminShellStateDependencies {
  readonly listTasks: typeof listTasks;
  readonly listIssueProjections: typeof listIssueProjections;
  readonly loadConnectionsPageData: typeof loadConnectionsPageData;
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

function defaultDependencies(): AdminShellStateDependencies {
  return {
    listTasks,
    listIssueProjections,
    loadConnectionsPageData: loadConnectionsPageDataForRequest,
  };
}

function gatewayReachableFromConnectionsPageData(
  result: Awaited<ReturnType<typeof loadConnectionsPageData>> | null,
): boolean {
  return result !== null && result.ok && result.value.snapshot.gateway.status === "active";
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
  readonly principal: AdminPrincipal;
  readonly tasks: readonly TaskDto[];
  readonly issues: readonly IssueProjectionDto[];
  readonly workspaceName: string;
}): readonly CommandPaletteItem[] {
  const navModel = buildAdminNavModel(input.principal);
  const destinations = [...navModel.pinned, ...navModel.groups.flatMap((group) => group.destinations)]
    .filter((destination) => NAVIGABLE_ROUTES.has(destination.href));
  if (destinations.length === 0) {
    return [];
  }

  return [
    ...destinations.map((destination) => ({
      id: `nav.${destination.id}`,
      label: destination.label,
      href: destination.href,
      kind: "destination" as const,
      meta: destination.group === "pinned" ? "Assistant" : "Develop",
    })),
    {
      id: "nav.connections",
      label: "Connections",
      href: "/connections",
      kind: "destination" as const,
      meta: "Automate",
    },
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
  const [tasksResult, issuesResult, connectionsResult] = await Promise.all([
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
  ]);

  const tasks = tasksResult.ok ? tasksResult.value : [];
  const issues = issuesResult?.ok === true ? issuesResult.value : [];
  const gatewayReachable = gatewayReachableFromConnectionsPageData(connectionsResult);
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
    health: shellHealthView({
      summary: healthSummary,
      checkedAt: openclawHealth?.checkedAt ?? null,
      gatewayReachable,
    }),
    commandItems: buildCommandPaletteItems({
      principal: context,
      tasks,
      issues,
      workspaceName: context.workspaceName,
    }),
  };
}
