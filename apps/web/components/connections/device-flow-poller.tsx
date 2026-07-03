"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { deviceFlowReducer, type DeviceFlowUiState } from "@/lib/connections-state";

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
    const poll = async () => {
      let response: Response;
      try {
        response = await fetch("/api/connections/device-flow", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flowId }),
        });
      } catch {
        setState({ status: "failed", message: "Device authorization polling failed." });
        return;
      }

      if (!response.ok) {
        setState({ status: "failed", message: "Device authorization polling failed." });
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
    };

    const interval = window.setInterval(
      () => {
        void poll();
      },
      Math.max(intervalSeconds, 2) * 1000,
    );
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [flowId, intervalSeconds, router]);

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
