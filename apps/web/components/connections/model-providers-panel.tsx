"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import type {
  DeviceFlowChallenge,
  ModelProviderApiKeyConnectStart,
  ModelProviderAuthChoice,
  ModelProviderDisconnectStart,
  OrchestratorDelegationState,
  ProviderConnectionState,
} from "@opzava/ports";

import { ApiKeyConnectPoller } from "@/components/connections/api-key-connect-poller";
import { DisconnectPoller } from "@/components/connections/disconnect-poller";
import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";
import { SetupTokenConnect } from "@/components/connections/setup-token-connect";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConnectionsPageData } from "@/lib/connections";
import { postConnectionsMutation } from "@/lib/connections-mutation-client";
import { groupProviderConnectionsByTier } from "@/lib/connections-state";
import { cn } from "@/lib/utils";

type ProviderRow = ConnectionsPageData["providers"][number];

interface ModelProvidersPanelProps {
  readonly gatewayStatus: ConnectionsPageData["snapshot"]["gateway"]["status"];
  readonly providers: readonly ProviderRow[];
  readonly summary: ConnectionsPageData["providerSummary"];
}

const TABLE_CAPTION =
  "LLM model providers the gateway can route to, with folded CLI runtimes, authentication methods, current models, live connection status, and actions.";
const UNSAFE_ACCOUNT_LABEL_PATTERN = /token:|sk-[a-z]|:default=|api[-_]?key/i;
const MAX_VISIBLE_AUTH_BADGES = 2;

