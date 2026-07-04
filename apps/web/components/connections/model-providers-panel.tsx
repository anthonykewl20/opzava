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
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConnectionsPageData } from "@/lib/connections";
import {
  initialConnectionActionState,
  type ConnectionActionState,
} from "@/lib/connections-action-state";
import { cn } from "@/lib/utils";

type ProviderRow = ConnectionsPageData["providers"][number];

interface ModelProvidersPanelProps {
  readonly providers: readonly ProviderRow[];
  readonly summary: ConnectionsPageData["providerSummary"];
}

function providerSort(left: ProviderRow, right: ProviderRow): number {
  const leftConnected = left.status === "connected" ? 0 : 1;
  const rightConnected = right.status === "connected" ? 0 : 1;
  return leftConnected === rightConnected
    ? left.label.localeCompare(right.label)
    : leftConnected - rightConnected;
}

function providerAuthLabel(provider: ProviderRow): string {
  const hasDeviceFlow = provider.deviceFlowChoices.length > 0;
  const hasApiKey = provider.apiKeyChoices.length > 0;

  if (hasDeviceFlow && hasApiKey) {
    return "OAuth device-flow + API key";
  }

  if (hasDeviceFlow) {
    return "OAuth device-flow";
  }

  if (hasApiKey) {
    return "API key";
  }

  return "No live auth method";
}

function providerBadgeVariant(provider: ProviderRow): "success" | "warning" | "muted" {
  if (provider.status === "connected") {
    return "success";
  }

  if (provider.status === "pending" || provider.status === "needs_attention") {
    return "warning";
  }

  return "muted";
}

function connectChoice(provider: ProviderRow) {
  return provider.apiKeyChoices[0] ?? provider.deviceFlowChoices[0] ?? null;
}

function tabProviders(
  providers: readonly ProviderRow[],
  tab: "connected" | "available",
): readonly ProviderRow[] {
  if (tab === "connected") {
    return providers.filter((provider) => provider.status === "connected");
  }

  return providers.filter((provider) => provider.status !== "connected");
}

