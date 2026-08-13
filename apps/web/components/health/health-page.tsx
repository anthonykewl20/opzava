"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { recheckDoctorScanAction } from "@/app/(app)/health/actions";
import { ActionStateForm } from "@/components/forms/action-state-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { HealthAttentionItemView, HealthPageViewModel } from "@/lib/health/health-view-model";
import { doctorScanCooldown } from "@/lib/health/doctor-scan-cooldown";

import { AllComponents } from "./all-components";
import { HealthRing } from "./health-ring";
import { ScannerFindings } from "./scanner-findings";
import styles from "./health.module.css";
import { useCountUp } from "./use-count-up";

function statusTone(status: "healthy" | "attention" | "unknown"): string {
  if (status === "healthy") return styles["healthy"]!;
  if (status === "attention") return styles["attention"]!;
  return styles["not_checked"]!;
}

function HealthLegend({ view }: { readonly view: HealthPageViewModel }) {
  const counts = view.counts;
  if (counts === null) return null;

  return (
    <div className={styles["legend"]!} aria-label="Health check counts">
      {(
        [
          { tone: "healthy", label: "Healthy", count: counts.healthy },
          { tone: "attention", label: "Attention", count: counts.attention },
          { tone: "not_checked", label: "Not checked", count: counts.notChecked },
        ] as const
      ).map((item) => (
        <span key={item.label}>
          <span className={`${styles["legendDot"]!} ${styles[item.tone]!}`} aria-hidden="true" />
          {item.label} <strong>{item.count}</strong>
        </span>
      ))}
    </div>
  );
}

function RecheckSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant="outline" aria-busy={pending}>
      <RefreshCcw aria-hidden="true" /> {pending ? "Re-checking…" : "Re-check now"}
    </Button>
  );
}

function RecheckDoctorScan({ runCheckedAt }: { readonly runCheckedAt: string | null }) {
  const [nowMs, setNowMs] = useState(() =>
    runCheckedAt === null ? 0 : Date.parse(runCheckedAt),
  );
  const cooldown = doctorScanCooldown(runCheckedAt, nowMs);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [runCheckedAt]);

  if (cooldown.disabled) {
    return (
      <Button disabled variant="outline" aria-live="polite">
        <RefreshCcw aria-hidden="true" /> {cooldown.label}
      </Button>
    );
  }

  return (
    <ActionStateForm action={recheckDoctorScanAction} errorTitle="Re-check failed">
      <RecheckSubmitButton />
    </ActionStateForm>
  );
}

function LastKnownGood({ view }: { readonly view: HealthPageViewModel }) {
  const snapshot = view.lastKnownGood;
  if (snapshot === null || (view.availability === "live" && view.counts?.notChecked === 0)) {
    return null;
  }

  return (
    <div className={styles["lastKnown"]!} data-last-known-good="stale">
      <Badge variant="warning">Stale · last known good</Badge>
      <span>
        {snapshot.healthy} of {snapshot.total} healthy · checked {snapshot.checkedLabel}
      </span>
    </div>
  );
}

