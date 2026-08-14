"use client";

import { useActionState } from "react";

import { securityAction, type SecurityActionState } from "@/app/(auth)/security/actions";

const initialState: SecurityActionState = { status: "idle" };

/** Pending-enrollment fields are pure so the error state remains renderable and testable. */
export function MfaEnrollmentFields({ secret, otpauthUri, generation }: {
  readonly secret: string;
  readonly otpauthUri: string;
  readonly generation: string;
}) {
  return <>
    <input type="hidden" name="generation" value={generation} />
    <p>Scan this setup URI with your authenticator app, or enter the setup key below. It is shown only for this enrollment.</p>
    <label className="label" htmlFor="setup-uri">Setup URI</label>
    <input className="input" id="setup-uri" readOnly value={otpauthUri} />
    <label className="label" htmlFor="setup-secret">Setup key</label>
    <input className="input" id="setup-secret" readOnly value={secret} />
    <label className="label" htmlFor="enable-code">6-digit verification code</label>
    <input className="input" id="enable-code" name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required />
  </>;
}

export function SecurityForm({ enabled, remaining }: { readonly enabled: boolean; readonly remaining: number }) {
  const [state, formAction, pending] = useActionState(securityAction, initialState);
  const effectiveEnabled = state.status === "disabled" ? false : enabled || state.status === "recovery";

  if (state.status === "recovery" && state.recoveryCodes !== undefined) {
    const codes = state.recoveryCodes.join("\n");
    function downloadCodes() {
      const url = URL.createObjectURL(new Blob([`${codes}\n`], { type: "text/plain" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "opzava-recovery-codes.txt";
      anchor.click();
      URL.revokeObjectURL(url);
    }
    return <section className="card" aria-labelledby="recovery-heading">
      <div className="card-header"><h2 className="card-title" id="recovery-heading">Save your recovery codes</h2></div>
      <div className="card-content">
        <p>Each code works once. Store them somewhere safe — you will not see them again.</p>
        <pre className="input" style={{ height: "auto", whiteSpace: "pre-wrap", marginTop: "var(--space-4)" }}>{codes}</pre>
        <button className="btn" type="button" onClick={() => void navigator.clipboard?.writeText(codes)}>Copy codes</button>
        <button className="btn" type="button" onClick={downloadCodes}>Download codes</button>
      </div>
    </section>;
  }

  return <section className="card" aria-labelledby="security-heading">
    <div className="card-header"><h1 className="card-title" id="security-heading">Security & account</h1></div>
    <div className="card-content">
      {state.message !== undefined ? <div className="sb-alert sb-alert--destructive" role="alert">{state.message}</div> : null}
      {!effectiveEnabled && state.status !== "enrolling" ? <form action={formAction}>
        <input type="hidden" name="intent" value="start" />
        <p>Protect your account with an authenticator app and one-time recovery codes.</p>
        <label className="label" htmlFor="enrollment-password">Account password</label>
        <input className="input" id="enrollment-password" name="password" type="password" autoComplete="current-password" required />
        <button className="btn btn-primary" type="submit" disabled={pending}>{state.message === "Enrollment expired — start again." ? "Restart enrollment" : "Enable two-factor"}</button>
      </form> : null}
      {state.status === "enrolling" && state.secret !== undefined && state.otpauthUri !== undefined && state.generation !== undefined ? <form action={formAction}>
        <input type="hidden" name="intent" value="enable" />
        <MfaEnrollmentFields secret={state.secret} otpauthUri={state.otpauthUri} generation={state.generation} />
        <button className="btn btn-primary" type="submit" disabled={pending}>Verify and enable</button>
      </form> : null}
      {effectiveEnabled && state.status !== "recovery" ? <form action={formAction}>
        <input type="hidden" name="intent" value="disable" />
        <input type="hidden" name="method" value="totp" />
        <p>Two-factor is on. {remaining > 0 ? `${remaining} recovery codes remain.` : "No recovery codes remain."}</p>
        <label className="label" htmlFor="disable-code">Authenticator code</label>
        <input className="input" id="disable-code" name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required />
        <button className="btn" type="submit" disabled={pending}>Turn off two-factor</button>
      </form> : null}
    </div>
  </section>;
}
