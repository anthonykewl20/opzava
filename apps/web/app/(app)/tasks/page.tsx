import { listTasks } from "@opzava/project-management";
import { redirect } from "next/navigation";

import { TasksBoard } from "@/components/tasks/tasks-board";
import { getOrCreateAskAdminHistory } from "@/lib/ask-admin-history";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

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
      roleKeys: context.roleKeys
    }
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

  const askAdminHistory = await getOrCreateAskAdminHistory(context);
  if (!askAdminHistory.ok) {
    if (
      errorCode(askAdminHistory.error) === "runtimeControl.forbidden" ||
      errorStatus(askAdminHistory.error) === 403
    ) {
      redirect("/");
    }

    throw askAdminHistory.error;
  }

  return (
    <TasksBoard
      tasks={result.value}
      currentUser={{ id: context.user.id, name: context.user.name }}
      workspaceName={context.workspaceName}
      askAdmin={{
        conversationId: askAdminHistory.value.conversationId,
        initialTurns: askAdminHistory.value.turns
      }}
    />
  );
}
