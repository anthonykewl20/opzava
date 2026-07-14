"use client";

import { useCallback, useId, useRef, useState } from "react";

import { DeviceFlowPoller } from "@/components/connections/device-flow-poller";
import { ProviderConnectDialog } from "@/components/connections/provider-connect-dialog";
import { DisconnectConfirm } from "@/components/connections/provider-disconnect-confirm";
import { ProviderLogo } from "@/components/connections/provider-logo";
import { SetMainOrchestratorConfirm } from "@/components/connections/provider-set-main-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProviderConnectionView } from "@/lib/connections-state";
import {
  actionLabel,
  authHealthLabel,
  connectChoice,
  displayStatusLabel,
  MAX_VISIBLE_AUTH_BADGES,
  providerAuthBadges,
  providerCardMeta,
  providerModelParts,
  providerSubLine,
  statusBadgeVariant,
  statusGuidance,
} from "@/lib/provider-presentation";
import { cn } from "@/lib/utils";

export function StatusDot({ status }: { readonly status: ProviderConnectionView["status"] }) {
  if (status === "not_connected") return null;
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

export function ProviderBacks({
  provider,
  isLeadOrchestrator,
}: {
  readonly provider: ProviderConnectionView;
  readonly isLeadOrchestrator: boolean;
}) {
  if (provider.status !== "connected") return null;
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

export function ProviderConnectedActions({
  provider,
  canSetMainOrchestrator,
  isLeadOrchestrator,
  onSetMainOrchestratorSuccess,
}: {
  readonly provider: ProviderConnectionView;
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
      if (!nextOpen) restoreRowActionTriggerFocus();
    },
    [restoreRowActionTriggerFocus],
  );
  const handleSetMainOpenChange = useCallback(
    (nextOpen: boolean) => {
      setSetMainOpen(nextOpen);
      if (!nextOpen) restoreRowActionTriggerFocus();
    },
    [restoreRowActionTriggerFocus],
  );
  const handleDisconnectOpenChange = useCallback(
    (nextOpen: boolean) => {
      setDisconnectOpen(nextOpen);
      if (!nextOpen) restoreRowActionTriggerFocus();
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
      <div className="flex w-full items-center gap-2">
        <Button
          type="button"
          variant={provider.status === "connected" ? "secondary" : "default"}
          className="flex-1"
          onClick={() => setManageOpen(true)}
        >
          {actionLabel(provider)}
        </Button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Row actions for ${provider.label}`}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ⋮
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canSetMainOrchestrator ? (
              <>
                <DropdownMenuItem
                  onSelect={(event) => openDialogFromMenu(event, () => setSetMainOpen(true))}
                >
                  Set as main orchestrator
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
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
      {isLeadOrchestrator ? <span className="sr-only">Current main orchestrator</span> : null}
    </>
  );
}

function OverflowBadge({
  count,
  labels,
  noun,
}: {
  readonly count: number;
  readonly labels: readonly string[];
  readonly noun: string;
}) {
  const ariaLabel = `${count} more ${noun}: ${labels.join(", ")}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="muted" tabIndex={0} aria-label={ariaLabel}>
          +{count}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{labels.join(", ")}</TooltipContent>
    </Tooltip>
  );
}

export interface ProviderCardProps {
  readonly provider: ProviderConnectionView;
  readonly optimisticLeadProviderId: string | null;
  readonly onSetMainOrchestratorSuccess: (providerId: string) => void;
}

export function ProviderCard({
  provider,
  optimisticLeadProviderId,
  onSetMainOrchestratorSuccess,
}: ProviderCardProps) {
  const headingId = useId();
  const models = providerModelParts(provider);
  const allModelIds = (provider.enabledModels ?? provider.models).map((model) => model.id);
  const visibleModels = [models.first, ...models.rest].filter(
    (model): model is string => model !== null,
  );
  const hiddenModels = allModelIds.slice(3);
  const catalogOnlyCount = Math.max(
    0,
    (provider.catalogModelCount ?? provider.catalogModels?.length ?? 0) - allModelIds.length,
  );
  const authBadges = providerAuthBadges(provider);
  const visibleAuthBadges = authBadges.slice(0, MAX_VISIBLE_AUTH_BADGES);
  const overflowAuthBadges = authBadges.slice(MAX_VISIBLE_AUTH_BADGES);
  const subLine = providerSubLine(provider);
  const meta = providerCardMeta(provider);
  const health = authHealthLabel(provider);
  const healthSignal =
    provider.status === "connected" &&
    ["expiring", "expired", "missing"].includes(provider.authHealth ?? "")
      ? health
      : null;
  const connectedMeta = [meta, healthSignal].filter(Boolean).join(" · ") || null;
  const isLeadOrchestrator =
    optimisticLeadProviderId === null
      ? provider.roleLabel === "Lead orchestrator"
      : provider.id === optimisticLeadProviderId;
  const canSetMainOrchestrator = provider.status === "connected" && !isLeadOrchestrator;
  const hasModels = visibleModels.length > 0 || provider.id === "openrouter";
  const noLiveAuth = connectChoice(provider) === null;
  // A pending status usually carries a browser-local device flow (connections-state forces pending
  // when one exists), but the gateway can also report pending for a flow started elsewhere (CLI,
  // another session). That card renders guidance instead of a poller — it must never crash the page.
  const pendingFlow = provider.pendingFlow;

  return (
    <TooltipProvider>
      <article
        data-provider-id={provider.id}
        aria-labelledby={headingId}
        className="flex h-full w-full min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
      >
        <header className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <ProviderLogo providerId={provider.id} label={provider.label} />
          <div className="min-w-0 flex-auto">
            <h2 id={headingId} className="text-sm font-semibold leading-snug">
              {provider.label}
            </h2>
            {subLine === null ? null : (
              <p className="mt-px text-xs leading-snug text-muted-foreground">{subLine}</p>
            )}
          </div>
          <Badge
            variant={statusBadgeVariant(provider)}
            data-provider-status={provider.status}
            className="ml-auto shrink-0 gap-1.5"
          >
            <StatusDot status={provider.status} />
            {displayStatusLabel(provider)}
          </Badge>
        </header>

        <div className="grid min-w-0 gap-3">
          {provider.status === "connected" ? (
            <div className="flex">
              <ProviderBacks provider={provider} isLeadOrchestrator={isLeadOrchestrator} />
            </div>
          ) : null}
          {hasModels ? (
            <div className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Models
              </span>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {visibleModels.map((model) => (
                  <Badge
                    key={model}
                    variant="outline"
                    className="max-w-full font-mono"
                    data-model={model}
                  >
                    {model}
                  </Badge>
                ))}
                {provider.id === "openrouter" && visibleModels.length === 0 ? (
                  <Badge variant="outline">Routes many</Badge>
                ) : null}
                {models.more > 0 ? (
                  <OverflowBadge count={models.more} labels={hiddenModels} noun="models" />
                ) : null}
              </div>
              {catalogOnlyCount === 0 ? null : (
                <span className="text-xs text-muted-foreground">
                  +{catalogOnlyCount} in catalog
                </span>
              )}
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Auth methods
            </span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {visibleAuthBadges.map((label) => (
                <Badge
                  key={`${provider.id}-${label}`}
                  variant={label === "No live auth method" ? "warning" : "outline"}
                  className={label === "No live auth method" ? undefined : "text-muted-foreground"}
                >
                  {label}
                </Badge>
              ))}
              {overflowAuthBadges.length > 0 ? (
                <OverflowBadge
                  count={overflowAuthBadges.length}
                  labels={overflowAuthBadges}
                  noun="auth methods"
                />
              ) : null}
            </div>
          </div>
          {provider.status === "needs_attention" ? (
            <div
              role="alert"
              className="rounded-md bg-[var(--warning-soft)] px-3 py-2 text-xs leading-snug text-[var(--warning)]"
            >
              {provider.message ?? statusGuidance(provider)}
            </div>
          ) : null}
          {provider.status === "pending" ? (
            <div className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-xs leading-snug text-muted-foreground">
              {pendingFlow !== null ? (
                <DeviceFlowPoller
                  flowId={pendingFlow.flowId}
                  verificationUri={pendingFlow.verificationUri}
                  userCode={pendingFlow.userCode}
                  codePending={pendingFlow.codePending}
                  intervalSeconds={pendingFlow.intervalSeconds}
                  expiresAt={pendingFlow.expiresAt}
                />
              ) : (
                statusGuidance(provider)
              )}
            </div>
          ) : null}
          {provider.status === "connected" && connectedMeta !== null ? (
            <p className="text-xs leading-snug text-muted-foreground">{connectedMeta}</p>
          ) : null}
        </div>

        <footer className="mt-auto pt-1">
          {provider.status === "connected" || provider.status === "needs_attention" ? (
            <ProviderConnectedActions
              provider={provider}
              canSetMainOrchestrator={canSetMainOrchestrator}
              isLeadOrchestrator={isLeadOrchestrator}
              onSetMainOrchestratorSuccess={onSetMainOrchestratorSuccess}
            />
          ) : provider.status === "pending" ? (
            <div className="text-xs text-muted-foreground">
              {/* DESCOPE(pending-cancel-authorisation): P8 PRD-013 omits device-flow cancellation until a worker cancel mutation exists; the poller expires codes on its own. */}
              Authorization continues while this page is open.
            </div>
          ) : noLiveAuth ? (
            <div className="grid gap-2">
              <Button type="button" disabled className="w-full">
                Connect
              </Button>
              <p className="text-xs text-muted-foreground">
                No live auth method. Refresh the gateway catalog after enabling this provider&apos;s
                auth choice.
              </p>
            </div>
          ) : (
            <ProviderConnectDialog
              provider={provider}
              trigger={
                <Button type="button" className="w-full">
                  Connect
                </Button>
              }
            />
          )}
        </footer>
      </article>
    </TooltipProvider>
  );
}
