"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { forbidden, redirect } from "next/navigation";

import { createIssueForContext, syncIssuesForContext } from "@/lib/issues";
import { formFailureState, initialFormActionState, type FormActionState } from "@/lib/action-state";
import { getAppSessionContext } from "@/lib/session";

async function requireIssuesContext() {
  const context = await getAppSessionContext();
  if (context === null) {
    redirect("/login");
  }

  return context;
}

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
  if (issueErrorCode(error) === "projectManagement.forbidden" || issueErrorStatus(error) === 403) {
    forbidden();
  }

  throw error instanceof Error ? error : new Error("GitHub issue action failed.");
}

function issueErrorStatus(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number"
    ? status
    : issueErrorStatus((error as { readonly cause?: unknown }).cause, depth + 1);
}

function issueErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string"
    ? code
    : issueErrorCode((error as { readonly cause?: unknown }).cause, depth + 1);
}

function issueActionErrorState(error: unknown): FormActionState {
  if (issueErrorCode(error) === "projectManagement.forbidden" || issueErrorStatus(error) === 403) {
    forbidden();
  }

  return formFailureState(
    error instanceof Error ? error.message : "GitHub issue could not be created.",
  );
}

export async function syncIssuesAction(): Promise<void> {
  const context = await requireIssuesContext();
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
  const context = await requireIssuesContext();
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
