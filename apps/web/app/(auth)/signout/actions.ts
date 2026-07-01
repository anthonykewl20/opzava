"use server";

import { authPort } from "@opzava/identity-access/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clearSessionCookies } from "@/lib/auth-cookie";
import { getCurrentAuthSession } from "@/lib/session";

export async function signOutAction(): Promise<void> {
  const requestHeaders = new Headers(await headers());
  const session = await getCurrentAuthSession(requestHeaders);

  if (session !== null) {
    await authPort.revokeSession({
      actorUserId: session.identity.userId,
      sessionToken: session.sessionToken
    });
  }

  await clearSessionCookies();
  redirect("/signout");
}
