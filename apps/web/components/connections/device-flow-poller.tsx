"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  deviceFlowPollSchedule,
  deviceFlowReducer,
  type DeviceFlowUiState,
} from "@/lib/connections-state";

interface DeviceFlowPollerProps {
  readonly flowId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly intervalSeconds: number;
  readonly expiresAt: string;
}

export function DeviceFlowPoller({
  flowId,
  verificationUri,
  userCode,
  intervalSeconds,
  expiresAt,
}: DeviceFlowPollerProps) {
  const router = useRouter();
  const [state, setState] = useState<DeviceFlowUiState>({
    status: "pending",
    message: "Waiting for device authorization.",
  });

  useEffect(() => {
    let cancelled = false;
    let timeout: number | null = null;
    let delayMs = Math.max(intervalSeconds, 2) * 1000;
    const clearPollTimeout = () => {
      if (timeout !== null) {
        window.clearTimeout(timeout);
        timeout = null;
      }
    };
    const stop = () => {
      cancelled = true;
      clearPollTimeout();
    };
    const expireIfNeeded = () => {
      const schedule = deviceFlowPollSchedule({
        status: "pending",
        expiresAt,
        nowMs: Date.now(),
        baseIntervalSeconds: intervalSeconds,
        previousDelayMs: delayMs,
      });
      if (schedule.expired) {
        setState({ status: "expired", message: "Device code expired." });
        stop();
        return true;
      }

      return false;
    };
    function scheduleNext(nextDelayMs: number) {
      if (cancelled) {
        return;
      }

      clearPollTimeout();
      timeout = window.setTimeout(() => {
        void poll();
      }, nextDelayMs);
    }
    async function poll() {
      if (expireIfNeeded()) {
        return;
      }

      let response: Response;
      try {
        response = await fetch("/api/connections/device-flow", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowId }),
        });
      } catch {
        if (!cancelled) {
          setState({ status: "failed", message: "Device authorization polling failed." });
        }
        stop();
        return;
      }

      if (!response.ok) {
        if (!cancelled) {
          setState({ status: "failed", message: "Device authorization polling failed." });
        }
        stop();
        return;
      }

      const payload = (await response.json()) as Parameters<typeof deviceFlowReducer>[1];
      if (cancelled) {
        return;
      }

      setState((current) => deviceFlowReducer(current, payload));
      if (payload.status === "connected") {
        router.refresh();
      }
      const schedule = deviceFlowPollSchedule({
        status: payload.status,
        expiresAt,
        nowMs: Date.now(),
        baseIntervalSeconds: intervalSeconds,
        previousDelayMs: delayMs,
        event: payload,
      });
      if (schedule.expired) {
        setState({ status: "expired", message: "Device code expired." });
      }
      if (schedule.stop) {
        stop();
        return;
      }

      delayMs = schedule.nextDelayMs;
      scheduleNext(delayMs);
    }

    void poll();

    return () => {
      stop();
    };
  }, [expiresAt, flowId, intervalSeconds, router]);

  return (
    <div className="connections-device-flow" aria-live="polite">
      <div>
        <div className="label">Authorize in browser</div>
        <a href={verificationUri} target="_blank" rel="noopener noreferrer">
          {verificationUri}
        </a>
      </div>
      <div>
        <div className="label">Code</div>
        <span className="connections-device-code u-mono">{userCode}</span>
      </div>
      <p className="hint">
        {state.message} Expires {new Date(expiresAt).toLocaleTimeString()}.
      </p>
    </div>
  );
}
