import { describe, expect, it } from "vitest";
import { FakeMailer, InMemoryNotificationRepository } from "../../../testing/fakes-sales";
import { NotificationsService } from "../service";
import type { OrderRecord } from "../../orders/types";
import type { IssuedTicket } from "../../tickets/types";

const order: OrderRecord = {
  id: "ord_1",
  organizationId: "org_1",
  eventId: "evt_1",
  status: "PAID",
  code: "ABCDEF234567",
  buyerName: "Maria <script>",
  buyerEmail: "maria@teste.com",
  buyerDocument: null,
  buyerPhone: null,
  subtotalCents: 20_000,
  discountCents: 0,
  feeCents: 0,
  feeMode: "PRODUCER",
  totalCents: 20_000,
  expiresAt: null,
  paidAt: new Date(),
  correlationId: "c",
};

const tickets: IssuedTicket[] = [
  {
    rawToken: "raw-token-um",
    ticket: {
      id: "tik_1",
      organizationId: "org_1",
      eventId: "evt_1",
      orderId: "ord_1",
      orderItemId: "itm_1",
      ticketTypeId: "tt_1",
      status: "VALID",
      tokenHash: "hash",
      participantName: null,
      participantEmail: null,
      issuedAt: new Date(),
    },
  },
];

function setup() {
  const notifications = new InMemoryNotificationRepository();
  const mailer = new FakeMailer();
  const service = new NotificationsService({
    notifications,
    mailer,
    baseUrl: "https://app.exemplo.com",
  });
  return { notifications, mailer, service };
}

describe("sendOrderConfirmation", () => {
  it("sends the e-mail with ticket links and records SENT", async () => {
    const env = setup();

    await env.service.sendOrderConfirmation(order, tickets, {
      correlationId: "c",
      eventTitle: "Festival",
    });

    expect(env.mailer.sent).toHaveLength(1);
    expect(env.mailer.sent[0]?.html).toContain("https://app.exemplo.com/t/raw-token-um");
    expect(env.mailer.sent[0]?.to).toBe("maria@teste.com");
    expect(env.notifications.notifications[0]?.status).toBe("SENT");
  });

  it("escapes HTML in buyer-controlled fields (anti-XSS)", async () => {
    const env = setup();
    await env.service.sendOrderConfirmation(order, tickets, { correlationId: "c" });
    expect(env.mailer.sent[0]?.html).not.toContain("<script>");
    expect(env.mailer.sent[0]?.html).toContain("&lt;script&gt;");
  });

  it("mailer failure records FAILED and never throws (NFR-AVL-006)", async () => {
    const env = setup();
    env.mailer.failNext = true;

    await expect(
      env.service.sendOrderConfirmation(order, tickets, { correlationId: "c" }),
    ).resolves.toBeUndefined();

    const record = env.notifications.notifications[0];
    expect(record?.status).toBe("FAILED");
    expect(record?.attempts).toBe(1);
  });
});
