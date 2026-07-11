"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SetupTokenFlowPollState, SetupTokenFlowStart } from "@opzava/ports";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pollUntilTerminal, postConnectionsMutation } from "@/lib/connections-mutation-client";
import { sanitizeSetupTokenCode } from "@/lib/setup-token-code";
import { cn } from "@/lib/utils";

type Phase =
  | { readonly step: "idle" }
  | { readonly step: "starting" }
  | { readonly step: "awaiting_code"; readonly flowId: string; readonly authorizeUrl: string }
  | { readonly step: "completing"; readonly flowId: string; readonly authorizeUrl: string | null }
  | { readonly step: "connected"; readonly message: string }
  | { readonly step: "failed"; readonly message: string; readonly code: string | null };

const ALERT_TONE = {
  success: "border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[var(--success-soft)]",
  destructive: "border-destructive/30 bg-destructive/10",
  neutral: "border-border bg-muted",
} as const;

function SetupTokenNotice({
  tone,
  title,
  children,
  role = "status",
}: {
  readonly tone: keyof typeof ALERT_TONE;
  readonly title: string;
  readonly children: ReactNode;
  readonly role?: "status" | "alert";
}) {
  return (
    <div role={role} className={cn("rounded-lg border p-3 text-sm", ALERT_TONE[tone])}>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
    </div>
  );
}

function failurePhase(failure: { readonly message: string; readonly code: string | null }): Phase {
  return { step: "failed", message: failure.message, code: failure.code };
}

export function SetupTokenConnect({ providerId }: { readonly providerId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [code, setCode] = useState("");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const busy =
    phase.step === "starting" ||
    phase.step === "completing";

  useEffect(() => {
    const flowId =
      phase.step === "awaiting_code" || phase.step === "completing" ? phase.flowId : null;
    if (flowId === null) {
      return undefined;
    }
    let cancelled = false;

    void pollUntilTerminal<SetupTokenFlowPollState>({
      poll: () =>
        postConnectionsMutation<SetupTokenFlowPollState>(
          "/api/connections/model/setup-token/poll",
          { flowId },
          { timeoutMs: 10_000 },
        ),
      isTerminal: (data) =>
        data.status === "connected" || data.status === "failed" || data.status === "expired",
      onPending: (data) => {
        if (cancelled || data.status !== "awaiting_code") {
          return;
        }
        const current = phaseRef.current;
        if (current.step !== "awaiting_code" || current.authorizeUrl !== data.authorizeUrl) {
          setPhase({ step: "awaiting_code", flowId, authorizeUrl: data.authorizeUrl });
        }
      },
      shouldContinue: () => !cancelled,
      maxDurationMs: 10 * 60 * 1000,
    }).then((outcome) => {
      if (cancelled) {
        return;
      }
      if (!outcome.ok) {
        if (outcome.kind !== "cancelled") {
          setPhase(failurePhase(outcome));
        }
        return;
      }
      const data = outcome.data;
      if (data.status === "connected") {
        setPhase({
          step: "connected",
          message: "Claude subscription connected in Opzava Gateway.",
        });
        router.refresh();
        return;
      }
      if (data.status === "failed" || data.status === "expired") {
        setPhase({ step: "failed", message: data.message, code: data.code ?? null });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [phase.step === "awaiting_code" || phase.step === "completing" ? phase.flowId : null, router]);

  const start = useCallback(async () => {
    if (phaseRef.current.step === "starting" || phaseRef.current.step === "completing") {
      return;
    }
    setCode("");
    setPhase({ step: "starting" });
    const result = await postConnectionsMutation<SetupTokenFlowStart>(
      "/api/connections/model/setup-token",
      { providerId },
    );
    if (!result.ok) {
      setPhase(failurePhase(result));
      return;
    }
    setPhase({ step: "completing", flowId: result.data.flowId, authorizeUrl: null });
  }, [providerId]);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const current = phaseRef.current;
      if (current.step !== "awaiting_code") {
        // Never swallow a click: the flow can expire underneath the form (10 min window).
        setPhase({
          step: "failed",
          message: "This sign-in window is no longer active. Start the flow again.",
          code: "web.setupTokenFlowInactive",
        });
        return;
      }
      const sanitized = sanitizeSetupTokenCode(code);
      if (sanitized.length === 0 || sanitized.length > 512) {
        setPhase({
          step: "failed",
          message:
            "Extra text such as a URL or stray characters was copied. Re-copy only the authorization code Claude shows.",
          code: "web.invalidRequest",
        });
        return;
      }
      setPhase({
        step: "completing",
        flowId: current.flowId,
        authorizeUrl: current.authorizeUrl,
      });
      const result = await postConnectionsMutation<{ readonly status: "pending" }>(
        "/api/connections/model/setup-token/code",
        { flowId: current.flowId, code: sanitized },
      );
      setCode("");
      if (!result.ok) {
        setPhase(failurePhase(result));
      }
    },
    [code],
  );

  if (phase.step === "awaiting_code") {
    return (
      <form onSubmit={submit} className="grid gap-4">
        <SetupTokenNotice tone="neutral" title="Authorize Claude subscription">
          Approve in the browser, then paste the code Claude shows you.
        </SetupTokenNotice>
        <Button asChild size="sm">
          <a href={phase.authorizeUrl} target="_blank" rel="noreferrer">
            Open Claude authorization
          </a>
        </Button>
        <div className="grid gap-2">
          <Label htmlFor={`${providerId}-setup-token-code`}>Authorization code</Label>
          <Input
            id={`${providerId}-setup-token-code`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            disabled={busy}
            required
          />
        </div>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          Connect Claude subscription
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-4">
      {phase.step === "failed" ? (
        <SetupTokenNotice
          tone="destructive"
          role="alert"
          title="Claude subscription connect failed"
        >
          {phase.message}
        </SetupTokenNotice>
      ) : null}
      {phase.step === "connected" ? (
        <SetupTokenNotice tone="success" title="Connection updated">
          {phase.message}
        </SetupTokenNotice>
      ) : null}
      {phase.step === "starting" || phase.step === "completing" ? (
        <div
          className="connections-device-flow connections-device-flow--pending"
          aria-live="polite"
        >
          <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
          <div>
            <div className="label">
              {phase.step === "starting" ? "Starting Claude sign-in" : "Completing connection"}
            </div>
            <p className="hint">Waiting for the Claude CLI inside Opzava Gateway.</p>
          </div>
        </div>
      ) : null}
      <Button type="button" onClick={() => void start()} disabled={busy} aria-busy={busy}>
        {phase.step === "failed" ? "Retry Claude subscription" : "Connect with Claude subscription"}
      </Button>
    </div>
  );
}
