"use server";

import { authPort } from "@opzava/identity-access/better-auth";
import { headers } from "next/headers";
import { z } from "zod";

import { getCurrentAuthSession } from "@/lib/session";

export interface SecurityActionState {
  readonly status: "idle" | "enrolling" | "recovery" | "error" | "disabled";
  readonly message?: string;
  readonly generation?: string;
  readonly secret?: string;
  readonly otpauthUri?: string;
  readonly recoveryCodes?: readonly string[];
}

export interface ChangePasswordActionState {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
}

const actionSchema = z.object({
  intent: z.enum(["start", "enable", "disable"]),
  password: z.string().min(1).optional(),
  generation: z.string().uuid().optional(),
  code: z.string().trim().optional(),
  method: z.enum(["totp", "recovery-code"]).optional()
});

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function securityAction(
  _previousState: SecurityActionState,
  formData: FormData
): Promise<SecurityActionState> {
  const parsed = actionSchema.safeParse({
    intent: formString(formData, "intent"),
    password: formString(formData, "password"),
    generation: formString(formData, "generation"),
    code: formString(formData, "code"),
    method: formString(formData, "method")
  });
  if (!parsed.success) return { status: "error", message: "Check the verification details and try again." };

  const session = await getCurrentAuthSession(new Headers(await headers()));
  if (session === null) return { status: "error", message: "Your session has ended. Sign in again." };
  const userId = session.identity.userId;

  if (parsed.data.intent === "start") {
    if (parsed.data.password === undefined) return { status: "error", message: "Enter your account password to continue." };
    const result = await authPort.startMfaEnrollment({
      userId,
      email: session.identity.email,
      password: parsed.data.password,
      currentSessionId: session.sessionId
    });
    return result.ok
      ? {
          status: "enrolling",
          generation: result.value.generation,
          secret: result.value.secret,
          otpauthUri: result.value.otpauthUri
        }
      : {
          status: "error",
          message: result.error.code === "auth.mfaEnrollmentPasswordInvalid"
            ? "That password didn't match."
            : "We could not start two-factor setup. Try again."
        };
  }
  if (parsed.data.code === undefined) return { status: "error", message: "Enter a verification code." };

  if (parsed.data.intent === "enable") {
    if (parsed.data.generation === undefined) return { status: "error", message: "Enrollment expired — start again." };
    const result = await authPort.enableMfa({
      userId,
      code: parsed.data.code,
      currentSessionId: session.sessionId,
      generation: parsed.data.generation
    });
    return result.ok
      ? { status: "recovery", recoveryCodes: result.value.recoveryCodes }
      : result.error.code === "auth.mfaEnrollmentVerificationFailed"
        ? {
          // The pending enrollment is still valid. Keep its one-time display
          // context so a mistyped code does not strand the user on an empty card.
          status: "enrolling",
          message: "That code didn't match. Check your phone's clock and try the newest code.",
          ...(_previousState.secret === undefined ? {} : { secret: _previousState.secret }),
          ...(_previousState.otpauthUri === undefined ? {} : { otpauthUri: _previousState.otpauthUri }),
          ...(_previousState.generation === undefined ? {} : { generation: _previousState.generation })
        }
        : { status: "error", message: "Enrollment expired — start again." };
  }
  const result = await authPort.disableMfa({
    userId,
    code: parsed.data.code,
    method: parsed.data.method ?? "totp"
  });
  return result.ok
    ? { status: "disabled", message: "Two-factor authentication is off." }
    : { status: "error", message: "That code didn't match." };
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, "Use at least 12 characters."),
  confirmPassword: z.string()
}).refine((value) => value.newPassword === value.confirmPassword, { path: ["confirmPassword"], message: "New passwords do not match." });

export async function changePasswordAction(
  _previousState: ChangePasswordActionState,
  formData: FormData
): Promise<ChangePasswordActionState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formString(formData, "currentPassword"),
    newPassword: formString(formData, "newPassword"),
    confirmPassword: formString(formData, "confirmPassword")
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the password fields and try again." };
  const session = await getCurrentAuthSession(new Headers(await headers()));
  if (session === null) return { status: "error", message: "Your session has ended. Sign in again." };
  const result = await authPort.changePassword({
    userId: session.identity.userId,
    currentSessionId: session.sessionId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword
  });
  return result.ok
    ? { status: "success", message: "Password changed. Other signed-in devices were signed out." }
    : { status: "error", message: result.error.code === "auth.invalidCredentials" ? "That current password didn't match." : "We could not change your password. Try again." };
}

export async function startPasskeyEnrollmentAction(password: string): Promise<{ readonly ok: boolean; readonly challengeId?: string; readonly options?: Readonly<Record<string, unknown>>; readonly message?: string }> {
  const session = await getCurrentAuthSession(new Headers(await headers()));
  if (session === null) return { ok: false, message: "Your session has ended. Sign in again." };
  const result = await authPort.startPasskeyEnrollment({ userId: session.identity.userId, currentSessionId: session.sessionId, password });
  return result.ok ? { ok: true, challengeId: result.value.challengeId, options: result.value.options } : { ok: false, message: result.error.code === "auth.passkeyEnrollmentPasswordInvalid" ? "That password didn't match." : "We could not start passkey setup." };
}

export async function finishPasskeyEnrollmentAction(challengeId: string, response: Readonly<Record<string, unknown>>, name: string): Promise<{ readonly ok: boolean; readonly message: string }> {
  const result = await authPort.finishPasskeyEnrollment({ challengeId: challengeId as import("@opzava/ports").PasskeyChallengeId, response, ...(name.trim() === "" ? {} : { name }) });
  return result.ok ? { ok: true, message: "Passkey added." } : { ok: false, message: "That passkey could not be verified." };
}

export async function managePasskeyAction(intent: "rename" | "revoke", passkeyId: string, password: string, name?: string): Promise<{ readonly ok: boolean; readonly message: string }> {
  const session = await getCurrentAuthSession(new Headers(await headers()));
  if (session === null) return { ok: false, message: "Your session has ended. Sign in again." };
  const isRename = intent === "rename";
  const result = isRename
    ? await authPort.renamePasskey({ userId: session.identity.userId, currentSessionId: session.sessionId, password, passkeyId, name: name ?? "" })
    : await authPort.revokePasskey({ userId: session.identity.userId, currentSessionId: session.sessionId, password, passkeyId });
  return result.ok ? { ok: true, message: intent === "rename" ? "Passkey renamed." : "Passkey removed." } : { ok: false, message: "We could not update that passkey. Confirm your current password and try again." };
}
