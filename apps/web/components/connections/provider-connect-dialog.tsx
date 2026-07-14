"use client";

import { useCallback, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  DeviceFlowChallenge,
  ModelProviderApiKeyConnectStart,
  ProviderConnectionState,
} from "@opzava/ports";

import { ApiKeyConnectPoller } from "@/components/connections/api-key-connect-poller";
import {
  DialogNotice,
  MutationErrorNotice,
} from "@/components/connections/connection-dialog-notices";
import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";
import { DisconnectConfirm } from "@/components/connections/provider-disconnect-confirm";
import { SetupTokenConnect } from "@/components/connections/setup-token-connect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { postConnectionsMutation } from "@/lib/connections-mutation-client";
import type { ProviderConnectionView } from "@/lib/connections-state";
import {
  activeModelLabel,
  actionLabel,
  authMethodTypeLabel,
  connectedAuthLabel,
  connectChoice,
  credentialFormChoice,
  credentialInputLabel,
  isSetupTokenChoice,
} from "@/lib/provider-presentation";

export type ApiKeyConnectPhase =
  | { readonly step: "idle" }
  | { readonly step: "starting" }
  | { readonly step: "polling"; readonly opId: string }
  | { readonly step: "connected"; readonly message: string }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

export type DeviceFlowStartPhase =
  | { readonly step: "idle" }
  | { readonly step: "starting" }
  | { readonly step: "started"; readonly challenge: DeviceFlowChallenge }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

/**
 * Elects which model the main orchestrator actually runs (#195).
 *
 * Enabling a model only makes it ROUTABLE (`agents.defaults.models`); the orchestrator runs
 * `agents.defaults.model.primary`. Before this, nothing in the product could set the primary, so a
 * provider connected with `onboard`'s default model was stuck on it — a newly released model could
 * be toggled on and still never be used. The options come from the live catalog, never a list in our
 * source, so a model is electable the moment the gateway knows about it.
 */
