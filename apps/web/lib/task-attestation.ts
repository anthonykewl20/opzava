import { issueDoneConfirmation, type HumanCommandAttestation } from "@opzava/project-management";
import type { Result } from "@opzava/shared-kernel";

import type { AppSessionContext } from "@/lib/session";
import { actorFromSessionContext } from "@/lib/task-card-detail";

export async function issueDoneConfirmNonce(
  context: AppSessionContext,
  taskId: string,
): Promise<Result<string>> {
  return issueDoneConfirmation({
    orgId: context.orgId,
    workspaceId: context.workspaceId,
    actor: actorFromSessionContext(context),
    taskId,
  });
}

export function attestHumanCommand(
  context: AppSessionContext,
  nonce: string,
): HumanCommandAttestation {
  return {
    confirmedByUserId: context.user.id,
    confirmSource: "admin-web",
    confirmNonce: nonce,
  };
}
