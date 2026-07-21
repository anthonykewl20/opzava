"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, LockKeyhole, ShieldAlert } from "lucide-react";

import { ProviderLogo } from "@/components/gateway/provider-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  ModelsPageViewModel,
  ModelsProviderCardView,
  ModelsTone,
} from "@/lib/models/models-view-model";

import styles from "./models.module.css";

function toneClass(tone: ModelsTone): string {
  if (tone === "healthy") return styles["healthy"]!;
  if (tone === "attention") return styles["attention"]!;
  if (tone === "danger") return styles["danger"]!;
  if (tone === "unknown") return styles["unknown"]!;
  return styles["muted"]!;
}

function statusBadgeVariant(tone: ModelsTone): "success" | "warning" | "destructive" | "muted" {
  if (tone === "healthy") return "success";
  if (tone === "attention") return "warning";
  if (tone === "danger") return "destructive";
  return "muted";
}

function StatusDot({
  tone,
  pulse = false,
}: {
  readonly tone: ModelsTone;
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
  const style = { "--models-count-end": value } as CSSProperties & {
    readonly "--models-count-end": number;
  };
  return (
    <span className={styles["count"]!}>
      <span className={styles["srOnly"]!}>{value}</span>
      <span className={styles["countVisual"]!} style={style} aria-hidden="true" />
    </span>
  );
}

function countOrDash(value: number | null) {
  return value === null ? <span aria-label="Unavailable">—</span> : <AnimatedCount value={value} />;
}

function AtAGlance({ view }: { readonly view: ModelsPageViewModel }) {
  const disconnected =
    view.glance.connected === null || view.glance.providersTotal === null
      ? null
      : view.glance.providersTotal - view.glance.connected;

  return (
    <Card className={styles["glance"]!} role="region" aria-label="Providers at a glance">
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Connected</span>
        <strong className={styles["glanceValue"]!}>
          <span className={styles["mono"]!}>{countOrDash(view.glance.connected)}</span>
          {view.glance.providersTotal === null ? null : (
            <span className={styles["glanceDenominator"]!}>
              / <span className={styles["mono"]!}>{view.glance.providersTotal}</span>
            </span>
          )}
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.glance.stale
            ? "Last-known snapshot · stale"
            : disconnected === null
              ? "Current status unavailable"
              : disconnected === 0
                ? "All advertised providers connected"
                : `${disconnected} not connected`}
        </span>
      </div>
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Needs attention</span>
        <strong className={styles["glanceValue"]!}>
          <StatusDot
            tone={view.glance.needsAttention > 0 ? "attention" : "healthy"}
            pulse={view.isFreshLive && view.glance.needsAttention === 0}
          />
          <span className={styles["mono"]!}>
            <AnimatedCount value={view.glance.needsAttention} />
          </span>
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.glance.needsAttention === 0
            ? "No provider auth risks reported"
            : `${view.glance.needsAttention} provider ${view.glance.needsAttention === 1 ? "item" : "items"} surfaced below`}
        </span>
      </div>
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Routable models</span>
        <strong className={`${styles["glanceValue"]!} ${styles["mono"]!}`}>
          {countOrDash(view.glance.routableModels)}
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.glance.stale
            ? "Observed in stale provider evidence"
            : view.glance.routableModels === null
              ? "Current catalog unavailable"
              : "Across connected providers"}
        </span>
      </div>
      <div className={styles["glanceCell"]!}>
        <span className={styles["glanceKey"]!}>Lead model</span>
        <strong className={`${styles["glanceValue"]!} ${styles["leadModel"]!}`}>
          {view.glance.leadModel ?? "Not elected"}
        </strong>
        <span className={styles["glanceSub"]!}>
          {view.glance.leadProvider === null
            ? "No provider is set as main"
            : `${view.glance.leadProvider} · ${view.glance.stale ? "last known" : "set as main"}`}
        </span>
      </div>
    </Card>
  );
}

