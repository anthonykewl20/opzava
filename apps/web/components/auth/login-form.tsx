"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginActionState } from "@/app/(auth)/login/actions";

const initialLoginActionState: LoginActionState = { status: "idle" };

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
  const [passwordVisible, setPasswordVisible] = useState(false);

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
            {passwordVisible ? "Hide" : "Show"}
          </button>
        </div>
        {fieldError("password") ? (
          <p className="hint" id="password-error">
            {fieldError("password")}
          </p>
        ) : null}
      </div>

      <div className="auth-row-between">
        <label className="auth-check">
          <input type="checkbox" name="rememberDevice" />
          Remember this device
        </label>
      </div>

      <SubmitButton />
    </form>
  );
}
