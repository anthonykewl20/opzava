"use client";

import { useCallback, useId, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ModelProviderDisconnectStart } from "@opzava/ports";

import { DisconnectPoller } from "@/components/connections/disconnect-poller";
import { MutationErrorNotice } from "@/components/connections/connection-dialog-notices";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { postConnectionsMutation } from "@/lib/connections-mutation-client";
import type { ProviderConnectionView } from "@/lib/connections-state";

export function DisconnectConfirm({
  provider,
  open: controlledOpen,
  onOpenChange,
  trigger,
  size = "sm",
  triggerVariant = "ghost",
}: {
  readonly provider: ProviderConnectionView;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly trigger?: ReactNode | null;
  readonly size?: "sm" | "default";
  readonly triggerVariant?: "ghost" | "destructive";
}) {
  const router = useRouter();
  const formId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const open = controlledOpen ?? uncontrolledOpen;
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (pending) {
        return;
      }

      if (nextOpen) {
        setFormVersion((current) => current + 1);
      }
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange, pending],
  );
  const handleSuccess = useCallback(() => {
    setPending(false);
    if (controlledOpen === undefined) {
      setUncontrolledOpen(false);
    }
    onOpenChange?.(false);
    router.refresh();
  }, [controlledOpen, onOpenChange, router]);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {trigger === null ? null : (
        <AlertDialogTrigger asChild>
          {trigger ?? (
            <Button type="button" variant={triggerVariant} size={size}>
              Disconnect
            </Button>
          )}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <DisconnectConfirmForm
          key={`${provider.connectionProviderId}-${formVersion}`}
          formId={formId}
          provider={provider}
          onPendingChange={setPending}
          onSuccess={handleSuccess}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

// The disconnect itself runs in the worker and outlives the request that starts it, so the dialog
// only ever holds an opId and samples it. There is no synchronous disconnect to fall back to: it
// paces one gateway logout per agent and would time out for any tenant with 3+ agents (#168).
export type DisconnectPhase =
  | { readonly step: "idle" }
  | { readonly step: "starting" }
  | { readonly step: "polling"; readonly opId: string }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

export function DisconnectConfirmForm({
  formId,
  provider,
  onPendingChange,
  onSuccess,
}: {
  readonly formId: string;
  readonly provider: ProviderConnectionView;
  readonly onPendingChange: (pending: boolean) => void;
  readonly onSuccess: () => void;
}) {
  const [phase, setPhase] = useState<DisconnectPhase>({ step: "idle" });
  const isPending = phase.step === "starting" || phase.step === "polling";

  const runDisconnect = useCallback(async () => {
    setPhase({ step: "starting" });
    onPendingChange(true);

    const started = await postConnectionsMutation<ModelProviderDisconnectStart>(
      "/api/connections/model/disconnect",
      { providerId: provider.connectionProviderId },
    );
    if (!started.ok) {
      onPendingChange(false);
      setPhase({ step: "failed", message: started.message, code: started.code });
      return;
    }

    setPhase({ step: "polling", opId: started.data.opId });
  }, [onPendingChange, provider.connectionProviderId]);

  const handleDisconnected = useCallback(() => {
    onPendingChange(false);
    setPhase({ step: "idle" });
    onSuccess();
  }, [onPendingChange, onSuccess]);

  const handleFailed = useCallback(
    (message: string, code: string | null) => {
      onPendingChange(false);
      setPhase({ step: "failed", message, code });
    },
    [onPendingChange],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isPending) {
        return;
      }
      void runDisconnect();
    },
    [isPending, runDisconnect],
  );

  return (
    <form id={formId} onSubmit={handleSubmit} className="grid gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Disconnect {provider.label}?</AlertDialogTitle>
        <AlertDialogDescription>
          {"This logs the gateway out of "}
          {provider.label}
          {
            " and stops routing its models. Reconnecting requires re-authenticating this provider. This can't be undone from here."
          }
        </AlertDialogDescription>
      </AlertDialogHeader>
      {phase.step === "polling" ? (
        <DisconnectPoller
          opId={phase.opId}
          providerLabel={provider.label}
          onDisconnected={handleDisconnected}
          onFailed={handleFailed}
        />
      ) : null}
      {phase.step === "failed" ? (
        <MutationErrorNotice failure={phase} title="Disconnect failed" />
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <Button
          type="submit"
          form={formId}
          variant="destructive"
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending
            ? "Disconnecting..."
            : phase.step === "failed"
              ? `Retry disconnect`
              : `Disconnect ${provider.label}`}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
