import { redirect } from "next/navigation";

import { AskOpzavaChat } from "@/components/ask-opzava/ask-opzava-chat";
import { errorCode, errorStatusCode } from "@/lib/authed-action";
import { getOrCreateAskAdminHistory } from "@/lib/ask-admin-history";
import { getAppSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AskOpzavaPage() {
  const context = await getAppSessionContext();

  if (context === null) {
    redirect("/login");
  }

  const history = await getOrCreateAskAdminHistory(context);
  if (!history.ok) {
    if (
      errorCode(history.error) === "runtimeControl.forbidden" ||
      errorStatusCode(history.error) === 403
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
