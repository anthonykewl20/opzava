"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

export const CONNECTIONS_REFRESH_INTERVAL_MS = 30_000;

export function ConnectionsAutoRefresh() {
  const router = useRouter();
  const [isPending, startRefreshTransition] = useTransition();
  const refreshScheduled = useRef(false);

  useEffect(() => {
    if (!isPending) refreshScheduled.current = false;
  }, [isPending]);

  const refresh = useCallback(() => {
    if (refreshScheduled.current) return;
    refreshScheduled.current = true;
    startRefreshTransition(() => router.refresh());
  }, [router, startRefreshTransition]);

  useEffect(() => {
    const interval = window.setInterval(refresh, CONNECTIONS_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return (
    <span className="sr-only" aria-live="polite">
      {isPending ? "Refreshing connection health" : ""}
    </span>
  );
}
