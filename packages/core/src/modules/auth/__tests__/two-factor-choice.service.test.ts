import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MailerPort, SendMailInput } from "../../../ports/mailer";
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
import { AuthService } from "../service";

const meta = { ip: "10.0.0.1", userAgent: "vitest", correlationId: "corr" };
const KEY = randomBytes(32);

class FakeMailer implements MailerPort {
  readonly sent: SendMailInput[] = [];
  async send(input: SendMailInput) {
    this.sent.push(input);
    return { providerMessageId: `msg_${this.sent.length}` };
  }
  lastCode(): string {
    return /\b(\d{6})\b/.exec(this.sent.at(-1)?.text ?? "")?.[1] ?? "";
  }
}

/** Both factors configured — the "choose at login" scenario. */
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
    mfa: { key: KEY, issuer: "Ingressos", trustedDevices },
    email2fa: { mailer, issuer: "Ingressos", trustedDevices },
  });
  return { clock, users, mailer, service };
}

async function login(s: ReturnType<typeof setup>) {
  return s.service.login({ email: "ana@x.com", password: "senha-forte-10" }, meta);
}

describe("Choose-at-login (both factors configured)", () => {
  it("offers a choice; e-mail is only sent when the user picks it", async () => {
    const s = setup();
    await s.service.register({ name: "Ana", email: "ana@x.com", password: "senha-forte-10" }, meta);

    const result = await login(s);
    expect(result.status).toBe("two_factor_required");
    if (result.status !== "two_factor_required") return;
    // Not enrolled yet: e-mail available now, TOTP offered as setup.
    expect(result.methods).toEqual(["email"]);
    expect(result.canSetupTotp).toBe(true);
    // Crucially, no e-mail was sent just by logging in (unlike email-only mode).
    expect(s.mailer.sent).toHaveLength(0);

    const chosen = await s.service.chooseSecondFactor(result.challengeToken, "email", meta);
    expect(chosen.kind).toBe("email");
    expect(s.mailer.sent).toHaveLength(1);

    const done = await s.service.verifyEmailOtp(chosen.challengeToken, s.mailer.lastCode(), meta);
    expect(done.status).toBe("authenticated");
  });

  it("lets a not-yet-enrolled user set up TOTP from the choice, then use it next time", async () => {
    const s = setup();
    await s.service.register({ name: "Ana", email: "ana@x.com", password: "senha-forte-10" }, meta);

    const first = await login(s);
    if (first.status !== "two_factor_required") throw new Error("expected choice");

    const setupChoice = await s.service.chooseSecondFactor(first.challengeToken, "totp_setup", meta);
    expect(setupChoice.kind).toBe("totp_setup");
    const { secret } = await s.service.setupMfa(setupChoice.challengeToken);
    const enrolled = await s.service.confirmMfaSetup(
      setupChoice.challengeToken,
      generateTotp(secret, s.clock.now()),
      meta,
    );
    expect(enrolled.status).toBe("authenticated");

    // Now both methods are real options at login.
    const second = await login(s);
    if (second.status !== "two_factor_required") throw new Error("expected choice");
    expect(second.methods).toEqual(["email", "totp"]);
    expect(second.canSetupTotp).toBe(false);

    const totpChoice = await s.service.chooseSecondFactor(second.challengeToken, "totp", meta);
    expect(totpChoice.kind).toBe("totp");
    const done = await s.service.verifyMfa(
      totpChoice.challengeToken,
      generateTotp(secret, s.clock.now()),
      meta,
    );
    expect(done.status).toBe("authenticated");
  });

  it("rejects picking TOTP before enrollment", async () => {
    const s = setup();
    await s.service.register({ name: "Ana", email: "ana@x.com", password: "senha-forte-10" }, meta);
    const result = await login(s);
    if (result.status !== "two_factor_required") throw new Error("expected choice");
    await expect(s.service.chooseSecondFactor(result.challengeToken, "totp", meta)).rejects.toThrow();
  });
});
