import { notFound, redirect } from "next/navigation";

import { TaskCardDetail } from "@/components/tasks/task-card-detail";
import {
  defaultTaskCardLoadDependencies,
  isTaskCardForbidden,
  isTaskCardNotFound,
  loadTaskCardPageData,
} from "@/lib/task-card-detail";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

interface TaskCardPageProps {
  readonly params: Promise<{
    readonly cardId: string;
  }>;
}

export default async function TaskCardPage({ params }: TaskCardPageProps) {
  const { cardId } = await params;
  const result = await loadTaskCardPageData(
    { cardId },
    {
      ...defaultTaskCardLoadDependencies,
      getSessionContext: getAppSessionContext,
    },
  );

  if (!result.ok) {
    if (isTaskCardNotFound(result.error)) {
      notFound();
    }

    if (isTaskCardForbidden(result.error)) {
      redirect("/");
    }

    throw result.error;
  }

  return (
    <TaskCardDetail
      card={result.value.card}
      assistantRuns={result.value.assistantRuns}
      currentUser={{
        id: result.value.context.user.id,
        name: result.value.context.user.name,
      }}
      workspaceName={result.value.context.workspaceName}
    />
  );
}
