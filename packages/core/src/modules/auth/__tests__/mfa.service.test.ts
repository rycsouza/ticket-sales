import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UnauthenticatedError } from "../../../shared/errors";
import { generateTotp } from "../../../shared/totp";
import {
  FakeCache,
  FakeClock,
  FakePasswordHasher,
  InMemoryAuditRepository,
  InMemorySessionRepository,
  InMemoryTrustedDeviceRepository,
  InMemoryUserRepository,
} from "../../../testing/fakes";
import { AuthService, type LoginResult } from "../service";

const meta = { ip: "10.0.0.1", userAgent: "vitest", correlationId: "corr" };
const KEY = randomBytes(32);

function setup() {
  const clock = new FakeClock();
  const users = new InMemoryUserRepository();
  const trustedDevices = new InMemoryTrustedDeviceRepository();
  const service = new AuthService({
    users,
    sessions: new InMemorySessionRepository(),
    audit: new InMemoryAuditRepository(),
    cache: new FakeCache(clock),
    clock,
    passwordHasher: new FakePasswordHasher(),
    mfa: { key: KEY, issuer: "Ingressos", trustedDevices },
  });
  return { clock, users, trustedDevices, service };
}

async function registerAndLogin(service: AuthService): Promise<LoginResult> {
  await service.register({ name: "Ana", email: "ana@x.com", password: "senha-forte-10" }, meta);
  return service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
}

/** Drives enrollment; returns the shared secret so tests can compute codes. */
async function enroll(s: ReturnType<typeof setup>) {
  const login = await registerAndLogin(s.service);
  if (login.status !== "mfa_setup_required") throw new Error("expected setup");
  const { secret } = await s.service.setupMfa(login.challengeToken);
  const confirmation = await s.service.confirmMfaSetup(
    login.challengeToken,
    generateTotp(secret, s.clock.now()),
    meta,
  );
  return { secret, confirmation };
}

describe("MFA enrollment (DEC-012)", () => {
  it("first login requires setup; confirming a valid code enables MFA + backup codes", async () => {
    const s = setup();
    const { secret, confirmation } = await enroll(s);

    expect(confirmation.status).toBe("authenticated");
    expect(confirmation.rawToken).toBeTruthy();
    expect(confirmation.backupCodes).toHaveLength(10);
    const user = await s.users.findByEmail("ana@x.com");
    expect(user?.mfaEnabled).toBe(true);
    expect(user?.mfaSecretEnc).toBeTruthy();
    expect(user?.mfaSecretEnc).not.toContain(secret); // stored encrypted
  });

  it("rejects an invalid setup code", async () => {
    const s = setup();
    const login = await registerAndLogin(s.service);
    if (login.status !== "mfa_setup_required") throw new Error("expected setup");
    await s.service.setupMfa(login.challengeToken);
    await expect(
      s.service.confirmMfaSetup(login.challengeToken, "000000", meta),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("MFA login (DEC-012)", () => {
  it("an enrolled user must pass a second factor", async () => {
    const s = setup();
    const { secret } = await enroll(s);

    const login = await s.service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
    expect(login.status).toBe("mfa_required");
    if (login.status !== "mfa_required") return;

    const done = await s.service.verifyMfa(
      login.challengeToken,
      generateTotp(secret, s.clock.now()),
      meta,
    );
    expect(done.status).toBe("authenticated");
    expect(done.rawToken).toBeTruthy();
  });

  it("a backup code works once and is then consumed", async () => {
    const s = setup();
    const { confirmation } = await enroll(s);
    const code = confirmation.backupCodes![0]!;

    const login1 = await s.service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
    if (login1.status !== "mfa_required") throw new Error("expected mfa");
    const done = await s.service.verifyMfa(login1.challengeToken, code, meta);
    expect(done.status).toBe("authenticated");

    // Reuse of the same backup code fails.
    const login2 = await s.service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
    if (login2.status !== "mfa_required") throw new Error("expected mfa");
    await expect(s.service.verifyMfa(login2.challengeToken, code, meta)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("a trusted device skips the second factor until it expires", async () => {
    const s = setup();
    const { secret } = await enroll(s);

    const login = await s.service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
    if (login.status !== "mfa_required") throw new Error("expected mfa");
    const done = await s.service.verifyMfa(
      login.challengeToken,
      generateTotp(secret, s.clock.now()),
      meta,
      { trustDevice: true },
    );
    expect(done.trustedDeviceToken).toBeTruthy();

    // Next login with the device token is authenticated directly.
    const trusted = await s.service.login(
      { email: "ana@x.com", password: "senha-forte-10" },
      meta,
      { trustedDeviceToken: done.trustedDeviceToken },
    );
    expect(trusted.status).toBe("authenticated");

    // An unknown device token still requires the second factor.
    const untrusted = await s.service.login(
      { email: "ana@x.com", password: "senha-forte-10" },
      meta,
      { trustedDeviceToken: "bogus" },
    );
    expect(untrusted.status).toBe("mfa_required");
  });

  it("rejects a wrong TOTP code", async () => {
    const s = setup();
    await enroll(s);
    const login = await s.service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
    if (login.status !== "mfa_required") throw new Error("expected mfa");
    await expect(
      s.service.verifyMfa(login.challengeToken, "000000", meta),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
