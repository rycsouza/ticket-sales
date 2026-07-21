import { createHash, randomBytes, randomInt } from "node:crypto";
import { ConflictError, DomainError, UnauthenticatedError } from "../../shared/errors";
import { generateToken, hashToken, tokenHashEquals } from "../../shared/tokens";
import type { MailerPort } from "../../ports/mailer";
import { decryptSecret, encryptSecret } from "../../shared/secret-box";
import { generateTotpSecret, totpAuthUri, verifyTotp } from "../../shared/totp";
import type { CachePort } from "../../ports/cache";
import type { ClockPort } from "../../ports/clock";
import type { PasswordHasherPort } from "../../ports/password-hasher";
import type { AuditRepository } from "../audit/repository";
import type { UserRepository } from "../identity/repository";
import type { UserRecord } from "../identity/types";
import type { SessionRepository, TrustedDeviceRepository } from "./repository";
import type { LoginInput, RegisterInput } from "./schemas";

const SESSION_TTL_HOURS = 24 * 30; // 30 days, sliding + revocable (FR-AUTH-003)
const SESSION_RENEW_THRESHOLD_MS = 60 * 60 * 1000; // renew at most ~hourly
const LOGIN_MAX_ATTEMPTS = 10; // per identifier per window (FR-AUTH-006)
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
const MFA_VERIFY_MAX_ATTEMPTS = 8;
const EMAIL_OTP_TTL_SECONDS = 10 * 60; // e-mail code lifetime
const EMAIL_OTP_DIGITS = 6;
const TRUSTED_DEVICE_DAYS = 30;
const BACKUP_CODE_COUNT = 10;

function hashCode(code: string): string {
  return createHash("sha256").update(code.replace(/\s/g, "").toUpperCase(), "utf8").digest("hex");
}

// Any Argon2id hash of an arbitrary string. Verified against when the user
// does not exist so the request timing does not reveal account existence
// (CLAUDE_SECURITY_RULES §5).
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface AuthServiceDeps {
  users: UserRepository;
  sessions: SessionRepository;
  audit: AuditRepository;
  cache: CachePort;
  clock: ClockPort;
  passwordHasher: PasswordHasherPort;
  /** DEC-012 — present iff TOTP MFA is enforced (encryption key configured). */
  mfa?:
    | { key: Buffer; issuer: string; trustedDevices: TrustedDeviceRepository }
    | undefined;
  /**
   * E-mail second factor — present iff EMAIL_2FA_ENABLED and a mailer is
   * configured. Takes precedence over TOTP. Sends a one-time code to the
   * account e-mail on untrusted devices; reuses the trusted-device table.
   */
  email2fa?:
    | { mailer: MailerPort; trustedDevices: TrustedDeviceRepository; issuer: string }
    | undefined;
}

/** Discriminated login outcome (DEC-012). Without a second factor it is always authenticated. */
export type LoginResult =
  | { status: "authenticated"; rawToken: string; expiresAt: Date; userId: string }
  | { status: "mfa_setup_required"; challengeToken: string }
  | { status: "mfa_required"; challengeToken: string }
  | { status: "email_2fa_required"; challengeToken: string };

