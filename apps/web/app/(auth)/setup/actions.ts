"use server";

import { FirstOwnerSetupService } from "@opzava/identity-access";
import { redirect } from "next/navigation";
import { z } from "zod";

import { setSessionCookie } from "@/lib/auth-cookie";

export interface SetupActionState {
  readonly status: "idle" | "error";
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

const setupSchema = z.object({
  idempotencyKey: z.string().min(8),
  ownerName: z.string().trim().min(1, "Enter your name."),
  ownerEmail: z.string().trim().email("Enter a valid email address."),
  ownerPassword: z
    .string()
    .min(12, "Use at least 12 characters.")
    .regex(/[a-z]/, "Add a lowercase letter.")
    .regex(/[A-Z]/, "Add an uppercase letter.")
    .regex(/[0-9]/, "Add a number."),
  workspaceName: z.string().trim().min(1, "Name your workspace."),
  timezone: z.string().trim().min(1, "Choose a timezone.")
});

function stringFromForm(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function validationState(error: z.ZodError): SetupActionState {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && fieldErrors[path] === undefined) {
      fieldErrors[path] = issue.message;
    }
  }

  return {
    status: "error",
    message: "Check the highlighted fields and try again.",
    fieldErrors
  };
}

function setupFailureState(message: string): SetupActionState {
  return { status: "error", message };
}

export async function setupFirstOwnerAction(
  _previousState: SetupActionState,
  formData: FormData
): Promise<SetupActionState> {
  const parsed = setupSchema.safeParse({
    idempotencyKey: stringFromForm(formData, "idempotencyKey"),
    ownerName: stringFromForm(formData, "ownerName"),
    ownerEmail: stringFromForm(formData, "ownerEmail"),
    ownerPassword: stringFromForm(formData, "ownerPassword"),
    workspaceName: stringFromForm(formData, "workspaceName"),
    timezone: stringFromForm(formData, "timezone")
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const result = await new FirstOwnerSetupService().setup({
    ownerName: parsed.data.ownerName,
    ownerEmail: parsed.data.ownerEmail,
    ownerPassword: parsed.data.ownerPassword,
    organizationName: parsed.data.workspaceName,
    workspaceName: parsed.data.workspaceName,
    timezone: parsed.data.timezone,
    idempotencyKey: parsed.data.idempotencyKey
  });

  if (!result.ok) {
    return setupFailureState("We could not create the workspace. Check the details and try again.");
  }

  if (result.value.status === "already-set-up") {
    return setupFailureState("Opzava is already set up. Sign in with the owner account instead.");
  }

  if (result.value.status === "created-sign-in-required" || result.value.session === undefined) {
    redirect("/login");
  }

  await setSessionCookie(result.value.session);
  redirect("/");
}
