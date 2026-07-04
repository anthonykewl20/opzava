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

function connectChoice(provider: ProviderRow) {
  return provider.apiKeyChoices[0] ?? provider.deviceFlowChoices[0] ?? null;
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
      provider.model,
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

  const ordered = ["OAuth", "Device", "API key", "Setup token"].filter((label) =>
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

// Provider sub-line: the live gateway `vendor` (when it adds information beyond the label) plus any
// folded CLI runtime hint — keeps `vendor` live data on-screen and mirrors the mockup sub-line
// ("Gemini · incl. Gemini CLI runtime"). Null when there is nothing meaningful to add.
function providerSubLine(provider: ProviderRow): string | null {
  const vendor = provider.vendor.trim();
  const showVendor = vendor !== "" && vendor.toLowerCase() !== provider.label.trim().toLowerCase();
  return [showVendor ? vendor : null, runtimeHint(provider)]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ")
    .trim() || null;
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
  // Role is only real once a provider is connected (an unconnected provider is not yet a subagent);
  // showing it otherwise is misleading chrome. Matches the mockup (badges only connected rows).
  if (provider.status !== "connected") {
    return null;
  }

  if (provider.roleLabel === "Lead orchestrator") {
    return (
      <Badge variant="secondary" title="Coordinator agent">
        <span className="u-sr-only">AI lead - </span>
        <span
          className="u-accent"
          aria-hidden="true"
          style={{ fontSize: "var(--text-sm)", lineHeight: 1 }}
        >
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
  const choice = connectChoice(provider);
  // A folded child (e.g. codex under openai) owns its own auth choice; the connect must target the
  // choice's OWN provider id, not the display/group id, or the gateway rejects it (review MED-2).
  const connectProviderId = choice?.providerId ?? provider.id;
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
              <input type="hidden" name="providerId" value={connectProviderId} />
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
              <ProviderActionResult
                state={apiKeyState}
                provider={provider}
                matchProviderId={connectProviderId}
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
          ) : (
            <form action={deviceAction} className="grid gap-4">
              <input type="hidden" name="providerId" value={connectProviderId} />
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
              <ProviderActionResult
                state={deviceState}
                provider={provider}
                matchProviderId={connectProviderId}
              />
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
  const models = providerModelParts(provider);
  const meta = statusMeta(provider);
  const subLine = providerSubLine(provider);

  return (
    <tr data-provider-id={provider.id}>
      <td data-label="Provider">
        <div
          className="u-row connections-provider-title"
          style={{ gap: "6px", fontWeight: "var(--fw-medium)", lineHeight: "var(--lh-snug)" }}
        >
          <span>{provider.label}</span>
          <ProviderBacks provider={provider} />
        </div>
        {subLine === null ? null : (
          <div className="u-subtle connections-provider-sub">{subLine}</div>
        )}
      </td>
      <td data-label="Auth">
        <div className="connections-provider-badges">
          {providerAuthBadges(provider).map((label) => (
            <Badge
              variant={label === "No live auth method" ? "muted" : "outline"}
              key={`${provider.id}-${label}`}
            >
              {label}
            </Badge>
          ))}
        </div>
      </td>
      <td data-label="Models">
        {models.first === null ? (
          <span className="u-subtle">
            {provider.id === "openrouter" ? "Routes many" : <span>&mdash;</span>}
          </span>
        ) : (
          <span>
            <span className="u-mono">{models.first}</span>
            {models.rest.length === 0 && models.more === 0 ? null : (
              <span className="u-subtle">
                {" "}
                · {models.rest.join(" · ")}
                {models.more > 0 ? ` · +${models.more} more` : ""}
              </span>
            )}
          </span>
        )}
      </td>
      <td data-label="Status">
        <span
          className={cn(
            "connections-provider-status",
            provider.status === "not_connected" ? "u-subtle" : null,
          )}
        >
          {provider.status === "not_connected" ? null : (
            <span className={provider.statusClassName} aria-hidden="true" />
          )}
          <span>{provider.statusLabel}</span>
          {meta.length === 0 ? null : <span className="u-subtle">· {meta.join(" · ")}</span>}
        </span>
        {provider.accountLabel === null ? null : (
          <div className="u-subtle connections-provider-sub">{provider.accountLabel}</div>
        )}
        {provider.message === null ? null : (
          <div className="hint connections-provider-sub">{provider.message}</div>
        )}
      </td>
      <td data-label="Actions" className="u-right">
        <div className="connections-provider-actions">
          <ProviderConnectDialog provider={provider} />
          {provider.status === "connected" ? (
            <form action={disconnectModelProviderAction}>
              <input type="hidden" name="providerId" value={provider.connectionProviderId} />
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
      </td>
    </tr>
  );
}

function ProviderTable({
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
    <div className="card connections-provider-table-card">
      <table className="table table-compact table-cards connections-provider-table">
        <caption className="u-sr-only">
          LLM model providers the gateway can route to, with folded CLI runtimes, authentication
          methods, current models, live connection status, and actions.
        </caption>
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Auth</th>
            <th scope="col">Models</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="u-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => (
            <ProviderRowView provider={provider} key={provider.id} />
          ))}
        </tbody>
      </table>
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
        <div>
          <div className="connections-provider-toolbar">
            <span className="u-subtle connections-provider-hint">
              Canonical LLM providers the gateway can route to - auth order OAuth to API key
            </span>
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
          <ProviderTable
            providers={filteredProviders}
            emptyTitle="No model providers match"
            emptyDescription="Clear search or refresh the gateway catalog."
          />
        </div>
      )}
    </section>
  );
}
