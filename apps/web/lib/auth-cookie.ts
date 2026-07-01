import type { AuthSession } from "@opzava/ports";
import { cookies } from "next/headers";

export const sessionCookieName = "opzava.session_token";

const betterAuthCookieNames = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token"
] as const;

function cookieIsSecure(): boolean {
  return process.env["NODE_ENV"] === "production";
}

export async function setSessionCookie(session: AuthSession): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, session.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieIsSecure(),
    path: "/",
    expires: session.expiresAt
  });
}

export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);

  for (const name of betterAuthCookieNames) {
    cookieStore.delete(name);
  }
}
