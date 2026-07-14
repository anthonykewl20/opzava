import type { OpenClawHealthComponent, OpenClawHealthComponentKind } from "@opzava/ports";
import { AlertTriangle, Check, CircleAlert, CircleHelp, Clock3, ShieldCheck } from "lucide-react";

import { relativeTime } from "@/app/(app)/connections/_lib/page-data";
import { HealthCheckSubmitButton } from "@/components/connections/health-check-submit";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { openclawHealthSummary, type OpenClawHealthRollupStatus } from "@/lib/connections-state";
import type { ConnectionsPageData } from "@/lib/connections";
import { cn } from "@/lib/utils";

interface ConnectionsSystemStatusProps {
  readonly data: ConnectionsPageData;
  readonly refreshAction: () => Promise<void>;
}

interface ComponentGroup {
  readonly label: "System Core" | "Channels" | "Agents";
  readonly emptyLabel: string;
  readonly kinds: readonly OpenClawHealthComponentKind[];
}

const componentGroups: readonly ComponentGroup[] = [
  {
    label: "System Core",
    emptyLabel: "No system core components were reported.",
    kinds: ["gateway", "event-loop", "plugins", "context-engines"],
  },
  {
    label: "Channels",
    emptyLabel: "No channel components were reported.",
    kinds: ["channel"],
  },
  {
    label: "Agents",
    emptyLabel: "No agent components were reported.",
    kinds: ["agent"],
  },
] as const;

function headline(status: OpenClawHealthRollupStatus, attention: number): string {
  if (status === "healthy") return "All systems healthy";
  if (status === "unknown") return "Health not fully checked";
  return `${attention} ${attention === 1 ? "component needs" : "components need"} attention`;
}

function statusLabel(status: OpenClawHealthComponent["status"]): string {
  if (status === "healthy") return "Healthy";
  if (status === "attention") return "Needs attention";
  return "Not checked";
}

