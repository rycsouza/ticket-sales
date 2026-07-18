import { ConflictError, DomainError, UnauthenticatedError } from "../../shared/errors";
import { generateToken, hashToken } from "../../shared/tokens";
import type { CachePort } from "../../ports/cache";
import type { ClockPort } from "../../ports/clock";
import type { PasswordHasherPort } from "../../ports/password-hasher";
import type { AuditRepository } from "../audit/repository";
import type { UserRepository } from "../identity/repository";
import type { SessionRepository } from "./repository";
import type { LoginInput, RegisterInput } from "./schemas";

const SESSION_TTL_HOURS = 24 * 7; // 7 days, revocable (FR-AUTH-003)
const LOGIN_MAX_ATTEMPTS = 10; // per identifier per window (FR-AUTH-006)
const LOGIN_WINDOW_SECONDS = 15 * 60;

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
  async login(input: LoginInput, meta: RequestMeta) {
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

    // rawToken goes into an httpOnly cookie at the boundary — never logged.
    return { rawToken, expiresAt: session.expiresAt, userId: user.id };
  }

  /** Boundary calls this on every authenticated request. */
  async validateSession(rawToken: string): Promise<{ userId: string; sessionId: string }> {
    const session = await this.deps.sessions.findByTokenHash(hashToken(rawToken));
    const now = this.deps.clock.now();

    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthenticatedError();
    }

    await this.deps.sessions.touch(session.id, now);
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

  private async enforceRateLimit(key: string): Promise<void> {
    const attempts = await this.deps.cache.increment(key, LOGIN_WINDOW_SECONDS);
    if (attempts > LOGIN_MAX_ATTEMPTS) {
      // Deliberately the same error shape as bad credentials would be
      // distinguishable only by the boundary mapping to HTTP 429.
      throw new RateLimitExceededError();
    }
  }
}

export class RateLimitExceededError extends DomainError {
  readonly code = "RATE_LIMITED";

  constructor() {
    super("Too many attempts, try again later");
  }
}
