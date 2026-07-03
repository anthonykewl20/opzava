"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createIssueForContext, syncIssuesForContext } from "@/lib/issues";
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

function throwIssueActionError(error: unknown): never {
  throw error instanceof Error ? error : new Error("GitHub issue action failed.");
}

export async function syncIssuesAction(): Promise<void> {
  const context = await requireIssuesContext();
  const result = await syncIssuesForContext(context);
  if (!result.ok) {
    throwIssueActionError(result.error);
  }

  revalidatePath("/issues");
}

export async function createIssueAction(formData: FormData): Promise<void> {
  const context = await requireIssuesContext();
  const title = stringFromForm(formData, "title");
  const body = stringFromForm(formData, "body");
  const labels = labelsFromForm(stringFromForm(formData, "labels"));
  const result = await createIssueForContext({
    context,
    title,
    ...(body.trim() === "" ? {} : { body }),
    ...(labels.length === 0 ? {} : { labels }),
  });

  if (!result.ok) {
    throwIssueActionError(result.error);
  }

  revalidatePath("/issues");
}
