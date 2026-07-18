import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CardCharge,
  CreateCardChargeInput,
  CreatePixChargeInput,
  NormalizedPspEvent,
  PixCharge,
  PspPort,
  PspTransaction,
  PspTransactionStatus,
  RefundInput,
  RefundResult,
  WebhookInput,
} from "@ingressos/core/ports";
import { cents, type Cents } from "@ingressos/core/shared";

const API_BASE = "https://api.mercadopago.com";

/**
 * Mercado Pago adapter (ARQUITETURA §10). Card data NEVER touches this code —
 * card charges take a token produced by MP's hosted fields (SAQ-A scope).
 *
 * Money note: our domain is integer cents (BR-FIN-001); MP's API speaks
 * decimal BRL. The conversion happens ONLY here, at the boundary.
 */
export class MercadoPagoAdapter implements PspPort {
  constructor(
    private readonly accessToken: string,
    private readonly webhookSecret: string,
  ) {}

  async createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const body = {
      transaction_amount: centsToDecimal(input.amount),
      payment_method_id: "pix",
      description: input.description,
      external_reference: input.orderId,
      date_of_expiration: toMpDate(input.expiresAt),
      payer: { email: input.payerEmail },
    };

    const data = await this.request<MpPayment>("POST", "/v1/payments", body, {
      "X-Idempotency-Key": input.idempotencyKey,
    });

    const pixData = data.point_of_interaction?.transaction_data;
    if (!pixData?.qr_code) {
      throw new Error("Mercado Pago response missing Pix QR data");
    }

    return {
      providerTransactionId: String(data.id),
      qrCode: pixData.qr_code_base64 ?? "",
      qrCodeText: pixData.qr_code,
      expiresAt: input.expiresAt,
    };
  }

  async createCardCharge(input: CreateCardChargeInput): Promise<CardCharge> {
    const body = {
      transaction_amount: centsToDecimal(input.amount),
      token: input.cardToken,
      installments: input.installments,
      description: input.description,
      external_reference: input.orderId,
    };
    const data = await this.request<MpPayment>("POST", "/v1/payments", body, {
      "X-Idempotency-Key": input.idempotencyKey,
    });
    return {
      providerTransactionId: String(data.id),
      status: mapStatus(data.status, data.status_detail),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const body = input.amount !== undefined ? { amount: centsToDecimal(input.amount) } : {};
    const data = await this.request<{ id: number; status: string }>(
      "POST",
      `/v1/payments/${encodeURIComponent(input.providerTransactionId)}/refunds`,
      body,
      { "X-Idempotency-Key": input.idempotencyKey },
    );
    return {
      providerRefundId: String(data.id),
      status: data.status === "approved" ? "completed" : "pending",
    };
  }

  async getTransaction(providerTransactionId: string): Promise<PspTransaction> {
    const data = await this.request<MpPayment>(
      "GET",
      `/v1/payments/${encodeURIComponent(providerTransactionId)}`,
    );
    return {
      providerTransactionId: String(data.id),
      status: mapStatus(data.status, data.status_detail),
      amount: cents(Math.round((data.transaction_amount ?? 0) * 100)) as Cents,
    };
  }

  /**
   * MP webhook: HMAC-SHA256 over `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
   * with the webhook secret, delivered in the x-signature header
   * (`ts=...,v1=...`). Notifications carry no status — the authoritative state
   * comes from getTransaction (BR-PAY-001: confirmation, not notification).
   */
  async verifyAndParseWebhook(input: WebhookInput): Promise<NormalizedPspEvent | null> {
    const headers = lowercaseKeys(input.headers);
    const signatureHeader = headers["x-signature"];
    const requestId = headers["x-request-id"];
    if (!signatureHeader) return null;

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [key, ...rest] = part.trim().split("=");
        return [key, rest.join("=")];
      }),
    ) as { ts?: string; v1?: string };
    if (!parts.ts || !parts.v1) return null;

    let body: MpWebhookBody;
    try {
      body = JSON.parse(input.rawBody) as MpWebhookBody;
    } catch {
      return null;
    }

    const dataId = body?.data?.id !== undefined ? String(body.data.id) : undefined;
    if (!dataId) return null;

    // Replay window: reject signatures older than 5 minutes (§18 das regras)
    const tsMs = Number(parts.ts) * (parts.ts.length > 11 ? 1 : 1000);
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      return null;
    }

    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ""};ts:${parts.ts};`;
    const expected = createHmac("sha256", this.webhookSecret).update(manifest).digest("hex");
    if (!safeEqualHex(expected, parts.v1)) return null;

    if (body.type !== "payment") return null; // only payment events matter

    // Authoritative status via API — never trust the notification alone
    const transaction = await this.getTransaction(dataId);
    const type = statusToEventType(transaction.status);
    if (!type) return null;

    return {
      providerEventId: String(body.id ?? `${dataId}:${parts.ts}`),
      providerTransactionId: dataId,
      type,
      occurredAt: new Date(tsMs),
    };
  }

  // -------------------------------------------------------------------------

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      // Never echo the response body into errors that may reach logs with
      // buyer data — status code and path are enough to diagnose.
      throw new Error(`Mercado Pago ${method} ${path} failed with ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

interface MpPayment {
  id: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string };
  };
}

interface MpWebhookBody {
  id?: number | string;
  type?: string;
  action?: string;
  data?: { id?: number | string };
}

function centsToDecimal(amount: Cents): number {
  return Number((amount / 100).toFixed(2));
}

function toMpDate(date: Date): string {
  // MP expects ISO-8601 with milliseconds and offset
  return date.toISOString().replace("Z", "-00:00");
}

function mapStatus(status?: string, detail?: string): PspTransactionStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return detail === "expired" ? "expired" : "cancelled";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "charged_back";
    case "in_process":
    case "pending":
    case "authorized":
    default:
      return "pending";
  }
}

function statusToEventType(status: PspTransactionStatus): NormalizedPspEvent["type"] | null {
  switch (status) {
    case "approved":
      return "payment.approved";
    case "rejected":
      return "payment.rejected";
    case "expired":
    case "cancelled":
      return "payment.expired";
    case "refunded":
    case "partially_refunded":
      return "payment.refunded";
    case "charged_back":
      return "payment.charged_back";
    case "pending":
      return null; // nothing actionable yet
  }
}

function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
