export { auth, createBetterAuth, type BetterAuthConfigOptions } from "./auth-config.js";
export { BetterAuthPortAdapter, authPort } from "./auth-port-adapter.js";
export { hashPassword, verifyPassword } from "./password-hasher.js";
export {
  activeOrgId,
  activeTenantId,
  credentialProviderId,
  normalizeEmail,
  resolveSessionPrincipal,
  userIdFromSession,
  withTenantForSession
} from "./session-principal.js";