function filterProviders(providers: readonly ProviderRow[], query: string): readonly ProviderRow[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return providers;
  }

  return providers.filter((provider) =>
    [provider.label, provider.vendor, provider.model, provider.id]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
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
      {pending ? <span className="sb-spinner sb-spinner--sm" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}

function ProviderActionResult({
  state,
  provider,
}: {
  readonly state: ConnectionActionState;
  readonly provider: ProviderRow;
}) {
  if (state.status === "idle" || state.providerId !== provider.id || state.message === null) {
    return null;
  }

  const adminRequired = state.code === "provisioning.openclawAdmin.operatorAdminRequired";
  const success = state.status === "success";

  return (
    <div
      className={cn(
        "sb-alert mt-2",
        success
          ? "sb-alert--success"
          : adminRequired
            ? "sb-alert--warning"
            : "sb-alert--destructive",
      )}
      role={success ? "status" : "alert"}
    >
      <span className="ico" aria-hidden="true">
        {success ? "OK" : "!"}
      </span>
      <div className="sb-alert-title">
        {success
          ? "Connection updated"
          : adminRequired
            ? "Admin device required"
            : "Connection failed"}
      </div>
      <div className="sb-alert-desc">{state.message}</div>
    </div>
  );
}

function ProviderBacks({ provider }: { readonly provider: ProviderRow }) {
  if (provider.roleLabel === "Lead orchestrator") {
    return (
      <span className="u-row" style={{ gap: "6px" }}>
        <span className="u-sr-only">AI lead - </span>
        <span
          className="u-accent"
          aria-hidden="true"
          style={{ fontSize: "var(--text-base)", lineHeight: 1 }}
        >
          *
        </span>
        Lead orchestrator
      </span>
    );
  }

  return (
    <span>
      Subagent <span className="u-subtle">({provider.whenToUse})</span>
    </span>
  );
}

function ProviderConnectDialog({ provider }: { readonly provider: ProviderRow }) {
  const router = useRouter();
  const choice = connectChoice(provider);
  const [apiKeyState, apiKeyAction] = useActionState(
    connectModelProviderApiKeyStateAction,
    initialConnectionActionState,
  );
  const [deviceState, deviceAction] = useActionState(
    startModelProviderDeviceFlowStateAction,
    initialConnectionActionState,
  );
  const state = choice?.mode === "device-flow" ? deviceState : apiKeyState;

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  if (choice === null) {
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
            Auth method from the live gateway catalog: {choice.label} (
            {choice.mode === "api-key" ? "API key" : "OAuth device-flow"}).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-[var(--surface-2)] p-3 text-sm">
            <div className="font-medium text-foreground">{provider.model}</div>
            <div className="mt-1 text-muted-foreground">
              {provider.message ?? provider.whenToUse}
            </div>
          </div>

          {choice.mode === "api-key" ? (
            <form action={apiKeyAction} className="grid gap-4">
              <input type="hidden" name="providerId" value={provider.id} />
              <input type="hidden" name="authChoiceId" value={choice.id} />
              <div className="field">
                <Label htmlFor={`${provider.id}-${choice.id}-dialog-key`}>API key</Label>
                <Input
                  id={`${provider.id}-${choice.id}-dialog-key`}
                  name="apiKey"
                  type="password"
                  autoComplete="off"
                  required
                  placeholder="Paste key once"
                />
                <p className="hint">
                  The key is sent to the provisioning worker and written inside Opzava Gateway.
                </p>
              </div>
              <ProviderActionResult state={apiKeyState} provider={provider} />
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
          ) : (
            <form action={deviceAction} className="grid gap-4">
              <input type="hidden" name="providerId" value={provider.id} />
              <input type="hidden" name="authChoiceId" value={choice.id} />
              <div className="sb-alert sb-alert--warning" role="status">
                <span className="ico" aria-hidden="true">
                  !
                </span>
                <div className="sb-alert-title">Interactive OAuth required</div>
                <div className="sb-alert-desc">
                  This provider uses the gateway's interactive device-flow path. The worker will
                  return the real gateway response instead of pretending to connect.
                </div>
              </div>
              <ProviderActionResult state={deviceState} provider={provider} />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
                <DialogSubmitButton pendingLabel="Starting...">
                  Start device flow
                </DialogSubmitButton>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProviderRowView({ provider }: { readonly provider: ProviderRow }) {
  return (
    <li className="connections-provider-row">
      <div className="min-w-0">
        <div className="connections-provider-name">{provider.label}</div>
        <div className="connections-provider-sub">
          {provider.vendor} - <span className="u-mono">{provider.model}</span>
        </div>
      </div>

      <div className="connections-provider-meta">
        <div className="connections-provider-meta-row">
          <Badge variant={providerBadgeVariant(provider)}>
            <span className={provider.statusClassName} aria-hidden="true" />
            {provider.statusLabel}
          </Badge>
          <Badge variant="outline">{providerAuthLabel(provider)}</Badge>
        </div>
        <ProviderBacks provider={provider} />
        {provider.accountLabel === null ? null : (
          <span className="u-subtle">{provider.accountLabel}</span>
        )}
        {provider.usageLabel === null ? null : <span>{provider.usageLabel}</span>}
        {provider.message === null ? null : <span className="hint">{provider.message}</span>}
      </div>

      <div className="connections-provider-state">
        <div className="connections-provider-actions">
          <ProviderConnectDialog provider={provider} />
          {provider.status === "connected" ? (
            <form action={disconnectModelProviderAction}>
              <input type="hidden" name="providerId" value={provider.id} />
              <Button type="submit" variant="ghost" size="sm">
                Disconnect
              </Button>
            </form>
          ) : null}
        </div>
        {provider.pendingFlow === null ? null : (
          <DeviceFlowPoller
            flowId={provider.pendingFlow.flowId}
            verificationUri={provider.pendingFlow.verificationUri}
            userCode={provider.pendingFlow.userCode}
            intervalSeconds={provider.pendingFlow.intervalSeconds}
            expiresAt={provider.pendingFlow.expiresAt}
          />
        )}
      </div>
    </li>
  );
}

function ProviderList({
  providers,
  emptyTitle,
  emptyDescription,
}: {
  readonly providers: readonly ProviderRow[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}) {
  if (providers.length === 0) {
    return (
      <div className="empty connections-empty">
        <p className="empty-title">{emptyTitle}</p>
        <p className="empty-desc">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <ul className="connections-provider-list" aria-label="Model provider connections">
      {providers.map((provider) => (
        <ProviderRowView provider={provider} key={provider.id} />
      ))}
    </ul>
  );
}

export function ModelProvidersPanel({ providers, summary }: ModelProvidersPanelProps) {
  const [query, setQuery] = useState("");
  const sortedProviders = useMemo(() => [...providers].sort(providerSort), [providers]);
  const connected = useMemo(
    () => filterProviders(tabProviders(sortedProviders, "connected"), query),
    [query, sortedProviders],
  );
  const available = useMemo(
    () => filterProviders(tabProviders(sortedProviders, "available"), query),
    [query, sortedProviders],
  );

  return (
    <section aria-labelledby="providers-lbl">
      <div className="connections-provider-head">
        <div>
          <div className="section-label" id="providers-lbl" style={{ padding: 0 }}>
            Model providers
          </div>
          <h2>Provider connection status</h2>
          <p className="connections-provider-count">
            Model providers - {summary.connected} connected / {summary.available} available.
          </p>
          <p className="hint">
            Connected providers can route models now; available providers need credentials.
          </p>
        </div>
        <Badge variant={summary.needsAttention > 0 ? "warning" : "secondary"}>
          {summary.needsAttention} need attention - {summary.pending} pending
        </Badge>
      </div>

      {providers.length === 0 ? (
        <div className="empty connections-empty">
          <p className="empty-title">Provider catalog unavailable</p>
          <p className="empty-desc">
            Configure the provisioning worker to read the live Opzava Gateway auth-choice catalog.
          </p>
        </div>
      ) : (
        <Tabs
          defaultValue={summary.connected > 0 ? "connected" : "available"}
          className="connections-provider-tabs"
        >
          <div className="connections-provider-toolbar">
            <TabsList aria-label="Model provider groups">
              <TabsTrigger value="connected">Connected ({summary.connected})</TabsTrigger>
              <TabsTrigger value="available">Available ({summary.available})</TabsTrigger>
            </TabsList>
            <div className="connections-provider-search">
              <Label className="u-sr-only" htmlFor="connections-provider-search">
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
          <TabsContent value="connected">
            <ProviderList
              providers={connected}
              emptyTitle="No connected model providers"
              emptyDescription="Connect a provider from Available to make it usable by the gateway."
            />
          </TabsContent>
          <TabsContent value="available">
            <ProviderList
              providers={available}
              emptyTitle="No available providers match"
              emptyDescription="Clear search or refresh the gateway catalog."
            />
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
