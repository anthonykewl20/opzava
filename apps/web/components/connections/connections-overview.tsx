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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  overviewHealthGroups,
  overviewProviders,
  type OverviewHealthGroup,
  type OverviewHealthStatus,
} from "@/lib/connections-overview";
import { openclawHealthSummary } from "@/lib/connections-state";
import type { ConnectionsPageData } from "@/lib/connections";

import { HealthBar } from "./health-bar";

interface ConnectionsOverviewProps {
  readonly data: ConnectionsPageData;
  readonly refreshAction: () => Promise<void>;
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function healthHeadline(status: OverviewHealthStatus, attention: number): string {
  if (status === "attention")
    return `${plural(attention, "component")} ${attention === 1 ? "needs" : "need"} attention`;
  if (status === "unknown") return "System health is not fully checked";
  return "All systems healthy";
}

function healthDescription(input: {
  readonly healthy: number;
  readonly attention: number;
  readonly notChecked: number;
  readonly percent: number | null;
}): string {
  const probed = input.healthy + input.attention;
  if (input.percent === null) {
    return `${plural(input.notChecked, "component")} not checked. No health percentage is available.`;
  }

  const checked = `${input.healthy} of ${probed} checked components healthy (${input.percent}%)`;
  return input.notChecked > 0
    ? `${checked}; ${plural(input.notChecked, "component")} not checked.`
    : `${checked}.`;
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
  const accessibleStatus = `${group.healthy} healthy, ${group.attention} ${group.attention === 1 ? "needs" : "need"} attention, ${group.notChecked} not checked`;

  return (
    <Link
      href={group.href}
      className="flex min-h-11 items-center gap-2 rounded-full border border-border px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-9 sm:py-1.5"
      aria-label={`${group.label}: ${accessibleStatus}`}
    >
      <Badge variant={groupBadgeVariant(group.status)} className="size-5 justify-center p-0">
        <GroupStatusIcon status={group.status} />
      </Badge>
      <span>{group.label}</span>
      <span className="ml-auto tabular-nums text-muted-foreground">
        {group.healthy}/{group.total}
      </span>
    </Link>
  );
}

function SystemHealthPanel({ data }: { readonly data: ConnectionsPageData }) {
  const health = data.snapshot.openclawHealth;
  const summary = openclawHealthSummary(health);
  const groups = overviewHealthGroups(health.components);

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
          <p className="text-sm text-muted-foreground sm:text-right">
            {health.checkedAt === null
              ? "Not checked"
              : `Checked ${relativeTime(health.checkedAt)}`}
          </p>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div>
            <p className="text-2xl font-semibold tracking-tight">
              {healthHeadline(summary.status, summary.attention)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{healthDescription(summary)}</p>
          </div>

          <HealthBar
            healthy={summary.healthy}
            attention={summary.attention}
            notChecked={summary.notChecked}
          />

          {summary.attention > 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <AlertTriangle
                  className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">
                    {plural(summary.attention, "component")}{" "}
                    {summary.attention === 1 ? "needs" : "need"} attention
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Open System status for the exact probes and repair context.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="h-11 w-full shrink-0 sm:h-9 sm:w-auto">
                <Link href="/connections/system">
                  View details <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
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
  const github = data.snapshot.github;
  const connected = github.status === "connected";
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
              {connected ? 1 : 0}{" "}
              <span className="text-sm font-normal text-muted-foreground">connected</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              External services this workspace can reach.
            </p>
          </div>
          <Separator />
          {connected ? (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
              data-integration-id="github"
              data-integration-status={github.status}
            >
              <div className="flex min-w-0 items-center gap-3">
                <GitBranch className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">GitHub</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Connected · {github.repository}
                  </span>
                </span>
              </div>
              <Link
                href="/connections/github"
                className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-9"
              >
                Open
              </Link>
            </div>
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
            variant={connected ? "outline" : "default"}
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
      <SystemHealthPanel data={data} />
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
