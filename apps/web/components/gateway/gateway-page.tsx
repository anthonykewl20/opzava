"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Lock, Network, RefreshCcw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { GatewayPageViewModel, GatewayTone } from "@/lib/gateway/gateway-view-model";

import styles from "./gateway.module.css";
import { ProviderLogo } from "./provider-logo";

function toneClass(tone: GatewayTone): string {
  if (tone === "healthy") return styles["healthy"]!;
  if (tone === "attention") return styles["attention"]!;
  return styles["unknown"]!;
}

function toneBadge(tone: GatewayTone): "success" | "warning" | "muted" {
  if (tone === "healthy") return "success";
  if (tone === "attention") return "warning";
  return "muted";
}

function StatusDot({
  tone,
  pulse = false,
}: {
  readonly tone: GatewayTone;
  readonly pulse?: boolean;
}) {
  return (
    <span
      className={`${styles["statusDot"]!} ${toneClass(tone)} ${pulse ? styles["livePulse"]! : ""}`}
      aria-hidden="true"
    />
  );
}

function AnimatedCount({ value }: { readonly value: number }) {
  const style = { "--gateway-count-end": value } as CSSProperties & {
    readonly "--gateway-count-end": number;
  };
  return (
    <span className={styles["count"]!}>
      <span className={styles["srOnly"]!}>{value}</span>
      <span className={styles["countVisual"]!} style={style} aria-hidden="true" />
    </span>
  );
}

function DisabledAction({
  children,
  explanation,
}: {
  readonly children: ReactNode;
  readonly explanation: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={styles["disabledAction"]!} tabIndex={0} aria-label={explanation}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}

function AtAGlance({ view }: { readonly view: GatewayPageViewModel }) {
  return (
    <Card className={styles["glance"]!} role="region" aria-label="Gateway at a glance">
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Connection</span>
        <strong className={styles["glanceValue"]!}>
          <StatusDot tone={view.connection.tone} pulse={view.connection.live} />
          {view.connection.statusLabel}
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.connection.region ?? "Region unknown"} · {view.connection.heartbeatLabel}
        </span>
      </div>
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Lead orchestrator</span>
        <strong className={`${styles["glanceValue"]!} ${styles["mono"]!}`}>
          {view.orchestrator.model ?? "Not elected"}
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.orchestrator.providerLabel ?? "No provider"} · delegation{" "}
          {view.orchestrator.delegationMode}
        </span>
      </div>
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Running now</span>
        <strong className={styles["glanceValue"]!}>
          {view.sessions.count === null ? "—" : <AnimatedCount value={view.sessions.count} />}{" "}
          sessions
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.subagents.length} {view.subagents.length === 1 ? "subagent" : "subagents"} enrolled
          · {view.sessions.evidenceLabel.toLowerCase()}
        </span>
      </div>
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Operator auth</span>
        <strong className={styles["glanceValue"]!}>
          <StatusDot tone={view.operatorAuth.tone} pulse={view.availability === "live"} />
          {view.operatorAuth.statusLabel}
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.operatorAuth.authLabel ?? "No current authorization evidence"}
        </span>
      </div>
    </Card>
  );
}

