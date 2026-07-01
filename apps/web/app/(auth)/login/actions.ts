"use server";

import { authPort } from "@opzava/identity-access/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { setSessionCookie } from "@/lib/auth-cookie";

export interface LoginActionState {
  readonly status: "idle" | "error";
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

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
      message: "Wrong email or password. Check both and try again, or reset your password."
    };
  }

  if ("challengeId" in signIn.value) {
    return {
      status: "error",
      message: "Two-factor verification is required before this session can open."
    };
  }

  await setSessionCookie(signIn.value);
  redirect("/");
}
