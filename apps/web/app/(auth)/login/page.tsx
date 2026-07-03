import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getAppSessionContext, isFirstOwnerSetupComplete } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await isFirstOwnerSetupComplete())) {
    redirect("/setup");
  }

  const session = await getAppSessionContext();
  if (session !== null) {
    redirect("/");
  }

  return (
    <main className="auth">
      <section className="auth-card" aria-label="Sign in to Opzava">
        <div className="auth-logo" aria-hidden="true">
          ◆
        </div>
        <h1>Welcome back</h1>
        <p className="auth-lead">Sign in to your workspace.</p>

        {/* DESCOPE(social-login): OAuth providers arrive with P8 SSO work. */}
        <div className="auth-oauth" aria-label="Provider sign in">
          <button
            className="btn"
            type="button"
            disabled
            aria-disabled="true"
            title="Not configured in this environment"
          >
            Continue with Google
          </button>
          <button
            className="btn"
            type="button"
            disabled
            aria-disabled="true"
            title="Not configured in this environment"
          >
            Continue with GitHub
          </button>
        </div>

        <div className="auth-divider" role="separator" aria-label="or use your email">
          <span>or use your email</span>
        </div>

        <LoginForm />

        <p className="auth-foot">
          First time here? <a href="/setup">Set up Opzava</a>
        </p>
      </section>
    </main>
  );
}
