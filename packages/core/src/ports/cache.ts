/**
 * Cache / short-lived state port — Upstash Redis initially.
 * Used for rate limiting and short idempotency windows. Durable idempotency
 * for financial effects lives in Postgres, not here (ARQUITETURA §7).
 */
export interface CachePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Atomic set-if-absent — building block for locks/idempotency windows. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  delete(key: string): Promise<void>;
}