export function OrchestratorModelPicker({
  provider,
}: {
  readonly provider: ProviderConnectionView;
}) {
  const router = useRouter();
  const catalogModels = provider.catalogModels ?? provider.models;
  const currentModel = provider.model ?? null;
  const [choice, setChoice] = useState<string>(currentModel ?? "");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{
    readonly message: string;
    readonly code: string | null;
  } | null>(null);

  const elect = useCallback(async () => {
    if (pending || choice === "" || choice === currentModel) {
      return;
    }
    setPending(true);
    setFailure(null);
    const result = await postConnectionsMutation<unknown>(
      "/api/connections/orchestrator/set-main",
      { providerId: provider.connectionProviderId, model: choice },
      { timeoutMs: 120_000 },
    );
    setPending(false);
    if (!result.ok) {
      setFailure({ message: result.message, code: result.code });
      return;
    }
    router.refresh();
  }, [choice, currentModel, pending, provider.connectionProviderId, router]);

  if (catalogModels.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-2" aria-labelledby={`${provider.id}-orchestrator-model`}>
      <div>
        <h3 id={`${provider.id}-orchestrator-model`} className="font-medium text-foreground">
          Orchestrator model
        </h3>
        <p className="text-sm text-muted-foreground">
          The model the main orchestrator runs. Electing one also makes it routable and makes this
          provider the main orchestrator.
        </p>
      </div>
      {failure === null ? null : (
        <MutationErrorNotice failure={failure} title="Orchestrator model update failed" />
      )}
      {/* minmax(0,1fr): a native select's min-content width is its longest option, which otherwise
          inflates the dialog's implicit grid column past the 520px panel — the content then paints
          on the overlay beside the dialog surface (user-reported). */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <select
          aria-label="Orchestrator model"
          className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground"
          disabled={pending}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {currentModel === null ? <option value="">Select a model</option> : null}
          {catalogModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label} ({model.id})
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={pending || choice === "" || choice === currentModel}
          onClick={() => void elect()}
        >
          {pending ? (
            <span className="flex items-center gap-1.5">
              <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
              Electing…
            </span>
          ) : (
            "Use for orchestrator"
          )}
        </Button>
      </div>
    </section>
  );
}

export function ProviderModelsSection({ provider }: { readonly provider: ProviderConnectionView }) {
  const router = useRouter();
  const [pendingModelIds, setPendingModelIds] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<{
    readonly message: string;
    readonly code: string | null;
  } | null>(null);
  const enabledModels = provider.enabledModels ?? provider.models;
  const catalogModels = provider.catalogModels ?? [];
  const enabledModelIds = useMemo(
    () => new Set(enabledModels.map((model) => model.id.trim().toLowerCase())),
    [enabledModels],
  );

  const toggleModel = useCallback(
    async (modelId: string, enabled: boolean) => {
      const normalizedModelId = modelId.trim().toLowerCase();
      if (pendingModelIds.has(normalizedModelId)) {
        return;
      }

      setFailure(null);
      setPendingModelIds((current) => new Set(current).add(normalizedModelId));
      const result = await postConnectionsMutation<ProviderConnectionState>(
        "/api/connections/model/models",
        {
          providerId: provider.connectionProviderId,
          modelId,
          enabled,
        },
        // Above the BFF's 30s window for this route, which itself sits above the worker's
        // bounded verification budget — each hop times out only after the one below it.
        { timeoutMs: 35_000 },
      );
      setPendingModelIds((current) => {
        const next = new Set(current);
        next.delete(normalizedModelId);
        return next;
      });
      if (!result.ok) {
        setFailure({ message: result.message, code: result.code });
        // A timeout or gateway-restart failure is AMBIGUOUS — the patch may still have applied
        // server-side. Refresh so the switches show the gateway's truth, not the optimistic UI.
        router.refresh();
        return;
      }

      router.refresh();
    },
    [pendingModelIds, provider.connectionProviderId, router],
  );
  // One provider-scoped mutation runs at a time worker-side; a second concurrent toggle would
  // only bounce off the in-flight guard with a confusing error, so the whole group waits.
  const anyTogglePending = pendingModelIds.size > 0;

  return (
    <section className="grid gap-3" aria-labelledby={`${provider.id}-models-heading`}>
      <OrchestratorModelPicker provider={provider} />
      <div>
        <h3 id={`${provider.id}-models-heading`} className="font-medium text-foreground">
          Models
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose which catalog models this provider can route. The gateway paces these writes, so a
          change can take a moment to land.
        </p>
      </div>
      {failure === null ? null : (
        <MutationErrorNotice failure={failure} title="Model update failed" />
      )}
      {catalogModels.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          This provider has not advertised a model catalog.
        </p>
      ) : (
        <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {catalogModels.map((model) => {
            const normalizedModelId = model.id.trim().toLowerCase();
            const checked = enabledModelIds.has(normalizedModelId);
            const pending = pendingModelIds.has(normalizedModelId);
            return (
              <div key={normalizedModelId} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{model.label}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{model.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* The gateway paces control-plane writes, so this round-trip can run for tens of
                      seconds. A switch that only greys out reads as broken — say what is happening. */}
                  {pending ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
                      {checked ? "Disabling…" : "Enabling…"}
                    </span>
                  ) : null}
                  <Switch
                    checked={checked}
                    disabled={pending || anyTogglePending}
                    label={model.label}
                    onCheckedChange={(nextChecked) => void toggleModel(model.id, nextChecked)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ProviderConnectDialog({
  provider,
  open,
  onOpenChange,
  trigger,
}: {
  readonly provider: ProviderConnectionView;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly trigger?: ReactNode | null;
}) {
  const apiKeyChoice = credentialFormChoice(provider);
  const choice =
    provider.status === "connected" && provider.connectedAuthMode === "api_key"
      ? apiKeyChoice
      : connectChoice(provider);
  // Any CONNECTED provider that is not an api-key connection shows "Connected + Disconnect" with no
  // key field. Covers oauth/token AND unknown (null) auth mode, so a connected provider's Manage
  // dialog can ALWAYS be closed and disconnected — never a dead "no auth method" end state.
  const connectedWithoutKeyField =
    provider.status === "connected" && provider.connectedAuthMode !== "api_key";
  const showApiKeyForm =
    provider.status === "connected"
      ? provider.connectedAuthMode === "api_key" && apiKeyChoice !== null
      : choice?.mode === "api-key" && !isSetupTokenChoice(choice);
  const router = useRouter();
  const [apiKeyPhase, setApiKeyPhase] = useState<ApiKeyConnectPhase>({ step: "idle" });
  const [devicePhase, setDevicePhase] = useState<DeviceFlowStartPhase>({ step: "idle" });

  const apiKeyBusy = apiKeyPhase.step === "starting" || apiKeyPhase.step === "polling";
  const handleApiKeySubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (apiKeyBusy || apiKeyChoice === null) {
        return;
      }
      const form = event.currentTarget;
      const apiKey = new FormData(form).get("apiKey");
      if (typeof apiKey !== "string" || apiKey.trim() === "") {
        return;
      }
      setApiKeyPhase({ step: "starting" });
      const result = await postConnectionsMutation<ModelProviderApiKeyConnectStart>(
        "/api/connections/model/api-key",
        { providerId: apiKeyChoice.providerId, authChoiceId: apiKeyChoice.id, apiKey },
      );
      if (!result.ok) {
        setApiKeyPhase({ step: "failed", message: result.message, code: result.code });
        return;
      }
      // Never retain the raw key in the DOM once the worker owns the operation.
      form.reset();
      setApiKeyPhase({ step: "polling", opId: result.data.opId });
    },
    [apiKeyBusy, apiKeyChoice],
  );

  const deviceBusy = devicePhase.step === "starting";
  const handleDeviceStart = useCallback(async () => {
    if (deviceBusy || choice === null) {
      return;
    }
    setDevicePhase({ step: "starting" });
    const result = await postConnectionsMutation<DeviceFlowChallenge>(
      "/api/connections/model/device-flow",
      { providerId: choice.providerId, authChoiceId: choice.id },
    );
    if (!result.ok) {
      // Sad path: no automatic retry here - each start spawns a fresh provider device-code
      // request and providers rate-limit that endpoint. The user retries deliberately.
      setDevicePhase({ step: "failed", message: result.message, code: result.code });
      return;
    }
    setDevicePhase({ step: "started", challenge: result.data });
  }, [choice, deviceBusy]);

  if (choice === null && provider.status !== "connected") {
    return (
      <Button type="button" variant="secondary" size="sm" disabled>
        Connect
      </Button>
    );
  }

  return (
    <Dialog
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button
              type="button"
              size="sm"
              variant={provider.status === "connected" ? "secondary" : "default"}
            >
              {actionLabel(provider)}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {actionLabel(provider)} {provider.label}
          </DialogTitle>
          <DialogDescription>
            {provider.status === "connected"
              ? `Connected via ${connectedAuthLabel(provider)}.`
              : choice === null
                ? "No live auth method is available for this provider."
                : `Auth method from the live gateway catalog: ${choice.label} (${authMethodTypeLabel(
                    choice,
                  )}).`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-muted p-3 text-sm">
            {/* break-all: a model id has no spaces, and an unbreakable font-mono line is the same
                min-content overflow the orchestrator select had. */}
            <div className="break-all font-mono font-medium text-foreground" data-active-model>
              {activeModelLabel(provider)}
            </div>
            <p className="mt-1 text-muted-foreground">{provider.message ?? provider.whenToUse}</p>
          </div>

          {provider.status === "connected" ? <ProviderModelsSection provider={provider} /> : null}

          {connectedWithoutKeyField ? (
            <div className="grid gap-4">
              <DialogNotice tone="success" title={`Connected via ${connectedAuthLabel(provider)}`}>
                Disconnect this provider before re-authenticating with a different account or
                subscription.
              </DialogNotice>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                <DisconnectConfirm
                  provider={provider}
                  size="default"
                  triggerVariant="destructive"
                />
              </DialogFooter>
            </div>
          ) : isSetupTokenChoice(choice) ? (
            <div className="grid gap-4">
              <SetupTokenConnect providerId={provider.connectionProviderId} />
              {apiKeyChoice !== null ? (
                <details className="rounded-lg border border-border bg-muted p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-foreground">
                    Already have a setup token?
                  </summary>
                  <form onSubmit={handleApiKeySubmit} className="mt-3 grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor={`${provider.id}-${apiKeyChoice.id}-dialog-key`}>
                        {credentialInputLabel(apiKeyChoice)}
                      </Label>
                      <Input
                        id={`${provider.id}-${apiKeyChoice.id}-dialog-key`}
                        name="apiKey"
                        type="password"
                        autoComplete="off"
                        required
                        disabled={apiKeyBusy}
                        placeholder="Paste setup token once"
                      />
                      <p className="text-xs text-muted-foreground">
                        The token is sent to the provisioning worker and written inside Opzava
                        Gateway. It is masked here and never echoed back.
                      </p>
                    </div>
                    {apiKeyPhase.step === "failed" ? (
                      <MutationErrorNotice failure={apiKeyPhase} />
                    ) : null}
                    {apiKeyPhase.step === "connected" ? (
                      <DialogNotice tone="success" role="status" title="Connection updated">
                        {apiKeyPhase.message}
                      </DialogNotice>
                    ) : null}
                    {apiKeyPhase.step === "polling" ? (
                      <ApiKeyConnectPoller
                        opId={apiKeyPhase.opId}
                        onConnected={(message) => {
                          setApiKeyPhase({ step: "connected", message });
                          router.refresh();
                        }}
                        onFailed={(message, code) => {
                          setApiKeyPhase({ step: "failed", message, code });
                        }}
                      />
                    ) : null}
                    <Button type="submit" disabled={apiKeyBusy} aria-busy={apiKeyBusy}>
                      {apiKeyBusy
                        ? "Connecting..."
                        : apiKeyPhase.step === "failed"
                          ? "Retry token"
                          : "Connect setup token"}
                    </Button>
                  </form>
                </details>
              ) : null}
            </div>
          ) : showApiKeyForm && apiKeyChoice !== null ? (
            <form onSubmit={handleApiKeySubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor={`${provider.id}-${apiKeyChoice.id}-dialog-key`}>
                  {credentialInputLabel(apiKeyChoice)}
                </Label>
                <Input
                  id={`${provider.id}-${apiKeyChoice.id}-dialog-key`}
                  name="apiKey"
                  type="password"
                  autoComplete="off"
                  required
                  disabled={apiKeyBusy}
                  placeholder={`Paste ${credentialInputLabel(apiKeyChoice).toLowerCase()} once`}
                />
                <p className="text-xs text-muted-foreground">
                  The credential is sent to the provisioning worker and written inside Opzava
                  Gateway. It is masked here and never echoed back.
                </p>
              </div>
              {apiKeyPhase.step === "failed" ? <MutationErrorNotice failure={apiKeyPhase} /> : null}
              {apiKeyPhase.step === "connected" ? (
                <DialogNotice tone="success" role="status" title="Connection updated">
                  {apiKeyPhase.message}
                </DialogNotice>
              ) : null}
              {apiKeyPhase.step === "polling" ? (
                <ApiKeyConnectPoller
                  opId={apiKeyPhase.opId}
                  onConnected={(message) => {
                    setApiKeyPhase({ step: "connected", message });
                    router.refresh();
                  }}
                  onFailed={(message, code) => {
                    setApiKeyPhase({ step: "failed", message, code });
                  }}
                />
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={apiKeyBusy} aria-busy={apiKeyBusy}>
                  {apiKeyBusy
                    ? "Connecting..."
                    : apiKeyPhase.step === "failed"
                      ? "Retry connect"
                      : provider.status === "connected"
                        ? "Rotate key"
                        : "Connect provider"}
                </Button>
              </DialogFooter>
            </form>
          ) : choice?.mode === "device-flow" ? (
            <div className="grid gap-4">
              {devicePhase.step === "started" ? (
                <DeviceFlowPoller
                  flowId={devicePhase.challenge.flowId}
                  verificationUri={devicePhase.challenge.verificationUri}
                  userCode={devicePhase.challenge.userCode}
                  codePending={devicePhase.challenge.codePending}
                  intervalSeconds={devicePhase.challenge.intervalSeconds}
                  expiresAt={devicePhase.challenge.expiresAt}
                />
              ) : (
                <DialogNotice tone="neutral" title="Browser device sign-in">
                  Start the device flow, then authorize {provider.label} with the verification code.
                </DialogNotice>
              )}
              {devicePhase.step === "failed" ? (
                <MutationErrorNotice failure={devicePhase} title="Device flow failed" />
              ) : null}
              {devicePhase.step === "failed" ? (
                <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
                  <code>openclaw onboard --auth-choice {choice.id}</code>
                </pre>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                {devicePhase.step === "started" ? null : (
                  <Button
                    type="button"
                    onClick={() => void handleDeviceStart()}
                    disabled={deviceBusy}
                    aria-busy={deviceBusy}
                  >
                    {deviceBusy
                      ? "Starting..."
                      : devicePhase.step === "failed"
                        ? "Retry device flow"
                        : "Start device flow"}
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : (
            <DialogNotice tone="warning" title="No live auth method">
              Refresh the gateway catalog after enabling this provider&apos;s auth choice.
            </DialogNotice>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
