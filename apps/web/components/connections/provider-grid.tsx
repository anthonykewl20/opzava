import { ProviderCard } from "@/components/connections/provider-card";
import type { ProviderConnectionTierView } from "@/lib/connections-state";

export interface ProviderGridProps {
  readonly tierId: ProviderConnectionTierView["id"];
  readonly tierLabel: string;
  readonly providers: ProviderConnectionTierView["providers"];
  readonly optimisticLeadProviderId: string | null;
  readonly onSetMainOrchestratorSuccess: (providerId: string) => void;
}

export function ProviderGrid({
  tierId,
  tierLabel,
  providers,
  optimisticLeadProviderId,
  onSetMainOrchestratorSuccess,
}: ProviderGridProps) {
  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <p className="font-medium">No model providers match</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Clear the search or refresh the gateway catalog.
        </p>
      </div>
    );
  }
  return (
    <ul
      role="list"
      aria-label={`${tierLabel} providers`}
      data-provider-tier={tierId}
      className="grid list-none grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-stretch gap-4"
    >
      {providers.map((provider) => (
        <li key={provider.id} className="flex min-w-0">
          <ProviderCard
            provider={provider}
            optimisticLeadProviderId={optimisticLeadProviderId}
            onSetMainOrchestratorSuccess={onSetMainOrchestratorSuccess}
          />
        </li>
      ))}
    </ul>
  );
}
