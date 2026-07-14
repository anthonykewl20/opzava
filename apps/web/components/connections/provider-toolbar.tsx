"use client";

import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProviderConnectionTierView } from "@/lib/connections-state";

export interface ProviderToolbarProps {
  readonly tiers: readonly ProviderConnectionTierView[];
  readonly query: string;
  readonly resultCount: number;
  readonly onQueryChange: (query: string) => void;
}

export function ProviderToolbar({
  tiers,
  query,
  resultCount,
  onQueryChange,
}: ProviderToolbarProps) {
  const searching = query.trim() !== "";
  const clearSearch = () => {
    onQueryChange("");
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus();
    });
  };
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {searching ? (
        <div className="flex h-10 items-center gap-2 text-sm" role="status">
          <span>{`${resultCount} ${resultCount === 1 ? "result" : "results"} for “${query.trim()}”`}</span>
          <span aria-hidden="true">·</span>
          <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>
            <X aria-hidden="true" className="size-3.5" /> Clear
          </Button>
        </div>
      ) : (
        <TabsList aria-label="Provider tiers" className="max-w-full overflow-x-auto">
          {tiers.map((tier) => {
            const connected = tier.providers.filter(
              (provider) => provider.status === "connected",
            ).length;
            const total = tier.providers.length;
            return (
              <TabsTrigger key={tier.id} value={tier.id}>
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
      )}
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <label htmlFor="provider-search" className="sr-only">
          Search providers
        </label>
        <Input
          id="provider-search"
          type="search"
          placeholder="Search providers"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
