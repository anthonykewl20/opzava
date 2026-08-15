"use server";

import { authPort } from "@opzava/identity-access/better-auth";
import { headers } from "next/headers";
import { z } from "zod";

const resetSchema = z.object({ handle: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(12, "Use at least 12 characters."), confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });
export interface ResetPasswordState { readonly status: "idle" | "success" | "error"; readonly message?: string; }

export async function resetPasswordAction(_previous: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const parsed = resetSchema.safeParse({ handle: formData.get("handle"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the password fields and try again." };
  const forwardedFor = (await headers()).get("x-forwarded-for");
  const ipAddress = forwardedFor ?? undefined;
  const resetInput: { handle: import("@opzava/ports").PasswordResetHandle; newPassword: string; ipAddress?: string } = {
    handle: parsed.data.handle as import("@opzava/ports").PasswordResetHandle,
    newPassword: parsed.data.password
  };
  if (ipAddress !== undefined) resetInput.ipAddress = ipAddress;
  const result = await authPort.resetPassword(resetInput);
  if (result.ok) return { status: "success", message: "Password reset. Sign in with your new password." };
  const message = result.error.code === "auth.resetUnavailable"
    ? "Too many attempts — try again in a few minutes."
    : "This password reset link is invalid or has expired.";
  return { status: "error", message };
}
