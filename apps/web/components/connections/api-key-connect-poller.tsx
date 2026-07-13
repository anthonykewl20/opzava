"use client";

import { useEffect, useRef } from "react";

import type { ModelProviderApiKeyConnectPollState } from "@opzava/ports";
import { pollUntilTerminal, postConnectionsMutation } from "@/lib/connections-mutation-client";

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
// The worker now proves the credential with a live provider call before reporting success, and a
// credential the provider REJECTS is removed again before the connect fails (#183). That rollback
// paces one gateway logout per agent, so a failing connect can run minutes rather than seconds —
// give the poller the same window the disconnect poller already uses, or the browser stops watching
// before the reason it is waiting for arrives.
const apiKeyConnectPollMaxDurationMs = 10 * 60 * 1000;

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
      maxDurationMs: apiKeyConnectPollMaxDurationMs,
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
          Writing the credential into Opzava Gateway, then checking it against the provider with one
          real call. A credential the provider rejects is removed again rather than kept.
        </p>
      </div>
    </div>
  );
}
