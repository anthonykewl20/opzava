import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleAlert,
  CircleHelp,
  GitBranch,
  Plug,
  Server,
} from "lucide-react";
import Link from "next/link";

import { relativeTime } from "@/app/(app)/connections/_lib/page-data";
import { HealthCheckSubmitButton } from "@/components/connections/health-check-submit";
import { ProviderBrandIcon } from "@/components/connections/provider-brand-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  overviewHealthGroups,
  overviewIntegrations,
  overviewProviders,
  type OverviewHealthGroup,
  type OverviewHealthStatus,
} from "@/lib/connections-overview";
import { openclawHealthSummary } from "@/lib/connections-state";
import type { ConnectionsPageData } from "@/lib/connections";

import { HealthStatusBreakdown } from "./health-status-breakdown";

interface ConnectionsOverviewProps {
  readonly data: ConnectionsPageData;
  readonly refreshAction: () => Promise<void>;
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function healthHeadline(
  status: OverviewHealthStatus,
  attention: number,
  gatewayUnavailable: boolean,
): string {
  if (status === "attention")
    return `${plural(attention, "component")} ${attention === 1 ? "needs" : "need"} attention`;
  if (status === "unknown" && gatewayUnavailable) return "OpenClaw unreachable";
  if (status === "unknown") return "System health is not fully checked";
  return "All systems healthy";
}

function inspectionActionLabel(
  kind: ConnectionsPageData["snapshot"]["openclawHealth"]["components"][number]["kind"],
): string {
  if (kind === "channel") return "Inspect channel";
  if (kind === "agent") return "Inspect agent";
  return "Inspect component";
}

function healthDescription(input: {
  readonly healthy: number;
  readonly attention: number;
  readonly notChecked: number;
}): string {
  return [
    `${plural(input.healthy, "component")} healthy.`,
    `${plural(input.attention, "component")} ${input.attention === 1 ? "needs" : "need"} attention.`,
    `${plural(input.notChecked, "component")} not checked.`,
  ].join(" ");
}

function groupBadgeVariant(status: OverviewHealthStatus): "success" | "warning" | "muted" {
  if (status === "healthy") return "success";
  if (status === "attention") return "warning";
  return "muted";
}

function GroupStatusIcon({ status }: { readonly status: OverviewHealthStatus }) {
  if (status === "healthy") return <Check aria-hidden="true" />;
  if (status === "attention") return <CircleAlert aria-hidden="true" />;
  return <CircleHelp aria-hidden="true" />;
}

function HealthGroupLink({ group }: { readonly group: OverviewHealthGroup }) {
  const emptyStatus =
    group.id === "channels"
      ? "No channels reported"
      : group.id === "agents"
        ? "No agents reported"
        : "No system components reported";
  const accessibleStatus = `${group.healthy} healthy, ${group.attention} ${group.attention === 1 ? "needs" : "need"} attention, ${group.notChecked} not checked`;
  const visibleStatus =
    group.total === 0
      ? emptyStatus
      : [
          group.healthy > 0 ? `${group.healthy} healthy` : null,
          group.attention > 0
            ? `${group.attention} ${group.attention === 1 ? "needs" : "need"} attention`
            : null,
          group.notChecked > 0 ? `${group.notChecked} not checked` : null,
        ]
          .filter((value) => value !== null)
          .join(" · ");

  return (
    <Button
      asChild
      variant="outline"
      className="h-auto min-h-11 min-w-0 w-full justify-start whitespace-normal rounded-full bg-transparent px-3 py-2 text-left sm:min-h-9 sm:py-1.5"
    >
      <Link
        href={group.href}
        data-health-group={group.id}
        aria-label={`${group.label}: ${group.total === 0 ? emptyStatus : accessibleStatus}`}
      >
        <Badge variant={groupBadgeVariant(group.status)} className="size-5 justify-center p-0">
          <GroupStatusIcon status={group.status} />
        </Badge>
        <span>{group.label}</span>
        <span className="ml-auto min-w-0 text-right leading-tight tabular-nums text-muted-foreground">
          {visibleStatus}
        </span>
      </Link>
    </Button>
  );
}

function SystemHealthPanel({ data, refreshAction }: ConnectionsOverviewProps) {
  const health = data.snapshot.openclawHealth;
  const summary = openclawHealthSummary(health);
  const groups = overviewHealthGroups(health.components);
  const affected = health.components.filter((component) => component.status === "attention");
  const firstAffected = affected[0] ?? null;
  const remainingAffected = Math.max(0, affected.length - 1);
  const gatewayUnavailable = data.snapshot.gateway.status === "unavailable";
  const groupsNotChecked = groups.filter((group) => group.notChecked > 0);
  const showLastKnown = summary.notChecked > 0 && health.lastKnownHealthy !== null;

  return (
    <section aria-labelledby="system-health-title">
      <Card
        data-health-status={summary.status}
        data-health-attention-count={summary.attention}
        data-health-checked-at={health.checkedAt ?? "not-checked"}
      >
        <CardHeader className="gap-3 border-b sm:grid-cols-[1fr_auto]">
          <h2 id="system-health-title" className="text-lg font-semibold leading-none">
            System health
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground sm:text-right">
              {health.checkedAt === null
                ? "Not checked"
                : `Checked ${relativeTime(health.checkedAt)}`}
            </p>
            <form action={refreshAction} aria-describedby="system-health-check-copy">
              <span id="system-health-check-copy" className="sr-only">
                Runs a live OpenClaw health probe.
              </span>
              <HealthCheckSubmitButton
                describedBy="system-health-check-copy"
                idleLabel="Refresh"
                pendingLabel="Refreshing..."
              />
            </form>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div>
            <p className="text-2xl font-semibold tracking-tight">
              {healthHeadline(summary.status, summary.attention, gatewayUnavailable)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{healthDescription(summary)}</p>
          </div>

          <HealthStatusBreakdown
            healthy={summary.healthy}
            attention={summary.attention}
            notChecked={summary.notChecked}
          />

          {firstAffected !== null ? (
            <Alert
              variant="warning"
              className="grid-cols-[1.25rem_minmax(0,1fr)] sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]"
            >
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
                aria-hidden="true"
              />
              <AlertTitle>{firstAffected.label} needs attention</AlertTitle>
              <AlertDescription className="grid gap-0.5">
                <p>{firstAffected.detail ?? "A live health probe reported a problem."}</p>
                <p>No repair metadata is available for this component.</p>
                {remainingAffected > 0 ? (
                  <p>
                    and {plural(remainingAffected, "more component")}{" "}
                    {remainingAffected === 1 ? "needs" : "need"} attention.
                  </p>
                ) : null}
              </AlertDescription>
              <Button
                asChild
                variant="outline"
                className="col-start-2 mt-2 h-11 w-full shrink-0 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:h-9 sm:w-auto sm:self-center"
              >
                <Link href="/connections/system">
                  {inspectionActionLabel(firstAffected.kind)} <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </Alert>
          ) : null}

          {summary.notChecked > 0 ? (
            <Alert
              data-health-missing-guidance="true"
              className="border-dashed border-[var(--border-strong)] bg-muted/40"
            >
              <CircleHelp className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
              <AlertTitle>{plural(summary.notChecked, "component")} not checked</AlertTitle>
              <AlertDescription className="grid gap-2">
                <p>
                  {gatewayUnavailable
                    ? "The Gateway is unavailable. OpenClaw will retry automatically. "
                    : "One or more live probes returned no result. "}
                  No live result means unknown, not failed. Refresh retries the missing probe.
                </p>
                <ul className="grid gap-1">
                  {groupsNotChecked.map((group) => (
                    <li key={group.id}>
                      <Link className="font-medium text-primary hover:underline" href={group.href}>
                        {group.label}: {group.notChecked} not checked
                      </Link>
                    </li>
                  ))}
                </ul>
                {showLastKnown && health.lastKnownHealthy !== null ? (
                  <p data-last-known-checked-at={health.lastKnownHealthy.checkedAt}>
                    <strong>Last known fully healthy snapshot:</strong>{" "}
                    {health.lastKnownHealthy.healthy} of {health.lastKnownHealthy.total} components
                    healthy. Checked {relativeTime(health.lastKnownHealthy.checkedAt)}.
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {health.warnings.map((warning) => (
            <Alert variant="warning" key={warning.id}>
              <AlertTriangle className="mt-0.5 size-4" aria-hidden="true" />
              <AlertTitle>Health warning: {warning.label}</AlertTitle>
              <AlertDescription>{warning.detail}</AlertDescription>
            </Alert>
          ))}

          <nav className="grid gap-2 md:grid-cols-3" aria-label="OpenClaw component groups">
            {groups.map((group) => (
              <HealthGroupLink group={group} key={group.id} />
            ))}
          </nav>
          <Link
            href="/connections/system"
            className="inline-flex min-h-11 items-center gap-1 justify-self-start rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-9"
          >
            System status <ArrowRight aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

function formatDuration(uptimeMs: number): string {
  const minutes = Math.floor(uptimeMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function GatewayCard({ data, refreshAction }: ConnectionsOverviewProps) {
  const gateway = data.snapshot.gateway;
  const runtime = data.snapshot.openclawHealth.runtime;
  const component = data.snapshot.openclawHealth.components.find((item) => item.kind === "gateway");
  const healthLabel =
    component?.status === "healthy"
      ? "Healthy"
      : component?.status === "attention"
        ? "Needs attention"
        : "Not checked";
  const badgeVariant = gateway.status === "active" ? "success" : "warning";

  return (
    <section aria-labelledby="gateway-card-title" className="min-w-0">
      <Card className="h-full">
        <CardHeader className="border-b">
          <h2
            id="gateway-card-title"
            className="flex items-center gap-2 font-semibold leading-none"
          >
            <Server className="size-4 text-muted-foreground" aria-hidden="true" /> Opzava Gateway
          </h2>
        </CardHeader>
        <CardContent className="grid flex-1 gap-5">
          <div>
            <Badge variant={badgeVariant}>
              {gateway.status === "active" ? "Active" : "Unavailable"}
            </Badge>
            <p className="mt-3 flex items-center gap-2 text-sm font-medium">
              <span
                className={
                  component?.status === "healthy"
                    ? "dot dot-success"
                    : component?.status === "attention"
                      ? "dot dot-warning"
                      : "dot"
                }
                aria-hidden="true"
              />
              {healthLabel}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Heartbeat {relativeTime(gateway.lastHeartbeatAt)}
            </p>
          </div>
          {runtime.version !== null || runtime.uptimeMs !== null ? (
            <>
              <Separator />
              <dl className="grid gap-3 text-sm">
                {runtime.version !== null ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Version</dt>
                    <dd className="min-w-0 truncate font-medium">{runtime.version}</dd>
                  </div>
                ) : null}
                {runtime.uptimeMs !== null ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Uptime</dt>
                    <dd className="font-medium tabular-nums">{formatDuration(runtime.uptimeMs)}</dd>
                  </div>
                ) : null}
              </dl>
            </>
          ) : null}
        </CardContent>
        <CardFooter className="mt-auto border-t">
          <form
            action={refreshAction}
            className="w-full"
            aria-describedby="gateway-health-check-copy"
          >
            <span id="gateway-health-check-copy" className="sr-only">
              Runs a live OpenClaw health probe.
            </span>
            <HealthCheckSubmitButton describedBy="gateway-health-check-copy" />
          </form>
        </CardFooter>
      </Card>
    </section>
  );
}

function providerDotClass(status: string, authHealth: string | null): string {
  if (
    status === "needs_attention" ||
    status === "pending" ||
    authHealth === "expired" ||
    authHealth === "missing" ||
    authHealth === "expiring"
  )
    return "dot dot-warning";
  return status === "connected" ? "dot dot-success" : "dot";
}

function ProvidersCard({ data }: { readonly data: ConnectionsPageData }) {
  const providers = overviewProviders(data.providers);
  return (
    <section aria-labelledby="providers-card-title" className="min-w-0">
      <Card className="h-full">
        <CardHeader className="border-b">
          <h2 id="providers-card-title" className="font-semibold leading-none">
            Model Providers
          </h2>
        </CardHeader>
        <CardContent className="grid flex-1 gap-5">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {data.providerSummary.connected}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                of {data.providerSummary.total} connected
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.providerSummary.available} available in the live gateway catalog.
            </p>
          </div>
          <Separator />
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No model providers in the live catalog.</p>
          ) : (
            <ul className="grid gap-1" aria-label="Priority model providers">
              {providers.map((provider) => (
                <li
                  key={provider.id}
                  data-provider-id={provider.id}
                  data-provider-status={provider.status}
                  data-provider-auth-health={provider.authHealth ?? "unknown"}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderBrandIcon providerId={provider.id} label={provider.label} />
                    <span
                      className={providerDotClass(provider.status, provider.authHealth)}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{provider.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {provider.statusLabel}
                        {provider.authLabel === null ? "" : ` · ${provider.authLabel}`}
                      </span>
                    </span>
                  </div>
                  <Link
                    href={provider.href}
                    className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-9"
                  >
                    {provider.actionLabel}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
        <CardFooter className="mt-auto border-t">
          <Button asChild variant="outline" className="h-11 w-full sm:h-9">
            <Link href="/connections/providers">All providers</Link>
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

function IntegrationsCard({ data }: { readonly data: ConnectionsPageData }) {
  const integrations = overviewIntegrations(data.snapshot.github);
  const connected = integrations.filter((integration) => integration.status === "connected").length;
  return (
    <section aria-labelledby="integrations-card-title" className="min-w-0">
      <Card className="h-full">
        <CardHeader className="border-b">
          <h2 id="integrations-card-title" className="font-semibold leading-none">
            Third-Party Integrations
          </h2>
        </CardHeader>
        <CardContent className="grid flex-1 gap-5">
          <div>
            <p className="text-2xl font-semibold tabular-nums">
              {connected}{" "}
              <span className="text-sm font-normal text-muted-foreground">connected</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              External services this workspace can reach.
            </p>
          </div>
          <Separator />
          {integrations.length > 0 ? (
            <ul className="grid gap-1" aria-label="Workspace integrations">
              {integrations.map((integration) => (
                <li
                  key={integration.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
                  data-integration-id={integration.id}
                  data-integration-status={integration.status}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <GitBranch className="size-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{integration.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {integration.statusLabel} · {integration.detail}
                      </span>
                    </span>
                  </div>
                  <Link
                    href={integration.href}
                    className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-9"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid justify-items-center gap-3 py-4 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-muted">
                <Plug className="size-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium">No integrations connected</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add GitHub when this workspace needs repository access.
                </p>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="mt-auto border-t">
          <Button
            asChild
            variant={integrations.length > 0 ? "outline" : "default"}
            className="h-11 w-full sm:h-9"
          >
            <Link href="/connections/add">Add integration</Link>
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

export function ConnectionsOverview({ data, refreshAction }: ConnectionsOverviewProps) {
  return (
    <div className="grid min-w-0 gap-6 overflow-x-hidden">
      <SystemHealthPanel data={data} refreshAction={refreshAction} />
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        <GatewayCard data={data} refreshAction={refreshAction} />
        <ProvidersCard data={data} />
        <IntegrationsCard data={data} />
      </div>
      <p className="text-sm text-muted-foreground">
        Health re-checks every 30 seconds and when this window regains focus.
      </p>
    </div>
  );
}
