"use server";

import { authPort } from "@opzava/identity-access/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { setSessionCookie } from "@/lib/auth-cookie";

export interface LoginActionState {
  readonly status: "idle" | "error" | "mfa";
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly challengeId?: string;
  /** A truthful lockout state, distinct from an invalid credential/code. */
  readonly locked?: boolean;
}

export type PasskeyLoginStart = { readonly ok: true; readonly challengeId: string; readonly options: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly message: string };

const mfaSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().trim().min(1, "Enter your verification code."),
  method: z.enum(["totp", "recovery-code"])
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.")
});

function stringFromForm(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function clientIpFromHeaders(requestHeaders: Headers): string | undefined {
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor === null || forwardedFor.trim() === "") {
    return undefined;
  }

  return forwardedFor.split(",")[0]?.trim();
}

function validationState(error: z.ZodError): LoginActionState {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && fieldErrors[path] === undefined) {
      fieldErrors[path] = issue.message;
    }
  }

  return {
    status: "error",
    message: "Check the highlighted fields and try again.",
    fieldErrors
  };
}

function isMfaLockout(result: { readonly ok: boolean; readonly error?: { readonly code?: unknown } }): boolean {
  return !result.ok && result.error?.code === "auth.mfaChallengeUnavailable";
}

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: stringFromForm(formData, "email"),
    password: stringFromForm(formData, "password")
  });

  if (!parsed.success) {
    return validationState(parsed.error);
  }

  const requestHeaders = new Headers(await headers());
  const userAgent = requestHeaders.get("user-agent") ?? undefined;
  const ipAddress = clientIpFromHeaders(requestHeaders);
  const signIn = await authPort.signIn({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(ipAddress === undefined ? {} : { ipAddress })
  });

  if (!signIn.ok) {
    return {
      status: "error",
      message: isMfaLockout(signIn)
        ? "Too many attempts — try again in a few minutes"
        : "Wrong email or password. Check both and try again, or reset your password.",
      ...(isMfaLockout(signIn) ? { locked: true } : {})
    };
  }

  if ("challengeId" in signIn.value) {
    return {
      status: "mfa",
      challengeId: signIn.value.challengeId
    };
  }

  await setSessionCookie(signIn.value);
  redirect("/");
}

export async function verifyMfaAction(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = mfaSchema.safeParse({
    challengeId: stringFromForm(formData, "challengeId"),
    code: stringFromForm(formData, "code"),
    method: stringFromForm(formData, "method")
  });
  if (!parsed.success) return validationState(parsed.error);

  const requestHeaders = new Headers(await headers());
  const userAgent = requestHeaders.get("user-agent");
  const ipAddress = clientIpFromHeaders(requestHeaders);
  const result = await authPort.verifyMfaChallenge({
    challengeId: parsed.data.challengeId as import("@opzava/ports").MfaChallengeId,
    code: parsed.data.code,
    method: parsed.data.method,
    ...(userAgent === null ? {} : { userAgent }),
    ...(ipAddress === undefined ? {} : { ipAddress })
  });
  if (!result.ok) {
    return {
      status: "mfa",
      challengeId: parsed.data.challengeId,
      message: isMfaLockout(result)
        ? "Too many attempts — try again in a few minutes"
        : "That code didn't match. Codes refresh every 30 seconds.",
      ...(isMfaLockout(result) ? { locked: true } : {})
    };
  }
  await setSessionCookie(result.value.session);
  redirect("/");
}

/** Explicit v1 WebAuthn path; conditional mediation is intentionally not used. */
export async function startPasskeyLoginAction(): Promise<PasskeyLoginStart> {
  const result = await authPort.startPasskeySignIn();
  return result.ok
    ? { ok: true, challengeId: result.value.challengeId, options: result.value.options }
    : { ok: false, message: "Passkey sign-in is unavailable. Try your password instead." };
}

export async function finishPasskeyLoginAction(challengeId: string, response: Readonly<Record<string, unknown>>): Promise<LoginActionState> {
  const requestHeaders = new Headers(await headers());
  const ipAddress = clientIpFromHeaders(requestHeaders);
  const result = await authPort.finishPasskeySignIn({
    challengeId: challengeId as import("@opzava/ports").PasskeyChallengeId,
    response,
    ...(requestHeaders.get("user-agent") === null ? {} : { userAgent: requestHeaders.get("user-agent")! }),
    ...(ipAddress === undefined ? {} : { ipAddress })
  });
  if (!result.ok) return { status: "error", message: "That passkey could not be verified. Try again or use your password." };
  await setSessionCookie(result.value);
  redirect("/");
}