function StateBanner({ view }: { readonly view: ModelsPageViewModel }) {
  if (view.stateTitle === null || view.stateDescription === null) return null;

  return (
    <Card className={styles["stateBanner"]!} role="status">
      <ShieldAlert aria-hidden="true" />
      <div>
        <strong>{view.stateTitle}</strong>
        <p>{view.stateDescription}</p>
      </div>
      <Badge variant={view.availability === "unavailable" ? "warning" : "muted"}>
        {view.lastKnownGood ? "Last-known · stale" : view.freshnessLabel}
      </Badge>
    </Card>
  );
}

function AttentionPanel({ view }: { readonly view: ModelsPageViewModel }) {
  if (view.attentionItems.length === 0) return null;

  return (
    <Card className={styles["attentionPanel"]!} aria-labelledby="models-attention-title">
      <div className={styles["attentionHeader"]!}>
        <AlertTriangle aria-hidden="true" />
        <h2 id="models-attention-title">Needs your attention</h2>
        <span>
          <span className={styles["mono"]!}>{view.attentionItems.length}</span>{" "}
          {view.attentionItems.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div>
        {view.attentionItems.map((item) => (
          <div className={styles["attentionRow"]!} key={item.providerId}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
            <Button asChild variant="link" className={styles["attentionAction"]!}>
              <Link href={item.href}>
                {item.actionLabel} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RoutableBar({ provider }: { readonly provider: ModelsProviderCardView }) {
  const ratio = provider.routable.ratio ?? 0;
  const style = { "--models-fill": ratio } as CSSProperties & {
    readonly "--models-fill": number;
  };
  return (
    <div className={styles["routableBlock"]!}>
      <div className={styles["detailRow"]!}>
        <span>Routable</span>
        <strong className={styles["mono"]!}>{provider.routable.label}</strong>
      </div>
      <div
        className={styles["modelsBar"]!}
        role="img"
        aria-label={`${provider.label}: ${provider.routable.label}`}
      >
        <span style={style} />
      </div>
    </div>
  );
}

function AuthRow({ provider }: { readonly provider: ModelsProviderCardView }) {
  return (
    <div className={styles["detailRow"]!}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={styles["authKey"]!} tabIndex={0}>
            <LockKeyhole aria-hidden="true" /> Auth
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Only credential type and health are shown. Token contents stay hidden.
        </TooltipContent>
      </Tooltip>
      <strong className={toneClass(provider.auth.tone)}>
        {provider.auth.modeLabel} · {provider.auth.healthLabel}
        {provider.auth.expiryLabel === null ? null : (
          <span className={styles["expiry"]!}> {provider.auth.expiryLabel}</span>
        )}
      </strong>
    </div>
  );
}

function ProviderCard({ provider }: { readonly provider: ModelsProviderCardView }) {
  const isLead = provider.roleLabel === "Lead orchestrator";
  const isNotConnected = provider.status === "not_connected";
  const cardClassName = [
    styles["providerCard"]!,
    isLead ? styles["leadCard"]! : "",
    isNotConnected ? styles["connectCard"]! : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Card className={cardClassName}>
      <div className={styles["providerTop"]!}>
        <ProviderLogo
          providerId={provider.id}
          label={provider.label}
          className={styles["providerLogo"]!}
        />
        <div className={styles["providerIdentity"]!}>
          <h3>{provider.label}</h3>
          <span>{provider.vendor}</span>
        </div>
        <div className={`${styles["providerStatus"]!} ${toneClass(provider.tone)}`}>
          <StatusDot tone={provider.tone} pulse={!provider.stale && provider.tone === "healthy"} />
          <span>{provider.statusLabel}</span>
        </div>
      </div>

      <div className={styles["providerBadges"]!}>
        <Badge
          variant={isLead ? "outline" : "muted"}
          className={isLead ? styles["leadBadge"]! : ""}
        >
          {provider.roleLabel}
        </Badge>
        {provider.planLabel === null ? null : (
          <Badge variant="muted" className={styles["planBadge"]!}>
            {provider.planLabel} plan
          </Badge>
        )}
        {provider.auth.health === "expiring" || provider.auth.health === "expired" ? (
          <Badge variant={statusBadgeVariant(provider.auth.tone)}>
            {provider.auth.expiryLabel ?? provider.auth.healthLabel}
          </Badge>
        ) : null}
        {provider.stale ? <Badge variant="muted">Stale evidence</Badge> : null}
      </div>

      {isNotConnected ? (
        <div className={styles["providerDetails"]!}>
          <div className={styles["detailRow"]!}>
            <span>Suggested for</span>
            <strong>{provider.whenToUse}</strong>
          </div>
          <div className={styles["detailRow"]!}>
            <span>Advertised models</span>
            <strong className={styles["mono"]!}>{provider.routable.label}</strong>
          </div>
        </div>
      ) : (
        <div className={styles["providerDetails"]!}>
          <div className={styles["detailRow"]!}>
            <span>{isLead ? "Main model" : "Model"}</span>
            <strong className={styles["mono"]!}>{provider.model ?? "No model selected"}</strong>
          </div>
          <AuthRow provider={provider} />
          <RoutableBar provider={provider} />
        </div>
      )}

      <div className={styles["cardActions"]!}>
        <Button
          asChild
          size="sm"
          variant={
            isNotConnected || provider.auth.tone === "attention" || provider.auth.tone === "danger"
              ? "default"
              : "outline"
          }
          className={isNotConnected ? styles["connectAction"]! : ""}
        >
          <Link href={provider.managementHref}>{provider.primaryActionLabel}</Link>
        </Button>
        {provider.canSetAsMain ? (
          <Button asChild size="sm">
            <Link href={provider.managementHref}>Set as main</Link>
          </Button>
        ) : isNotConnected ? null : (
          <Button asChild variant="link" size="sm" className={styles["manageLink"]!}>
            <Link href={provider.managementHref}>
              Models <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

function EmptyProviders({ view }: { readonly view: ModelsPageViewModel }) {
  return (
    <Card className={styles["emptyProviders"]!}>
      <Info aria-hidden="true" />
      <div>
        <strong>{view.stateTitle ?? "No model providers advertised"}</strong>
        <p>
          {view.stateDescription ??
            "The live Gateway catalog returned no provider rows, so this page does not invent any."}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href={view.managementHref}>Open provider management</Link>
      </Button>
    </Card>
  );
}

export function ModelsPage({ view }: { readonly view: ModelsPageViewModel }) {
  return (
    <TooltipProvider>
      <main className={styles["page"]!}>
        <header className={styles["pageHeader"]!}>
          <div>
            <span className={styles["eyebrow"]!}>AI Runtime</span>
            <h1>Models &amp; Providers</h1>
            <p>
              Every model provider connected to this workspace — who&apos;s the lead, which are
              subagents, token health, and what&apos;s routable. The catalog comes from the live
              Gateway; nothing here is invented.
            </p>
          </div>
          <span className={styles["freshness"]!}>
            <StatusDot
              tone={
                view.isFreshLive
                  ? "healthy"
                  : view.availability === "unavailable"
                    ? "attention"
                    : "unknown"
              }
              pulse={view.isFreshLive}
            />
            {view.freshnessLabel}
          </span>
        </header>

        <StateBanner view={view} />
        <AtAGlance view={view} />
        <AttentionPanel view={view} />

        <section aria-labelledby="models-provider-title">
          <div className={styles["sectionHeader"]!}>
            <h2 id="models-provider-title">Providers</h2>
            <span>
              · <span className={styles["mono"]!}>{view.providers.length}</span> — lead first, then
              subagents
            </span>
          </div>
          {view.providers.length === 0 ? (
            <EmptyProviders view={view} />
          ) : (
            <div className={styles["providerGrid"]!}>
              {view.providers.map((provider) => (
                <ProviderCard provider={provider} key={provider.id} />
              ))}
            </div>
          )}
        </section>

        <p className={styles["footerNote"]!}>
          Reads the provider list and model catalogs reported by the Gateway. Unreachable evidence
          is shown only as a last-known snapshot marked stale. Connect, re-authorize, set-as-main,
          and manage links open the existing provider-management flow; this page never mutates the
          Gateway or displays token contents.
        </p>
      </main>
    </TooltipProvider>
  );
}
