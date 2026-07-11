"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  deviceFlowPollSchedule,
  deviceFlowReducer,
  type DeviceFlowUiState,
} from "@/lib/connections-state";

interface DeviceFlowPollerProps {
  readonly flowId: string;
  readonly verificationUri: string;
  readonly userCode: string;
  readonly codePending?: boolean | undefined;
  readonly intervalSeconds: number;
  readonly expiresAt: string;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function currentDeviceFlowCodeFields(
  current: DeviceFlowUiState,
): Pick<DeviceFlowUiState, "verificationUri" | "userCode"> {
  return {
    ...(current.verificationUri === undefined ? {} : { verificationUri: current.verificationUri }),
    ...(current.userCode === undefined ? {} : { userCode: current.userCode }),
  };
}

export function DeviceFlowPoller({
  flowId,
  verificationUri,
  userCode,
  codePending,
  intervalSeconds,
  expiresAt,
}: DeviceFlowPollerProps) {
  const router = useRouter();
  const initialVerificationUri = verificationUri.trim() === "" ? undefined : verificationUri;
  const initialUserCode = userCode.trim() === "" ? undefined : userCode;
  const initialCodePending =
    codePending ?? (initialVerificationUri === undefined || initialUserCode === undefined);
  const [state, setState] = useState<DeviceFlowUiState>({
    status: "pending",
    message: initialCodePending ? "Requesting device code..." : "Waiting for device authorization.",
    ...(initialVerificationUri === undefined ? {} : { verificationUri: initialVerificationUri }),
    ...(initialUserCode === undefined ? {} : { userCode: initialUserCode }),
    codePending: initialCodePending,
  });
  const [copied, setCopied] = useState(false);

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
        setState((current) => ({
          status: "expired",
          message:
            current.codePending === true
              ? "Could not get a device code, try again."
              : "Device code expired.",
          ...currentDeviceFlowCodeFields(current),
          codePending: false,
        }));
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
          setState((current) => ({
            status: "failed",
            message: "Device authorization polling failed.",
            ...currentDeviceFlowCodeFields(current),
            codePending: false,
          }));
        }
        stop();
        return;
      }

      if (!response.ok) {
        if (!cancelled) {
          setState((current) => ({
            status: "failed",
            message: "Device authorization polling failed.",
            ...currentDeviceFlowCodeFields(current),
            codePending: false,
          }));
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
        setState((current) => ({
          status: "expired",
          message:
            current.codePending === true
              ? "Could not get a device code, try again."
              : "Device code expired.",
          ...currentDeviceFlowCodeFields(current),
          codePending: false,
        }));
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

  const hasCode =
    state.codePending !== true && present(state.verificationUri) && present(state.userCode);
  const expiresLabel = new Date(expiresAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const copyCode = () => {
    if (!present(state.userCode)) {
      return;
    }
    void navigator.clipboard
      ?.writeText(state.userCode)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  if (state.status === "connected") {
    return (
      <div className="connections-device-flow connections-device-flow--done" aria-live="polite">
        <span
          className="connections-device-flow__badge connections-device-flow__badge--ok"
          aria-hidden="true"
        >
          ✓
        </span>
        <div>
          <div className="label">Connected</div>
          <p className="hint">{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === "expired" || state.status === "failed") {
    return (
      <div
        className="connections-device-flow connections-device-flow--error"
        aria-live="assertive"
      >
        <span
          className="connections-device-flow__badge connections-device-flow__badge--err"
          aria-hidden="true"
        >
          !
        </span>
        <div>
          <div className="label">
            {state.status === "expired" ? "Device code expired" : "Authorization failed"}
          </div>
          <p className="hint">{state.message}</p>
          <p className="hint">Close this dialog and start the device flow again.</p>
        </div>
      </div>
    );
  }

  if (!hasCode) {
    return (
      <div
        className="connections-device-flow connections-device-flow--pending"
        aria-live="polite"
      >
        <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
        <div>
          <div className="label">Generating your device code</div>
          <p className="hint">This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="connections-device-flow" aria-live="polite">
      <ol className="connections-device-steps">
        <li className="connections-device-steps__item">
          <span className="connections-device-steps__n" aria-hidden="true">
            1
          </span>
          <div className="connections-device-steps__body">
            <div className="label">Copy your one-time code</div>
            <div className="connections-device-coderow">
              <span className="connections-device-code u-mono">{state.userCode}</span>
              <Button type="button" variant="secondary" size="sm" onClick={copyCode}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </li>
        <li className="connections-device-steps__item">
          <span className="connections-device-steps__n" aria-hidden="true">
            2
          </span>
          <div className="connections-device-steps__body">
            <div className="label">Open the sign-in page and enter the code</div>
            <Button asChild size="sm">
              <a href={state.verificationUri} target="_blank" rel="noopener noreferrer">
                Open sign-in page
                <span aria-hidden="true"> ↗</span>
              </a>
            </Button>
          </div>
        </li>
      </ol>
      <div className="connections-device-flow__status">
        <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
        <p className="hint">Waiting for you to approve in the browser. Expires {expiresLabel}.</p>
      </div>
    </div>
  );
}
