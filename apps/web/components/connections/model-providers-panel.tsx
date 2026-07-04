"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  connectModelProviderApiKeyStateAction,
  disconnectModelProviderAction,
  startModelProviderDeviceFlowStateAction,
} from "@/app/(app)/connections/actions";
import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  initialConnectionActionState,
  type ConnectionActionState,
} from "@/lib/connections-action-state";
import { groupProviderConnectionsByTier } from "@/lib/connections-state";
import { cn } from "@/lib/utils";

type ProviderRow = ConnectionsPageData["providers"][number];

interface ModelProvidersPanelProps {
  readonly providers: readonly ProviderRow[];
  readonly summary: ConnectionsPageData["providerSummary"];
}

const TABLE_CAPTION =
  "LLM model providers the gateway can route to, with folded CLI runtimes, authentication methods, current models, live connection status, and actions.";

function providerSort(left: ProviderRow, right: ProviderRow): number {
  const leftConnected = left.status === "connected" ? 0 : 1;
  const rightConnected = right.status === "connected" ? 0 : 1;
  return leftConnected === rightConnected
    ? left.label.localeCompare(right.label)
    : leftConnected - rightConnected;
}

function connectChoice(provider: ProviderRow) {
  return provider.deviceFlowChoices[0] ?? provider.apiKeyChoices[0] ?? null;
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

function DialogSubmitButton({
  pendingLabel,
  children,
}: {
  readonly pendingLabel: string;
  readonly children: ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function ProviderActionResult({
  state,
  provider,
  matchProviderId,
}: {
  readonly state: ConnectionActionState;
  readonly provider: ProviderRow;
  readonly matchProviderId?: string;
}) {
  const expected = matchProviderId ?? provider.id;
  if (state.status === "idle" || state.providerId !== expected || state.message === null) {
    return null;
  }

  const adminRequired = state.code === "provisioning.openclawAdmin.operatorAdminRequired";
  const success = state.status === "success";

  return (
    <DialogNotice
      tone={success ? "success" : adminRequired ? "warning" : "destructive"}
      role={success ? "status" : "alert"}
      title={
        success
          ? "Connection updated"
          : adminRequired
            ? "Admin device required"
            : "Connection failed"
      }
    >
      {state.message}
    </DialogNotice>
  );
}

// Destructive-action guard: disconnect logs the gateway out of a provider, so it must be confirmed
// (UX error-prevention) — an accidental click on the row button should never sever a live connection.
function DisconnectConfirm({
  provider,
  size = "sm",
  triggerVariant = "ghost",
}: {
  readonly provider: ProviderRow;
  readonly size?: "sm" | "default";
  readonly triggerVariant?: "ghost" | "destructive";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size={size}>
          Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {provider.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This logs the gateway out of {provider.label} and stops routing its models. Reconnecting
            requires re-authenticating this provider. This can&apos;t be undone from here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={disconnectModelProviderAction}>
            <input type="hidden" name="providerId" value={provider.connectionProviderId} />
            <AlertDialogAction type="submit" className={buttonVariants({ variant: "destructive" })}>
              Disconnect {provider.label}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProviderBacks({ provider }: { readonly provider: ProviderRow }) {
  // Role is only real once a provider is connected (an unconnected provider is not yet a subagent);
  // showing it otherwise is misleading chrome. Matches the mockup (badges only connected rows).
  if (provider.status !== "connected") {
    return null;
  }

  if (provider.roleLabel === "Lead orchestrator") {
    return (
      <Badge variant="secondary" title="Coordinator agent">
        <span className="sr-only">AI lead - </span>
        <span aria-hidden="true" className="text-[var(--accent)]">
          ✦
        </span>
        Orchestrator
      </Badge>
    );
  }

  return <Badge variant="outline">Subagent</Badge>;
}

function ProviderConnectDialog({ provider }: { readonly provider: ProviderRow }) {
  const router = useRouter();
  const apiKeyChoice = provider.apiKeyChoices[0] ?? null;
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
      : choice?.mode === "api-key";
  const [apiKeyState, apiKeyAction] = useActionState(
    connectModelProviderApiKeyStateAction,
    initialConnectionActionState,
  );
  const [deviceFlowState, deviceAction] = useActionState(
    startModelProviderDeviceFlowStateAction,
    initialConnectionActionState,
  );

  useEffect(() => {
    if (apiKeyState.status === "success") {
      router.refresh();
    }
  }, [apiKeyState.status, router]);

  if (choice === null && provider.status !== "connected") {
    return (
      <Button type="button" variant="secondary" size="sm" disabled>
        Connect
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={provider.status === "connected" ? "secondary" : "default"}
        >
          {provider.status === "connected" ? "Manage" : "Connect"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {provider.status === "connected" ? "Manage" : "Connect"} {provider.label}
          </DialogTitle>
          <DialogDescription>
            {provider.status === "connected"
              ? `Connected via ${connectedAuthLabel(provider)}.`
              : choice === null
                ? "No live auth method is available for this provider."
                : `Auth method from the live gateway catalog: ${choice.label} (${
                    choice.mode === "api-key" ? "API key" : "OAuth device-flow"
                  }).`}
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
          ) : showApiKeyForm && apiKeyChoice !== null ? (
            <form action={apiKeyAction} className="grid gap-4">
              <input type="hidden" name="providerId" value={apiKeyChoice.providerId} />
              <input type="hidden" name="authChoiceId" value={apiKeyChoice.id} />
              <div className="grid gap-2">
                <Label htmlFor={`${provider.id}-${apiKeyChoice.id}-dialog-key`}>API key</Label>
                <Input
                  id={`${provider.id}-${apiKeyChoice.id}-dialog-key`}
                  name="apiKey"
                  type="password"
                  autoComplete="off"
                  required
                  placeholder="Paste key once"
                />
                <p className="text-xs text-muted-foreground">
                  The key is sent to the provisioning worker and written inside Opzava Gateway.
                </p>
              </div>
              <ProviderActionResult
                state={apiKeyState}
                provider={provider}
                matchProviderId={apiKeyChoice.providerId}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                <DialogSubmitButton pendingLabel="Connecting...">
                  {provider.status === "connected" ? "Rotate key" : "Connect provider"}
                </DialogSubmitButton>
              </DialogFooter>
            </form>
          ) : choice?.mode === "device-flow" ? (
            <form action={deviceAction} className="grid gap-4">
              <input type="hidden" name="providerId" value={choice.providerId} />
              <input type="hidden" name="authChoiceId" value={choice.id} />
              {deviceFlowState.status === "success" &&
              deviceFlowState.deviceFlowChallenge !== null ? (
                <DeviceFlowPoller
                  flowId={deviceFlowState.deviceFlowChallenge.flowId}
                  verificationUri={deviceFlowState.deviceFlowChallenge.verificationUri}
                  userCode={deviceFlowState.deviceFlowChallenge.userCode}
                  codePending={deviceFlowState.deviceFlowChallenge.codePending}
                  intervalSeconds={deviceFlowState.deviceFlowChallenge.intervalSeconds}
                  expiresAt={deviceFlowState.deviceFlowChallenge.expiresAt}
                />
              ) : (
                <DialogNotice tone="neutral" title="Browser device sign-in">
                  Start the device flow, then authorize {provider.label} with the verification code.
                </DialogNotice>
              )}
              {deviceFlowState.status === "error" ? (
                <ProviderActionResult
                  state={deviceFlowState}
                  provider={provider}
                  matchProviderId={choice.providerId}
                />
              ) : null}
              {deviceFlowState.status === "error" ? (
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
                {deviceFlowState.status === "success" &&
                deviceFlowState.deviceFlowChallenge !== null ? null : (
                  <DialogSubmitButton pendingLabel="Starting...">
                    Start device flow
                  </DialogSubmitButton>
                )}
              </DialogFooter>
            </form>
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

function ProviderTableRow({ provider }: { readonly provider: ProviderRow }) {
  const models = providerModelParts(provider);
  const meta = statusMeta(provider);
  const subLine = providerSubLine(provider);
  const authBadges = providerAuthBadges(provider);

  return (
    <TableRow data-provider-id={provider.id}>
      <TableCell data-label="Provider" className="align-top">
        <div className="flex flex-wrap items-center gap-2 font-medium">
          <span>{provider.label}</span>
          <ProviderBacks provider={provider} />
        </div>
        {subLine === null ? null : (
          <div className="mt-0.5 text-xs text-muted-foreground">{subLine}</div>
        )}
      </TableCell>
      <TableCell data-label="Auth" className="align-top">
        <div className="flex flex-wrap gap-1.5">
          {authBadges.map((label) => (
            <Badge
              key={`${provider.id}-${label}`}
              variant={label === "No live auth method" ? "muted" : "outline"}
            >
              {label}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell data-label="Models" className="align-top">
        {models.first === null ? (
          <span className="text-muted-foreground">
            {provider.id === "openrouter" ? "Routes many" : "—"}
          </span>
        ) : (
          <span>
            <span className="font-mono text-[13px]" data-model>
              {models.first}
            </span>
            {models.rest.length === 0 && models.more === 0 ? null : (
              <span className="text-muted-foreground">
                {" · "}
                {models.rest.join(" · ")}
                {models.more > 0 ? ` · +${models.more} more` : ""}
              </span>
            )}
          </span>
        )}
      </TableCell>
      <TableCell data-label="Status" className="align-top">
        <span
          className={cn(
            "inline-flex items-center gap-2",
            provider.status === "not_connected" && "text-muted-foreground",
          )}
        >
          <StatusDot status={provider.status} />
          <span>{provider.statusLabel}</span>
          {meta.length === 0 ? null : (
            <span className="text-xs text-muted-foreground">· {meta.join(" · ")}</span>
          )}
        </span>
        {provider.accountLabel === null ? null : (
          <div className="mt-0.5 text-xs text-muted-foreground">{provider.accountLabel}</div>
        )}
        {provider.message === null ? null : (
          <div className="mt-0.5 text-xs text-muted-foreground">{provider.message}</div>
        )}
      </TableCell>
      <TableCell data-label="Actions" className="align-top text-right">
        <div className="flex items-center justify-end gap-2">
          <ProviderConnectDialog provider={provider} />
          {provider.status === "connected" ? <DisconnectConfirm provider={provider} /> : null}
        </div>
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
      </TableCell>
    </TableRow>
  );
}

function ProviderTable({ providers }: { readonly providers: readonly ProviderRow[] }) {
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
      <Table>
        <TableCaption className="sr-only">{TABLE_CAPTION}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Auth</TableHead>
            <TableHead>Models</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <ProviderTableRow provider={provider} key={provider.id} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ModelProvidersPanel({ providers, summary }: ModelProvidersPanelProps) {
  const [query, setQuery] = useState("");
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
            <p className="font-medium">Provider catalog unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure the provisioning worker to read the live Opzava Gateway auth-choice catalog.
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

            {searchActive ? (
              <ProviderTable providers={filteredProviders} />
            ) : tiers.length === 0 ? (
              <ProviderTable providers={[]} />
            ) : (
              <Tabs defaultValue={defaultTier} className="gap-4">
                <TabsList className="flex-wrap">
                  {tiers.map((tier) => (
                    <TabsTrigger key={tier.id} value={tier.id} className="gap-1.5">
                      {tier.label}
                      <Badge variant="muted" className="h-5 px-1.5">
                        {tier.providers.length}
                      </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tiers.map((tier) => (
                  <TabsContent key={tier.id} value={tier.id} data-provider-tier={tier.id}>
                    <ProviderTable providers={tier.providers} />
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
