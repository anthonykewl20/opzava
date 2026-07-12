"use client";

import {
  createContext,
  useCallback,
  useContext,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import type { ProviderConnectionView } from "@/lib/connections-state";

interface OrchestratorHostsRefreshContextValue {
  readonly isRefreshing: boolean;
  readonly refreshHosts: () => void;
}

const OrchestratorHostsRefreshContext =
  createContext<OrchestratorHostsRefreshContextValue | null>(null);

export function OrchestratorHostsRefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const refreshHosts = useCallback(() => {
    startRefresh(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <OrchestratorHostsRefreshContext.Provider value={{ isRefreshing, refreshHosts }}>
      {children}
    </OrchestratorHostsRefreshContext.Provider>
  );
}

export function useOrchestratorHostsRefresh() {
  const context = useContext(OrchestratorHostsRefreshContext);
  if (context === null) {
    throw new Error(
      "useOrchestratorHostsRefresh must be used within OrchestratorHostsRefreshProvider",
    );
  }

  return context;
}

export function GatewayHostsBadgesView({
  providers,
  isRefreshing,
}: {
  readonly providers: readonly ProviderConnectionView[];
  readonly isRefreshing: boolean;
}) {
  if (isRefreshing) {
    return (
      <div className="connections-actions" aria-busy="true">
        <span className="u-sr-only">Updating hosts…</span>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-32" />
      </div>
    );
  }

  const leads = providers.filter(
    (p) => p.status === "connected" && p.roleLabel === "Lead orchestrator",
  );
  const subagents = providers.filter((p) => p.status === "connected" && p.roleLabel === "Subagent");

  return (
    <div className="connections-actions">
      {leads.length === 0 ? (
        <span className="badge">No connected lead orchestrator</span>
      ) : (
        leads.map((p) => (
          <span className="badge" key={p.id}>
            <span className="u-sr-only">AI lead - </span>
            <span className="u-accent" aria-hidden="true">
              ✦
            </span>
            {p.label} · LEAD ORCHESTRATOR
          </span>
        ))
      )}
      {subagents.length === 0 ? (
        <span className="u-subtle">No connected subagent providers yet</span>
      ) : (
        subagents.map((p) => (
          <span className="badge" key={p.id}>
            {p.label} · SUBAGENT
          </span>
        ))
      )}
    </div>
  );
}

export function GatewayHostsBadges({
  providers,
}: {
  readonly providers: readonly ProviderConnectionView[];
}) {
  const { isRefreshing } = useOrchestratorHostsRefresh();

  return <GatewayHostsBadgesView providers={providers} isRefreshing={isRefreshing} />;
}
