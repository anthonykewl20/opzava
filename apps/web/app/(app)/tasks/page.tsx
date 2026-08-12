import { listTasks } from "@opzava/project-management";
import { redirect } from "next/navigation";

import { TasksBoard } from "@/components/tasks/tasks-board";
import { errorCode, errorStatusCode } from "@/lib/authed-action";
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
      errorStatusCode(result.error) === 403
    ) {
      redirect("/");
    }

    throw result.error;
  }

  const renderedAt = new Date();
  // DESCOPE(project-filter): multi-workspace data seam arrives with workspace switching.
  const workspaces = [{ id: context.workspaceId, name: context.workspaceName }];

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
