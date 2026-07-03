import { listTasks } from "@opzava/project-management";
import { redirect } from "next/navigation";

import { TasksBoard } from "@/components/tasks/tasks-board";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

function todayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function errorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : errorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

function errorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : errorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

export default async function TasksPage() {
  const context = await getAppSessionContext();

  if (context === null) {
    redirect("/login");
  }

  const result = await listTasks({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: {
      userId: context.user.id,
      roleKeys: context.roleKeys,
    },
  });

  if (!result.ok) {
    if (
      errorCode(result.error) === "projectManagement.forbidden" ||
      errorStatus(result.error) === 403
    ) {
      redirect("/");
    }

    throw result.error;
  }

  const renderedAt = new Date();
  const workspaces = context.workspaces ?? [
    { id: context.workspaceId, name: context.workspaceName },
  ];

  return (
    <TasksBoard
      tasks={result.value}
      currentUser={{ id: context.user.id, name: context.user.name }}
      workspaceId={context.workspaceId}
      workspaceName={context.workspaceName}
      workspaces={workspaces}
      renderedAtIso={renderedAt.toISOString()}
      todayLabel={todayLabel(renderedAt)}
    />
  );
}
