export interface FormActionState {
  readonly status: "idle" | "error";
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export const initialFormActionState: FormActionState = { status: "idle" };

export function formFailureState(message: string): FormActionState {
  return { status: "error", message };
}

export function formValidationState(
  issues: readonly { readonly path: readonly unknown[]; readonly message: string }[],
): FormActionState {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const path = issue.path[0];
    if (typeof path === "string" && fieldErrors[path] === undefined) {
      fieldErrors[path] = issue.message;
    }
  }

  return {
    status: "error",
    message: "Check the highlighted fields and try again.",
    fieldErrors,
  };
}
