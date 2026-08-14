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
