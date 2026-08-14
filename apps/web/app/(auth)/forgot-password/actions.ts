"use server";

import { authPort } from "@opzava/identity-access/better-auth";
import { z } from "zod";

const emailSchema = z.object({ email: z.string().trim().email() });

export interface ForgotPasswordState { readonly status: "idle" | "sent" | "error"; readonly message?: string; }

export async function requestPasswordResetAction(_previous: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  // This is intentionally the same confirmation for a valid, unknown, or malformed address.
  if (!parsed.success) return { status: "sent", message: "If that account can be reset, follow the instructions provided by your administrator." };
  const result = await authPort.requestPasswordReset({ email: parsed.data.email });
  return result.ok
    ? { status: "sent", message: "If that account can be reset, follow the instructions provided by your administrator." }
    : { status: "error", message: "Password reset is temporarily unavailable. Try again later." };
}
