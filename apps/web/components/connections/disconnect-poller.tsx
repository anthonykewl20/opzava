"use client";

import { useEffect, useRef } from "react";

import type { ModelProviderDisconnectPollState } from "@opzava/ports";
import { pollUntilTerminal, postConnectionsMutation } from "@/lib/connections-mutation-client";

interface DisconnectPollerProps {
  readonly opId: string;
  readonly providerLabel: string;
  readonly onDisconnected: (message: string) => void;
  readonly onFailed: (message: string, code: string | null) => void;
}

// Disconnect logs the provider out of every configured agent, one paced gateway write at a time
// (the gateway caps control-plane writes at 3 per 60s), so a multi-agent tenant runs for minutes.
// Sample fast at first — a single-agent disconnect lands in well under a second — then back off to
// a 5s ceiling so a long run costs dozens of polls rather than hundreds.
const disconnectPollIntervalMs = 1_000;
const disconnectPollMaxIntervalMs = 5_000;
const disconnectPollBackoffFactor = 1.6;
// Stay under the worker's own 15-minute op TTL: if the browser gives up first, the disconnect still
// completes server-side and the next snapshot read shows the truth.
const disconnectPollMaxDurationMs = 10 * 60 * 1000;

/**
 * Drives an in-flight disconnect operation. The worker owns the operation and it outlives this
 * component: unmounting only stops the sampling, never the disconnect itself.
 */
export function DisconnectPoller({
  opId,
  providerLabel,
  onDisconnected,
  onFailed,
}: DisconnectPollerProps) {
  const callbacksRef = useRef({ onDisconnected, onFailed });
  callbacksRef.current = { onDisconnected, onFailed };

  useEffect(() => {
    let cancelled = false;

    void pollUntilTerminal<ModelProviderDisconnectPollState>({
      poll: () =>
        postConnectionsMutation<ModelProviderDisconnectPollState>(
          "/api/connections/model/disconnect/poll",
          { opId },
          { timeoutMs: 10_000 },
        ),
      isTerminal: (data) => data.status !== "pending",
      intervalMs: disconnectPollIntervalMs,
      maxIntervalMs: disconnectPollMaxIntervalMs,
      backoffFactor: disconnectPollBackoffFactor,
      maxDurationMs: disconnectPollMaxDurationMs,
      shouldContinue: () => !cancelled,
    }).then((outcome) => {
      if (cancelled) {
        return;
      }
      if (outcome.ok) {
        const data = outcome.data;
        if (data.status === "disconnected") {
          callbacksRef.current.onDisconnected("Provider disconnected from Opzava Gateway.");
          return;
        }
        if (data.status === "failed" || data.status === "expired") {
          callbacksRef.current.onFailed(data.message, data.code ?? null);
        }
        return;
      }
      if (outcome.kind === "cancelled") {
        return;
      }
      callbacksRef.current.onFailed(outcome.message, outcome.code);
    });

    return () => {
      cancelled = true;
    };
  }, [opId]);

  return (
    <div className="connections-device-flow connections-device-flow--pending" aria-live="polite">
      <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
      <div>
        <div className="label">Disconnecting {providerLabel}</div>
        <p className="hint">
          Signing every agent out of this provider. Opzava Gateway paces these writes, so this can
          take a couple of minutes. You can leave this dialog — the disconnect keeps running.
        </p>
      </div>
    </div>
  );
}
