import type { ReactNode } from "react";

import { actionMessage } from "@/lib/provider-presentation";
import { cn } from "@/lib/utils";

export const ALERT_TONE = {
  success: "border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[var(--success-soft)]",
  warning: "border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[var(--warning-soft)]",
  destructive: "border-destructive/30 bg-destructive/10",
  neutral: "border-border bg-muted",
} as const;

export function DialogNotice({
  tone,
  title,
  children,
  role = "status",
}: {
  readonly tone: keyof typeof ALERT_TONE;
  readonly title: string;
  readonly children: ReactNode;
  readonly role?: "status" | "alert";
}) {
  return (
    <div role={role} className={cn("rounded-lg border p-3 text-sm", ALERT_TONE[tone])}>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}

/** Actionable failure notice for a mutation; role denials get the admin-device guidance tone. */
export function MutationErrorNotice({
  failure,
  title = "Connection failed",
}: {
  readonly failure: { readonly message: string; readonly code: string | null };
  readonly title?: string;
}) {
  const adminRequired = failure.code === "provisioning.openclawAdmin.operatorAdminRequired";
  return (
    <DialogNotice
      tone={adminRequired ? "warning" : "destructive"}
      role="alert"
      title={adminRequired ? "Admin device required" : title}
    >
      {actionMessage(failure.message)}
    </DialogNotice>
  );
}

// Destructive-action guard: disconnect logs the gateway out of a provider, so it must be confirmed
// (UX error-prevention) — an accidental click on the row button should never sever a live connection.
