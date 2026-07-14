"use client";

import { useCallback, useId, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import type { OrchestratorDelegationState } from "@opzava/ports";

import {
  DialogNotice,
  MutationErrorNotice,
} from "@/components/connections/connection-dialog-notices";
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

export function SetMainOrchestratorConfirm({
  provider,
  open: controlledOpen,
  onOpenChange,
  onSetMainSuccess,
  trigger,
}: {
  readonly provider: ProviderConnectionView;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSetMainSuccess: (providerId: string) => void;
  readonly trigger?: ReactNode | null;
}) {
  const router = useRouter();
  const formId = useId();
  const [, startRefreshTransition] = useTransition();
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
    flushSync(() => {
      setPending(false);
      onSetMainSuccess(provider.id);
      if (controlledOpen === undefined) {
        setUncontrolledOpen(false);
      }
      onOpenChange?.(false);
    });
    startRefreshTransition(() => {
      router.refresh();
    });
  }, [controlledOpen, onOpenChange, onSetMainSuccess, provider.id, router, startRefreshTransition]);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {trigger === null ? null : (
        <AlertDialogTrigger asChild>
          {trigger ?? (
            <Button type="button" variant="secondary" size="sm">
              Set as main orchestrator
            </Button>
          )}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <SetMainOrchestratorForm
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

export type SetMainOrchestratorPhase =
  | { readonly step: "idle" }
  | { readonly step: "pending" }
  | { readonly step: "verifying" }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

export function SetMainOrchestratorForm({
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
  const [phase, setPhase] = useState<SetMainOrchestratorPhase>({ step: "idle" });
  const isPending = phase.step === "pending" || phase.step === "verifying";

  const runSetMain = useCallback(async () => {
    const setMainOnce = () =>
      postConnectionsMutation<OrchestratorDelegationState>(
        "/api/connections/orchestrator/set-main",
        {
          providerId: provider.connectionProviderId,
        },
      );

    setPhase({ step: "pending" });
    onPendingChange(true);
    let result = await setMainOnce();
    if (!result.ok && (result.kind === "timeout" || result.kind === "network")) {
      setPhase({ step: "verifying" });
      result = await setMainOnce();
    }
    onPendingChange(false);
    if (result.ok) {
      setPhase({ step: "idle" });
      onSuccess();
      return;
    }
    setPhase({ step: "failed", message: result.message, code: result.code });
  }, [onPendingChange, onSuccess, provider.connectionProviderId]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isPending) {
        return;
      }
      void runSetMain();
    },
    [isPending, runSetMain],
  );

  return (
    <form id={formId} onSubmit={handleSubmit} className="grid gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Make {provider.label} the main orchestrator?</AlertDialogTitle>
        <AlertDialogDescription>
          This changes the gateway&apos;s primary model leader to {provider.label}. Exactly one
          connected provider leads at a time; the previous lead becomes a subagent.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <DialogNotice tone="neutral" title="Single main orchestrator">
        Other connected providers stay available as subagents after this change.
      </DialogNotice>
      {phase.step === "verifying" ? (
        <DialogNotice tone="neutral" role="status" title="Verifying orchestrator">
          The first attempt did not answer in time; confirming the main orchestrator with the
          gateway.
        </DialogNotice>
      ) : null}
      {phase.step === "failed" ? (
        <MutationErrorNotice failure={phase} title="Set orchestrator failed" />
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
        <Button type="submit" form={formId} disabled={isPending} aria-busy={isPending}>
          {isPending
            ? "Setting..."
            : phase.step === "failed"
              ? "Retry set main"
              : `Set ${provider.label} as main`}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
