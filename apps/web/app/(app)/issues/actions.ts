"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { createIssueForContext, syncIssuesForContext } from "@/lib/issues";
import { formFailureState, initialFormActionState, type FormActionState } from "@/lib/action-state";
import { forbiddenFromError, requireContext } from "@/lib/authed-action";

function stringFromForm(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function labelsFromForm(value: string): readonly string[] {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label !== "");
}

function idempotencyKeyFromForm(
  formData: FormData,
  title: string,
  body: string,
  labels: readonly string[],
): string {
  const explicit = stringFromForm(formData, "idempotencyKey").trim();
  if (explicit !== "") {
    return explicit;
  }

  return createHash("sha256")
    .update(JSON.stringify({ title: title.trim(), body: body.trim(), labels }))
    .digest("hex");
}

function throwIssueActionError(error: unknown): never {
  forbiddenFromError(error);

  throw error instanceof Error ? error : new Error("GitHub issue action failed.");
}

function issueActionErrorState(error: unknown): FormActionState {
  forbiddenFromError(error);

  return formFailureState(
    error instanceof Error ? error.message : "GitHub issue could not be created.",
  );
}

export async function syncIssuesAction(): Promise<void> {
  const context = await requireContext();
  const result = await syncIssuesForContext(context);
  if (!result.ok) {
    throwIssueActionError(result.error);
  }

  revalidatePath("/issues");
}

export async function createIssueAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const context = await requireContext();
  const title = stringFromForm(formData, "title");
  const body = stringFromForm(formData, "body");
  const labels = labelsFromForm(stringFromForm(formData, "labels"));
  const idempotencyKey = idempotencyKeyFromForm(formData, title, body, labels);
  const result = await createIssueForContext({
    context,
    title,
    ...(body.trim() === "" ? {} : { body }),
    ...(labels.length === 0 ? {} : { labels }),
    idempotencyKey,
  });

  if (!result.ok) {
    return issueActionErrorState(result.error);
  }

  revalidatePath("/issues");
  return initialFormActionState;
}
