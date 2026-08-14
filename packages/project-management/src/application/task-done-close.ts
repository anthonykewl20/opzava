import { mapDatabaseError, withTenant } from "@opzava/adapters";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

import {
  enqueueIssueCloseForTaskTx,
  IssueCloseIntentRollbackError,
  issueRefFromTask,
  type IssueCloseOutboxDto,
} from "./issues.js";
import {
  appendMarkTaskDoneRejectionAttempt,
  markTaskDoneInTransaction,
  prepareMarkTaskDone,
  TaskCommandRollbackError,
  type MarkTaskDoneInput,
  type TaskApplicationDependencies,
  type TaskDto,
} from "./tasks.js";

export type LinkedIssueCloseIntent =
  | {
      readonly kind: "no_linked_issue";
      readonly taskId: string;
      readonly cardNumber: number;
    }
  | {
      readonly kind: "deferred_to_slice_2_5e";
      readonly taskId: string;
      readonly cardNumber: number;
      readonly targetRef: string;
      readonly outbox: IssueCloseOutboxDto;
    };

export interface MarkTaskDoneAndEnqueueIssueCloseDependencies extends TaskApplicationDependencies {
  /** @internal Test-only fault seam; it runs inside the transaction immediately before outbox insertion. */
  readonly failIssueCloseEnqueue?: () => never;
}

type MarkTaskDoneAndEnqueueIssueCloseResult = {
  readonly task: TaskDto;
  readonly linkedIssueCloseIntent: LinkedIssueCloseIntent;
};

interface MarkTaskDoneAndEnqueueIssueCloseTransactionOutcome {
  readonly markTaskDoneOutcome: Awaited<ReturnType<typeof markTaskDoneInTransaction>>;
  readonly result: Result<MarkTaskDoneAndEnqueueIssueCloseResult>;
}

function taskDoneCloseError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

export async function markTaskDoneAndEnqueueIssueClose(
  input: MarkTaskDoneInput,
  dependencies: MarkTaskDoneAndEnqueueIssueCloseDependencies = {},
): Promise<Result<MarkTaskDoneAndEnqueueIssueCloseResult>> {
  /**
   * Time-boxed legacy compatibility exception (#335): only apps/web session paths may use this human
   * confirmation flow. Retire it at verified Dev Board cutover in favour of wf229's proof-bound
   * AdmitDone; it is never a template for new commands or agent surfaces. It joins the cutover
   * retirement list.
   */
  const prepared = await prepareMarkTaskDone(input, dependencies);
  if (!prepared.ok) return err(prepared.error);

  try {
    const outcome: MarkTaskDoneAndEnqueueIssueCloseTransactionOutcome = await withTenant(
      input.orgId,
      async (tx) => {
        const marked = await markTaskDoneInTransaction(tx, input);
        if (!marked.result.ok) {
          return { markTaskDoneOutcome: marked, result: err(marked.result.error) };
        }

        const outbox = await enqueueIssueCloseForTaskTx(
          tx,
          {
            orgId: input.orgId,
            workspaceId: input.workspaceId,
            actor: input.actor,
            task: marked.result.value,
          },
          {
            ...(dependencies.authorizationPort === undefined
              ? {}
              : { authorizationPort: dependencies.authorizationPort }),
            ...(dependencies.failIssueCloseEnqueue === undefined
              ? {}
              : { failIssueCloseEnqueue: dependencies.failIssueCloseEnqueue }),
          },
        );
        const issueRef = issueRefFromTask(marked.result.value);
        const linkedIssueCloseIntent: LinkedIssueCloseIntent =
          outbox === null || issueRef === null
            ? {
                kind: "no_linked_issue",
                taskId: marked.result.value.id,
                cardNumber: marked.result.value.cardNumber,
              }
            : {
                // Wire-shape contract fidelity: retained until a consumer migration exists.
                kind: "deferred_to_slice_2_5e",
                taskId: marked.result.value.id,
                cardNumber: marked.result.value.cardNumber,
                targetRef: marked.result.value.provenanceExternalRef ?? issueRef.url,
                outbox,
              };

        return {
          markTaskDoneOutcome: marked,
          result: ok({ task: marked.result.value, linkedIssueCloseIntent }),
        };
      },
    );
    await appendMarkTaskDoneRejectionAttempt(input, outcome.markTaskDoneOutcome, dependencies);
    return outcome.result;
  } catch (error) {
    if (error instanceof TaskCommandRollbackError) {
      return err(error.domainError);
    }
    if (error instanceof IssueCloseIntentRollbackError) {
      return err(error.domainError);
    }

    return err(
      taskDoneCloseError(
        "projectManagement.taskDoneFailed",
        "Task could not be marked Done.",
        mapDatabaseError(error),
      ),
    );
  }
}
