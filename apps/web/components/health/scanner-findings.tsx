"use client";

import { useState } from "react";
import { Check, ChevronRight, Clipboard, EyeOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type {
  HealthScanFindingsView,
  ScanFindingGroupView,
  ScanFindingView,
  ScanFindingSeverity,
} from "@/lib/health/health-view-model";

import styles from "./health.module.css";

function severityTone(severity: ScanFindingSeverity): string {
  if (severity === "error") return styles["scanError"]!;
  if (severity === "warning") return styles["scanWarning"]!;
  return styles["scanInfo"]!;
}

function findingBlock(finding: ScanFindingView): string {
  return [
    finding.checkId,
    finding.summary,
    finding.fixHint === null ? null : `Fix: ${finding.fixHint}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function FindingRow({ finding }: { readonly finding: ScanFindingView }) {
  const [copied, setCopied] = useState(false);

  async function copyFinding(): Promise<void> {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
    await navigator.clipboard.writeText(findingBlock(finding));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  }

  return (
    <div className={styles["findingRow"]!} data-suppressed={finding.suppressed}>
      <span
        className={`${styles["scanSeverityDot"]!} ${severityTone(finding.severity)}`}
        aria-label={finding.suppressed ? `${finding.severity}, suppressed` : finding.severity}
      />
      <div className={styles["findingCopy"]!}>
        <div className={styles["findingCode"]!}>
          {finding.checkId}
          {finding.suppressed ? <Badge variant="muted">Suppressed</Badge> : null}
        </div>
        <p>{finding.summary}</p>
        {finding.fixHint === null ? null : (
          <p className={styles["findingHint"]!}>{finding.fixHint}</p>
        )}
        {finding.detailState === "redacted_unavailable" ? (
          <span className={styles["redactedDetail"]!}>
            <EyeOff aria-hidden="true" /> Additional detail is unavailable after redaction.
          </span>
        ) : null}
        {finding.suppressed ? (
          <p className={styles["suppressionReason"]!}>
            Not counted · {finding.suppressionReason ?? "No suppression reason was provided."}
          </p>
        ) : null}
      </div>
      <div className={styles["findingActions"]!}>
        <Button type="button" variant="outline" onClick={() => void copyFinding()}>
          {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function Group({ group }: { readonly group: ScanFindingGroupView }) {
  const attention = group.counts.errors + group.counts.warnings;
  const total = group.findings.length;
  return (
    <Collapsible defaultOpen={attention > 0} className={styles["scannerGroup"]!}>
      <CollapsibleTrigger asChild>
        <Button className={styles["scannerGroupTrigger"]!} variant="ghost">
          <span className={`${styles["scanSeverityDot"]!} ${severityTone(group.worstSeverity)}`} />
          <strong>{group.name}</strong>
          <span className={styles["groupFindingCount"]!}>
            {total} {total === 1 ? "finding" : "findings"}
          </span>
          <Badge variant={attention > 0 ? "warning" : "muted"}>
            {attention > 0 ? "Needs attention" : "Info only"}
          </Badge>
          <ChevronRight className={styles["scannerChevron"]!} aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={styles["scannerGroupContent"]!}>
        {group.findings.map((finding) => (
          <FindingRow finding={finding} key={finding.checkId} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function unavailableCopy(scan: HealthScanFindingsView): { readonly title: string; readonly detail: string } {
  if (scan.availability === "not-configured") {
    return {
      title: "Health data isn't set up",
      detail: "Deep-scan groups are unavailable. No healthy zero is inferred.",
    };
  }
  return {
    title: "No scan yet",
    detail: "Live RPC components keep their own state. Deep-scan findings are not reported as zero.",
  };
}

export function ScannerFindings({ scan }: { readonly scan: HealthScanFindingsView }) {
  const totals = scan.groups.reduce(
    (sum, group) => ({
      errors: sum.errors + group.counts.errors,
      warnings: sum.warnings + group.counts.warnings,
      info: sum.info + group.counts.info,
      suppressed: sum.suppressed + group.counts.suppressed,
    }),
    { errors: 0, warnings: 0, info: 0, suppressed: 0 },
  );
  const unavailable = unavailableCopy(scan);

  return (
    <Card className={styles["scanner"]!}>
      <div className={styles["scannerHeader"]!}>
        <div>
          <span className={styles["eyebrow"]!}>Scanner findings · deep scan</span>
          {scan.inProgress ? <p>Scan in progress · showing the previous recorded result.</p> : null}
        </div>
        {scan.availability === "available" ? (
          <div className={styles["scannerCounts"]!} aria-label="Deep scan finding counts">
            errors <strong className={styles["scanError"]!}>{totals.errors}</strong> · warnings{" "}
            <strong className={styles["scanWarning"]!}>{totals.warnings}</strong> · info{" "}
            <strong>{totals.info}</strong> · suppressed <strong>{totals.suppressed}</strong>
          </div>
        ) : null}
      </div>
      {scan.availability !== "available" ? (
        <div className={styles["scannerUnavailable"]!} data-availability={scan.availability}>
          <strong>{unavailable.title}</strong>
          <p>{unavailable.detail}</p>
        </div>
      ) : scan.groups.length === 0 ? (
        <div className={styles["scannerClean"]!}>
          <strong>No findings in the recorded scan</strong>
          <p>The completed deep scan returned no findings.</p>
        </div>
      ) : (
        scan.groups.map((group) => <Group group={group} key={group.name} />)
      )}
    </Card>
  );
}
