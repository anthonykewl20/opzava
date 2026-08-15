"use client";

import { useActionState, useState } from "react";

import { changePasswordAction, securityAction, type ChangePasswordActionState, type SecurityActionState } from "@/app/(auth)/security/actions";
import { finishPasskeyEnrollmentAction, managePasskeyAction, startPasskeyEnrollmentAction } from "@/app/(auth)/security/actions";
import { createPasskey } from "@/lib/webauthn-json";
import { useRouter } from "next/navigation";

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

export function SecurityForm({ enabled, remaining, passkeys }: { readonly enabled: boolean; readonly remaining: number; readonly passkeys: readonly import("@opzava/ports").Passkey[] | undefined }) {
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

  return <>
    <section className="card" aria-labelledby="password-heading">
      <div className="card-header"><h2 className="card-title" id="password-heading">Change password</h2></div>
      <div className="card-content"><ChangePasswordForm /></div>
    </section>
    <section className="card" aria-labelledby="security-heading">
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
    </section>
    {passkeys === undefined
      ? <p className="hint" role="status">Passkeys are not configured on this deployment.</p>
      : <PasskeySection passkeys={passkeys} />}
  </>;
}

function PasskeySection({ passkeys }: { readonly passkeys: readonly import("@opzava/ports").Passkey[] }) {
  const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [message, setMessage] = useState<string>(); const [pending, setPending] = useState(false); const router = useRouter();
  async function enroll() {
    setPending(true); setMessage(undefined);
    try { const started = await startPasskeyEnrollmentAction(password); if (!started.ok || started.challengeId === undefined || started.options === undefined) { setMessage(started.message ?? "We could not start passkey setup."); return; } const response = await createPasskey(started.options); const finished = await finishPasskeyEnrollmentAction(started.challengeId, response, name); setMessage(finished.message); if (finished.ok) { setPassword(""); setName(""); router.refresh(); } } catch { setMessage("Passkey enrollment was cancelled or could not be verified."); } finally { setPending(false); }
  }
  async function manage(intent: "rename" | "revoke", id: string, currentName: string) {
    const freshPassword = window.prompt("Enter your current password to continue."); if (freshPassword === null || freshPassword === "") return;
    const nextName = intent === "rename" ? window.prompt("Passkey name", currentName) : undefined;
    if (intent === "rename" && (nextName === null || nextName === undefined || nextName.trim() === "")) return;
    const result = await managePasskeyAction(intent, id, freshPassword, nextName ?? undefined); setMessage(result.message); if (result.ok) router.refresh();
  }
  return <section className="card" aria-labelledby="passkeys-heading"><div className="card-header"><h2 className="card-title" id="passkeys-heading">Passkeys</h2></div><div className="card-content">
    <p>Use a passkey to sign in without a password. Adding one requires your current password.</p>
    {passkeys.length === 0 ? <p className="hint">No passkeys added yet.</p> : <ul>{passkeys.map((passkey) => <li key={passkey.id}>{passkey.name} <span className="hint">{passkey.deviceType === "multiDevice" ? "synced" : "device-bound"}</span> <button className="link" type="button" onClick={() => void manage("rename", passkey.id, passkey.name)}>Rename</button> <button className="link" type="button" onClick={() => void manage("revoke", passkey.id, passkey.name)}>Remove</button></li>)}</ul>}
    {message === undefined ? null : <p className="hint" role="alert">{message}</p>}
    <label className="label" htmlFor="passkey-name">Passkey name</label><input className="input" id="passkey-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="This device" />
    <label className="label" htmlFor="passkey-password">Current password</label><input className="input" id="passkey-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
    <button className="btn btn-primary" type="button" disabled={pending || password === ""} onClick={() => void enroll()}>{pending ? "Adding passkey…" : "Add a passkey"}</button>
  </div></section>;
}

function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, { status: "idle" } satisfies ChangePasswordActionState);
  return <form action={formAction}>
    {state.message === undefined ? null : <div className={state.status === "success" ? "sb-alert" : "sb-alert sb-alert--destructive"} role="alert">{state.message}</div>}
    <p>Use your current password to set a new one. Other signed-in devices will be signed out.</p>
    <label className="label" htmlFor="current-password">Current password</label>
    <input className="input" id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
    <label className="label" htmlFor="new-password">New password</label>
    <input className="input" id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
    <label className="label" htmlFor="confirm-password">Confirm new password</label>
    <input className="input" id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required />
    <button className="btn btn-primary" type="submit" disabled={pending}>Change password</button>
  </form>;
}
