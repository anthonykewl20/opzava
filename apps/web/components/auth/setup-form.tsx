"use client";

import { Check, Circle, Eye, EyeOff, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { setupFirstOwnerAction, type SetupActionState } from "@/app/(auth)/setup/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

interface SetupFormProps {
  readonly idempotencyKey: string;
  readonly defaultTimezone: string;
}

type Step = 1 | 2;

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

const stepCopy: Record<Step, { readonly title: string; readonly lead: string }> = {
  1: {
    title: "Set up Opzava",
    lead: "Create the owner account - the first person on this install."
  },
  2: {
    title: "Name your workspace",
    lead: "This is what your team sees in the top bar and in email."
  }
};

const stepLabels = ["Account", "Workspace"] as const;

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

function validateAccount(values: {
  readonly ownerName: string;
  readonly ownerEmail: string;
  readonly ownerPassword: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (values.ownerName.trim().length < 1) {
    errors["ownerName"] = "Enter your name.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.ownerEmail.trim())) {
    errors["ownerEmail"] = "Enter a valid email address.";
  }
  if (values.ownerPassword.length < 12) {
    errors["ownerPassword"] = "Use at least 12 characters.";
  } else if (!/[a-z]/.test(values.ownerPassword)) {
    errors["ownerPassword"] = "Add a lowercase letter.";
  } else if (!/[A-Z]/.test(values.ownerPassword)) {
    errors["ownerPassword"] = "Add an uppercase letter.";
  } else if (!/[0-9]/.test(values.ownerPassword)) {
    errors["ownerPassword"] = "Add a number.";
  }

  return errors;
}

function validateWorkspace(values: {
  readonly workspaceName: string;
  readonly timezone: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (values.workspaceName.trim().length < 1) {
    errors["workspaceName"] = "Name your workspace.";
  }
  if (values.timezone.trim().length < 1) {
    errors["timezone"] = "Choose a timezone.";
  }

  return errors;
}

function stepForField(field: string): Step {
  if (field === "workspaceName" || field === "timezone") {
    return 2;
  }

  return 1;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <Button className="auth-submit h-11" type="submit" disabled={pending}>
        {pending ? (
          <>
            <span className="sb-spinner sb-spinner--sm" aria-hidden="true" />
            Creating workspace…
          </>
        ) : (
          "Create workspace"
        )}
      </Button>
      <span className="u-sr-only" aria-live="polite">
        {pending ? "Creating your workspace…" : ""}
      </span>
    </>
  );
}

function Requirement({
  met,
  children
}: {
  readonly met: boolean;
  readonly children: React.ReactNode;
}) {
  const Icon = met ? Check : Circle;

  return (
    <li className={`auth-req${met ? " is-met" : ""}`}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export function SetupForm({ idempotencyKey, defaultTimezone }: SetupFormProps) {
  const [state, formAction] = useActionState(setupFirstOwnerAction, initialSetupActionState);
  const [step, setStep] = useState<Step>(1);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [passwordVisible, setPasswordVisible] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const score = useMemo(() => passwordScore(ownerPassword), [ownerPassword]);
  const passwordRequirements = {
    length: ownerPassword.length >= 12,
    lowercase: /[a-z]/.test(ownerPassword),
    uppercase: /[A-Z]/.test(ownerPassword),
    number: /[0-9]/.test(ownerPassword)
  };
  const serverErrors = state.status === "error" ? state.fieldErrors : undefined;
  const fieldError = (name: string) => clientErrors[name] ?? serverErrors?.[name];
  const workspacePreview = workspaceName.trim() || "Acme Inc.";

  useEffect(() => {
    if (state.status !== "error" || state.fieldErrors === undefined) {
      return;
    }

    const firstField = Object.keys(state.fieldErrors)[0];
    if (firstField !== undefined) {
      setClientErrors({});
      setStep(stepForField(firstField));
    }
  }, [state]);

  function focusStepHeading() {
    window.requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }

  function focusFirstInvalid(errors: Record<string, string>) {
    const firstField = Object.keys(errors)[0];
    if (firstField !== undefined) {
      document.getElementById(firstField === "timezone" ? "timezone-trigger" : firstField)?.focus();
    }
  }

  function clearFieldError(name: string) {
    setClientErrors((current) => {
      if (current[name] === undefined) {
        return current;
      }

      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function continueToWorkspace() {
    const errors = validateAccount({ ownerName, ownerEmail, ownerPassword });
    setClientErrors(errors);

    if (Object.keys(errors).length > 0) {
      focusFirstInvalid(errors);
      return;
    }

    setStep(2);
    focusStepHeading();
  }

  function backToAccount() {
    setStep(1);
    focusStepHeading();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (step === 1) {
      event.preventDefault();
      continueToWorkspace();
      return;
    }

    const errors = validateWorkspace({ workspaceName, timezone });
    setClientErrors(errors);

    if (Object.keys(errors).length > 0) {
      event.preventDefault();
      focusFirstInvalid(errors);
    }
  }

  return (
    <section className="auth-card" aria-label={`Set up Opzava - step ${step} of 2`}>
      <div className="auth-logo" aria-hidden="true">
        ◆
      </div>
      <h1 ref={headingRef} tabIndex={-1}>
        {stepCopy[step].title}
      </h1>
      <p className="auth-lead">{stepCopy[step].lead}</p>

      <ol className="auth-steps" aria-label="Setup progress">
        {([1, 2] as const)
          .map((item, index) => (
            <li
              key={item}
              className={`auth-step${step === item ? " is-current" : ""}${step > item ? " is-done" : ""}`}
              aria-current={step === item ? "step" : undefined}
            >
              <span className="num">{step > item ? <Check aria-hidden="true" /> : item}</span>
              <span className="lbl">{stepLabels[index]}</span>
            </li>
          ))
          .flatMap((item, index) =>
            index < 1 ? [item, <li className="bar" aria-hidden="true" key={`bar-${index}`} />] : [item]
          )}
      </ol>

      <form action={formAction} noValidate onSubmit={handleSubmit}>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="timezone" value={timezone} />

        {state.status === "error" && state.message !== undefined ? (
          <div className="sb-alert sb-alert--destructive" role="alert">
            <X className="ico" aria-hidden="true" />
            <strong className="sb-alert-title">Setup needs attention</strong>
            <span className="sb-alert-desc">{state.message}</span>
          </div>
        ) : null}

        <div className="auth-stepbody" hidden={step !== 1} aria-hidden={step !== 1}>
          <div className="field" style={{ marginTop: state.status === "error" ? "var(--space-4)" : 0 }}>
            <Label className="label" htmlFor="ownerName">
              Your name
            </Label>
            <Input
              aria-describedby={fieldError("ownerName") ? "ownerName-error" : undefined}
              aria-invalid={fieldError("ownerName") ? "true" : undefined}
              className="input h-11"
              id="ownerName"
              name="ownerName"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={ownerName}
              onChange={(event) => {
                setOwnerName(event.target.value);
                clearFieldError("ownerName");
              }}
            />
            {fieldError("ownerName") ? (
              <p className="hint" id="ownerName-error">
                {fieldError("ownerName")}
              </p>
            ) : null}
          </div>

          <div className="field">
            <Label className="label" htmlFor="ownerEmail">
              Email
            </Label>
            <Input
              aria-describedby={fieldError("ownerEmail") ? "ownerEmail-error" : undefined}
              aria-invalid={fieldError("ownerEmail") ? "true" : undefined}
              className="input h-11"
              id="ownerEmail"
              name="ownerEmail"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={ownerEmail}
              onChange={(event) => {
                setOwnerEmail(event.target.value);
                clearFieldError("ownerEmail");
              }}
            />
            {fieldError("ownerEmail") ? (
              <p className="hint" id="ownerEmail-error">
                {fieldError("ownerEmail")}
              </p>
            ) : null}
          </div>

          <div className="field">
            <Label className="label" htmlFor="ownerPassword">
              Password
            </Label>
            <div className="auth-pw">
              <Input
                aria-describedby={
                  fieldError("ownerPassword") ? "ownerPassword-error ownerPassword-hint" : "ownerPassword-hint"
                }
                aria-invalid={fieldError("ownerPassword") ? "true" : undefined}
                className="input h-11"
                id="ownerPassword"
                name="ownerPassword"
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 12 characters"
                value={ownerPassword}
                onChange={(event) => {
                  setOwnerPassword(event.target.value);
                  clearFieldError("ownerPassword");
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
                {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
              <div className="auth-strength" data-score={score} aria-hidden="true">
                <div className="auth-strength-bars">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="auth-strength-row">
                  <span className="auth-strength-word">{ownerPassword.length > 0 ? strengthWord(score) : ""}</span>
                  <span className="auth-strength-hint" id="ownerPassword-hint">
                    12+ characters, mixed case and a number
                  </span>
                </div>
              </div>
            </div>
            <ul className="auth-reqs" aria-label="Password requirements">
              <Requirement met={passwordRequirements.length}>12+ characters</Requirement>
              <Requirement met={passwordRequirements.lowercase}>Lowercase letter</Requirement>
              <Requirement met={passwordRequirements.uppercase}>Uppercase letter</Requirement>
              <Requirement met={passwordRequirements.number}>Number</Requirement>
            </ul>
            {fieldError("ownerPassword") ? (
              <p className="hint" id="ownerPassword-error">
                {fieldError("ownerPassword")}
              </p>
            ) : null}
          </div>

          <p className="hint" style={{ marginTop: "var(--space-4)" }}>
            This first account is the <strong>workspace owner</strong> - full admin.
          </p>

          <Button className="auth-submit h-11" type="button" onClick={continueToWorkspace}>
            Continue -&gt; Name workspace
          </Button>
        </div>

        <div className="auth-stepbody" hidden={step !== 2} aria-hidden={step !== 2}>
          <div className="field" style={{ marginTop: state.status === "error" ? "var(--space-4)" : 0 }}>
            <Label className="label" htmlFor="workspaceName">
              Workspace name
            </Label>
            <Input
              aria-describedby={fieldError("workspaceName") ? "workspaceName-error workspaceName-hint" : "workspaceName-hint"}
              aria-invalid={fieldError("workspaceName") ? "true" : undefined}
              className="input h-11"
              id="workspaceName"
              name="workspaceName"
              type="text"
              autoComplete="organization"
              placeholder="Acme Inc."
              value={workspaceName}
              onChange={(event) => {
                setWorkspaceName(event.target.value);
                clearFieldError("workspaceName");
              }}
            />
            <p className="hint" id="workspaceName-hint">
              Your team will see <strong>{workspacePreview}</strong>.
            </p>
            {fieldError("workspaceName") ? (
              <p className="hint" id="workspaceName-error">
                {fieldError("workspaceName")}
              </p>
            ) : null}
          </div>

          <div className="field">
            <Label className="label" htmlFor="timezone-trigger">
              Timezone
            </Label>
            <Select
              value={timezone}
              onValueChange={(value) => {
                setTimezone(value);
                clearFieldError("timezone");
              }}
            >
              <SelectTrigger
                aria-describedby={fieldError("timezone") ? "timezone-error timezone-hint" : "timezone-hint"}
                aria-invalid={fieldError("timezone") ? "true" : undefined}
                className="select h-11"
                id="timezone-trigger"
              >
                <SelectValue placeholder="Choose a timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            Creating the workspace signs you in and opens Opzava.
          </p>

          <div className="auth-nav">
            <Button className="h-11" type="button" variant="ghost" onClick={backToAccount}>
              Back
            </Button>
            <SubmitButton />
          </div>
        </div>
      </form>
    </section>
  );
}
