import type { OrgId, TenantId, UserId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type SessionId = string & { readonly __sessionId: "SessionId" };
export type SessionToken = string & { readonly __sessionToken: "SessionToken" };
export type MfaChallengeId = string & { readonly __mfaChallengeId: "MfaChallengeId" };

export interface AuthMembership {
  readonly orgId: OrgId;
  readonly tenantId: TenantId;
  readonly membershipVersion: number;
  readonly roleKeys: readonly string[];
}

export interface AuthIdentity {
  readonly userId: UserId;
  readonly email: string;
  readonly activeMembership: AuthMembership;
  readonly memberships: readonly AuthMembership[];
}

export interface AuthSession {
  readonly sessionId: SessionId;
  readonly sessionToken: SessionToken;
  readonly identity: AuthIdentity;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly mfaSatisfiedAt?: Date;
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export interface GetSessionInput {
  readonly sessionToken?: string;
  readonly headers?: Headers;
}

export interface RevokeSessionInput {
  readonly sessionId?: SessionId;
  readonly sessionToken?: SessionToken;
  readonly actorUserId: UserId;
}

export interface ListSessionsInput {
  readonly userId: UserId;
}

export interface LogoutAllInput {
  readonly userId: UserId;
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
  signIn(input: SignInInput, hooks?: MfaHooks): Promise<Result<AuthSession | MfaChallenge>>;
  getSession(input: GetSessionInput): Promise<Result<AuthSession | null>>;
  revokeSession(input: RevokeSessionInput): Promise<Result<void>>;
  listSessions(input: ListSessionsInput): Promise<Result<readonly AuthSession[]>>;
  logoutAll(input: LogoutAllInput): Promise<Result<number>>;
}
