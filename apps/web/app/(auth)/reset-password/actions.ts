"use server";

import { authPort } from "@opzava/identity-access/better-auth";
import { z } from "zod";

const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(12, "Use at least 12 characters."), confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });
export interface ResetPasswordState { readonly status: "idle" | "success" | "error"; readonly message?: string; }

export async function resetPasswordAction(_previous: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const parsed = resetSchema.safeParse({ token: formData.get("token"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the password fields and try again." };
  const result = await authPort.resetPassword({ token: parsed.data.token as import("@opzava/ports").PasswordResetToken, newPassword: parsed.data.password });
  return result.ok
    ? { status: "success", message: "Password reset. Sign in with your new password." }
    : { status: "error", message: result.error.code === "auth.resetUnavailable" ? "Too many attempts — try again in a few minutes." : "This password reset link is invalid or has expired." };
}
