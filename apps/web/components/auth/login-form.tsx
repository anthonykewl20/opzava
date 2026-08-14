"use client";

import { useActionState, useRef, useState, type ClipboardEvent, type ChangeEvent, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginActionState, verifyMfaAction } from "@/app/(auth)/login/actions";

const initialLoginActionState: LoginActionState = { status: "idle" };

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S5.5 5.5 12 5.5 21.5 12 21.5 12 18.5 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {off ? <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /> : null}
    </svg>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>
      {pending ? (
        <>
          <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
          Signing in...
        </>
      ) : (
        "Sign in"
      )}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialLoginActionState);
  const [mfaState, mfaFormAction] = useActionState(verifyMfaAction, initialLoginActionState);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [totpDigits, setTotpDigits] = useState<string[]>(() => Array.from({ length: 6 }, () => ""));
  const totpInputs = useRef<Array<HTMLInputElement | null>>([]);

  function setTotpValue(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6).split("");
    setTotpDigits(Array.from({ length: 6 }, (_, index) => digits[index] ?? ""));
  }

  function onTotpChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "");
    if (digits.length > 1) {
      setTotpValue(`${totpDigits.slice(0, index).join("")}${digits}`);
      totpInputs.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }
    const next = [...totpDigits];
    next[index] = digits;
    setTotpDigits(next);
    if (digits !== "") totpInputs.current[index + 1]?.focus();
  }

  function onTotpPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    setTotpValue(event.clipboardData.getData("text"));
    totpInputs.current[5]?.focus();
  }

  function onTotpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && totpDigits[index] === "") totpInputs.current[index - 1]?.focus();
  }

  if (state.status === "mfa" && state.challengeId !== undefined) {
    return (
      <form action={mfaFormAction} noValidate>
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <input type="hidden" name="method" value={recovery ? "recovery-code" : "totp"} />
        {!recovery ? <input type="hidden" name="code" value={totpDigits.join("")} /> : null}
        {mfaState.message !== undefined ? (
          <div className="sb-alert sb-alert--destructive" role="alert">
            <span className="ico" aria-hidden="true">!</span>
            <strong className="sb-alert-title">Could not verify</strong>
            <span className="sb-alert-desc">{mfaState.message}</span>
          </div>
        ) : null}
        <div className="field" style={{ marginTop: mfaState.message === undefined ? 0 : "var(--space-4)" }}>
          <label className="label" htmlFor="mfa-code">
            {recovery ? "Recovery code" : "Verification code"}
          </label>
          {recovery ? <input
            className="input"
            id="mfa-code"
            name="code"
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="ABCDE-FGHIJ"
            required
          /> : <div aria-label="Six-digit verification code" style={{ display: "flex", gap: "var(--space-2)" }}>
            {totpDigits.map((digit, index) => <input
              key={index}
              ref={(element) => { totpInputs.current[index] = element; }}
              aria-label={`Verification code digit ${index + 1}`}
              className="input"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={6}
              onChange={(event) => onTotpChange(index, event)}
              onKeyDown={(event) => onTotpKeyDown(index, event)}
              onPaste={onTotpPaste}
              pattern="[0-9]"
              required
              style={{ width: "48px", height: "48px", padding: 0, textAlign: "center", fontSize: "var(--text-lg)" }}
              type="text"
              value={digit}
            />)}
          </div>}
          <p className="hint">
            {recovery ? "Use one of the recovery codes you saved." : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
        <SubmitButton />
        <p className="auth-foot">
          <button className="link" type="button" onClick={() => setRecovery((current) => !current)}>
            {recovery ? "Use an authenticator code" : "Use a recovery code"}
          </button>
        </p>
        <p className="auth-foot"><a className="link" href="/login">← Back</a></p>
      </form>
    );
  }

  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && state.message !== undefined ? (
        <div className="sb-alert sb-alert--destructive" role="alert">
          <span className="ico" aria-hidden="true">
            !
          </span>
          <strong className="sb-alert-title">Could not sign in</strong>
          <span className="sb-alert-desc">{state.message}</span>
        </div>
      ) : null}

      <div className="field" style={{ marginTop: state.status === "error" ? "var(--space-4)" : 0 }}>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          aria-describedby={fieldError("email") ? "email-error" : undefined}
          aria-invalid={fieldError("email") ? "true" : undefined}
          className="input"
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@company.com"
        />
        {fieldError("email") ? (
          <p className="hint" id="email-error">
            {fieldError("email")}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          Password
        </label>
        <div className="auth-pw">
          <input
            aria-describedby={fieldError("password") ? "password-error" : undefined}
            aria-invalid={fieldError("password") ? "true" : undefined}
            className="input"
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Your password"
          />
          <button
            className="auth-pw-toggle"
            type="button"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            onClick={() => {
              setPasswordVisible((value) => !value);
            }}
          >
            <EyeIcon off={passwordVisible} />
          </button>
        </div>
        {fieldError("password") ? (
          <p className="hint" id="password-error">
            {fieldError("password")}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
