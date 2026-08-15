import { BetterAuthPortAdapter } from "../../../packages/identity-access/src/adapters/better-auth/auth-port-adapter.js";
import { writeFileSync } from "node:fs";

const [email, password, outputFile] = process.argv.slice(2);

if (email === undefined || password === undefined || outputFile === undefined) {
  throw new Error("Usage: password-reset-handle.ts <email> <password> <output-file>");
}

void (async () => {
  const auth = new BetterAuthPortAdapter();
  const session = await auth.signIn({ email, password });
  if (!session.ok || "challengeId" in session.value) throw new Error("Disposable reset fixture could not sign in.");
  const issued = await auth.requestPasswordReset({
    email,
    authenticatedSelf: { userId: session.value.identity.userId, sessionId: session.value.sessionId }
  });
  if (!issued.ok || issued.value.resetUrl === undefined) throw new Error("Disposable reset fixture did not receive a handoff URL.");

  // The file contains only the low-value, single-use browser handoff URL.
  writeFileSync(outputFile, issued.value.resetUrl);
})().catch((error: unknown) => {
  throw error;
});
