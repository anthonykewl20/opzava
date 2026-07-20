"use client";

import { useEffect, useState, type CSSProperties } from "react";

import type { HealthCountsView } from "@/lib/health/health-view-model";

import styles from "./health.module.css";

export const HEALTH_RING_CIRCUMFERENCE = 2 * Math.PI * 70;

export interface HealthRingSegment {
  readonly status: "healthy" | "attention" | "not_checked";
  readonly count: number;
  readonly length: number;
  readonly startDegrees: number;
}

export function healthRingSegments(counts: HealthCountsView): readonly HealthRingSegment[] {
  if (counts.total <= 0) return [];

  const values = [
    { status: "healthy", count: counts.healthy },
    { status: "attention", count: counts.attention },
    { status: "not_checked", count: counts.notChecked },
  ] as const;
  let preceding = 0;

  return values.flatMap((value) => {
    const startDegrees = -90 + (preceding / counts.total) * 360;
    preceding += value.count;
    if (value.count <= 0) return [];
    return [
      {
        ...value,
        length: (value.count / counts.total) * HEALTH_RING_CIRCUMFERENCE,
        startDegrees,
      },
    ];
  });
}

function useCountUp(value: number, durationMs = 900): number {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || value <= 0) {
      setDisplayValue(value);
      return;
    }

    let frameId = 0;
    let startTime: number | null = null;
    setDisplayValue(0);
    const frame = (time: number) => {
      startTime ??= time;
      const progress = Math.min(1, (time - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frameId = window.requestAnimationFrame(frame);
    };
    frameId = window.requestAnimationFrame(frame);

    return () => window.cancelAnimationFrame(frameId);
  }, [durationMs, value]);

  return displayValue;
}

function ringLabel(counts: HealthCountsView | null): string {
  if (counts === null) return "No current health check is available";
  return `${counts.healthy} of ${counts.total} checks healthy, ${counts.attention} need attention, ${counts.notChecked} not checked`;
}

export function HealthRing({ counts }: { readonly counts: HealthCountsView | null }) {
  const healthy = useCountUp(counts?.healthy ?? 0);
  const segments = counts === null ? [] : healthRingSegments(counts);

  return (
    <div className={styles["ringWrap"]!} role="img" aria-label={ringLabel(counts)}>
      <svg className={styles["ringSvg"]!} viewBox="0 0 176 176" aria-hidden="true">
        <circle className={styles["ringTrack"]!} cx="88" cy="88" r="70" />
        {segments.map((segment, index) => {
          const arcStyle = {
            "--health-arc-length": segment.length,
            "--health-arc-delay": `${0.15 + index * 0.24}s`,
            strokeDasharray: `${segment.length} ${HEALTH_RING_CIRCUMFERENCE}`,
          } as CSSProperties;
          return (
            <circle
              className={`${styles["ringArc"]!} ${styles[segment.status]!}`}
              cx="88"
              cy="88"
              data-ring-status={segment.status}
              key={segment.status}
              r="70"
              style={arcStyle}
              transform={`rotate(${segment.startDegrees} 88 88)`}
            />
          );
        })}
      </svg>
      <div className={styles["ringMiddle"]!}>
        <span className={styles["ringNumber"]!}>
          {counts === null ? "—" : `${healthy}/${counts.total}`}
        </span>
        <span className={styles["ringLabel"]!}>
          {counts === null ? "no current check" : "checks healthy"}
        </span>
      </div>
    </div>
  );
}