function providerSort(left: ProviderRow, right: ProviderRow): number {
  const leftConnected = left.status === "connected" ? 0 : 1;
  const rightConnected = right.status === "connected" ? 0 : 1;
  if (leftConnected !== rightConnected) {
    return leftConnected - rightConnected;
  }

  const leftKey = left.label.toLowerCase();
  const rightKey = right.label.toLowerCase();
  if (leftKey !== rightKey) {
    return leftKey < rightKey ? -1 : 1;
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function connectChoice(provider: ProviderRow) {
  const setupTokenChoice = provider.apiKeyChoices.find((choice) =>
    `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token"),
  );
  if (setupTokenChoice !== undefined) {
    return setupTokenChoice;
  }

  return provider.deviceFlowChoices[0] ?? provider.apiKeyChoices[0] ?? null;
}

function credentialFormChoice(provider: ProviderRow) {
  return (
    provider.apiKeyChoices.find((choice) =>
      `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token"),
    ) ??
    provider.apiKeyChoices[0] ??
    null
  );
}

function credentialInputLabel(choice: ModelProviderAuthChoice): string {
  return `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token")
    ? "Setup token"
    : "API key";
}

function isSetupTokenChoice(choice: ModelProviderAuthChoice | null): boolean {
  return choice !== null && `${choice.id} ${choice.label}`.toLowerCase().includes("setup-token");
}

function authMethodTypeLabel(choice: ModelProviderAuthChoice): string {
  return choice.mode === "device-flow" ? "OAuth device-flow" : credentialInputLabel(choice);
}

function filterProviders(providers: readonly ProviderRow[], query: string): readonly ProviderRow[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return providers;
  }

  return providers.filter((provider) =>
    [
      provider.label,
      provider.vendor,
      provider.model ?? "",
      provider.id,
      ...provider.runtimeLabels,
      ...provider.models.map((model) => model.id),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function providerAuthBadges(provider: ProviderRow): readonly string[] {
  const labels = new Set<string>();

  for (const choice of [...provider.deviceFlowChoices, ...provider.apiKeyChoices]) {
    const haystack = `${choice.id} ${choice.label} ${choice.mode}`.toLowerCase();
    if (haystack.includes("proxy") || haystack.includes("subscription")) {
      labels.add("Subscription");
      continue;
    }

    if (haystack.includes("setup") || (haystack.includes("token") && !haystack.includes("api"))) {
      labels.add("Setup token");
      continue;
    }

    if (choice.mode === "api-key") {
      labels.add("API key");
      continue;
    }

    labels.add(haystack.includes("oauth") ? "OAuth" : "Device");
  }

  const ordered = ["Subscription", "OAuth", "Device", "API key", "Setup token"].filter((label) =>
    labels.has(label),
  );
  return ordered.length === 0 ? ["No live auth method"] : ordered;
}

function runtimeHint(provider: ProviderRow): string | null {
  if (provider.runtimeLabels.length === 0) {
    return null;
  }

  const labels = provider.runtimeLabels.map((label) =>
    label.toLowerCase().includes("cli") ? `${label} runtime` : label,
  );
  return `incl. ${labels.join(", ")}`;
}

function connectedAuthLabel(provider: ProviderRow): string {
  if (provider.connectedAuthMode === "oauth") {
    return provider.id === "openai" ? "ChatGPT/OAuth subscription" : "OAuth subscription";
  }

  if (provider.connectedAuthMode === "token") {
    return "setup token";
  }

  if (provider.connectedAuthMode === "api_key") {
    return "API key";
  }

  return "gateway credential";
}

function activeModelLabel(provider: ProviderRow): string {
  return provider.model ?? "No configured model";
}

function actionLabel(provider: ProviderRow): string {
  if (provider.status === "connected") {
    return "Manage";
  }

  return provider.status === "needs_attention" ? "Fix" : "Connect";
}

function displayStatusLabel(provider: ProviderRow): string {
  return provider.status === "not_connected" ? "Available" : provider.statusLabel;
}

function statusBadgeVariant(provider: ProviderRow): "success" | "warning" | "muted" | "outline" {
  if (provider.status === "connected") {
    return "success";
  }

  if (provider.status === "needs_attention" || provider.status === "pending") {
    return "warning";
  }

  return "muted";
}

function authHealthLabel(provider: ProviderRow): string | null {
  if (provider.authHealth === null) {
    return null;
  }

  const labels: Record<NonNullable<ProviderRow["authHealth"]>, string> = {
    ok: "Auth OK",
    expiring: "Auth expiring",
    expired: "Auth expired",
    missing: "Auth missing",
    static: "Static key",
  };
  return labels[provider.authHealth];
}

function statusGuidance(provider: ProviderRow): string | null {
  if (provider.status === "needs_attention") {
    return `${provider.message ?? "Gateway reported this credential needs attention."} Fix: reconnect the account or rotate the credential.`;
  }

  if (provider.status === "pending") {
    return "Authorization is in progress. Complete the device flow or wait for the next poll.";
  }

  if (provider.status === "not_connected") {
    return "Available to connect.";
  }

  if (provider.authHealth === "expiring") {
    return "Credential is still usable, but it should be refreshed soon.";
  }

  if (provider.authHealth === "expired" || provider.authHealth === "missing") {
    return "Credential cannot route models until it is reconnected.";
  }

  return null;
}

function actionMessage(message: string): string {
  return /^exit code \d+\.?$/i.test(message.trim())
    ? `Gateway command failed after returning ${message.trim()}. Check provisioning worker logs for the sanitized command output.`
    : message;
}

// Provider sub-line: the live gateway `vendor` (when it adds information beyond the label) plus any
// folded CLI runtime hint — keeps `vendor` live data on-screen and mirrors the mockup sub-line
// ("Gemini · incl. Gemini CLI runtime"). Null when there is nothing meaningful to add.
function providerSubLine(provider: ProviderRow): string | null {
  const vendor = provider.vendor.trim();
  const showVendor = vendor !== "" && vendor.toLowerCase() !== provider.label.trim().toLowerCase();
  return (
    [showVendor ? vendor : null, runtimeHint(provider)]
      .filter((part): part is string => part !== null && part !== "")
      .join(" · ")
      .trim() || null
  );
}

function providerModelParts(provider: ProviderRow): {
  readonly first: string | null;
  readonly rest: readonly string[];
  readonly more: number;
} {
  const ids = provider.models.map((model) => model.id);
  return {
    first: ids[0] ?? null,
    rest: ids.slice(1, 3),
    more: Math.max(0, ids.length - 3),
  };
}

function statusMeta(provider: ProviderRow): readonly string[] {
  return [
    provider.expiryLabel === null ? null : `expires ${provider.expiryLabel}`,
    provider.planLabel === null ? null : `plan ${provider.planLabel}`,
    provider.usageLabel,
  ].filter((label): label is string => label !== null);
}

function safeAccountLabel(label: string | null): string | null {
  const trimmed = label?.trim() ?? "";
  if (trimmed === "" || UNSAFE_ACCOUNT_LABEL_PATTERN.test(trimmed)) {
    return null;
  }

  // Gateway profile labels look like "provider:<account>=<mode> (<account>)". Surface only a clean
  // human account (an email or a real name), never the raw "provider:x=mode" wire format.
  const email = trimmed.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email !== null) {
    return email[0];
  }
  const account = trimmed.match(/^[a-z0-9-]+:([^=]+)=/i)?.[1]?.trim();
  if (account !== undefined && account !== "" && account.toLowerCase() !== "default") {
    return account;
  }
  // A plain label with no wire-format markers is safe to show as-is; otherwise drop it.
  return /[:=]/.test(trimmed) ? null : trimmed;
}

// One canonical status dot rendered with theme tokens (mockup-parity look, shadcn-native styling).
function StatusDot({ status }: { readonly status: ProviderRow["status"] }) {
  if (status === "not_connected") {
    return null;
  }

  const connected = status === "connected";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        connected ? "bg-[var(--success)]" : "bg-[var(--warning)]",
        connected && "animate-pulse",
      )}
    />
  );
}

const ALERT_TONE = {
  success: "border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[var(--success-soft)]",
  warning: "border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[var(--warning-soft)]",
  destructive: "border-destructive/30 bg-destructive/10",
  neutral: "border-border bg-muted",
} as const;

function DialogNotice({
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
function MutationErrorNotice({
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
function DisconnectConfirm({
  provider,
  open: controlledOpen,
  onOpenChange,
  trigger,
  size = "sm",
  triggerVariant = "ghost",
}: {
  readonly provider: ProviderRow;
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
type DisconnectPhase =
  | { readonly step: "idle" }
  | { readonly step: "starting" }
  | { readonly step: "polling"; readonly opId: string }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

function DisconnectConfirmForm({
  formId,
  provider,
  onPendingChange,
  onSuccess,
}: {
  readonly formId: string;
  readonly provider: ProviderRow;
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
          This logs the gateway out of {provider.label} and stops routing its models. Reconnecting
          requires re-authenticating this provider. This can&apos;t be undone from here.
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

function SetMainOrchestratorConfirm({
  provider,
  open: controlledOpen,
  onOpenChange,
  onSetMainSuccess,
  trigger,
}: {
  readonly provider: ProviderRow;
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

type SetMainOrchestratorPhase =
  | { readonly step: "idle" }
  | { readonly step: "pending" }
  | { readonly step: "verifying" }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

function SetMainOrchestratorForm({
  formId,
  provider,
  onPendingChange,
  onSuccess,
}: {
  readonly formId: string;
  readonly provider: ProviderRow;
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

function ProviderBacks({
  provider,
  isLeadOrchestrator,
}: {
  readonly provider: ProviderRow;
  readonly isLeadOrchestrator: boolean;
}) {
  // Role is only real once a provider is connected (an unconnected provider is not yet a subagent);
  // showing it otherwise is misleading chrome. Matches the mockup (badges only connected rows).
  if (provider.status !== "connected") {
    return null;
  }

  if (isLeadOrchestrator) {
    return (
      <Badge variant="secondary" title="Coordinator agent">
        <span className="sr-only">AI lead - </span>
        <span aria-hidden="true" className="text-[var(--accent)]">
          ✦
        </span>
        LEAD ORCHESTRATOR
      </Badge>
    );
  }

  return <Badge variant="outline">SUBAGENT</Badge>;
}

type ApiKeyConnectPhase =
  | { readonly step: "idle" }
  | { readonly step: "starting" }
  | { readonly step: "polling"; readonly opId: string }
  | { readonly step: "connected"; readonly message: string }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

type DeviceFlowStartPhase =
  | { readonly step: "idle" }
  | { readonly step: "starting" }
  | { readonly step: "started"; readonly challenge: DeviceFlowChallenge }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

function ProviderConnectDialog({
  provider,
  open,
  onOpenChange,
  trigger,
}: {
  readonly provider: ProviderRow;
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
            <div className="font-mono font-medium text-foreground" data-active-model>
              {activeModelLabel(provider)}
            </div>
            <p className="mt-1 text-muted-foreground">{provider.message ?? provider.whenToUse}</p>
          </div>

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

function ProviderConnectedActions({
  provider,
  canSetMainOrchestrator,
  isLeadOrchestrator,
  onSetMainOrchestratorSuccess,
}: {
  readonly provider: ProviderRow;
  readonly canSetMainOrchestrator: boolean;
  readonly isLeadOrchestrator: boolean;
  readonly onSetMainOrchestratorSuccess: (providerId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [setMainOpen, setSetMainOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreRowActionTriggerFocus = useCallback(() => {
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);
  const handleManageOpenChange = useCallback(
    (nextOpen: boolean) => {
      setManageOpen(nextOpen);
      if (!nextOpen) {
        restoreRowActionTriggerFocus();
      }
    },
    [restoreRowActionTriggerFocus],
  );
  const handleSetMainOpenChange = useCallback(
    (nextOpen: boolean) => {
      setSetMainOpen(nextOpen);
      if (!nextOpen) {
        restoreRowActionTriggerFocus();
      }
    },
    [restoreRowActionTriggerFocus],
  );
  const handleDisconnectOpenChange = useCallback(
    (nextOpen: boolean) => {
      setDisconnectOpen(nextOpen);
      if (!nextOpen) {
        restoreRowActionTriggerFocus();
      }
    },
    [restoreRowActionTriggerFocus],
  );
  const openDialogFromMenu = useCallback((event: Event, openDialog: () => void) => {
    event.preventDefault();
    openDialog();
    setMenuOpen(false);
  }, []);

  return (
    <>
      <div className="inline-flex items-center justify-end gap-2">
        {isLeadOrchestrator ? <Badge variant="secondary">Main orchestrator</Badge> : null}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Row actions for ${provider.label}`}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ⋮
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(event) => openDialogFromMenu(event, () => setManageOpen(true))}
            >
              Manage
            </DropdownMenuItem>
            {canSetMainOrchestrator ? (
              <DropdownMenuItem
                onSelect={(event) => openDialogFromMenu(event, () => setSetMainOpen(true))}
              >
                Set as main orchestrator
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => openDialogFromMenu(event, () => setDisconnectOpen(true))}
            >
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ProviderConnectDialog
        provider={provider}
        open={manageOpen}
        onOpenChange={handleManageOpenChange}
        trigger={null}
      />
      {canSetMainOrchestrator ? (
        <SetMainOrchestratorConfirm
          provider={provider}
          open={setMainOpen}
          onOpenChange={handleSetMainOpenChange}
          onSetMainSuccess={onSetMainOrchestratorSuccess}
          trigger={null}
        />
      ) : null}
      <DisconnectConfirm
        provider={provider}
        open={disconnectOpen}
        onOpenChange={handleDisconnectOpenChange}
        trigger={null}
      />
    </>
  );
}

