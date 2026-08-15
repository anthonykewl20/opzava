import type { OrgId, TenantId, UserId } from "@opzava/shared-kernel";
import type { Result } from "@opzava/shared-kernel";

export type SessionId = string & { readonly __sessionId: "SessionId" };
export type SessionToken = string & { readonly __sessionToken: "SessionToken" };
export type MfaChallengeId = string & { readonly __mfaChallengeId: "MfaChallengeId" };
/** One-time browser handoff handle. It is never a raw reset token. */
export type PasswordResetHandle = string & { readonly __passwordResetHandle: "PasswordResetHandle" };
export type InvitationToken = string & { readonly __invitationToken: "InvitationToken" };
export type GuestMagicLinkToken = string & { readonly __guestMagicLinkToken: "GuestMagicLinkToken" };
export type GuestSessionToken = string & { readonly __guestSessionToken: "GuestSessionToken" };

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
   * Present only for controlled delivery to a freshly authenticated account owner.
   * This is the sole browser-safe reset delivery value: it contains a one-time
   * handoff handle, never the password-reset credential itself.
   */
  readonly resetUrl?: string;
}

export interface RequestPasswordResetInput {
  readonly email: string;
  /** Enables the controlled, out-of-band v1 delivery path for the account owner only. */
  readonly authenticatedSelf?: { readonly userId: UserId; readonly sessionId: SessionId };
  /** Rightmost proxy-appended x-forwarded-for hop, supplied only by the trusted server boundary. */
  readonly ipAddress?: string;
}

export interface ResetPasswordInput {
  readonly handle: PasswordResetHandle;
  readonly newPassword: string;
  /** Rightmost proxy-appended x-forwarded-for hop for the public exchange limiter. */
  readonly ipAddress?: string;
}

export interface ChangePasswordInput {
  readonly userId: UserId;
  readonly currentSessionId: SessionId;
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface Invitation {
  readonly id: string;
  readonly orgId: OrgId;
  readonly email: string;
  readonly role: "admin" | "member";
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface CreateInvitationInput {
  readonly orgId: OrgId;
  readonly email: string;
  readonly role: "admin" | "member";
  readonly actor: UserId;
  readonly expiresAt?: Date;
}

/** Invitation TTLs over 24h reject; guest-link TTLs over 24h clamp to 24h. */

export interface AcceptInvitationInput {
  readonly token: InvitationToken;
  readonly userId: UserId;
}

export interface CreateGuestMagicLinkInput {
  readonly orgId: OrgId;
  /** v1's current project aggregate is persisted as a tenant workspace. */
  readonly projectId: string;
  readonly email: string;
  readonly actor: UserId;
  readonly expiresAt?: Date;
}

export interface GuestMagicLink {
  readonly id: string;
  readonly guestMagicLinkToken: GuestMagicLinkToken;
  readonly expiresAt: Date;
}

export interface GuestSession {
  readonly guestSessionToken: GuestSessionToken;
  readonly expiresAt: Date;
}

/**
 * This deliberately never becomes AuthSession: guest credentials grant only
 * the returned external identity/project scope and confer no organization role.
 */
export interface GuestSessionPrincipal {
  readonly orgId: OrgId;
  readonly projectId: string;
  readonly externalIdentityId: string;
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
  createInvitation(input: CreateInvitationInput): Promise<Result<{ readonly invitation: Invitation; readonly token: InvitationToken }>>;
  listInvitations(input: { readonly orgId: OrgId; readonly actor: UserId }): Promise<Result<readonly Invitation[]>>;
  revokeInvitation(input: { readonly id: string; readonly orgId: OrgId; readonly actor: UserId }): Promise<Result<void>>;
  /** Provider invite callbacks must route here; no callback may create membership directly. */
  acceptInvitation(input: AcceptInvitationInput): Promise<Result<void>>;
  createGuestMagicLink(input: CreateGuestMagicLinkInput): Promise<Result<GuestMagicLink>>;
  consumeGuestMagicLink(input: { readonly token: GuestMagicLinkToken }): Promise<Result<GuestSession>>;
  resolveGuestSession(token: GuestSessionToken): Promise<Result<GuestSessionPrincipal | null>>;
  getSession(input: GetSessionInput): Promise<Result<AuthSession | null>>;
  revokeSession(input: RevokeSessionInput): Promise<Result<void>>;
  listSessions(input: ListSessionsInput): Promise<Result<readonly AuthSession[]>>;
  logoutAll(input: LogoutAllInput): Promise<Result<number>>;
}