function OrchestrationStage({ view }: { readonly view: GatewayPageViewModel }) {
  const orchestrator = view.orchestrator;
  return (
    <Card className={styles["stage"]!} aria-labelledby="gateway-drivers-title">
      <CardHeader className={styles["stageHeader"]!}>
        <div>
          <h2 id="gateway-drivers-title">Who&apos;s driving</h2>
          <p>The elected orchestrator and its real subagent roster run through this gateway.</p>
        </div>
        <Button asChild variant="link" className={styles["changeLink"]!}>
          <Link href={view.modelsHref}>
            Change in Models &amp; Providers <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className={styles["lead"]!}>
        <span className={styles["leadHalo"]!} aria-hidden="true">
          {orchestrator.providerId === null ? (
            <span className={styles["emptyLeadLogo"]!}>
              <Network />
            </span>
          ) : (
            <ProviderLogo
              providerId={orchestrator.providerId}
              label={orchestrator.providerLabel ?? orchestrator.providerId}
              className={styles["leadProviderLogo"]!}
            />
          )}
        </span>
        <div className={styles["leadCopy"]!}>
          <div className={styles["leadName"]!}>
            <strong>{orchestrator.model ?? orchestrator.emptyLabel}</strong>
            <Badge variant="outline" className={styles["mainBadge"]!}>
              {orchestrator.model === null ? "Main orchestrator slot" : "Main orchestrator"}
            </Badge>
            <Badge variant={toneBadge(orchestrator.electionTone)}>
              {orchestrator.electionLabel}
            </Badge>
          </div>
          {orchestrator.model === null ? (
            <p>
              Choose a connected, runnable model before this workforce can claim a lead.{" "}
              <Link href={view.modelsHref}>Elect the main orchestrator</Link>.
            </p>
          ) : (
            <p>
              <span>{orchestrator.providerLabel ?? orchestrator.providerId}</span> · agent{" "}
              <span className={styles["mono"]!}>{orchestrator.agentId}</span> · delegation{" "}
              <span className={styles["mono"]!}>{orchestrator.delegationMode}</span> ·{" "}
              {orchestrator.updatedLabel}
            </p>
          )}
          <div className={styles["toolPolicy"]!} aria-label="Orchestrator tool policy">
            {orchestrator.toolPolicy.map((tool) => (
              <Badge variant="muted" key={tool}>
                {tool}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>

      <div className={styles["subagentHeading"]!}>
        Subagents · <span className={styles["mono"]!}>{view.subagents.length}</span> · who does what
      </div>
      {view.subagents.length === 0 ? (
        <div className={styles["subagentEmpty"]!}>
          <strong>No subagents enrolled</strong>
          <p>
            The current orchestration snapshot contains no delegated roles; none are invented here.
          </p>
        </div>
      ) : (
        <div className={styles["subagents"]!} role="list" aria-label="Orchestrator subagents">
          {view.subagents.map((subagent) => (
            <article className={styles["subagent"]!} key={subagent.agentId} role="listitem">
              <div className={styles["subagentTop"]!}>
                <ProviderLogo providerId={subagent.providerId} label={subagent.providerLabel} />
                <div className={styles["subagentRole"]!}>
                  <strong>{subagent.strength}</strong>
                  <span className={styles["mono"]!}>{subagent.agentId}</span>
                </div>
                <div className={styles["subagentModel"]!}>
                  <strong className={styles["mono"]!}>{subagent.model}</strong>
                  <span>{subagent.providerLabel}</span>
                </div>
              </div>
              <p>{subagent.whenToUse}</p>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function HeartbeatStrip({ view }: { readonly view: GatewayPageViewModel }) {
  const label = view.connection.live
    ? `Latest Gateway heartbeat is current: ${view.connection.heartbeatLabel}`
    : `Gateway heartbeat is not current: ${view.connection.heartbeatLabel}`;
  return (
    <div
      className={`${styles["heartbeat"]!} ${toneClass(view.connection.tone)}`}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 520 46" preserveAspectRatio="none" aria-hidden="true">
        <path
          className={styles["heartbeatTrack"]!}
          d="M0 27 H174 L190 27 L199 10 L211 39 L222 18 L234 27 H520"
        />
        <path
          className={styles["heartbeatLine"]!}
          d="M0 27 H174 L190 27 L199 10 L211 39 L222 18 L234 27 H520"
        />
        <circle
          className={view.connection.live ? styles["heartbeatLive"]! : ""}
          cx="512"
          cy="27"
          r="4"
        />
      </svg>
    </div>
  );
}

function ConnectionTile({ view }: { readonly view: GatewayPageViewModel }) {
  return (
    <Card className={`${styles["tile"]!} ${styles["spanTwo"]!}`}>
      <CardHeader className={styles["tileHeader"]!}>
        <span>Connection &amp; heartbeat</span>
        <Badge variant={toneBadge(view.connection.tone)}>{view.connection.statusLabel}</Badge>
      </CardHeader>
      <CardContent className={styles["tileContent"]!}>
        <div className={styles["connectionName"]!}>Platform Gateway</div>
        <HeartbeatStrip view={view} />
        <p>
          {view.runtime.version === null
            ? "Runtime version unavailable"
            : `runtime ${view.runtime.version}`}
          {view.runtime.uptimeLabel === null ? "" : ` · up ${view.runtime.uptimeLabel}`} ·{" "}
          {view.connection.heartbeatLabel}
        </p>
        {view.connection.retainedLabel === null ? null : (
          <Badge variant="warning">{view.connection.retainedLabel}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

function OperatorAuthTile({ view }: { readonly view: GatewayPageViewModel }) {
  return (
    <Card className={styles["tile"]!}>
      <CardHeader className={styles["tileHeader"]!}>
        <span>Operator auth</span>
        <Badge variant={toneBadge(view.operatorAuth.tone)}>{view.operatorAuth.statusLabel}</Badge>
      </CardHeader>
      <CardContent className={styles["tileContent"]!}>
        <div className={styles["scopes"]!} aria-label="Required operator policy scopes">
          {view.operatorAuth.policyScopes.map((scope) => (
            <Badge
              variant={scope.label === "admin" ? "muted" : "outline"}
              key={scope.label}
              title={scope.qualifier}
            >
              {scope.label}
            </Badge>
          ))}
        </div>
        <p>
          Hot path requires <span className={styles["mono"]!}>write + approvals</span>;{" "}
          <span className={styles["mono"]!}>admin</span> is JIT worker-only. These are policy lanes,
          not exposed token contents.
        </p>
      </CardContent>
    </Card>
  );
}

function UsageTile({ view }: { readonly view: GatewayPageViewModel }) {
  const explanation =
    "Usage & Costs is coming soon; this Gateway leaf never fabricates token or cost totals.";
  return (
    <Card className={styles["tile"]!} data-destination={view.usage.href}>
      <CardHeader className={styles["tileHeader"]!}>
        <span>Usage</span>
        <Badge variant="muted">In Usage &amp; Costs</Badge>
      </CardHeader>
      <CardContent className={styles["tileContent"]!}>
        <p>Token and cost breakdown per model belongs in Operate → Usage &amp; Costs.</p>
        <DisabledAction explanation={explanation}>
          <Button disabled variant="ghost" className={styles["tileAction"]!}>
            Open Usage &amp; Costs <ArrowRight aria-hidden="true" />
          </Button>
        </DisabledAction>
      </CardContent>
    </Card>
  );
}

function SessionsTile({ view }: { readonly view: GatewayPageViewModel }) {
  const explanation =
    "Sessions & Runs is coming soon; this rollout does not link to an unavailable route.";
  return (
    <Card
      className={`${styles["tile"]!} ${styles["spanTwo"]!}`}
      data-destination={view.sessionsHref}
    >
      <CardHeader className={styles["tileHeader"]!}>
        <span>Through the gateway now</span>
        <Badge variant="muted">{view.sessions.evidenceLabel}</Badge>
      </CardHeader>
      <CardContent className={`${styles["tileContent"]!} ${styles["sessionsContent"]!}`}>
        <strong className={styles["bigCount"]!}>
          {view.sessions.count === null ? "—" : <AnimatedCount value={view.sessions.count} />}
        </strong>
        <div>
          <p>
            {view.sessions.count === null
              ? "Current session count is unavailable."
              : `${view.sessions.count} current · ${view.sessions.recentCount} recent session ${view.sessions.recentCount === 1 ? "record" : "records"}.`}
          </p>
          <DisabledAction explanation={explanation}>
            <Button disabled variant="ghost" className={styles["tileAction"]!}>
              Open Sessions &amp; Runs <ArrowRight aria-hidden="true" />
            </Button>
          </DisabledAction>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakGlassTile() {
  return (
    <Card className={styles["tile"]!}>
      <CardHeader className={styles["tileHeader"]!}>
        <span>Control UI</span>
        <Badge variant="muted">Internal only</Badge>
      </CardHeader>
      <CardContent className={styles["tileContent"]!}>
        <div className={styles["breakGlass"]!}>
          <Lock aria-hidden="true" />
          <strong>SSH break-glass path</strong>
        </div>
        <p>SSH-only — never linked, exposed, or proxied into the browser.</p>
        <code>docs/runbooks/platform-gateway.md</code>
      </CardContent>
    </Card>
  );
}

function RecheckTile() {
  const explanation = "No browser-safe runtime re-check command is exposed yet.";
  return (
    <Card className={`${styles["tile"]!} ${styles["recheckTile"]!}`}>
      <DisabledAction explanation={explanation}>
        <Button disabled variant="outline">
          <RefreshCcw aria-hidden="true" /> Re-check gateway
        </Button>
      </DisabledAction>
      <p>Re-check stays with the owning runtime.</p>
    </Card>
  );
}

export function GatewayPage({ view }: { readonly view: GatewayPageViewModel }) {
  return (
    <TooltipProvider>
      <div className={`page ${styles["page"]!}`}>
        <header className={styles["pageHeader"]!}>
          <div>
            <span className={styles["eyebrow"]!}>AI Runtime</span>
            <h1>Gateway</h1>
            <p>
              The one runtime every agent runs through — whether it&apos;s reachable, how it&apos;s
              authorized, and which models are actually driving the work.
            </p>
          </div>
          <span
            className={styles["freshness"]!}
            data-availability={view.availability}
            data-freshness-state={view.freshnessState}
          >
            <StatusDot tone={view.connection.tone} pulse={view.isFreshLive} />
            {view.freshnessLabel}
          </span>
        </header>

        <AtAGlance view={view} />
        <OrchestrationStage view={view} />

        <div className={styles["bento"]!}>
          <ConnectionTile view={view} />
          <OperatorAuthTile view={view} />
          <UsageTile view={view} />
          <SessionsTile view={view} />
          <BreakGlassTile />
          <RecheckTile />
        </div>

        <p className={styles["footerNote"]!}>
          <ShieldCheck aria-hidden="true" /> Reads and links only — this page never mutates the
          Gateway or orchestration. Every value carries freshness; unavailable evidence is never
          shown as active. Usage and Sessions remain disabled until their owning leaves land, and
          the Control UI remains SSH break-glass only.
        </p>
      </div>
    </TooltipProvider>
  );
}