function ProviderTableRow({
  provider,
  optimisticLeadProviderId,
  onSetMainOrchestratorSuccess,
}: {
  readonly provider: ProviderRow;
  readonly optimisticLeadProviderId: string | null;
  readonly onSetMainOrchestratorSuccess: (providerId: string) => void;
}) {
  const models = providerModelParts(provider);
  const meta = statusMeta(provider);
  const subLine = providerSubLine(provider);
  const authBadges = providerAuthBadges(provider);
  const visibleAuthBadges = authBadges.slice(0, MAX_VISIBLE_AUTH_BADGES);
  const overflowAuthBadges = authBadges.slice(MAX_VISIBLE_AUTH_BADGES);
  const healthLabel = authHealthLabel(provider);
  const guidance = statusGuidance(provider);
  const accountLabel = safeAccountLabel(provider.accountLabel);
  const modelOverflowCount = models.rest.length + models.more;
  const statusDetails = [healthLabel, accountLabel, ...meta, guidance].filter(
    (detail): detail is string => detail !== null,
  );
  const isLeadOrchestrator =
    optimisticLeadProviderId === null
      ? provider.roleLabel === "Lead orchestrator"
      : provider.id === optimisticLeadProviderId;
  const canSetMainOrchestrator = provider.status === "connected" && !isLeadOrchestrator;

  return (
    <TableRow data-provider-id={provider.id}>
      <TableCell data-label="Provider" className="min-w-0 align-middle py-4">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium leading-tight">
            <span>{provider.label}</span>
            <ProviderBacks provider={provider} isLeadOrchestrator={isLeadOrchestrator} />
          </div>
          {subLine === null ? null : (
            <div className="text-xs leading-snug text-muted-foreground">{subLine}</div>
          )}
        </div>
      </TableCell>
      <TableCell data-label="Auth" className="min-w-0 align-middle py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {visibleAuthBadges.map((label) => (
            <Badge
              key={`${provider.id}-${label}`}
              variant={label === "No live auth method" ? "muted" : "outline"}
              className={label === "No live auth method" ? undefined : "text-muted-foreground"}
            >
              {label}
            </Badge>
          ))}
          {overflowAuthBadges.length === 0 ? null : (
            <Badge variant="muted" title={overflowAuthBadges.join(", ")}>
              +{overflowAuthBadges.length}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell data-label="Models" className="min-w-0 align-middle py-4">
        {models.first === null ? (
          <span className="text-muted-foreground">
            {provider.id === "openrouter" ? "Routes many" : "—"}
          </span>
        ) : (
          <div className="grid min-w-0 gap-1">
            <span className="break-words font-mono text-sm leading-tight" data-model>
              {models.first}
            </span>
            {modelOverflowCount === 0 ? null : (
              <span className="text-xs text-muted-foreground">+{modelOverflowCount} more</span>
            )}
          </div>
        )}
      </TableCell>
      <TableCell data-label="Status" className="min-w-0 align-middle py-4">
        <div className="grid min-w-0 gap-1">
          <span className="inline-flex min-w-0 items-center gap-2">
            <StatusDot status={provider.status} />
            <Badge variant={statusBadgeVariant(provider)} data-provider-status={provider.status}>
              {displayStatusLabel(provider)}
            </Badge>
          </span>
          {statusDetails.length === 0 ? null : (
            <div className="text-xs leading-snug text-muted-foreground">
              {statusDetails.join(" · ")}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell data-label="Actions" className="align-middle py-4 text-right">
        <div className="grid justify-items-end gap-2">
          {provider.status === "connected" ? (
            <ProviderConnectedActions
              provider={provider}
              canSetMainOrchestrator={canSetMainOrchestrator}
              isLeadOrchestrator={isLeadOrchestrator}
              onSetMainOrchestratorSuccess={onSetMainOrchestratorSuccess}
            />
          ) : (
            <ProviderConnectDialog provider={provider} />
          )}
          {provider.pendingFlow === null ? null : (
            <DeviceFlowPoller
              flowId={provider.pendingFlow.flowId}
              verificationUri={provider.pendingFlow.verificationUri}
              userCode={provider.pendingFlow.userCode}
              codePending={provider.pendingFlow.codePending}
              intervalSeconds={provider.pendingFlow.intervalSeconds}
              expiresAt={provider.pendingFlow.expiresAt}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ProviderTable({
  providers,
  optimisticLeadProviderId,
  onSetMainOrchestratorSuccess,
}: {
  readonly providers: readonly ProviderRow[];
  readonly optimisticLeadProviderId: string | null;
  readonly onSetMainOrchestratorSuccess: (providerId: string) => void;
}) {
  if (providers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-medium">No model providers match</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Clear the search or refresh the gateway catalog.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table className="table table-cards">
        <TableCaption className="sr-only">{TABLE_CAPTION}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/4">Provider</TableHead>
            <TableHead className="w-1/6">Auth</TableHead>
            <TableHead className="w-1/5">Models</TableHead>
            <TableHead className="w-1/4">Status</TableHead>
            <TableHead className="text-right whitespace-nowrap">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <ProviderTableRow
              provider={provider}
              optimisticLeadProviderId={optimisticLeadProviderId}
              onSetMainOrchestratorSuccess={onSetMainOrchestratorSuccess}
              key={provider.id}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ModelProvidersPanel({
  gatewayStatus,
  providers,
  summary,
}: ModelProvidersPanelProps) {
  const [query, setQuery] = useState("");
  const [optimisticLeadProviderId, setOptimisticLeadProviderId] = useState<string | null>(null);
  const providersAtOptimisticSetRef = useRef<readonly ProviderRow[] | null>(null);
  const sortedProviders = useMemo(() => [...providers].sort(providerSort), [providers]);
  const filteredProviders = useMemo(
    () => filterProviders(sortedProviders, query),
    [query, sortedProviders],
  );
  const tiers = useMemo(
    () => groupProviderConnectionsByTier(filteredProviders),
    [filteredProviders],
  );
  const searchActive = query.trim() !== "";
  const defaultTier = tiers[0]?.id ?? "frontier";
  // Keep the lead badge deterministic after a successful set-main mutation while the
  // transitioned router refresh catches the rest of the Connections snapshot up.
  const handleSetMainOrchestratorSuccess = useCallback(
    (providerId: string) => {
      providersAtOptimisticSetRef.current = providers;
      setOptimisticLeadProviderId(providerId);
    },
    [providers],
  );
  useEffect(() => {
    if (optimisticLeadProviderId === null) {
      return;
    }
    const optimisticProvider = providers.find(
      (provider) => provider.id === optimisticLeadProviderId,
    );
    if (
      providers !== providersAtOptimisticSetRef.current ||
      optimisticProvider === undefined ||
      optimisticProvider.status !== "connected"
    ) {
      providersAtOptimisticSetRef.current = null;
      setOptimisticLeadProviderId(null);
    }
  }, [optimisticLeadProviderId, providers]);

  return (
    <Card aria-labelledby="providers-lbl">
      <CardHeader>
        <CardTitle id="providers-lbl">Provider connection status</CardTitle>
        <CardDescription>
          Model providers — {summary.connected} connected / {summary.available} available. Connected
          providers can route models now; available providers need credentials.
        </CardDescription>
        <CardAction>
          <Badge variant={summary.needsAttention > 0 ? "warning" : "secondary"}>
            {summary.needsAttention} need attention · {summary.pending} pending
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        {providers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="font-medium">
              {gatewayStatus === "unavailable"
                ? "Gateway unavailable - retrying automatically"
                : "No model providers in the live catalog"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {gatewayStatus === "unavailable"
                ? "The backend reconnects on its own. This is not a zero-provider configuration."
                : "Refresh after adding provider auth choices to the gateway catalog."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Canonical LLM providers the gateway can route to — auth order OAuth to API key.
              </p>
              <div className="w-full max-w-xs">
                <Label className="sr-only" htmlFor="connections-provider-search">
                  Search model providers
                </Label>
                <Input
                  id="connections-provider-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search providers"
                  type="search"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Exactly one connected provider is the main orchestrator. Other connected providers run
              as subagents.
            </p>

            {searchActive ? (
              <ProviderTable
                providers={filteredProviders}
                optimisticLeadProviderId={optimisticLeadProviderId}
                onSetMainOrchestratorSuccess={handleSetMainOrchestratorSuccess}
              />
            ) : tiers.length === 0 ? (
              <ProviderTable
                providers={[]}
                optimisticLeadProviderId={optimisticLeadProviderId}
                onSetMainOrchestratorSuccess={handleSetMainOrchestratorSuccess}
              />
            ) : (
              <Tabs defaultValue={defaultTier} className="gap-4">
                <TabsList className="flex-wrap">
                  {tiers.map((tier) => {
                    const connected = tier.providers.filter(
                      (candidate) => candidate.status === "connected",
                    ).length;
                    const total = tier.providers.length;
                    return (
                      <TabsTrigger key={tier.id} value={tier.id} className="gap-1.5">
                        {tier.label}
                        {connected > 0 ? (
                          <Badge
                            variant="success"
                            className="h-5 px-1.5"
                            aria-label={`${connected} of ${total} connected`}
                          >
                            {connected}/{total}
                          </Badge>
                        ) : (
                          <Badge
                            variant="muted"
                            className="h-5 px-1.5"
                            aria-label={`${total} providers, none connected`}
                          >
                            {total}
                          </Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {tiers.map((tier) => (
                  <TabsContent key={tier.id} value={tier.id} data-provider-tier={tier.id}>
                    <ProviderTable
                      providers={tier.providers}
                      optimisticLeadProviderId={optimisticLeadProviderId}
                      onSetMainOrchestratorSuccess={handleSetMainOrchestratorSuccess}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
