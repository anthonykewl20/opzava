import { authPort } from "@opzava/identity-access/better-auth";
import { redirect } from "next/navigation";

import { SecurityForm } from "@/components/auth/security-form";
import { getCurrentAuthSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const session = await getCurrentAuthSession();
  if (session === null) redirect("/login");
  const status = await authPort.getMfaStatus({ userId: session.identity.userId });
  if (!status.ok) throw status.error;
  return <div className="page"><SecurityForm enabled={status.value.enabled} remaining={status.value.recoveryCodesRemaining} /></div>;
}
