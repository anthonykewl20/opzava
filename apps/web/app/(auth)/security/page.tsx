import { authPort } from "@opzava/identity-access/better-auth";
import { redirect } from "next/navigation";

import { SecurityForm } from "@/components/auth/security-form";
import { getCurrentAuthSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export function SecurityPageContent({
  enabled,
  remaining,
  passkeys
}: {
  readonly enabled: boolean;
  readonly remaining: number;
  readonly passkeys: readonly import("@opzava/ports").Passkey[] | undefined;
}) {
  return <div className="page"><SecurityForm enabled={enabled} remaining={remaining} passkeys={passkeys} /></div>;
}

export function passkeysForSecurityPage(passkeys: {
  readonly ok: true;
  readonly value: readonly import("@opzava/ports").Passkey[];
} | {
  readonly ok: false;
  readonly error: { readonly code: string };
}): readonly import("@opzava/ports").Passkey[] | undefined {
  if (passkeys.ok) return passkeys.value;
  if (passkeys.error.code === "auth.passkeyUnavailable") return undefined;
  throw passkeys.error;
}

export default async function SecurityPage() {
  const session = await getCurrentAuthSession();
  if (session === null) redirect("/login");
  const status = await authPort.getMfaStatus({ userId: session.identity.userId });
  if (!status.ok) throw status.error;
  const passkeys = await authPort.listPasskeys({ userId: session.identity.userId });
  return <SecurityPageContent
    enabled={status.value.enabled}
    remaining={status.value.recoveryCodesRemaining}
    passkeys={passkeysForSecurityPage(passkeys)}
  />;
}
