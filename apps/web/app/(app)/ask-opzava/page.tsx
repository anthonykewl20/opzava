import { redirect } from "next/navigation";

import { AskOpzavaChat } from "@/components/ask-opzava/ask-opzava-chat";
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

export default async function AskOpzavaPage() {
  const context = await getAppSessionContext();

  if (context === null) {
    redirect("/login");
  }

  const history = await getOrCreateAskAdminHistory(context);
  if (!history.ok) {
    if (
      errorCode(history.error) === "runtimeControl.forbidden" ||
      errorStatus(history.error) === 403
    ) {
      redirect("/");
    }

    throw history.error;
  }

  return (
    <AskOpzavaChat
      conversationId={history.value.conversationId}
      initialTurns={history.value.turns}
      currentUserName={context.user.name}
      organizationName={context.organizationName}
      workspaceName={context.workspaceName}
    />
  );
}
