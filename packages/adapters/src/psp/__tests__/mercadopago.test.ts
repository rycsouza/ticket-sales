import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PspTransaction } from "@ingressos/core/ports";
import { MercadoPagoAdapter } from "../mercadopago";

const SECRET = "test-webhook-secret";

function makeAdapter(transactionStatus: PspTransaction["status"] = "approved") {
  const adapter = new MercadoPagoAdapter("token", SECRET);
  // Webhooks carry no status: the adapter fetches the authoritative state.
  // Stub the API call so tests stay offline.
  (adapter as unknown as { getTransaction: unknown }).getTransaction = async (
    id: string,
  ): Promise<PspTransaction> => ({
    providerTransactionId: id,
    status: transactionStatus,
    amount: 20_000 as never,
  });
  return adapter;
}

function signedWebhook(overrides?: {
  ts?: string;
  v1?: string;
  body?: Record<string, unknown>;
  requestId?: string;
}) {
  const ts = overrides?.ts ?? String(Math.floor(Date.now() / 1000));
  const requestId = overrides?.requestId ?? "req-123";
  const body = overrides?.body ?? { id: "notif-1", type: "payment", data: { id: "555" } };
  const dataId = String((body as { data?: { id?: unknown } }).data?.id ?? "");

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = overrides?.v1 ?? createHmac("sha256", SECRET).update(manifest).digest("hex");

  return {
    headers: {
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": requestId,
    },
    rawBody: JSON.stringify(body),
  };
}

describe("verifyAndParseWebhook", () => {
  it("accepts a correctly signed payment webhook and resolves the status", async () => {
    const adapter = makeAdapter("approved");

    const event = await adapter.verifyAndParseWebhook(signedWebhook());

    expect(event).not.toBeNull();
    expect(event?.type).toBe("payment.approved");
    expect(event?.providerTransactionId).toBe("555");
    expect(event?.providerEventId).toBe("notif-1");
  });

  it("rejects a tampered signature", async () => {
    const adapter = makeAdapter();
    const webhook = signedWebhook({ v1: "0".repeat(64) });
    expect(await adapter.verifyAndParseWebhook(webhook)).toBeNull();
  });

  it("rejects a replayed (stale) timestamp", async () => {
    const adapter = makeAdapter();
    const staleTs = String(Math.floor(Date.now() / 1000) - 10 * 60);
    expect(await adapter.verifyAndParseWebhook(signedWebhook({ ts: staleTs }))).toBeNull();
  });

  it("ignores non-payment notifications", async () => {
    const adapter = makeAdapter();
    const webhook = signedWebhook({
      body: { id: "n2", type: "plan", data: { id: "999" } },
    });
    expect(await adapter.verifyAndParseWebhook(webhook)).toBeNull();
  });

  it("ignores webhooks without signature header", async () => {
    const adapter = makeAdapter();
    expect(
      await adapter.verifyAndParseWebhook({ headers: {}, rawBody: "{}" }),
    ).toBeNull();
  });

  it("returns null (no event) while the transaction is still pending", async () => {
    const adapter = makeAdapter("pending");
    expect(await adapter.verifyAndParseWebhook(signedWebhook())).toBeNull();
  });

  it("maps expired transactions to payment.expired", async () => {
    const adapter = makeAdapter("expired");
    const event = await adapter.verifyAndParseWebhook(signedWebhook());
    expect(event?.type).toBe("payment.expired");
  });
});
