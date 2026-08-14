import { ForgotPasswordForm } from "@/components/auth/password-reset-form";

export default function ForgotPasswordPage() {
  return <main className="auth-panel"><section className="auth-panel-inner"><h1>Reset your password</h1><p className="auth-lead">Enter your email to begin account recovery.</p><ForgotPasswordForm /><p className="auth-foot"><a href="/login">Back to sign in</a></p></section></main>;
}
