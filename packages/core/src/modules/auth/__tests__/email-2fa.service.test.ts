import { describe, expect, it } from "vitest";
import { UnauthenticatedError } from "../../../shared/errors";
import type { MailerPort, SendMailInput } from "../../../ports/mailer";
import {
  FakeCache,
  FakeClock,
  FakePasswordHasher,
  InMemoryAuditRepository,
  InMemorySessionRepository,
  InMemoryTrustedDeviceRepository,
  InMemoryUserRepository,
} from "../../../testing/fakes";
import { AuthService } from "../service";

const meta = { ip: "10.0.0.1", userAgent: "vitest", correlationId: "corr" };

class FakeMailer implements MailerPort {
  readonly sent: SendMailInput[] = [];
  async send(input: SendMailInput) {
    this.sent.push(input);
    return { providerMessageId: `msg_${this.sent.length}` };
  }
  /** The 6-digit code from the most recent e-mail (mirrors what the user sees). */
  lastCode(): string {
    const text = this.sent.at(-1)?.text ?? "";
    return /\b(\d{6})\b/.exec(text)?.[1] ?? "";
  }
}

function setup() {
  const clock = new FakeClock();
  const users = new InMemoryUserRepository();
  const trustedDevices = new InMemoryTrustedDeviceRepository();
  const mailer = new FakeMailer();
  const service = new AuthService({
    users,
    sessions: new InMemorySessionRepository(),
    audit: new InMemoryAuditRepository(),
    cache: new FakeCache(clock),
    clock,
    passwordHasher: new FakePasswordHasher(),
    email2fa: { mailer, issuer: "Ingressos", trustedDevices },
  });
  return { clock, users, mailer, service };
}

async function registerAndLogin(service: AuthService) {
  await service.register({ name: "Ana", email: "ana@x.com", password: "senha-forte-10" }, meta);
  return service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
}

describe("E-mail 2FA", () => {
  it("login on an untrusted device e-mails a code and does not authenticate yet", async () => {
    const s = setup();
    const login = await registerAndLogin(s.service);
    expect(login.status).toBe("email_2fa_required");
    expect(s.mailer.sent).toHaveLength(1);
    expect(s.mailer.lastCode()).toMatch(/^\d{6}$/);
    // The code must never appear outside the e-mail.
    expect(JSON.stringify(login)).not.toContain(s.mailer.lastCode());
  });

  it("verifying the correct code authenticates and can trust the device", async () => {
    const s = setup();
    const login = await registerAndLogin(s.service);
    if (login.status !== "email_2fa_required") throw new Error("expected email_2fa_required");

    const completion = await s.service.verifyEmailOtp(login.challengeToken, s.mailer.lastCode(), meta, {
      trustDevice: true,
    });
    expect(completion.status).toBe("authenticated");
    expect(completion.rawToken).toBeTruthy();
    expect(completion.trustedDeviceToken).toBeTruthy();

    // A trusted device skips the second factor on the next login.
    const next = await s.service.login(
      { email: "ana@x.com", password: "senha-forte-10" },
      meta,
      { trustedDeviceToken: completion.trustedDeviceToken },
    );
    expect(next.status).toBe("authenticated");
  });

  it("rejects a wrong code and does not authenticate", async () => {
    const s = setup();
    const login = await registerAndLogin(s.service);
    if (login.status !== "email_2fa_required") throw new Error("expected email_2fa_required");

    await expect(
      s.service.verifyEmailOtp(login.challengeToken, "000000", meta),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("a used code cannot be replayed", async () => {
    const s = setup();
    const login = await registerAndLogin(s.service);
    if (login.status !== "email_2fa_required") throw new Error("expected email_2fa_required");
    const code = s.mailer.lastCode();

    await s.service.verifyEmailOtp(login.challengeToken, code, meta);
    await expect(s.service.verifyEmailOtp(login.challengeToken, code, meta)).rejects.toThrow(
      UnauthenticatedError,
    );
  });
});
