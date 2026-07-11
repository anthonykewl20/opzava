"use client";

import { useEffect, useRef } from "react";

import type { ModelProviderApiKeyConnectPollState } from "@opzava/ports";
import {
  pollUntilTerminal,
  postConnectionsMutation,
} from "@/lib/connections-mutation-client";

interface ApiKeyConnectPollerProps {
  readonly opId: string;
  readonly onConnected: (message: string) => void;
  readonly onFailed: (message: string, code: string | null) => void;
}

/**
 * Drives an in-flight API-key connect operation over plain fetch polling. The worker owns the
 * operation; this component only samples its status until terminal. Sad paths: bounded transient
 * retries for network blips, hard errors surface immediately, the whole window is bounded, and
 * unmounting cancels cleanly (the operation itself continues server-side).
 */
export function ApiKeyConnectPoller({ opId, onConnected, onFailed }: ApiKeyConnectPollerProps) {
  const callbacksRef = useRef({ onConnected, onFailed });
  callbacksRef.current = { onConnected, onFailed };

  useEffect(() => {
    let cancelled = false;

    void pollUntilTerminal<ModelProviderApiKeyConnectPollState>({
      poll: () =>
        postConnectionsMutation<ModelProviderApiKeyConnectPollState>(
          "/api/connections/model/api-key/poll",
          { opId },
          { timeoutMs: 10_000 },
        ),
      isTerminal: (data) => data.status !== "pending",
      shouldContinue: () => !cancelled,
    }).then((outcome) => {
      if (cancelled) {
        return;
      }
      if (outcome.ok) {
        const data = outcome.data;
        if (data.status === "connected") {
          callbacksRef.current.onConnected("Provider connected in Opzava Gateway.");
          return;
        }
        if (data.status === "failed" || data.status === "expired") {
          callbacksRef.current.onFailed(data.message, data.code ?? null);
          return;
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
        <div className="label">Connecting provider</div>
        <p className="hint">
          Writing the credential into Opzava Gateway. This survives the gateway&apos;s own restart
          and usually finishes within seconds.
        </p>
      </div>
    </div>
  );
}
