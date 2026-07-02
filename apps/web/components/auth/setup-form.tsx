"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { setupFirstOwnerAction, type SetupActionState } from "@/app/(auth)/setup/actions";

interface SetupFormProps {
  readonly idempotencyKey: string;
  readonly defaultTimezone: string;
}

const timezoneOptions = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Manila",
  "Asia/Singapore",
  "Australia/Sydney"
] as const;

const initialSetupActionState: SetupActionState = { status: "idle" };

function passwordScore(password: string): number {
  if (password.length === 0) {
    return 0;
  }

  let score = password.length >= 12 ? 1 : 0;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score += 1;
  }
  if (/[0-9]/.test(password)) {
    score += 1;
  }
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 16) {
    score += 1;
  }

  return Math.min(score, 4);
}

function strengthWord(score: number): string {
  if (score <= 1) {
    return "Too weak";
  }
  if (score === 2) {
    return "Getting there";
  }
  if (score === 3) {
    return "Good";
  }
  return "Strong";
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>
      {pending ? (
        <>
          <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
          Creating workspace...
        </>
      ) : (
        "Create workspace"
      )}
    </button>
  );
}

export function SetupForm({ idempotencyKey, defaultTimezone }: SetupFormProps) {
  const [state, formAction] = useActionState(setupFirstOwnerAction, initialSetupActionState);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [password, setPassword] = useState("");
  const score = useMemo(() => passwordScore(password), [password]);

  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {state.status === "error" && state.message !== undefined ? (
        <div className="sb-alert sb-alert--destructive" role="alert">
          <span className="ico" aria-hidden="true">
            !
          </span>
          <strong className="sb-alert-title">Setup needs attention</strong>
          <span className="sb-alert-desc">{state.message}</span>
        </div>
      ) : null}

      <div className="field" style={{ marginTop: state.status === "error" ? "var(--space-4)" : 0 }}>
        <label className="label" htmlFor="ownerName">
          Your name
        </label>
        <input
          aria-describedby={fieldError("ownerName") ? "ownerName-error" : undefined}
          aria-invalid={fieldError("ownerName") ? "true" : undefined}
          className="input"
          id="ownerName"
          name="ownerName"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
        />
        {fieldError("ownerName") ? (
          <p className="hint" id="ownerName-error">
            {fieldError("ownerName")}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="ownerEmail">
          Email
        </label>
        <input
          aria-describedby={fieldError("ownerEmail") ? "ownerEmail-error" : undefined}
          aria-invalid={fieldError("ownerEmail") ? "true" : undefined}
          className="input"
          id="ownerEmail"
          name="ownerEmail"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="you@company.com"
        />
        {fieldError("ownerEmail") ? (
          <p className="hint" id="ownerEmail-error">
            {fieldError("ownerEmail")}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="ownerPassword">
          Password
        </label>
        <div className="auth-pw">
          <input
            aria-describedby={
              fieldError("ownerPassword") ? "ownerPassword-error ownerPassword-hint" : "ownerPassword-hint"
            }
            aria-invalid={fieldError("ownerPassword") ? "true" : undefined}
            className="input"
            id="ownerPassword"
            name="ownerPassword"
            type={passwordVisible ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 12 characters"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
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
          <div className="auth-strength" data-score={score} aria-hidden="true">
            <div className="auth-strength-bars">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="auth-strength-row">
              <span className="auth-strength-word">{password.length > 0 ? strengthWord(score) : ""}</span>
              <span className="auth-strength-hint" id="ownerPassword-hint">
                12+ characters, mixed case and a number
              </span>
            </div>
          </div>
        </div>
        {fieldError("ownerPassword") ? (
          <p className="hint" id="ownerPassword-error">
            {fieldError("ownerPassword")}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="workspaceName">
          Workspace name
        </label>
        <input
          aria-describedby={fieldError("workspaceName") ? "workspaceName-error" : "workspaceName-hint"}
          aria-invalid={fieldError("workspaceName") ? "true" : undefined}
          className="input"
          id="workspaceName"
          name="workspaceName"
          type="text"
          autoComplete="organization"
          placeholder="Acme Inc."
        />
        <p className="hint" id="workspaceName-hint">
          This name becomes the active organization and workspace context in the admin shell.
        </p>
        {fieldError("workspaceName") ? (
          <p className="hint" id="workspaceName-error">
            {fieldError("workspaceName")}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="label" htmlFor="timezone">
          Timezone
        </label>
        <select
          aria-describedby={fieldError("timezone") ? "timezone-error" : "timezone-hint"}
          aria-invalid={fieldError("timezone") ? "true" : undefined}
          className="select"
          id="timezone"
          name="timezone"
          defaultValue={defaultTimezone}
        >
          {timezoneOptions.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </select>
        <p className="hint" id="timezone-hint">
          Used for schedules, digests, and dates that need you.
        </p>
        {fieldError("timezone") ? (
          <p className="hint" id="timezone-error">
            {fieldError("timezone")}
          </p>
        ) : null}
      </div>

      <p className="hint" style={{ marginTop: "var(--space-4)" }}>
        This first account is the workspace owner with full admin access.
      </p>

      <SubmitButton />
    </form>
  );
}