function AttentionItem({ item }: { readonly item: HealthAttentionItemView }) {
  return (
    <li className={styles["attentionItem"]!}>
      <div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
      <Link href={item.href}>
        {item.actionLabel} <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}

function unverifiedAttentionCopy(view: HealthPageViewModel, scanAttention: number): string {
  if (scanAttention === 0) {
    return "Current exceptions cannot be fully verified. RPC and deep-scan evidence keep separate states; no zero count is inferred from unavailable, stale, or unknown evidence.";
  }
  if (view.scanFindings.availability === "stale") {
    return "The stale recorded scan contains findings that needed attention. Review them below, but do not treat them as current evidence.";
  }
  return "Scanner findings need attention and are listed in their separate deep-scan section.";
}

function AttentionTile({ view }: { readonly view: HealthPageViewModel }) {
  const scanAttention = view.scanFindings.groups.reduce(
    (total, group) => total + group.counts.errors + group.counts.warnings,
    0,
  );
  const emptyAndVerified =
    view.availability === "live" &&
    view.attentionItems.length === 0 &&
    view.scanFindings.availability === "available" &&
    scanAttention === 0;
  return (
    <Card className={`${styles["tile"]!} ${styles["spanTwo"]!}`}>
      <CardHeader className={styles["attentionHeader"]!}>
        <span
          className={emptyAndVerified ? styles["clearGlyph"]! : styles["attentionGlyph"]!}
          aria-hidden="true"
        >
          {emptyAndVerified ? <CheckCircle2 /> : <AlertTriangle />}
        </span>
        <h2>Needs your attention</h2>
        <span className={styles["attentionCount"]!}>
          {view.availability === "live" && view.scanFindings.availability === "available"
            ? `${view.attentionItems.length} RPC · ${scanAttention} scanner`
            : "Current state unverified"}
        </span>
      </CardHeader>
      <CardContent className={styles["attentionContent"]!}>
        {view.attentionItems.length > 0 ? (
          <ul>
            {view.attentionItems.map((item) => (
              <AttentionItem item={item} key={item.id} />
            ))}
          </ul>
        ) : emptyAndVerified ? (
          <p className={styles["quietState"]!}>
            Nothing needs your attention in the current health evidence.
          </p>
        ) : (
          <p className={styles["quietState"]!}>{unverifiedAttentionCopy(view, scanAttention)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function GatewayTile({ view }: { readonly view: HealthPageViewModel }) {
  return (
    <Card className={`${styles["tile"]!} ${styles["kpiTile"]!} ${styles["interactive"]!}`}>
      <Link
        className={styles["cardLink"]!}
        href={view.gateway.href}
        aria-label="Open Gateway owner surface"
      >
        <div className={styles["kpiTop"]!}>
          <span>Gateway</span>
          <ArrowUpRight aria-hidden="true" />
        </div>
        <div className={styles["statusWord"]!}>
          <span
            className={`${styles["statusDot"]!} ${statusTone(view.gateway.tone)} ${view.gateway.live ? styles["livePulse"]! : ""}`}
            aria-hidden="true"
          />
          {view.gateway.statusLabel}
        </div>
        <p>{view.gateway.detail}</p>
      </Link>
    </Card>
  );
}

function RuntimeTile({ view }: { readonly view: HealthPageViewModel }) {
  return (
    <Card className={`${styles["tile"]!} ${styles["kpiTile"]!} ${styles["interactive"]!}`}>
      <Link
        className={styles["cardLink"]!}
        href={view.runtime.href}
        aria-label="Open Runtime owner surface"
      >
        <div className={styles["kpiTop"]!}>
          <span>Runtime</span>
          {view.runtime.update === null ? null : <Badge variant="warning">Update ready</Badge>}
        </div>
        <div className={styles["kpiValue"]!}>{view.runtime.version ?? "Unknown"}</div>
        <p>
          {view.runtime.uptimeLabel === null
            ? "Uptime unavailable"
            : `Up ${view.runtime.uptimeLabel}`}
          {view.runtime.update === null
            ? ""
            : ` · latest ${view.runtime.update.latestVersion} (${view.runtime.update.channel})`}
        </p>
      </Link>
    </Card>
  );
}

function SessionsTile({ view }: { readonly view: HealthPageViewModel }) {
  const sessionCount = useCountUp(view.sessions.count ?? 0);
  return (
    <Card
      className={`${styles["tile"]!} ${styles["kpiTile"]!} ${styles["spanTwo"]!} ${styles["interactive"]!}`}
    >
      <Link
        className={styles["cardLink"]!}
        href={view.sessions.href}
        aria-label="Open runtime session evidence"
      >
        <div className={styles["kpiTop"]!}>
          <span>Runtime sessions</span>
          <ArrowRight aria-hidden="true" />
        </div>
        <div className={styles["sessionsValue"]!}>
          <span className={styles["kpiValue"]!}>
            {view.sessions.count === null ? "—" : sessionCount}
          </span>
          <p>
            {view.sessions.count === null
              ? "Session count unavailable"
              : `${view.sessions.count} current · ${view.sessions.recentCount} recent session ${view.sessions.recentCount === 1 ? "record" : "records"}`}
          </p>
        </div>
      </Link>
    </Card>
  );
}

export function HealthPage({ view }: { readonly view: HealthPageViewModel }) {
  return (
    <div className={`page ${styles["page"]!}`}>
      <header className={styles["pageHeader"]!}>
        <div>
          <span className={styles["eyebrow"]!}>Operate</span>
          <h1>Health</h1>
          <p>
            One glance tells you if the platform can keep working. We surface only what needs you —
            everything healthy stays quiet.
          </p>
        </div>
        <div className={styles["freshnessClocks"]!}>
          <span
            className={styles["freshness"]!}
            data-availability={view.availability}
            data-freshness-state={view.freshnessState}
          >
            <span
              className={view.isFreshLive ? styles["freshPulse"]! : styles["freshDot"]!}
              aria-hidden="true"
            />
            {view.freshnessLabel} <em>RPC snapshot</em>
          </span>
          <span className={`${styles["freshness"]!} ${styles["scanFreshness"]!}`}>
            <span className={styles["scanFreshDot"]!} aria-hidden="true" />
            {view.scanFindings.freshnessLabel} <em>deep doctor-scan</em>
          </span>
        </div>
      </header>

      <div className={styles["bento"]!}>
        <Card className={`${styles["tile"]!} ${styles["hero"]!}`} aria-labelledby="health-verdict">
          <HealthRing counts={view.counts} />
          <div>
            <h2 id="health-verdict">{view.verdict}</h2>
            <p className={styles["heroDescription"]!}>{view.description}</p>
          </div>
          <HealthLegend view={view} />
          <LastKnownGood view={view} />
          <RecheckDoctorScan runCheckedAt={view.scanFindings.runCheckedAt} />
        </Card>

        <AttentionTile view={view} />
        <GatewayTile view={view} />
        <RuntimeTile view={view} />
        <SessionsTile view={view} />
      </div>

      <AllComponents groups={view.groups} />
      <ScannerFindings scan={view.scanFindings} />

      <p className={styles["footerNote"]!}>
        Every value carries freshness; unknown and not checked are never shown as healthy, and
        last-known-good evidence is marked stale. Re-check only requests fresh diagnostic evidence.
      </p>
    </div>
  );
}
