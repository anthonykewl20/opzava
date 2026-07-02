import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { SetupForm } from "@/components/auth/setup-form";
import { getAppSessionContext, isFirstOwnerSetupComplete } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isFirstOwnerSetupComplete()) {
    const session = await getAppSessionContext();
    redirect(session === null ? "/login" : "/");
  }

  return (
    <main className="auth">
      <p className="auth-cap">First run - setting up Opzava happens once</p>
      <section className="auth-card" aria-label="Set up Opzava">
        <div className="auth-logo" aria-hidden="true">
          ◆
        </div>
        <h1>Set up Opzava</h1>
        <p className="auth-lead">Create the owner account and workspace.</p>

        <ol className="auth-steps" aria-label="Setup progress">
          <li className="auth-step is-current" aria-current="step">
            <span className="num">1</span>
            <span className="lbl">Account</span>
          </li>
          <li className="bar" aria-hidden="true" />
          <li className="auth-step is-current">
            <span className="num">2</span>
            <span className="lbl">Workspace</span>
          </li>
        </ol>

        <SetupForm idempotencyKey={randomUUID()} defaultTimezone="Asia/Manila" />
      </section>
    </main>
  );
}
