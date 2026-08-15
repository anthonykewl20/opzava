"use client";

import { useActionState } from "react";

import { requestPasswordResetAction, type ForgotPasswordState } from "@/app/(auth)/forgot-password/actions";
import { resetPasswordAction, type ResetPasswordState } from "@/app/(auth)/reset-password/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, { status: "idle" } satisfies ForgotPasswordState);
  return <form action={action}>{state.message === undefined ? null : <div className={state.status === "error" ? "sb-alert sb-alert--destructive" : "sb-alert"} role="alert">{state.message}</div>}<label className="label" htmlFor="reset-email">Email</label><input className="input" id="reset-email" name="email" type="email" autoComplete="email" required /><button className="btn btn-primary" type="submit" disabled={pending}>Request password reset</button></form>;
}

export function ResetPasswordForm({ handle }: { readonly handle: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, { status: "idle" } satisfies ResetPasswordState);
  if (handle === "") return <div className="sb-alert sb-alert--destructive" role="alert">This password reset link is invalid or has expired.</div>;
  if (state.status === "success") return <div className="sb-alert" role="alert">{state.message} <a href="/login">Sign in</a></div>;
  return <form action={action}><input type="hidden" name="handle" value={handle} />{state.message === undefined ? null : <div className="sb-alert sb-alert--destructive" role="alert">{state.message}</div>}<label className="label" htmlFor="reset-password">New password</label><input className="input" id="reset-password" name="password" type="password" autoComplete="new-password" minLength={12} required /><label className="label" htmlFor="reset-confirm-password">Confirm new password</label><input className="input" id="reset-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /><button className="btn btn-primary" type="submit" disabled={pending}>Reset password</button></form>;
}