export interface MfaCompletion {
  status: "authenticated";
  rawToken: string;
  expiresAt: Date;
  userId: string;
  /** Present on setup confirmation — shown once for the user to store. */
  backupCodes?: string[];
  /** Present when the device was trusted — set as an httpOnly cookie. */
  trustedDeviceToken?: string;
}

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
  correlationId: string;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  /** FR-AUTH-001 — self-service registration (creates the future org owner). */
  async register(input: RegisterInput, meta: RequestMeta) {
    await this.enforceRateLimit(`auth:register:${meta.ip ?? "unknown"}`);

    const existing = await this.deps.users.findByEmail(input.email);
    if (existing) {
      // Boundary maps this to a generic message; we still avoid detailing.
      throw new ConflictError("Unable to register with the provided data");
    }

    const user = await this.deps.users.create({
      email: input.email,
      name: input.name,
      passwordHash: await this.deps.passwordHasher.hash(input.password),
    });

    await this.deps.audit.append({
      actorUserId: user.id,
      action: "user.registered",
      resourceType: "user",
      resourceId: user.id,
      correlationId: meta.correlationId,
      ip: meta.ip,
    });

    return { userId: user.id };
  }

  /**
   * FR-AUTH-001/006 — rate-limited login with a single generic failure error
   * (no user-exists oracle) and audit for success and failure (§14 rules).
   */
  async login(
    input: LoginInput,
    meta: RequestMeta,
    opts?: { trustedDeviceToken?: string | undefined },
  ): Promise<LoginResult> {
    await this.enforceRateLimit(`auth:login:email:${input.email}`);
    if (meta.ip) await this.enforceRateLimit(`auth:login:ip:${meta.ip}`);

    const user = await this.deps.users.findByEmail(input.email);

    // Always verify against SOME hash to equalize timing.
    const passwordOk = await this.deps.passwordHasher.verify(
      user?.passwordHash ?? DUMMY_HASH,
      input.password,
    );

    if (!user || user.status !== "ACTIVE" || !user.passwordHash || !passwordOk) {
      await this.deps.audit.append({
        action: "auth.login_failed",
        resourceType: "user",
        // Do not record which part failed — only that an attempt failed.
        resourceId: user?.id,
        correlationId: meta.correlationId,
        ip: meta.ip,
      });
      throw new UnauthenticatedError("Invalid credentials");
    }

    // Second factor on untrusted devices. E-mail OTP takes precedence over
    // TOTP; when neither is configured, behave exactly as before.
    if (this.deps.email2fa) {
      const now = this.deps.clock.now();
      const trusted =
        opts?.trustedDeviceToken !== undefined &&
        (await this.deps.email2fa.trustedDevices.isValid(
          user.id,
          hashToken(opts.trustedDeviceToken),
          now,
        ));
      if (!trusted) {
        return {
          status: "email_2fa_required",
          challengeToken: await this.issueEmailOtp(user, meta),
        };
      }
    } else if (this.deps.mfa) {
      const now = this.deps.clock.now();
      if (!user.mfaEnabled) {
        return { status: "mfa_setup_required", challengeToken: await this.issueChallenge(user.id, "setup") };
      }
      const trusted =
        opts?.trustedDeviceToken !== undefined &&
        (await this.deps.mfa.trustedDevices.isValid(
          user.id,
          hashToken(opts.trustedDeviceToken),
          now,
        ));
      if (!trusted) {
        return { status: "mfa_required", challengeToken: await this.issueChallenge(user.id, "verify") };
      }
    }

    const session = await this.issueSession(user, meta);
    return {
      status: "authenticated",
      rawToken: session.rawToken,
      expiresAt: session.expiresAt,
      userId: user.id,
    };
  }

  // --- MFA (DEC-012) --------------------------------------------------------

  /** Begins enrollment: returns the secret + otpauth URI for the QR code. */
  async setupMfa(challengeToken: string): Promise<{ secret: string; otpauthUri: string }> {
    const mfa = this.requireMfa();
    const userId = await this.peekChallenge(challengeToken, "setup");
    const user = await this.mustFindUser(userId);

    const secret = generateTotpSecret();
    await this.deps.users.setMfaPendingSecret(user.id, encryptSecret(secret, mfa.key));
    return { secret, otpauthUri: totpAuthUri(secret, user.email, mfa.issuer) };
  }

  /** Confirms enrollment with the first code; enables MFA and returns backup codes. */
  async confirmMfaSetup(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
    opts?: { trustDevice?: boolean | undefined },
  ): Promise<MfaCompletion> {
    const mfa = this.requireMfa();
    const userId = await this.consumeChallenge(challengeToken, "setup");
    await this.enforceMfaRateLimit(userId);
    const user = await this.mustFindUser(userId);
    if (!user.mfaSecretEnc) throw new UnauthenticatedError();

    const secret = decryptSecret(user.mfaSecretEnc, mfa.key);
    if (!verifyTotp(secret, code, this.deps.clock.now())) {
      throw new UnauthenticatedError("Invalid code");
    }

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      base32Code(),
    );
    await this.deps.users.enableMfa(user.id, backupCodes.map(hashCode));
    await this.deps.audit.append({
      actorUserId: user.id,
      action: "auth.mfa_enabled",
      resourceType: "user",
      resourceId: user.id,
      correlationId: meta.correlationId,
      ip: meta.ip,
    });

    const completion = await this.completeMfa(user, meta, opts);
    return { ...completion, backupCodes };
  }

  /** Verifies a TOTP code (or a backup code) for an enrolled user. */
  async verifyMfa(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
    opts?: { trustDevice?: boolean | undefined },
  ): Promise<MfaCompletion> {
    const mfa = this.requireMfa();
    const userId = await this.consumeChallenge(challengeToken, "verify");
    await this.enforceMfaRateLimit(userId);
    const user = await this.mustFindUser(userId);
    if (!user.mfaEnabled || !user.mfaSecretEnc) throw new UnauthenticatedError();

    const secret = decryptSecret(user.mfaSecretEnc, mfa.key);
    let ok = verifyTotp(secret, code, this.deps.clock.now());
    if (!ok) {
      // Fall back to a single-use backup code.
      ok = await this.deps.users.consumeBackupCode(user.id, hashCode(code));
    }
    if (!ok) throw new UnauthenticatedError("Invalid code");

    return this.completeMfa(user, meta, opts);
  }

  // --- E-mail 2FA -----------------------------------------------------------

  /** Generates a one-time code, stores its hash, and e-mails it to the user. */
  private async issueEmailOtp(user: UserRecord, meta: RequestMeta): Promise<string> {
    const email2fa = this.requireEmail2fa();
    const code = String(randomInt(0, 10 ** EMAIL_OTP_DIGITS)).padStart(EMAIL_OTP_DIGITS, "0");
    const token = generateToken();
    await this.deps.cache.set(
      `email2fa:challenge:${token}`,
      JSON.stringify({ userId: user.id, codeHash: hashCode(code) }),
      EMAIL_OTP_TTL_SECONDS,
    );
    // The code is sent ONLY by e-mail — never logged or returned to the client.
    await email2fa.mailer.send({
      to: user.email,
      subject: `${code} é o seu código de acesso`,
      text: `Seu código de acesso ao ${email2fa.issuer} é ${code}. Ele expira em 10 minutos. Se não foi você, ignore este e-mail e troque sua senha.`,
      html: `<p>Seu código de acesso ao <strong>${email2fa.issuer}</strong> é:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Ele expira em 10 minutos. Se não foi você, ignore este e-mail e troque sua senha.</p>`,
      notificationId: generateToken(),
    });
    await this.deps.audit.append({
      actorUserId: user.id,
      action: "auth.email_2fa_sent",
      resourceType: "user",
      resourceId: user.id,
      correlationId: meta.correlationId,
      ip: meta.ip,
    });
    return token;
  }

  /** Verifies the e-mailed code and completes login (optionally trusting the device). */
  async verifyEmailOtp(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
    opts?: { trustDevice?: boolean | undefined },
  ): Promise<MfaCompletion> {
    const email2fa = this.requireEmail2fa();
    const raw = await this.deps.cache.get(`email2fa:challenge:${challengeToken}`);
    if (!raw) throw new UnauthenticatedError("Challenge expired");
    const { userId, codeHash } = JSON.parse(raw) as { userId: string; codeHash: string };

    await this.enforceMfaRateLimit(userId);
    const user = await this.mustFindUser(userId);

    if (!tokenHashEquals(hashCode(code), codeHash)) {
      throw new UnauthenticatedError("Invalid code");
    }
    // Single-use: consume the challenge only on success.
    await this.deps.cache.delete(`email2fa:challenge:${challengeToken}`);

    return this.completeSecondFactor(user, meta, opts, email2fa.trustedDevices);
  }

  /** Boundary calls this on every authenticated request. */
  async validateSession(rawToken: string): Promise<{ userId: string; sessionId: string }> {
    const session = await this.deps.sessions.findByTokenHash(hashToken(rawToken));
    const now = this.deps.clock.now();

    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthenticatedError();
    }

    // Sliding window: keep an active session alive without a write on every
    // request (renew at most ~hourly). Revocation/expiry are still enforced
    // above, so this never resurrects a killed session.
    const renewedExpiry = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    const shouldRenew =
      renewedExpiry.getTime() - session.expiresAt.getTime() > SESSION_RENEW_THRESHOLD_MS;
    await this.deps.sessions.touch(session.id, now, shouldRenew ? renewedExpiry : undefined);
    return { userId: session.userId, sessionId: session.id };
  }

  async logout(rawToken: string, meta: RequestMeta) {
    const session = await this.deps.sessions.findByTokenHash(hashToken(rawToken));
    if (!session) return; // idempotent — logging out twice is fine

    await this.deps.sessions.revoke(session.id, this.deps.clock.now());
    await this.deps.audit.append({
      actorUserId: session.userId,
      action: "auth.logout",
      resourceType: "session",
      resourceId: session.id,
      correlationId: meta.correlationId,
    });
  }

  /** EP-01 acceptance: revoking a user's access ends their sessions. */
  async revokeAllSessions(userId: string, meta: RequestMeta & { actorUserId: string }) {
    const count = await this.deps.sessions.revokeAllForUser(userId, this.deps.clock.now());
    await this.deps.audit.append({
      actorUserId: meta.actorUserId,
      action: "auth.sessions_revoked",
      resourceType: "user",
      resourceId: userId,
      after: { revokedCount: count },
      correlationId: meta.correlationId,
    });
    return count;
  }

  // -------------------------------------------------------------------------

  private async issueSession(
    user: UserRecord,
    meta: RequestMeta,
  ): Promise<{ rawToken: string; expiresAt: Date }> {
    const rawToken = generateToken();
    const now = this.deps.clock.now();
    const session = await this.deps.sessions.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.deps.audit.append({
      actorUserId: user.id,
      action: "auth.login_succeeded",
      resourceType: "session",
      resourceId: session.id,
      correlationId: meta.correlationId,
      ip: meta.ip,
    });
    return { rawToken, expiresAt: session.expiresAt };
  }

  private completeMfa(
    user: UserRecord,
    meta: RequestMeta,
    opts?: { trustDevice?: boolean | undefined },
  ): Promise<MfaCompletion> {
    return this.completeSecondFactor(user, meta, opts, this.requireMfa().trustedDevices);
  }

  /** Shared post-2FA completion: issue session + optionally remember the device. */
  private async completeSecondFactor(
    user: UserRecord,
    meta: RequestMeta,
    opts: { trustDevice?: boolean | undefined } | undefined,
    trustedDevices: TrustedDeviceRepository,
  ): Promise<MfaCompletion> {
    const session = await this.issueSession(user, meta);
    const result: MfaCompletion = {
      status: "authenticated",
      rawToken: session.rawToken,
      expiresAt: session.expiresAt,
      userId: user.id,
    };
    if (opts?.trustDevice) {
      const deviceToken = generateToken();
      const now = this.deps.clock.now();
      await trustedDevices.create({
        userId: user.id,
        tokenHash: hashToken(deviceToken),
        expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000),
        label: meta.userAgent,
      });
      result.trustedDeviceToken = deviceToken;
    }
    return result;
  }

  private requireMfa(): NonNullable<AuthServiceDeps["mfa"]> {
    if (!this.deps.mfa) throw new UnauthenticatedError();
    return this.deps.mfa;
  }

  private requireEmail2fa(): NonNullable<AuthServiceDeps["email2fa"]> {
    if (!this.deps.email2fa) throw new UnauthenticatedError();
    return this.deps.email2fa;
  }

  private async mustFindUser(userId: string): Promise<UserRecord> {
    const user = await this.deps.users.findById(userId);
    if (!user || user.status !== "ACTIVE") throw new UnauthenticatedError();
    return user;
  }

  private async issueChallenge(userId: string, purpose: "setup" | "verify"): Promise<string> {
    const token = generateToken();
    await this.deps.cache.set(
      `mfa:challenge:${token}`,
      JSON.stringify({ userId, purpose }),
      MFA_CHALLENGE_TTL_SECONDS,
    );
    return token;
  }

  private async peekChallenge(token: string, purpose: "setup" | "verify"): Promise<string> {
    const raw = await this.deps.cache.get(`mfa:challenge:${token}`);
    if (!raw) throw new UnauthenticatedError("Challenge expired");
    const data = JSON.parse(raw) as { userId: string; purpose: string };
    if (data.purpose !== purpose) throw new UnauthenticatedError();
    return data.userId;
  }

  private async consumeChallenge(token: string, purpose: "setup" | "verify"): Promise<string> {
    const userId = await this.peekChallenge(token, purpose);
    await this.deps.cache.delete(`mfa:challenge:${token}`);
    return userId;
  }

  private async enforceMfaRateLimit(userId: string): Promise<void> {
    const attempts = await this.deps.cache.increment(
      `mfa:verify:${userId}`,
      LOGIN_WINDOW_SECONDS,
    );
    if (attempts > MFA_VERIFY_MAX_ATTEMPTS) throw new RateLimitExceededError();
  }

  private async enforceRateLimit(key: string): Promise<void> {
    const attempts = await this.deps.cache.increment(key, LOGIN_WINDOW_SECONDS);
    if (attempts > LOGIN_MAX_ATTEMPTS) {
      // Deliberately the same error shape as bad credentials would be
      // distinguishable only by the boundary mapping to HTTP 429.
      throw new RateLimitExceededError();
    }
  }
}

const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** 10-char human-typable backup code (no ambiguous chars). */
function base32Code(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (let i = 0; i < 10; i++) code += BACKUP_ALPHABET[bytes[i]! % BACKUP_ALPHABET.length];
  return code;
}

export class RateLimitExceededError extends DomainError {
  readonly code = "RATE_LIMITED";

  constructor() {
    super("Too many attempts, try again later");
  }
}
