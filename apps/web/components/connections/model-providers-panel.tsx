"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrchestratorDelegationState } from "@opzava/ports";

import { ProviderGrid } from "@/components/connections/provider-grid";
import { ProviderToolbar } from "@/components/connections/provider-toolbar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { ConnectionsPageData } from "@/lib/connections";
import { groupProviderConnectionsByTier } from "@/lib/connections-state";
import { filterProviders, providerSort } from "@/lib/provider-presentation";

type ProviderRow = ConnectionsPageData["providers"][number];

interface ModelProvidersPanelProps {
  readonly gatewayStatus: ConnectionsPageData["snapshot"]["gateway"]["status"];
  readonly providers: readonly ProviderRow[];
  readonly summary: ConnectionsPageData["providerSummary"];
  readonly orchestratorReconcile: OrchestratorDelegationState["reconcile"];
}

const orchestratorReconcilePollIntervalMs = 5_000;

function OrchestratorReconcileNotice({
  reconcile,
}: {
  readonly reconcile: OrchestratorDelegationState["reconcile"];
}) {
  if (reconcile.status === "idle") return null;
  if (reconcile.status === "running") {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
        role="status"
      >
        <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
        <span>Re-electing the main orchestrator - this can take a minute.</span>
      </div>
    );
  }
  const recovery =
    reconcile.reason === "disconnect"
      ? `The main orchestrator may still point to a disconnected provider. Set another connected provider as main, or reconnect ${reconcile.providerId ?? "the provider"} before using Ask Admin.`
      : "The gateway primary and main orchestrator may disagree. Set a connected provider as main before using Ask Admin.";
  return (
    <div
      className="grid gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
      role="alert"
    >
      <p className="font-medium">Main orchestrator re-election failed</p>
      <p>{recovery}</p>
      {reconcile.message === undefined ? null : (
        <p className="text-muted-foreground">{reconcile.message}</p>
      )}
    </div>
  );
}

export function ModelProvidersPanel({
  gatewayStatus,
  providers,
  summary,
  orchestratorReconcile,
}: ModelProvidersPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTier, setActiveTier] = useState<string | undefined>(undefined);
  const [optimisticLeadProviderId, setOptimisticLeadProviderId] = useState<string | null>(null);
  const providersAtOptimisticSetRef = useRef<readonly ProviderRow[] | null>(null);
  const sortedProviders = useMemo(() => [...providers].sort(providerSort), [providers]);
  const filteredProviders = useMemo(
    () => filterProviders(sortedProviders, query),
    [query, sortedProviders],
  );
  const tiers = useMemo(() => groupProviderConnectionsByTier(sortedProviders), [sortedProviders]);
  const filteredTiers = useMemo(
    () => groupProviderConnectionsByTier(filteredProviders),
    [filteredProviders],
  );
  const searchActive = query.trim() !== "";
  const defaultTier = tiers[0]?.id ?? "frontier";
  const selectedTier = activeTier ?? defaultTier;

  useEffect(() => {
    if (orchestratorReconcile.status !== "running") return;
    const intervalId = window.setInterval(
      () => router.refresh(),
      orchestratorReconcilePollIntervalMs,
    );
    return () => window.clearInterval(intervalId);
  }, [orchestratorReconcile.status, router]);

  const handleSetMainOrchestratorSuccess = useCallback(
    (providerId: string) => {
      providersAtOptimisticSetRef.current = providers;
      setOptimisticLeadProviderId(providerId);
    },
    [providers],
  );
  useEffect(() => {
    if (optimisticLeadProviderId === null) return;
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

  const connectedProviders = sortedProviders.filter((provider) => provider.status === "connected");
  const leadProvider = connectedProviders.find((provider) =>
    optimisticLeadProviderId === null
      ? provider.roleLabel === "Lead orchestrator"
      : provider.id === optimisticLeadProviderId,
  );
  const subagents = connectedProviders.filter((provider) => provider.id !== leadProvider?.id);

  return (
    <div className="grid gap-4">
      <OrchestratorReconcileNotice reconcile={orchestratorReconcile} />
      {connectedProviders.length >= 2 && leadProvider !== undefined ? (
        <div className="banner banner-info" role="status">
          <span aria-hidden="true" className="text-[var(--accent)]">
            ✦
          </span>
          <span>
            <strong>{leadProvider.label}</strong> is the main orchestrator.{" "}
            {subagents.map((provider) => provider.label).join(", ")}{" "}
            {subagents.length === 1 ? "runs" : "run"} as subagent{subagents.length === 1 ? "" : "s"}
            .
          </span>
        </div>
      ) : null}
      {summary.needsAttention + summary.pending > 0 ? (
        <div className="banner banner-warning" role="alert">
          {summary.needsAttention} need attention · {summary.pending} pending
        </div>
      ) : null}
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
        <Tabs value={selectedTier} onValueChange={setActiveTier} className="gap-4">
          <ProviderToolbar
            tiers={tiers}
            query={query}
            resultCount={filteredProviders.length}
            onQueryChange={setQuery}
          />
          {searchActive ? (
            filteredTiers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
                <p className="font-medium">No model providers match</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clear the search or refresh the gateway catalog.
                </p>
              </div>
            ) : (
              <div className="grid gap-6">
                {filteredTiers.map((tier) => (
                  <ProviderGrid
                    key={tier.id}
                    tierId={tier.id}
                    tierLabel={tier.label}
                    providers={tier.providers}
                    optimisticLeadProviderId={optimisticLeadProviderId}
                    onSetMainOrchestratorSuccess={handleSetMainOrchestratorSuccess}
                  />
                ))}
              </div>
            )
          ) : (
            tiers.map((tier) => (
              <TabsContent key={tier.id} value={tier.id}>
                <ProviderGrid
                  tierId={tier.id}
                  tierLabel={tier.label}
                  providers={tier.providers}
                  optimisticLeadProviderId={optimisticLeadProviderId}
                  onSetMainOrchestratorSuccess={handleSetMainOrchestratorSuccess}
                />
              </TabsContent>
            ))
          )}
        </Tabs>
      )}
    </div>
  );
}
