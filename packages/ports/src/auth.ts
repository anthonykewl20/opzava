import type { OrgId, TenantId, UserId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type SessionId = string & { readonly __sessionId: "SessionId" };
export type MfaChallengeId = string & { readonly __mfaChallengeId: "MfaChallengeId" };

export interface AuthIdentity {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly orgId: OrgId;
  readonly email: string;
}

export interface AuthSession {
  readonly sessionId: SessionId;
  readonly identity: AuthIdentity;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly mfaSatisfiedAt?: Date;
}

export interface SignUpInput {
  readonly email: string;
  readonly password: string;
  readonly tenantId: TenantId;
  readonly orgId: OrgId;
  readonly displayName?: string;
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly tenantId: TenantId;
}

export interface GetSessionInput {
  readonly sessionToken: string;
}

export interface RevokeSessionInput {
  readonly sessionId: SessionId;
  readonly actorUserId: UserId;
}

export interface ListSessionsInput {
  readonly userId: UserId;
  readonly tenantId: TenantId;
}

export interface LogoutAllInput {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly keepSessionId?: SessionId;
}

export interface MfaChallenge {
  readonly challengeId: MfaChallengeId;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly method: "totp" | "passkey" | "recovery-code";
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface MfaVerificationInput {
  readonly challengeId: MfaChallengeId;
  readonly code?: string;
  readonly passkeyResponseJson?: string;
}

export interface MfaVerificationResult {
  readonly session: AuthSession;
  readonly verifiedAt: Date;
}

export interface MfaHooks {
  readonly createChallenge: (identity: AuthIdentity) => Promise<Result<MfaChallenge>>;
  readonly verifyChallenge: (
    input: MfaVerificationInput
  ) => Promise<Result<MfaVerificationResult>>;
}

export interface AuthPort {
  signUp(input: SignUpInput): Promise<Result<AuthSession>>;
  signIn(input: SignInInput, hooks?: MfaHooks): Promise<Result<AuthSession | MfaChallenge>>;
  getSession(input: GetSessionInput): Promise<Result<AuthSession | null>>;
  revokeSession(input: RevokeSessionInput): Promise<Result<void>>;
  listSessions(input: ListSessionsInput): Promise<Result<readonly AuthSession[]>>;
  logoutAll(input: LogoutAllInput): Promise<Result<number>>;
}
