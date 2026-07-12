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
    <main className="auth auth--hero">
      <div className="auth-fx" aria-hidden="true">
        <span className="auth-fx-orb auth-fx-orb--1" />
        <span className="auth-fx-orb auth-fx-orb--2" />
        <span className="auth-fx-orb auth-fx-orb--3" />
        <div className="auth-fx-grid" />
      </div>
      <p className="auth-cap">First run - setting up Opzava happens once</p>
      <SetupForm idempotencyKey={randomUUID()} defaultTimezone="Asia/Manila" />
    </main>
  );
}
