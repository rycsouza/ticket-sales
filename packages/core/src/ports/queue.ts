/**
 * Async job/event port — Upstash QStash initially (ARQUITETURA §9).
 * Delivery is at-least-once: every consumer MUST be idempotent
 * (NFR-REL-001/005).
 */
export interface QueuePort {
  publish(input: PublishInput): Promise<void>;
}

export interface PublishInput {
  /** Logical topic, mapped to a handler route (e.g. "payment.approved"). */
  topic: string;
  /** JSON-serializable payload. Never include secrets or full personal data. */
  payload: Record<string, unknown>;
  /** End-to-end correlation id (NFR-REL-003). */
  correlationId: string;
  /** Optional delay in seconds (e.g. reservation expiry sweep). */
  delaySeconds?: number;
  /** Deduplication key when the producer might publish twice. */
  deduplicationId?: string;
}