function formatDuration(value: number): string {
  const seconds = Math.max(0, Math.floor(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function CheckedTime({ value }: { readonly value: string | null }) {
  if (value === null) return <>not checked</>;
  return (
    <time dateTime={value} title={value}>
      {relativeTime(value)}
    </time>
  );
}

function StatusIcon({ status }: { readonly status: OpenClawHealthComponent["status"] }) {
  if (status === "healthy") return <Check className="size-4 text-emerald-600" aria-hidden="true" />;
  if (status === "attention")
    return <CircleAlert className="size-4 text-amber-600" aria-hidden="true" />;
  return <CircleHelp className="size-4 text-muted-foreground" aria-hidden="true" />;
}

function HealthEmblem({ status }: { readonly status: OpenClawHealthRollupStatus }) {
  if (status === "healthy") {
    return (
      <span
        className="grid size-14 shrink-0 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
        aria-hidden="true"
      >
        <ShieldCheck className="size-7" />
      </span>
    );
  }

  if (status === "attention") {
    return (
      <span
        className="grid size-14 shrink-0 place-items-center rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-600"
        aria-hidden="true"
      >
        <AlertTriangle className="size-7" />
      </span>
    );
  }

  return (
    <span
      className="grid size-14 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground"
      aria-hidden="true"
    >
      <CircleHelp className="size-7" />
    </span>
  );
}

function ComponentCard({ component }: { readonly component: OpenClawHealthComponent }) {
  return (
    <Card
      data-component-id={component.id}
      data-component-status={component.status}
      className={cn(
        "gap-3 py-4",
        component.status === "attention" && "border-amber-500/50 bg-amber-500/5",
        component.status === "not_checked" && "border-dashed bg-transparent",
      )}
    >
      <CardHeader className="gap-2 px-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm">{component.label}</CardTitle>
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <StatusIcon status={component.status} />
            {statusLabel(component.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 px-4 text-sm">
        {component.detail === null ? (
          <p className="text-muted-foreground">No detail was reported.</p>
        ) : (
          <p>{component.detail}</p>
        )}
        {component.lastCheckedAt === null ? (
          <p className="text-xs text-muted-foreground">No live check available</p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden="true" />
            Checked <CheckedTime value={component.lastCheckedAt} />
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ComponentGroups({
  components,
}: {
  readonly components: readonly OpenClawHealthComponent[];
}) {
  return (
    <div className="grid gap-8">
      {componentGroups.map((group) => {
        const items = components.filter((component) => group.kinds.includes(component.kind));
        const groupId = `system-group-${group.label.toLowerCase().replaceAll(" ", "-")}`;
        const headingId = `${groupId}-heading`;
        return (
          <section
            key={group.label}
            id={groupId}
            aria-labelledby={headingId}
            className="scroll-mt-24"
          >
            <h2
              id={headingId}
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {group.label}
            </h2>
            {items.length === 0 ? (
              <Card className="border-dashed bg-transparent py-5">
                <CardContent className="px-5 text-sm text-muted-foreground">
                  {group.emptyLabel}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((component) => (
                  <ComponentCard component={component} key={component.id} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SessionsSection({
  sessions,
}: {
  readonly sessions: ConnectionsPageData["snapshot"]["openclawHealth"]["sessions"];
}) {
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground">
        {sessions.count === null
          ? "Session count was not reported."
          : `${sessions.count} ${sessions.count === 1 ? "session" : "sessions"} reported.`}
      </p>
      {sessions.recent.length === 0 ? (
        <p>No recent session details were reported.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.recent.map((session, index) => (
              <TableRow
                key={`${session.agentId ?? "unknown"}-${session.updatedAt ?? "unknown"}-${index}`}
              >
                <TableCell>{session.agentId ?? "Not reported"}</TableCell>
                <TableCell>
                  {session.updatedAt === null ? (
                    "Not reported"
                  ) : (
                    <time dateTime={session.updatedAt}>{relativeTime(session.updatedAt)}</time>
                  )}
                </TableCell>
                <TableCell>
                  {session.ageMs === null ? "Not reported" : formatDuration(session.ageMs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function GatewaySection({
  gateway,
  providerCatalogCount,
}: {
  readonly gateway: ConnectionsPageData["snapshot"]["gateway"];
  readonly providerCatalogCount: number;
}) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-5 gap-y-3">
      <dt className="text-muted-foreground">Status</dt>
      <dd>{gateway.status === "active" ? "Active" : "Unavailable"}</dd>
      <dt className="text-muted-foreground">Authentication</dt>
      <dd>{gateway.authLabel}</dd>
      <dt className="text-muted-foreground">Last heartbeat</dt>
      <dd>
        <CheckedTime value={gateway.lastHeartbeatAt} />
      </dd>
      <dt className="text-muted-foreground">Provider catalog</dt>
      <dd>
        {providerCatalogCount} {providerCatalogCount === 1 ? "provider" : "providers"} advertised
      </dd>
      {gateway.region === null ? null : (
        <>
          <dt className="text-muted-foreground">Region</dt>
          <dd>{gateway.region}</dd>
        </>
      )}
      {gateway.message === null || gateway.message.trim() === "" ? null : (
        <>
          <dt className="text-muted-foreground">Message</dt>
          <dd>{gateway.message}</dd>
        </>
      )}
    </dl>
  );
}

function RuntimeSection({
  runtime,
}: {
  readonly runtime: ConnectionsPageData["snapshot"]["openclawHealth"]["runtime"];
}) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-5 gap-y-3">
      <dt className="text-muted-foreground">Version</dt>
      <dd>{runtime.version ?? "Not reported"}</dd>
      <dt className="text-muted-foreground">Gateway uptime</dt>
      <dd>{runtime.uptimeMs === null ? "Not reported" : formatDuration(runtime.uptimeMs)}</dd>
      <dt className="text-muted-foreground">Host uptime</dt>
      <dd>
        {runtime.hostUptimeMs === null ? "Not reported" : formatDuration(runtime.hostUptimeMs)}
      </dd>
      <dt className="text-muted-foreground">Update available</dt>
      <dd>
        {runtime.updateAvailable === null ? (
          "Not checked"
        ) : (
          <>
            {runtime.updateAvailable.currentVersion} → {runtime.updateAvailable.latestVersion} (
            {runtime.updateAvailable.channel})
          </>
        )}
      </dd>
    </dl>
  );
}

export function ConnectionsSystemStatus({ data, refreshAction }: ConnectionsSystemStatusProps) {
  const health = data.snapshot.openclawHealth;
  const summary = openclawHealthSummary(health);

  return (
    <div className="grid gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/connections">Connections</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>System status</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header
        className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
        data-health-status={summary.status}
        data-health-attention-count={summary.attention}
        data-health-checked-at={health.checkedAt ?? ""}
      >
        <div className="flex items-center gap-4">
          <HealthEmblem status={summary.status} />
          <div>
            <h1>System status</h1>
            <p className="mt-1 text-muted-foreground">
              {headline(summary.status, summary.attention)}
            </p>
            {health.checkedAt === null ? (
              <p className="mt-1 text-xs text-muted-foreground">No completed health check</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Checked <CheckedTime value={health.checkedAt} />
              </p>
            )}
          </div>
        </div>
        <form action={refreshAction} className="self-start sm:self-auto">
          <HealthCheckSubmitButton describedBy="system-health-refresh-copy" />
          <span id="system-health-refresh-copy" className="sr-only">
            Refreshes the Opzava health snapshot.
          </span>
        </form>
      </header>

      {health.warnings.length === 0 ? null : (
        <div className="grid gap-3" aria-label="Health warnings">
          {health.warnings.map((warning) => (
            <Alert variant="warning" key={warning.id}>
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>Health warning · {warning.label}</AlertTitle>
              <AlertDescription>{warning.detail}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <ComponentGroups components={health.components} />

      <Card>
        <CardContent className="px-5">
          <Accordion type="multiple">
            <AccordionItem value="sessions">
              <AccordionTrigger>Sessions</AccordionTrigger>
              <AccordionContent forceMount>
                <SessionsSection sessions={health.sessions} />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="gateway">
              <AccordionTrigger>Gateway detail</AccordionTrigger>
              <AccordionContent forceMount>
                <GatewaySection
                  gateway={data.snapshot.gateway}
                  providerCatalogCount={data.snapshot.providerCatalog.length}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="runtime">
              <AccordionTrigger>Runtime</AccordionTrigger>
              <AccordionContent forceMount>
                <RuntimeSection runtime={health.runtime} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
