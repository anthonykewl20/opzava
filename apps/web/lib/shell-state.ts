import {
  listIssueProjections,
  listTasks,
  type IssueProjectionDto,
  type TaskDto,
} from "@opzava/project-management";

import { buildAdminNavModel, NAVIGABLE_ROUTES, type AdminPrincipal } from "@/lib/admin-registry";
import type { EvidenceEnvelope } from "@/lib/admin-evidence";
import {
  projectNeedsYourAttention,
  type NeedsYourAttentionSection,
} from "@/lib/admin-overview/overview-composition";
import {
  projectHealthReadiness,
  type HealthReadiness,
} from "@/lib/admin-overview/readiness-projections";
import { loadConnectionsPageDataForRequest, type loadConnectionsPageData } from "@/lib/connections";
import { readGitHubIssuesRepository } from "@/lib/issues";
import { formatCardId } from "@/lib/task-card-format";
import type { AppSessionContext } from "@/lib/session";

export type ShellHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ShellHealthState {
  readonly status: ShellHealthStatus;
  readonly text: string;
  readonly dotClassName: string;
  readonly ariaLabel: string;
  readonly checkedAt: string | null;
  readonly freshnessState: EvidenceEnvelope<unknown>["freshnessState"];
  readonly gatewayReachable: boolean | null;
}

export interface ShellAttentionState {
  readonly count: number | null;
  readonly hasItems: boolean | null;
  readonly state: "available" | "partial" | "unknown";
  readonly ariaLabel: string;
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
  readonly attention: ShellAttentionState;
  readonly commandItems: readonly CommandPaletteItem[];
}

export interface AdminShellStateDependencies {
  readonly listTasks: typeof listTasks;
  readonly listIssueProjections: typeof listIssueProjections;
  readonly loadConnectionsPageData: typeof loadConnectionsPageData;
  readonly now?: () => Date;
  readonly observationGeneration?: number;
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

type ShellHealthEvidence = Pick<
  EvidenceEnvelope<HealthReadiness>,
  "state" | "freshnessState" | "sourceTimestamp" | "value" | "provenance"
>;

function healthFreshnessLabel(envelope: ShellHealthEvidence | null): string {
  if (envelope === null || envelope.freshnessState === "unknown") return "freshness unknown";
  if (envelope.freshnessState === "stale") {
    return envelope.sourceTimestamp === null
      ? "evidence stale"
      : `evidence stale; last checked ${envelope.sourceTimestamp}`;
  }
  return envelope.sourceTimestamp === null
    ? "freshness within budget"
    : `checked ${envelope.sourceTimestamp}`;
}

function healthCapabilityLabel(
  envelope: ShellHealthEvidence | null,
  status: ShellHealthStatus,
): string | null {
  if (envelope?.value === null || envelope === null || status === "unknown") return null;
  const source = envelope.provenance.label;
  if (status === "healthy") return source;
  return `${source} is ${status}`;
}

export function shellHealthView(envelope: ShellHealthEvidence | null): ShellHealthState {
  const status = envelope?.state === "live" ? (envelope.value?.overall ?? "unknown") : "unknown";
  const presentation = {
    healthy: { text: "Healthy", dotClassName: "dot dot-success" },
    degraded: { text: "Degraded", dotClassName: "dot dot-warning" },
    unhealthy: { text: "Unhealthy", dotClassName: "dot dot-danger" },
    unknown: { text: "Unknown", dotClassName: "dot" },
  } as const;
  const view = presentation[status];
  const capability = healthCapabilityLabel(envelope, status);
  const freshness = healthFreshnessLabel(envelope);

  return {
    status,
    text: view.text,
    dotClassName: view.dotClassName,
    ariaLabel: `Health: ${view.text}${capability === null ? "" : `; ${capability}`}; ${freshness}`,
    checkedAt: envelope?.sourceTimestamp ?? null,
    freshnessState: envelope?.freshnessState ?? "unknown",
    gatewayReachable: envelope?.value?.gatewayActive ?? null,
  };
}

type AttentionProjection = Pick<NeedsYourAttentionSection, "rows"> & {
  readonly status: Pick<NeedsYourAttentionSection["status"], "state" | "partial">;
};

export function attentionInboxView(projection: AttentionProjection): ShellAttentionState {
  const count = projection.rows.length;
  if (projection.status.state === "live") {
    return {
      count,
      hasItems: count > 0,
      state: "available",
      ariaLabel: `Attention: ${count} actionable ${count === 1 ? "item" : "items"}`,
    };
  }
  if (count > 0) {
    return {
      count,
      hasItems: true,
      state: "partial",
      ariaLabel: `Attention: at least ${count} actionable ${count === 1 ? "item" : "items"}; feed partial`,
    };
  }
  return {
    count: null,
    hasItems: null,
    state: projection.status.partial ? "partial" : "unknown",
    ariaLabel: "Attention: actionable items unavailable",
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
  const destinations = [
    ...navModel.pinned,
    ...navModel.groups.flatMap((group) => group.destinations),
  ].filter((destination) => NAVIGABLE_ROUTES.has(destination.href));
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
  const pageData = connectionsResult?.ok === true ? connectionsResult.value : null;
  const now = dependencies.now?.() ?? new Date();
  const projectionContext = {
    evaluatedAt: now.toISOString(),
    observationGeneration: dependencies.observationGeneration ?? now.getTime(),
  };
  const healthReadiness =
    pageData === null ? null : projectHealthReadiness(pageData, projectionContext);
  const needsYourAttention = projectNeedsYourAttention(pageData, projectionContext);

  return {
    health: {
      ...shellHealthView(healthReadiness),
      gatewayReachable,
    },
    attention: attentionInboxView(needsYourAttention),
    commandItems: buildCommandPaletteItems({
      principal: context,
      tasks,
      issues,
      workspaceName: context.workspaceName,
    }),
  };
}
