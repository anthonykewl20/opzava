import { ResetPasswordForm } from "@/components/auth/password-reset-form";

export default async function ResetPasswordPage({ searchParams }: { readonly searchParams: Promise<{ readonly h?: string }> }) {
  const { h } = await searchParams;
  return <main className="auth-panel"><section className="auth-panel-inner"><h1>Choose a new password</h1><p className="auth-lead">This link can be used once.</p><ResetPasswordForm handle={h ?? ""} /></section></main>;
}
