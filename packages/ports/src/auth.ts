import type { OrgId, TenantId, UserId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type SessionId = string & { readonly __sessionId: "SessionId" };
export type SessionToken = string & { readonly __sessionToken: "SessionToken" };
export type MfaChallengeId = string & { readonly __mfaChallengeId: "MfaChallengeId" };
export type PasswordResetToken = string & { readonly __passwordResetToken: "PasswordResetToken" };

export interface AuthMembership {
  readonly orgId: OrgId;
  readonly tenantId: TenantId;
  readonly membershipVersion: number;
  /** Opaque authorization state token. Consumers must not parse it. */
  readonly authorizationVersion: string;
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
  readonly code: string;
  readonly method: "totp" | "recovery-code";
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export interface MfaVerificationResult {
  readonly session: AuthSession;
  readonly verifiedAt: Date;
}

export interface StartMfaEnrollmentInput {
  readonly userId: UserId;
  readonly email: string;
  /** Re-authentication is required before MFA material may be disclosed. */
  readonly password: string;
  /** The active session that owns this pending enrollment. */
  readonly currentSessionId: SessionId;
}

export interface MfaEnrollment {
  /** Opaque server-issued generation; only the current pending enrollment can be enabled. */
  readonly generation: string;
  readonly otpauthUri: string;
  /** Show once while enrollment is pending; never persist client-side. */
  readonly secret: string;
}

export interface EnableMfaInput {
  readonly userId: UserId;
  readonly code: string;
  /** The authenticated session that created this enrollment; all other sessions are revoked on enable. */
  readonly currentSessionId: SessionId;
  /** Opaque generation returned by startMfaEnrollment. */
  readonly generation: string;
}

export interface EnabledMfa {
  /** Show once; recovery-code hashes are the only persisted representation. */
  readonly recoveryCodes: readonly string[];
}

export interface DisableMfaInput {
  readonly userId: UserId;
  readonly code: string;
  readonly method: "totp" | "recovery-code";
}

export interface MfaStatus {
  readonly enabled: boolean;
  readonly recoveryCodesRemaining: number;
}

/** This outcome is deliberately identical whether or not the email exists. */
export interface PasswordResetRequestOutcome {
  readonly status: "reset-token-issued";
  /**
   * Present only for a server-side, freshly authenticated self-service request.
   * A browser-facing request must never receive or render this value.
   */
  readonly resetToken?: PasswordResetToken;
}

export interface RequestPasswordResetInput {
  readonly email: string;
  /** Enables the controlled, out-of-band v1 delivery path for the account owner only. */
  readonly authenticatedSelf?: { readonly userId: UserId; readonly sessionId: SessionId };
}

export interface ResetPasswordInput {
  readonly token: PasswordResetToken;
  readonly newPassword: string;
}

export interface ChangePasswordInput {
  readonly userId: UserId;
  readonly currentSessionId: SessionId;
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface AuthPort {
  signIn(input: SignInInput): Promise<Result<AuthSession | MfaChallenge>>;
  verifyMfaChallenge(input: MfaVerificationInput): Promise<Result<MfaVerificationResult>>;
  startMfaEnrollment(input: StartMfaEnrollmentInput): Promise<Result<MfaEnrollment>>;
  enableMfa(input: EnableMfaInput): Promise<Result<EnabledMfa>>;
  disableMfa(input: DisableMfaInput): Promise<Result<void>>;
  getMfaStatus(input: { readonly userId: UserId }): Promise<Result<MfaStatus>>;
  requestPasswordReset(input: RequestPasswordResetInput): Promise<Result<PasswordResetRequestOutcome>>;
  resetPassword(input: ResetPasswordInput): Promise<Result<void>>;
  changePassword(input: ChangePasswordInput): Promise<Result<void>>;
  getSession(input: GetSessionInput): Promise<Result<AuthSession | null>>;
  revokeSession(input: RevokeSessionInput): Promise<Result<void>>;
  listSessions(input: ListSessionsInput): Promise<Result<readonly AuthSession[]>>;
  logoutAll(input: LogoutAllInput): Promise<Result<number>>;
}
