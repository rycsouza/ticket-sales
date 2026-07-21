import { describe, expect, it } from "vitest";
import { ConflictError, UnauthenticatedError } from "../../../shared/errors";
import {
  FakeCache,
  FakeClock,
  FakePasswordHasher,
  InMemoryAuditRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "../../../testing/fakes";
import { AuthService, RateLimitExceededError, type LoginResult } from "../service";

const HOUR_MS = 60 * 60 * 1000;

/** These tests run without MFA enforced, so login is always authenticated. */
function authed(result: LoginResult) {
  if (result.status !== "authenticated") {
    throw new Error(`expected authenticated login, got ${result.status}`);
  }
  return result;
}

function setup() {
  const clock = new FakeClock();
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const audit = new InMemoryAuditRepository();
  const cache = new FakeCache(clock);
  const service = new AuthService({
    users,
    sessions,
    audit,
    cache,
    clock,
    passwordHasher: new FakePasswordHasher(),
  });
  return { clock, users, sessions, audit, cache, service };
}

const meta = { ip: "10.0.0.1", userAgent: "vitest", correlationId: "corr" };

describe("register", () => {
  it("creates a user with a hashed password and audits", async () => {
    const { service, users, audit } = setup();

    await service.register({ name: "Ana", email: "ana@x.com", password: "senha-forte-10" }, meta);

    const user = await users.findByEmail("ana@x.com");
    expect(user?.passwordHash).toBe("hashed:senha-forte-10");
    expect(audit.byAction("user.registered")).toHaveLength(1);
  });

  it("rejects duplicate e-mail with a generic conflict", async () => {
    const { service } = setup();
    const input = { name: "Ana", email: "ana@x.com", password: "senha-forte-10" };

    await service.register(input, meta);
    await expect(service.register(input, meta)).rejects.toThrow(ConflictError);
  });
});

describe("login", () => {
  async function withUser() {
    const env = setup();
    await env.service.register(
      { name: "Ana", email: "ana@x.com", password: "senha-forte-10" },
      meta,
    );
    return env;
  }

  it("returns a session token on valid credentials", async () => {
    const { service, audit } = await withUser();

    const result = authed(await service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta));

    expect(result.rawToken).toHaveLength(43);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(audit.byAction("auth.login_succeeded")).toHaveLength(1);
  });

  it("fails with the SAME error for wrong password and unknown user", async () => {
    const { service, audit } = await withUser();

    const wrongPassword = service
      .login({ email: "ana@x.com", password: "errada-errada" }, meta)
      .catch((e: unknown) => e);
    const unknownUser = service
      .login({ email: "ghost@x.com", password: "qualquer-senha" }, meta)
      .catch((e: unknown) => e);

    const [e1, e2] = await Promise.all([wrongPassword, unknownUser]);
    expect(e1).toBeInstanceOf(UnauthenticatedError);
    expect(e2).toBeInstanceOf(UnauthenticatedError);
    expect((e1 as Error).message).toBe((e2 as Error).message);
    expect(audit.byAction("auth.login_failed")).toHaveLength(2);
  });

  it("rate limits repeated attempts per e-mail", async () => {
    const { service } = await withUser();

    for (let i = 0; i < 10; i++) {
      await service
        .login({ email: "ana@x.com", password: "senha-errada!" }, meta)
        .catch(() => undefined);
    }

    await expect(
      service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta),
    ).rejects.toThrow(RateLimitExceededError);
  });

  it("releases the rate limit after the window passes", async () => {
    const { service, clock } = await withUser();

    for (let i = 0; i < 10; i++) {
      await service
        .login({ email: "ana@x.com", password: "senha-errada!" }, meta)
        .catch(() => undefined);
    }
    clock.advance(16 * 60 * 1000);

    const result = authed(await service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta));
    expect(result.rawToken).toBeDefined();
  });
});

describe("sessions", () => {
  async function withSession() {
    const env = setup();
    await env.service.register(
      { name: "Ana", email: "ana@x.com", password: "senha-forte-10" },
      meta,
    );
    const login = authed(
      await env.service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta),
    );
    return { ...env, login };
  }

  it("validates an active session", async () => {
    const { service, login } = await withSession();
    const result = await service.validateSession(login.rawToken);
    expect(result.userId).toBe(login.userId);
  });

  it("rejects an expired session", async () => {
    const { service, login, clock } = await withSession();
    // Session TTL is 30 days (sliding); advance well past it without any
    // intervening validation so the window is never renewed.
    clock.advance(31 * 24 * HOUR_MS);

    await expect(service.validateSession(login.rawToken)).rejects.toThrow(UnauthenticatedError);
  });

  it("slides the expiry while the session is used", async () => {
    const { service, login, clock } = await withSession();
    // Use it after 20 days (renews to +30d), then 20 more days: still valid.
    clock.advance(20 * 24 * HOUR_MS);
    await service.validateSession(login.rawToken);
    clock.advance(20 * 24 * HOUR_MS);
    const result = await service.validateSession(login.rawToken);
    expect(result.userId).toBe(login.userId);
  });

  it("rejects a revoked session (logout)", async () => {
    const { service, login } = await withSession();

    await service.logout(login.rawToken, meta);
    await expect(service.validateSession(login.rawToken)).rejects.toThrow(UnauthenticatedError);
  });

  it("logout is idempotent", async () => {
    const { service, login } = await withSession();
    await service.logout(login.rawToken, meta);
    await expect(service.logout(login.rawToken, meta)).resolves.toBeUndefined();
  });

  it("rejects garbage tokens", async () => {
    const { service } = await withSession();
    await expect(service.validateSession("not-a-token")).rejects.toThrow(UnauthenticatedError);
  });

  it("revokeAllSessions ends every session of the user", async () => {
    const { service, login } = await withSession();
    const second = authed(
      await service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta),
    );

    const count = await service.revokeAllSessions(login.userId, {
      ...meta,
      actorUserId: "admin-user",
    });

    expect(count).toBe(2);
    await expect(service.validateSession(login.rawToken)).rejects.toThrow(UnauthenticatedError);
    await expect(service.validateSession(second.rawToken)).rejects.toThrow(UnauthenticatedError);
  });
});
