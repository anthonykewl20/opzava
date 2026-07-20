"use client";

import { useEffect, useState } from "react";

export function useCountUp(value: number, durationMs = 900): number {
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
